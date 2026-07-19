import { eventType } from "inngest";
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";

export const orderPlacedEvent = eventType("store/order.placed", {
  schema: z.object({
    orderId: z.string().regex(/^[a-f0-9]{24}$/i)
  })
});

export function createOrderPlacedEvent(orderId: string, recoveryAttemptId?: string) {
  const recoverySuffix = recoveryAttemptId ? `-recovery-${recoveryAttemptId}` : "";
  return orderPlacedEvent.create(
    { orderId },
    { id: `ebikas-place-order-placed-${orderId}${recoverySuffix}` }
  );
}

/**
 * Await event acceptance so an idempotent checkout replay can recover a
 * transient Inngest failure instead of silently losing the notification.
 */
export function enqueueOrderPlacedNotification(orderId: string) {
  return inngest.send(createOrderPlacedEvent(orderId));
}
