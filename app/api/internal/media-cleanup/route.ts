import { hasValidCronAuthorization } from "@/lib/server/cron-authorization";
import { sweepProductMediaCleanup } from "@/lib/server/product-media";
import { createRequestContext, withRequestId } from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    if (!hasValidCronAuthorization(request)) {
      return withRequestId(Response.json({ error: "Not authorized." }, { status: 401 }), context.requestId);
    }
    const sweep = await sweepProductMediaCleanup({ limit: 50 });
    return withRequestId(
      Response.json({ ok: true, sweep }, { headers: { "cache-control": "no-store" } }),
      context.requestId
    );
  } catch (error) {
    return safeErrorResponse(error, { ...context, event: "product-media.scheduled-cleanup.failed" });
  }
}
