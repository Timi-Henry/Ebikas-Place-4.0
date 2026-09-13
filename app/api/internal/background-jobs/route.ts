import { recoverBackgroundJobs } from "@/lib/server/background-job-service";
import { hasValidCronAuthorization } from "@/lib/server/cron-authorization";
import { createRequestContext, withRequestId } from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const context = createRequestContext(request);
  try {
    if (!hasValidCronAuthorization(request)) {
      return withRequestId(Response.json({ error: "Not authorized." }, { status: 401 }), context.requestId);
    }
    const recovery = await recoverBackgroundJobs(50);
    return withRequestId(
      Response.json({ ok: true, recovery }, {
        headers: { "cache-control": "no-store" }
      }),
      context.requestId
    );
  } catch (error) {
    return safeErrorResponse(error, { ...context, event: "background-jobs.recovery.failed" });
  }
}
