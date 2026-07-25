import { type NextRequest, NextResponse } from "next/server";
import {
  assertSameOrigin,
  createRequestContext,
  withRequestId
} from "@/lib/server/request-security";
import { getSiteUrl } from "@/lib/server/env";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { incrementHomepageVisitCount } from "@/lib/server/page-visits";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, {
      expectedOrigin: getSiteUrl(),
      allowedOrigins: process.env.NODE_ENV === "production"
        ? []
        : ["http://127.0.0.1:3000", "http://localhost:3000"]
    });
    const count = await incrementHomepageVisitCount();
    const response = NextResponse.json(
      { count },
      { headers: { "cache-control": "no-store" } }
    );

    return withRequestId(response, context.requestId);
  } catch (error) {
    return safeErrorResponse(error, {
      ...context,
      event: "homepage.visit_counter_failed"
    });
  }
}
