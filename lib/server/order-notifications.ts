import "server-only";
import { createOrderNotificationDispatcher } from "@/lib/order-notifications";
import { sendTransactionalEmails } from "@/lib/server/email-delivery";
import {
  getOrderNotificationEnvironment,
  getSiteUrl
} from "@/lib/server/env";
import {
  loadOrderForNotification,
  markOrderNotificationEnqueued
} from "@/lib/server/order-notification-state";

export const sendOrderPlacedEmails = createOrderNotificationDispatcher({
  loadOrder: loadOrderForNotification,
  markEnqueued: markOrderNotificationEnqueued,
  getConfig: () => ({
    ...getOrderNotificationEnvironment(),
    siteUrl: getSiteUrl()
  }),
  sendMany: sendTransactionalEmails
});
