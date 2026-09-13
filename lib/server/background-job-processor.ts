import "server-only";
import { isPermanentOrderNotificationError } from "@/lib/order-notifications";
import { isPermanentWelcomeNotificationError } from "@/lib/welcome-notifications";
import { BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS } from "@/lib/server/background-job-store";

export const BACKGROUND_JOB_MAX_ATTEMPTS = 4;
export const BACKGROUND_JOB_LEASE_MS = 60_000;

export type ClaimedBackgroundJob = {
  id: string;
  kind: "order-notification" | "welcome-notification";
  entityId: string;
  attempts: number;
  leaseId: string;
};

export type BackgroundJobClaim =
  | { outcome: "claimed"; job: ClaimedBackgroundJob }
  | { outcome: "missing" | "busy" | "handled" | "not-due" };

type NotificationDelivery = {
  outcome: "sent" | "suppressed" | "already-handled";
};

export type BackgroundJobProcessorDependencies = {
  claimJob(
    jobId: string,
    options: { leaseMs: number; maxAttempts: number }
  ): Promise<BackgroundJobClaim>;
  completeJob(job: ClaimedBackgroundJob): Promise<void>;
  markJobDead(job: ClaimedBackgroundJob, errorCode: string): Promise<void>;
  releaseJobForQueueRetry(
    job: ClaimedBackgroundJob,
    errorCode: string,
    nextAttemptAt: Date
  ): Promise<void>;
  deferJobForRecovery(
    job: ClaimedBackgroundJob,
    errorCode: string,
    nextAttemptAt: Date
  ): Promise<void>;
  sendOrderNotification(orderId: string): Promise<NotificationDelivery>;
  sendWelcomeNotification(userId: string): Promise<NotificationDelivery>;
  markOrderNotificationSent(orderId: string): Promise<void>;
  markOrderNotificationSuppressed(orderId: string): Promise<void>;
  markWelcomeNotificationSent(userId: string): Promise<void>;
  markWelcomeNotificationSuppressed(userId: string): Promise<void>;
  errorCode(error: unknown): string;
  retryDelayMs(attempt: number): number;
  now(): Date;
};

export type BackgroundJobProcessorResult =
  | { outcome: "ignored"; reason: Exclude<BackgroundJobClaim["outcome"], "claimed"> }
  | { outcome: "completed"; jobId: string }
  | { outcome: "dead"; jobId: string; errorCode: string }
  | { outcome: "deferred"; jobId: string; errorCode: string };

/**
 * Signals the queue adapter only after retry state has been durably released.
 * The delay keeps redelivery aligned with the job's persisted next-attempt time.
 */
export class BackgroundJobRetryError extends Error {
  constructor(public readonly afterSeconds: number) {
    super("Background job is ready for a queue retry.");
    this.name = "BackgroundJobRetryError";
  }
}

function isPermanentFailure(error: unknown, kind: ClaimedBackgroundJob["kind"]) {
  return kind === "order-notification"
    ? isPermanentOrderNotificationError(error)
    : isPermanentWelcomeNotificationError(error);
}

function nextAttempt(dependencies: BackgroundJobProcessorDependencies, attempt: number) {
  const delayMs = Math.max(1_000, dependencies.retryDelayMs(attempt));
  return {
    delayMs,
    at: new Date(dependencies.now().getTime() + delayMs)
  };
}

async function deliverClaimedJob(
  job: ClaimedBackgroundJob,
  dependencies: BackgroundJobProcessorDependencies
) {
  const delivery = job.kind === "order-notification"
    ? await dependencies.sendOrderNotification(job.entityId)
    : await dependencies.sendWelcomeNotification(job.entityId);

  if (delivery.outcome === "sent") {
    if (job.kind === "order-notification") {
      await dependencies.markOrderNotificationSent(job.entityId);
    } else {
      await dependencies.markWelcomeNotificationSent(job.entityId);
    }
  } else if (delivery.outcome === "suppressed") {
    if (job.kind === "order-notification") {
      await dependencies.markOrderNotificationSuppressed(job.entityId);
    } else {
      await dependencies.markWelcomeNotificationSuppressed(job.entityId);
    }
  }

  await dependencies.completeJob(job);
}

export function createBackgroundJobProcessor(
  dependencies: BackgroundJobProcessorDependencies
) {
  return async function processBackgroundJob(jobId: string): Promise<BackgroundJobProcessorResult> {
    const claim = await dependencies.claimJob(jobId, {
      leaseMs: BACKGROUND_JOB_LEASE_MS,
      maxAttempts: BACKGROUND_JOB_MAX_ATTEMPTS
    });

    if (claim.outcome !== "claimed") {
      return { outcome: "ignored", reason: claim.outcome };
    }

    const { job } = claim;
    try {
      await deliverClaimedJob(job, dependencies);
      return { outcome: "completed", jobId: job.id };
    } catch (error) {
      const errorCode = dependencies.errorCode(error);
      if (isPermanentFailure(error, job.kind)) {
        await dependencies.markJobDead(job, errorCode);
        return { outcome: "dead", jobId: job.id, errorCode };
      }

      if (job.attempts >= BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS) {
        await dependencies.markJobDead(job, errorCode);
        return { outcome: "dead", jobId: job.id, errorCode };
      }

      const retry = nextAttempt(dependencies, job.attempts);
      if (job.attempts >= BACKGROUND_JOB_MAX_ATTEMPTS) {
        await dependencies.deferJobForRecovery(job, errorCode, retry.at);
        return { outcome: "deferred", jobId: job.id, errorCode };
      }

      await dependencies.releaseJobForQueueRetry(job, errorCode, retry.at);
      throw new BackgroundJobRetryError(Math.max(1, Math.ceil(retry.delayMs / 1_000)));
    }
  };
}
