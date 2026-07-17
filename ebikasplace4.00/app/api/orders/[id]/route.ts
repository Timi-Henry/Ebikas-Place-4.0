import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { cancelUserOrder, updateOrderStatusByAdmin, type AdminOrderAction } from "@/lib/server/orders";

const adminActions = new Set(["accept", "confirm", "reject", "out-for-delivery", "delivered"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const { id } = await params;

  if (action === "cancel") {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    try {
      const order = await cancelUserOrder(id, user.id);
      return NextResponse.json({ order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order could not be cancelled.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!adminActions.has(action)) {
    return NextResponse.json({ error: "Unsupported order action." }, { status: 400 });
  }

  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const adminAction: AdminOrderAction = action === "accept" ? "confirm" : (action as AdminOrderAction);
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.slice(0, 500) : "";

  try {
    const order = await updateOrderStatusByAdmin(id, adminAction, rejectionReason);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order could not be updated.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
