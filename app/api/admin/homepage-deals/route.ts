import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { getSiteUrl } from "@/lib/server/env";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { updateHomepageDealLabel } from "@/lib/server/storefront-settings";
import { homepageDealLabelMutationSchema } from "@/lib/validation";

export async function PUT(request: Request) {
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
      scope: "storefront.homepage-deals.update",
      limit: 20,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const body = await parseBoundedJson(request, homepageDealLabelMutationSchema, { maxBytes: 1024 });
    const label = await updateHomepageDealLabel(body.label);
    try {
      revalidatePath("/");
      revalidatePath("/admin/catalog");
    } catch (error) {
      console.error("[storefront-settings] Path revalidation failed.", {
        errorType: error instanceof Error ? error.name : typeof error
      });
    }

    return withRequestId(NextResponse.json({ label }), context.requestId);
  } catch (error) {
    return safeErrorResponse(error, { ...context, event: "storefront.homepage-deals.update.failed" });
  }
}

