import { describe, expect, it } from "vitest";
import { createOrderPlacedEvent } from "@/lib/inngest/order-events";
import {
  ORDER_NOTIFICATION_FUNCTION_SETTINGS,
  ORDER_NOTIFICATION_RECOVERY_SETTINGS
} from "@/lib/inngest/order-notification-settings";

describe("order notification event", () => {
  it("uses a stable ID and keeps customer data out of the event", async () => {
    const orderId = "64b000000000000000000001";
    const event = createOrderPlacedEvent(orderId);

    await expect(event.validate()).resolves.toBeUndefined();
    expect(event).toMatchObject({
      id: `ebikas-place-order-placed-${orderId}`,
      name: "store/order.placed",
      data: { orderId }
    });
    expect(Object.keys(event.data)).toEqual(["orderId"]);
  });

  it("bounds retries and active email work for the free plan", () => {
    expect(ORDER_NOTIFICATION_FUNCTION_SETTINGS).toEqual({
      concurrency: { limit: 1 },
      retries: 2
    });
    expect(ORDER_NOTIFICATION_RECOVERY_SETTINGS).toEqual({
      concurrency: { limit: 1 },
      retries: 1
    });
  });

  it("gives each recovery attempt a distinct event ID", () => {
    const orderId = "64b000000000000000000001";

    expect(createOrderPlacedEvent(orderId, "cron-run-a").id).toBe(
      `ebikas-place-order-placed-${orderId}-recovery-cron-run-a`
    );
    expect(createOrderPlacedEvent(orderId, "cron-run-b").id).not.toBe(
      createOrderPlacedEvent(orderId, "cron-run-a").id
    );
  });
});
