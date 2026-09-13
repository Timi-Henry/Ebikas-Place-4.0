import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { createClerkWebhookHandler } from "@/lib/server/clerk-webhook";
import {
  cleanupDeletedClerkUser,
  syncClerkUserProfile
} from "@/lib/server/clerk-users";
import { enqueueWelcomeNotificationJob } from "@/lib/server/background-job-service";
import { getClerkWebhookEnvironment } from "@/lib/server/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = createClerkWebhookHandler({
  // Next.js supplies a NextRequest at this route boundary. Keep the reusable
  // handler expressed against the standard Request interface for easy testing.
  verify: (request) => verifyWebhook(request as NextRequest, {
    signingSecret: getClerkWebhookEnvironment().signingSecret
  }),
  syncUser: syncClerkUserProfile,
  cleanupUser: cleanupDeletedClerkUser,
  enqueueWelcome: enqueueWelcomeNotificationJob
});
