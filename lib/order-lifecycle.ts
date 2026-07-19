import type { FulfillmentMethod, OrderStatus } from "@/lib/types";

export const adminOrderActions = ["confirm", "reject", "out-for-delivery", "delivered"] as const;
export type AdminOrderAction = (typeof adminOrderActions)[number];
export type OrderTransitionAction = AdminOrderAction | "cancel";
export type OrderTransitionActorKind = "customer" | "admin";

export type OrderTransitionDecision =
  | { ok: true; nextStatus: OrderStatus }
  | { ok: false; message: string };

export function decideOrderTransition(input: {
  actor: OrderTransitionActorKind;
  action: OrderTransitionAction;
  currentStatus: OrderStatus;
  fulfillmentMethod: FulfillmentMethod;
}): OrderTransitionDecision {
  if (input.actor === "customer") {
    if (input.action === "cancel" && (input.currentStatus === "placed" || input.currentStatus === "confirmed")) {
      return { ok: true, nextStatus: "cancelled" };
    }
    return { ok: false, message: "This order can no longer be cancelled." };
  }

  if (input.action === "confirm" && input.currentStatus === "placed") {
    return { ok: true, nextStatus: "confirmed" };
  }
  if (input.action === "reject" && (input.currentStatus === "placed" || input.currentStatus === "confirmed")) {
    return { ok: true, nextStatus: "rejected" };
  }
  if (
    input.action === "out-for-delivery" &&
    input.currentStatus === "confirmed" &&
    input.fulfillmentMethod === "store-delivery"
  ) {
    return { ok: true, nextStatus: "out-for-delivery" };
  }
  if (
    input.action === "delivered" &&
    (input.currentStatus === "out-for-delivery" ||
      (input.currentStatus === "confirmed" && input.fulfillmentMethod === "customer-rider"))
  ) {
    return { ok: true, nextStatus: "delivered" };
  }

  return { ok: false, message: "That status change is not allowed for this order." };
}

