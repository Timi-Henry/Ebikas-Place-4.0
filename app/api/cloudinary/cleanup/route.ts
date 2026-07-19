import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { ProductMediaError, retireProductMedia, sweepProductMediaCleanup } from "@/lib/server/product-media";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { cloudinaryCleanupSchema } from "@/lib/validation";

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
      scope: "cloudinary.cleanup",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const { publicIds } = await parseBoundedJson(request, cloudinaryCleanupSchema, { maxBytes: 8192 });
    const mediaCleanup = await retireProductMedia({
      actorId: admin.user.id,
      publicIds,
      reason: "manual-cleanup"
    });
    const sweep = await sweepProductMediaCleanup({ limit: Math.min(25, publicIds.length) });
    return withRequestId(
      NextResponse.json({
        mediaCleanup,
        sweep,
        cloudinaryCleanup: {
          requested: publicIds,
          deleted: [],
          alreadyMissing: [],
          recovered: [],
          failed: []
        }
      }),
      context.requestId
    );
  } catch (error) {
    if (error instanceof ProductMediaError) {
      const status = error.code === "INVALID_MEDIA_INPUT" ? 400 : 409;
      return withRequestId(
        NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status }),
        context.requestId
      );
    }
    return safeErrorResponse(error, { ...context, event: "cloudinary.cleanup.failed" });
  }
}
