import {
  getClerkEnvironment,
  getCloudinaryEnvironment,
  getCronSecret,
  getInngestEnvironment,
  getOrderNotificationEnvironment,
  getSiteUrl,
  getTransactionalEmailEnvironment,
} from "@/lib/server/env";
import { getDb } from "@/lib/server/mongodb";
import { createRequestContext, withRequestId } from "@/lib/server/request-security";
import { logServerError } from "@/lib/server/safe-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = createRequestContext(request);

  try {
    getSiteUrl();
    getClerkEnvironment();
    getCloudinaryEnvironment();
    getCronSecret();
    getInngestEnvironment();
    getOrderNotificationEnvironment();
    getTransactionalEmailEnvironment();
    const db = await getDb();
    await db.command({ ping: 1 });
    return withRequestId(
      Response.json(
        { status: "ready", requestId: context.requestId },
        { headers: { "cache-control": "no-store" } }
      ),
      context.requestId
    );
  } catch (error) {
    logServerError(error, { ...context, event: "readiness_check_failed" });
    return withRequestId(
      Response.json(
        { status: "unavailable", requestId: context.requestId },
        { status: 503, headers: { "cache-control": "no-store", "retry-after": "10" } }
      ),
      context.requestId
    );
  }
}

export function HEAD(request: Request) {
  return GET(request).then((response) => new Response(null, { status: response.status, headers: response.headers }));
}
