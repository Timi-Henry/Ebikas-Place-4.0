import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import {
  cancelUserOrder,
  OrderTransitionError,
  updateOrderStatusByAdmin,
  type AdminOrderAction
} from "@/lib/server/orders";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { objectIdSchema, orderActionSchema } from "@/lib/validation";

const adminActions = new Set(["accept", "confirm", "reject", "out-for-delivery", "delivered"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      scope: "order.transition",
      limit: 60,
      windowMs: 10 * 60 * 1000,
      userId
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Order not found." }, { status: 404 }), context.requestId);
    }

    const body = await parseBoundedJson(request, orderActionSchema, { maxBytes: 2048 });
    const { action, expectedVersion } = body;
    const id = idResult.data;

    if (action === "cancel") {
      const order = await cancelUserOrder(id, userId, expectedVersion);
      return withRequestId(NextResponse.json({ order }), context.requestId);
    }

    if (!adminActions.has(action)) {
      return withRequestId(
        NextResponse.json({ error: "Unsupported order action." }, { status: 400 }),
        context.requestId
      );
    }

    const admin = await requireAdmin();
    if (!admin.ok) {
      return withRequestId(
        NextResponse.json({ error: admin.message }, { status: admin.status }),
        context.requestId
      );
    }

    const adminAction: AdminOrderAction = action === "accept" ? "confirm" : (action as AdminOrderAction);
    const rejectionReason = body.rejectionReason || "";

    const order = await updateOrderStatusByAdmin(id, adminAction, expectedVersion, rejectionReason);
    return withRequestId(NextResponse.json({ order }), context.requestId);
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      return withRequestId(
        NextResponse.json({ error: error.message, code: error.code }, { status: error.status }),
        context.requestId
      );
    }

    return safeErrorResponse(error, { ...context, event: "order.transition.failed" });
  }
}
