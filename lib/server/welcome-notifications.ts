import "server-only";
import { createWelcomeNotificationDispatcher } from "@/lib/welcome-notifications";
import {
  loadClerkUserForWelcome,
  markWelcomeNotificationEnqueued
} from "@/lib/server/clerk-users";
import { sendTransactionalEmails } from "@/lib/server/email-delivery";
import { getSiteUrl } from "@/lib/server/env";

export const sendWelcomeEmail = createWelcomeNotificationDispatcher({
  loadUser: loadClerkUserForWelcome,
  markEnqueued: markWelcomeNotificationEnqueued,
  getConfig: () => ({ siteUrl: getSiteUrl() }),
  sendMany: sendTransactionalEmails
});
