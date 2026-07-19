import { cron, NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createOrderPlacedEvent, orderPlacedEvent } from "@/lib/inngest/order-events";
import {
  ORDER_NOTIFICATION_FUNCTION_SETTINGS,
  ORDER_NOTIFICATION_RECOVERY_SETTINGS
} from "@/lib/inngest/order-notification-settings";
import { isPermanentOrderNotificationError } from "@/lib/order-notifications";
import { EnvironmentConfigurationError } from "@/lib/server/env";
import { sendOrderPlacedEmails } from "@/lib/server/order-notifications";
import {
  findOrderIdsNeedingNotificationRecovery,
  markOrderNotificationSent,
  markOrderNotificationSuppressed
} from "@/lib/server/order-notification-state";

export const sendOrderPlacedNotification = inngest.createFunction(
  {
    id: "send-order-placed-notification",
    ...ORDER_NOTIFICATION_FUNCTION_SETTINGS,
    triggers: [orderPlacedEvent]
  },
  async ({ event, step }) => {
    const delivery = await step.run("send-customer-and-admin-email", async () => {
      try {
        return await sendOrderPlacedEmails(event.data.orderId);
      } catch (error) {
        if (error instanceof EnvironmentConfigurationError || isPermanentOrderNotificationError(error)) {
          throw new NonRetriableError("Order notification has a permanent configuration or data error.");
        }
        throw error;
      }
    });

    if (delivery.outcome === "sent") {
      await step.run("mark-order-notification-sent", () => {
        return markOrderNotificationSent(event.data.orderId);
      });
    } else if (delivery.outcome === "suppressed") {
      await step.run("mark-order-notification-suppressed", () => {
        return markOrderNotificationSuppressed(event.data.orderId);
      });
    }

    return delivery;
  }
);

export const recoverOrderNotifications = inngest.createFunction(
  {
    id: "recover-pending-order-notifications",
    ...ORDER_NOTIFICATION_RECOVERY_SETTINGS,
    triggers: [cron("TZ=Africa/Lagos 0 */12 * * *")]
  },
  async ({ event, step }) => {
    const orderIds = await step.run("find-pending-order-notifications", () => {
      return findOrderIdsNeedingNotificationRecovery();
    });

    if (orderIds.length === 0) return { recovered: 0 };

    await step.sendEvent(
      "requeue-pending-order-notifications",
      orderIds.map((orderId) => createOrderPlacedEvent(orderId, event.id))
    );
    return { recovered: orderIds.length };
  }
);
