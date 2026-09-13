import "server-only";

import {
  clerkUserLifecycleEventNames,
  parseClerkUserLifecycleEvent,
  type ClerkUserSnapshot
} from "@/lib/clerk-user-lifecycle";
import { EnvironmentConfigurationError } from "@/lib/server/env";

type VerifiedClerkWebhook = {
  type: string;
  data: unknown;
};

type ClerkUserSyncResult = {
  outcome: "synced" | "stale" | "deleted";
  enqueueWelcome?: boolean;
};

export type ClerkWebhookDependencies = {
  verify(request: Request): Promise<VerifiedClerkWebhook>;
  syncUser(
    user: ClerkUserSnapshot,
    kind: "created" | "updated"
  ): Promise<ClerkUserSyncResult>;
  cleanupUser(userId: string): Promise<unknown>;
  enqueueWelcome(userId: string): Promise<unknown>;
};

const supportedEventNames = new Set<string>(clerkUserLifecycleEventNames);

function jsonResponse(body: Readonly<Record<string, unknown>>, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

/**
 * Creates a signed Clerk webhook ingress while keeping verification and side
 * effects injectable for deterministic tests. No raw payload or verifier error
 * is returned or logged here because either may contain account data or signing
 * details.
 */
export function createClerkWebhookHandler(dependencies: ClerkWebhookDependencies) {
  return async function handleClerkWebhook(request: Request) {
    let event: VerifiedClerkWebhook;
    try {
      event = await dependencies.verify(request);
    } catch (error) {
      // A bad signature is a permanent client error. Missing server
      // configuration is operational and must remain retryable by Clerk.
      if (error instanceof EnvironmentConfigurationError) {
        return jsonResponse({ error: "Webhook is temporarily unavailable." }, 500);
      }
      return jsonResponse({ error: "Invalid webhook signature." }, 400);
    }

    if (!supportedEventNames.has(event.type)) {
      return jsonResponse({ ok: true, ignored: true }, 200);
    }

    let lifecycle: ReturnType<typeof parseClerkUserLifecycleEvent>;
    try {
      lifecycle = parseClerkUserLifecycleEvent(event.type, event.data);
    } catch {
      return jsonResponse({ error: "Invalid webhook payload." }, 400);
    }

    try {
      if (lifecycle.kind === "deleted") {
        await dependencies.cleanupUser(lifecycle.userId);
      } else {
        const sync = await dependencies.syncUser(lifecycle.user, lifecycle.kind);
        if (sync.outcome !== "deleted" && (lifecycle.kind === "created" || sync.enqueueWelcome)) {
          await dependencies.enqueueWelcome(lifecycle.user.userId);
        }
      }
    } catch {
      // A 5xx response tells Clerk to retry transient database and queue
      // failures. The underlying sync, cleanup, and enqueue operations are
      // idempotent, so a replay is safe.
      return jsonResponse({ error: "Unable to process webhook." }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  };
}
