import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CheckoutError } from "@/lib/checkout";
import { checkout } from "@/lib/server/checkout";
import { getUserOrders } from "@/lib/server/orders";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { checkoutEnvelopeSchema } from "@/lib/validation";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const orders = await getUserOrders(userId);
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const { userId } = await auth();
    if (!userId) {
      return withRequestId(
        NextResponse.json({ error: "Sign in required." }, { status: 401 }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "checkout.create",
      limit: 10,
      windowMs: 10 * 60 * 1000,
      userId
    });

    // Checkout owns the deep domain schema; this first pass prevents unbounded JSON reads.
    const payload = await parseBoundedJson(request, checkoutEnvelopeSchema, { maxBytes: 32 * 1024 });
    const result = await checkout.place({
      userId,
      idempotencyKey: request.headers.get("Idempotency-Key") || "",
      payload
    });

    return withRequestId(NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store" }
    }), context.requestId);
  } catch (error) {
    if (error instanceof CheckoutError) {
      return withRequestId(NextResponse.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.retryable,
          issues: error.issues
        },
        {
          status: error.status,
          headers: error.retryable ? { "Retry-After": "2" } : undefined
        }
      ), context.requestId);
    }

    return safeErrorResponse(error, { ...context, event: "checkout.place.failed" });
  }
}
