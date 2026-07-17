import "server-only";
import { v2 as cloudinary } from "cloudinary";
import type { CloudinaryCleanupIssue, CloudinaryCleanupResult } from "@/lib/types";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export async function uploadImage(buffer: Buffer) {
  const folder = process.env.CLOUDINARY_UPLOAD_FOLDER || "ebikas-place/products";

  return new Promise<{ secureUrl: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }]
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Cloudinary upload failed"));
          return;
        }

        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      }
    );

    stream.end(buffer);
  });
}

type DestroyOutcome =
  | { status: "deleted" | "missing"; attempts: number; message: string }
  | { status: "failed"; attempts: number; message: string; retryable: boolean };

const maxDeleteAttempts = 3;
const imageExtensionPattern = /\.(avif|bmp|gif|jpe?g|png|tiff?|webp)$/i;
const transientCloudinaryErrorPattern =
  /(timeout|timed out|econnreset|eai_again|etimedout|socket|rate|429|500|502|503|504|network|epipe|temporary)/i;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Cloudinary error.";
}

function withoutImageExtension(value: string) {
  return value.replace(imageExtensionPattern, "");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCloudinaryPublicId(value: string) {
  try {
    const url = new URL(value);
    if (!url.hostname.includes("res.cloudinary.com")) return "";

    const marker = "/image/upload/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return "";

    const afterUpload = url.pathname.slice(markerIndex + marker.length);
    const parts = afterUpload.split("/").filter(Boolean);
    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
    const publicPathParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
    return withoutImageExtension(safeDecode(publicPathParts.join("/")));
  } catch {
    return "";
  }
}

function deletionCandidates(publicId: string) {
  const trimmed = publicId.trim();
  if (!trimmed) return [];

  const parsedFromUrl = parseCloudinaryPublicId(trimmed);
  const normalized = safeDecode(trimmed).replace(/^\/+/, "");
  const candidates = parsedFromUrl
    ? [parsedFromUrl, withoutImageExtension(parsedFromUrl)]
    : [normalized, withoutImageExtension(normalized)];

  return [...new Set(candidates.filter(Boolean))];
}

export function collectImagePublicIds(image: {
  imagePublicId?: string;
  imagePublicIds?: string[];
  imageUrl?: string;
  imageUrls?: string[];
}) {
  const publicIds = [
    ...(image.imagePublicIds || []),
    image.imagePublicId,
    ...(image.imageUrls || []).map(parseCloudinaryPublicId),
    parseCloudinaryPublicId(image.imageUrl || "")
  ];

  return [...new Set(publicIds.filter((publicId): publicId is string => Boolean(publicId)))];
}

function isRetryableCloudinaryError(message: string) {
  return transientCloudinaryErrorPattern.test(message);
}

function cleanupSuggestion(message: string) {
  if (/api_key|api secret|signature|credentials|cloud_name/i.test(message)) {
    return "Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local, then retry cleanup.";
  }

  if (/rate|429/i.test(message)) {
    return "Cloudinary is rate limiting requests. Wait a minute, then use Retry cleanup.";
  }

  if (isRetryableCloudinaryError(message)) {
    return "This looks temporary. Use Retry cleanup; the server will retry Cloudinary again.";
  }

  if (/invalid|public.?id/i.test(message)) {
    return "Confirm the stored Cloudinary public ID does not include the full URL or file extension. The cleanup helper already tried common normalized variants.";
  }

  return "Use Retry cleanup first. If it still fails, check that the image exists in Cloudinary and that the stored public ID matches the asset public ID.";
}

async function destroyCandidate(publicId: string): Promise<DestroyOutcome> {
  let lastMessage = "";

  for (let attempt = 1; attempt <= maxDeleteAttempts; attempt += 1) {
    try {
      const result = (await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true
      })) as { result?: string };
      const cloudinaryResult = result?.result || "unknown";

      if (cloudinaryResult === "ok") {
        return { status: "deleted", attempts: attempt, message: "Deleted from Cloudinary." };
      }

      if (cloudinaryResult === "not found") {
        return { status: "missing", attempts: attempt, message: "Cloudinary says this image is already missing." };
      }

      lastMessage = `Cloudinary returned "${cloudinaryResult}".`;
    } catch (error) {
      lastMessage = errorMessage(error);
    }

    if (!isRetryableCloudinaryError(lastMessage) || attempt === maxDeleteAttempts) {
      return {
        status: "failed",
        attempts: attempt,
        message: lastMessage,
        retryable: isRetryableCloudinaryError(lastMessage)
      };
    }

    await wait(300 * attempt);
  }

  return {
    status: "failed",
    attempts: maxDeleteAttempts,
    message: lastMessage || "Cloudinary deletion failed.",
    retryable: true
  };
}

