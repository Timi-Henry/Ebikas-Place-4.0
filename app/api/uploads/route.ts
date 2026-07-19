import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { ProductMediaError, stageProductMedia } from "@/lib/server/product-media";
import { allowedImageTypes, maxUploadBytes } from "@/lib/validation";
import {
  assertSameOrigin,
  createRequestContext,
  RequestSecurityError,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";

export const runtime = "nodejs";

const maxMultipartBytes = maxUploadBytes + 256 * 1024;
const multipartContentType = /^multipart\/form-data;\s*boundary=(?:"[^"\r\n]{1,200}"|[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,200})\s*$/i;

function assertMultipartHeaders(request: Request) {
  const contentType = request.headers.get("content-type")?.trim() || "";
  if (!multipartContentType.test(contentType)) {
    throw new RequestSecurityError("invalid_content_type", 415, "Content-Type must be multipart/form-data.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
      throw new RequestSecurityError("invalid_content_length", 400, "Content-Length is invalid.");
    }
    if (Number(contentLength) > maxMultipartBytes) {
      throw new RequestSecurityError("request_body_too_large", 413, "Upload request is too large.");
    }
  }

  return contentType;
}

async function readBoundedMultipartBody(request: Request) {
  if (!request.body) {
    throw new RequestSecurityError("missing_request_body", 400, "Upload body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxMultipartBytes) {
        await reader.cancel();
        throw new RequestSecurityError("request_body_too_large", 413, "Upload request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new RequestSecurityError("missing_request_body", 400, "Upload body is required.");
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function hasExpectedImageSignature(buffer: Buffer, contentType: string) {
  if (contentType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (contentType === "image/avif") {
    if (buffer.length < 16 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
    const boxSize = buffer.readUInt32BE(0);
    const boxEnd = Math.min(buffer.length, boxSize >= 16 ? boxSize : buffer.length, 256);
    for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
      const brand = buffer.toString("ascii", offset, offset + 4);
      if (brand === "avif" || brand === "avis") return true;
    }
  }
  return false;
}

export async function POST(request: Request) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const admin = await requireAdmin();
    if (!admin.ok) {
      return withRequestId(
        NextResponse.json({ error: admin.message }, { status: admin.status }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "product-image.upload",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const contentType = assertMultipartHeaders(request);
    const body = await readBoundedMultipartBody(request);
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    } catch {
      throw new RequestSecurityError("invalid_request_body", 422, "Upload form is invalid.");
    }

    const entries = Array.from(form.entries());
    const imageEntries = entries.filter(([name, value]) => name === "image" && value instanceof File);
    const fileCount = entries.filter(([, value]) => value instanceof File).length;
    if (entries.length !== 1 || fileCount !== 1 || imageEntries.length !== 1) {
      throw new RequestSecurityError("invalid_request_body", 422, "Upload exactly one image file.");
    }

    const file = imageEntries[0][1] as File;
    if (!allowedImageTypes.has(file.type)) {
      throw new RequestSecurityError(
        "invalid_request_body",
        422,
        "Upload a JPEG, PNG, WebP, or AVIF image."
      );
    }
    if (file.size < 1 || file.size > maxUploadBytes) {
      throw new RequestSecurityError("request_body_too_large", 413, "Images must be between 1 byte and 5MB.");
    }
    if (file.name.length > 255) {
      throw new RequestSecurityError("invalid_request_body", 422, "Image filename is too long.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedImageSignature(buffer, file.type)) {
      throw new RequestSecurityError(
        "invalid_request_body",
        422,
        "The uploaded file content does not match its image type."
      );
    }

    const staged = await stageProductMedia({
      ownerId: admin.user.id,
      requestId: request.headers.get("Idempotency-Key") || undefined,
      files: [{ buffer, contentType: file.type }]
    });
    const image = staged.media[0];
    return withRequestId(
      NextResponse.json({
        requestId: staged.requestId,
        image: {
          stageId: image.stageId,
          publicId: image.publicId,
          secureUrl: image.secureUrl
        }
      }),
      context.requestId
    );
  } catch (error) {
    if (error instanceof ProductMediaError) {
      const status = error.code === "INVALID_MEDIA_INPUT" ? 400 : error.code === "MEDIA_STAGE_FAILED" ? 503 : 409;
      return withRequestId(
        NextResponse.json(
          { error: error.message, code: error.code, retryable: error.retryable },
          { status, headers: error.retryable ? { "Retry-After": "2" } : undefined }
        ),
        context.requestId
      );
    }
    return safeErrorResponse(error, { ...context, event: "product-image.upload.failed" });
  }
}
