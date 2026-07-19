import { eventType, NonRetriableError } from "inngest";
import { parseClerkUserLifecycleEvent } from "@/lib/clerk-user-lifecycle";
import { isPermanentWelcomeNotificationError } from "@/lib/welcome-notifications";
import { inngest } from "@/lib/inngest/client";
import { CLERK_USER_LIFECYCLE_FUNCTION_SETTINGS } from "@/lib/inngest/clerk-user-lifecycle-settings";
import {
  cleanupDeletedClerkUser,
  markWelcomeNotificationSent,
  markWelcomeNotificationSuppressed,
  syncClerkUserProfile
} from "@/lib/server/clerk-users";
import { EnvironmentConfigurationError } from "@/lib/server/env";
import { sendWelcomeEmail } from "@/lib/server/welcome-notifications";

export const clerkUserCreatedEvent = eventType("clerk/user.created");
export const clerkUserUpdatedEvent = eventType("clerk/user.updated");
export const clerkUserDeletedEvent = eventType("clerk/user.deleted");

function parseEvent(eventName: string, data: unknown) {
  try {
    return parseClerkUserLifecycleEvent(eventName, data);
  } catch {
    throw new NonRetriableError("Clerk sent an invalid user lifecycle payload.");
  }
}

export const handleClerkUserLifecycle = inngest.createFunction(
  {
    id: "handle-clerk-user-lifecycle",
    ...CLERK_USER_LIFECYCLE_FUNCTION_SETTINGS,
    triggers: [clerkUserCreatedEvent, clerkUserUpdatedEvent, clerkUserDeletedEvent]
  },
  async ({ event, step }) => {
    const lifecycle = parseEvent(event.name, event.data);

    if (lifecycle.kind === "deleted") {
      return step.run("cleanup-deleted-user", () => cleanupDeletedClerkUser(lifecycle.userId));
    }

    const sync = await step.run("sync-user-profile", () => {
      return syncClerkUserProfile(lifecycle.user, lifecycle.kind);
    });

    if (lifecycle.kind === "updated" || sync.outcome === "deleted") {
      return { ...sync, userId: lifecycle.user.userId };
    }

    const delivery = await step.run("send-welcome-email", async () => {
      try {
        return await sendWelcomeEmail(lifecycle.user.userId);
      } catch (error) {
        if (error instanceof EnvironmentConfigurationError || isPermanentWelcomeNotificationError(error)) {
          throw new NonRetriableError("Welcome email has a permanent configuration or data error.");
        }
        throw error;
      }
    });

    if (delivery.outcome === "sent") {
      await step.run("mark-welcome-email-sent", () => {
        return markWelcomeNotificationSent(lifecycle.user.userId);
      });
    } else if (delivery.outcome === "suppressed") {
      await step.run("mark-welcome-email-suppressed", () => {
        return markWelcomeNotificationSuppressed(lifecycle.user.userId);
      });
    }

    return delivery;
  }
);