async function deleteOneImage(publicId: string): Promise<CloudinaryCleanupResult> {
  const candidates = deletionCandidates(publicId);
  const attemptedPublicIds: string[] = [];
  let attempts = 0;
  let lastFailure: DestroyOutcome | null = null;

  for (const candidate of candidates) {
    attemptedPublicIds.push(candidate);
    const outcome = await destroyCandidate(candidate);
    attempts += outcome.attempts;

    if (outcome.status === "deleted") {
      return {
        requested: [publicId],
        deleted: [candidate],
        alreadyMissing: [],
        recovered:
          candidate !== publicId.trim()
            ? [{ publicId, usedPublicId: candidate, message: "Deleted after normalizing the stored Cloudinary public ID." }]
            : [],
        failed: []
      };
    }

    if (outcome.status === "failed") {
      lastFailure = outcome;
      if (/api_key|api secret|signature|credentials|cloud_name/i.test(outcome.message)) break;
    }
  }

  if (!lastFailure) {
    return {
      requested: [publicId],
      deleted: [],
      alreadyMissing: [publicId],
      recovered: [],
      failed: []
    };
  }

  const issue: CloudinaryCleanupIssue = {
    publicId,
    attemptedPublicIds,
    attempts,
    message: lastFailure.message,
    suggestion: cleanupSuggestion(lastFailure.message),
    retryable: lastFailure.retryable
  };

  return {
    requested: [publicId],
    deleted: [],
    alreadyMissing: [],
    recovered: [],
    failed: [issue]
  };
}

function emptyCleanupResult(requested: string[] = []): CloudinaryCleanupResult {
  return { requested, deleted: [], alreadyMissing: [], recovered: [], failed: [] };
}

function mergeCleanupResults(results: CloudinaryCleanupResult[]): CloudinaryCleanupResult {
  return results.reduce<CloudinaryCleanupResult>(
    (merged, result) => ({
      requested: [...merged.requested, ...result.requested],
      deleted: [...merged.deleted, ...result.deleted],
      alreadyMissing: [...merged.alreadyMissing, ...result.alreadyMissing],
      recovered: [...merged.recovered, ...result.recovered],
      failed: [...merged.failed, ...result.failed]
    }),
    emptyCleanupResult()
  );
}

function logCleanupResult(result: CloudinaryCleanupResult) {
  if (result.failed.length) {
    console.error("[cloudinary cleanup] Failed to delete image assets.", {
      failed: result.failed,
      deleted: result.deleted,
      alreadyMissing: result.alreadyMissing
    });
  }

  if (result.recovered.length) {
    console.warn("[cloudinary cleanup] Deleted image assets after public ID fallback.", {
      recovered: result.recovered
    });
  }
}

export async function deleteImages(publicIds: string[] = []): Promise<CloudinaryCleanupResult> {
  const uniqueIds = [...new Set(publicIds.map((publicId) => publicId.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return emptyCleanupResult();

  const result = mergeCleanupResults(await Promise.all(uniqueIds.map(deleteOneImage)));
  logCleanupResult(result);
  return result;
}
