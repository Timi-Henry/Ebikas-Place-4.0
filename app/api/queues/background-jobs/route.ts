import { handleCallback } from "@vercel/queue";
import {
  backgroundJobBackoffMs,
  backgroundQueueEnvelopeSchema,
  sanitizeBackgroundJobErrorCode
} from "@/lib/background-jobs";
import {
  BackgroundJobRetryError,
  createBackgroundJobProcessor,
  type ClaimedBackgroundJob
} from "@/lib/server/background-job-processor";
import {
  claimBackgroundJob,
  completeBackgroundJob,
  deadBackgroundJob,
  deferForRecovery,
  releaseForQueueRetry
} from "@/lib/server/background-job-store";
import {
  markWelcomeNotificationSent,
  markWelcomeNotificationSuppressed
} from "@/lib/server/clerk-users";
import { getDb } from "@/lib/server/mongodb";
import {
  markOrderNotificationSent,
  markOrderNotificationSuppressed
} from "@/lib/server/order-notification-state";
import { sendOrderPlacedEmails } from "@/lib/server/order-notifications";
import { sendWelcomeEmail } from "@/lib/server/welcome-notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

function leaseInput(job: ClaimedBackgroundJob) {
  return { jobId: job.id, leaseId: job.leaseId };
}

function delayFrom(nextAttemptAt: Date) {
  return Math.max(1_000, nextAttemptAt.getTime() - Date.now());
}

async function requireLeasedTransition<T>(transition: Promise<T | null>) {
  const result = await transition;
  if (!result) throw new Error("Background job lease was lost before its state transition.");
}

const processBackgroundJob = createBackgroundJobProcessor({
  async claimJob(jobId, options) {
    const db = await getDb();
    const claim = await claimBackgroundJob(db, {
      jobId,
      leaseMs: options.leaseMs
    });
    if (claim.outcome !== "claimed") return claim;
    const document = claim.document;
    if (!document.leaseId) throw new Error("Claimed background job has no lease identifier.");
    return {
      outcome: "claimed" as const,
      job: {
        id: document._id,
        kind: document.kind,
        entityId: document.entityId,
        attempts: document.attempts,
        leaseId: document.leaseId
      }
    };
  },
  async completeJob(job) {
    const db = await getDb();
    await requireLeasedTransition(completeBackgroundJob(db, leaseInput(job)));
  },
  async markJobDead(job, errorCode) {
    const db = await getDb();
    await requireLeasedTransition(deadBackgroundJob(db, {
      ...leaseInput(job),
      errorCode
    }));
  },
  async releaseJobForQueueRetry(job, errorCode, nextAttemptAt) {
    const db = await getDb();
    await requireLeasedTransition(releaseForQueueRetry(db, {
      ...leaseInput(job),
      errorCode,
      recoverAfterMs: delayFrom(nextAttemptAt)
    }));
  },
  async deferJobForRecovery(job, errorCode, nextAttemptAt) {
    const db = await getDb();
    await requireLeasedTransition(deferForRecovery(db, {
      ...leaseInput(job),
      errorCode,
      delayMs: delayFrom(nextAttemptAt)
    }));
  },
  sendOrderNotification: sendOrderPlacedEmails,
  sendWelcomeNotification: sendWelcomeEmail,
  markOrderNotificationSent,
  markOrderNotificationSuppressed,
  markWelcomeNotificationSent,
  markWelcomeNotificationSuppressed,
  errorCode: sanitizeBackgroundJobErrorCode,
  retryDelayMs: backgroundJobBackoffMs,
  now: () => new Date()
});

const handleBackgroundJobCallback = handleCallback<unknown>(
  async (message, metadata) => {
    const envelope = backgroundQueueEnvelopeSchema.safeParse(message);
    if (!envelope.success) {
      console.warn("background-job.invalid-envelope", {
        messageId: metadata.messageId,
        deliveryCount: metadata.deliveryCount
      });
      return;
    }
    const result = await processBackgroundJob(envelope.data.jobId);
    console.info("background-job.processed", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      jobId: envelope.data.jobId,
      outcome: result.outcome,
      ...(result.outcome === "ignored" ? { reason: result.reason } : {}),
      ...(result.outcome === "dead" || result.outcome === "deferred"
        ? { errorCode: result.errorCode }
        : {})
    });
    if (result.outcome === "ignored" && (result.reason === "busy" || result.reason === "not-due")) {
      throw new BackgroundJobRetryError(30);
    }
  },
  {
    visibilityTimeoutSeconds: 300,
    retry(error) {
      if (error instanceof BackgroundJobRetryError) {
        return { afterSeconds: error.afterSeconds };
      }
      return undefined;
    }
  }
);

/** Keeps Next.js's route signature narrow while the SDK also supports event wrappers. */
export function POST(request: Request) {
  return handleBackgroundJobCallback(request);
}
