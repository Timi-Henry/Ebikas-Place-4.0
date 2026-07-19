import {
  createRequestContext,
  withRequestId
} from "@/lib/server/request-security";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const context = createRequestContext(request);
  const response = Response.json(
    { status: "ok", requestId: context.requestId },
    { headers: { "cache-control": "no-store" } }
  );
  return withRequestId(response, context.requestId);
}

export function HEAD(request: Request) {
  const context = createRequestContext(request);
  return withRequestId(
    new Response(null, { status: 200, headers: { "cache-control": "no-store" } }),
    context.requestId
  );
}
