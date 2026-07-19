import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { handleClerkUserLifecycle } from "@/lib/inngest/functions/clerk-user-lifecycle";
import {
  recoverOrderNotifications,
  sendOrderPlacedNotification
} from "@/lib/inngest/functions/order-notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendOrderPlacedNotification, recoverOrderNotifications, handleClerkUserLifecycle]
});
