import { describe, expect, it } from "vitest";
import { decideOrderTransition, type OrderTransitionAction } from "@/lib/order-lifecycle";
import type { FulfillmentMethod, OrderStatus } from "@/lib/types";

function decide(
  actor: "customer" | "admin",
  action: OrderTransitionAction,
  currentStatus: OrderStatus,
  fulfillmentMethod: FulfillmentMethod = "store-delivery"
) {
  return decideOrderTransition({ actor, action, currentStatus, fulfillmentMethod });
}

describe("order lifecycle", () => {
  it.each<[OrderStatus, OrderStatus]>([
    ["placed", "cancelled"],
    ["confirmed", "cancelled"]
  ])("allows a customer to cancel %s orders", (currentStatus, nextStatus) => {
    expect(decide("customer", "cancel", currentStatus)).toEqual({ ok: true, nextStatus });
  });

  it.each<OrderStatus>(["rejected", "out-for-delivery", "delivered", "cancelled"])(
    "prevents a customer from cancelling %s orders",
    (currentStatus) => {
      expect(decide("customer", "cancel", currentStatus)).toMatchObject({ ok: false });
    }
  );

  it("allows only the intended admin progression for store delivery", () => {
    expect(decide("admin", "confirm", "placed")).toEqual({ ok: true, nextStatus: "confirmed" });
    expect(decide("admin", "reject", "placed")).toEqual({ ok: true, nextStatus: "rejected" });
    expect(decide("admin", "reject", "confirmed")).toEqual({ ok: true, nextStatus: "rejected" });
    expect(decide("admin", "out-for-delivery", "confirmed")).toEqual({ ok: true, nextStatus: "out-for-delivery" });
    expect(decide("admin", "delivered", "out-for-delivery")).toEqual({ ok: true, nextStatus: "delivered" });
  });

  it("allows customer-rider pickup to move directly from confirmed to delivered", () => {
    expect(decide("admin", "delivered", "confirmed", "customer-rider")).toEqual({
      ok: true,
      nextStatus: "delivered"
    });
    expect(decide("admin", "out-for-delivery", "confirmed", "customer-rider")).toMatchObject({ ok: false });
  });

  it.each<[OrderTransitionAction, OrderStatus]>([
    ["confirm", "confirmed"],
    ["confirm", "delivered"],
    ["out-for-delivery", "placed"],
    ["delivered", "placed"],
    ["reject", "out-for-delivery"],
    ["reject", "delivered"]
  ])("rejects admin action %s from %s", (action, currentStatus) => {
    expect(decide("admin", action, currentStatus)).toMatchObject({ ok: false });
  });
});

