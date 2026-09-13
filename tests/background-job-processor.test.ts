import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TransactionalEmailProviderError } from "@/lib/email-delivery";
import { OrderNotificationPermanentError } from "@/lib/order-notifications";
import {
  BACKGROUND_JOB_LEASE_MS,
  BACKGROUND_JOB_MAX_ATTEMPTS,
  BackgroundJobRetryError,
  createBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type ClaimedBackgroundJob
} from "@/lib/server/background-job-processor";
import { BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS } from "@/lib/server/background-job-store";
import { EnvironmentConfigurationError } from "@/lib/server/env";

const now = new Date("2026-08-13T12:00:00.000Z");
const orderJob: ClaimedBackgroundJob = {
  id: "job-order-1",
  kind: "order-notification",
  entityId: "64b000000000000000000001",
  attempts: 1,
  leaseId: "lease-1"
};
const welcomeJob: ClaimedBackgroundJob = {
  id: "job-welcome-1",
  kind: "welcome-notification",
  entityId: "user_123",
  attempts: 1,
  leaseId: "lease-2"
};

function dependencies(job: ClaimedBackgroundJob = orderJob) {
  return {
    claimJob: vi.fn().mockResolvedValue({ outcome: "claimed", job }),
    completeJob: vi.fn().mockResolvedValue(undefined),
    markJobDead: vi.fn().mockResolvedValue(undefined),
    releaseJobForQueueRetry: vi.fn().mockResolvedValue(undefined),
    deferJobForRecovery: vi.fn().mockResolvedValue(undefined),
    sendOrderNotification: vi.fn().mockResolvedValue({ outcome: "sent" }),
    sendWelcomeNotification: vi.fn().mockResolvedValue({ outcome: "sent" }),
    markOrderNotificationSent: vi.fn().mockResolvedValue(undefined),
    markOrderNotificationSuppressed: vi.fn().mockResolvedValue(undefined),
    markWelcomeNotificationSent: vi.fn().mockResolvedValue(undefined),
    markWelcomeNotificationSuppressed: vi.fn().mockResolvedValue(undefined),
    errorCode: vi.fn(() => "safe_error"),
    retryDelayMs: vi.fn(() => 30_000),
    now: vi.fn(() => now)
  } satisfies BackgroundJobProcessorDependencies;
}

describe("background job processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["missing", "busy", "handled", "not-due"] as const)(
    "acknowledges a %s claim without dispatching",
    async (outcome) => {
      const deps = dependencies();
      deps.claimJob.mockResolvedValue({ outcome });
      const processJob = createBackgroundJobProcessor(deps);

      await expect(processJob("job-1")).resolves.toEqual({ outcome: "ignored", reason: outcome });
      expect(deps.claimJob).toHaveBeenCalledWith("job-1", {
        leaseMs: BACKGROUND_JOB_LEASE_MS,
        maxAttempts: BACKGROUND_JOB_MAX_ATTEMPTS
      });
      expect(deps.sendOrderNotification).not.toHaveBeenCalled();
      expect(deps.completeJob).not.toHaveBeenCalled();
    }
  );

  it("delivers and completes an order notification", async () => {
    const deps = dependencies();
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(orderJob.id)).resolves.toEqual({
      outcome: "completed",
      jobId: orderJob.id
    });
    expect(deps.sendOrderNotification).toHaveBeenCalledWith(orderJob.entityId);
    expect(deps.markOrderNotificationSent).toHaveBeenCalledWith(orderJob.entityId);
    expect(deps.completeJob).toHaveBeenCalledWith(orderJob);
  });

  it("persists a suppressed welcome notification before completing its job", async () => {
    const deps = dependencies(welcomeJob);
    deps.sendWelcomeNotification.mockResolvedValue({ outcome: "suppressed" });
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(welcomeJob.id)).resolves.toMatchObject({ outcome: "completed" });
    expect(deps.markWelcomeNotificationSuppressed).toHaveBeenCalledWith(welcomeJob.entityId);
    expect(deps.markWelcomeNotificationSent).not.toHaveBeenCalled();
    expect(deps.completeJob).toHaveBeenCalledWith(welcomeJob);
  });

  it("completes an already-handled notification without rewriting notification state", async () => {
    const deps = dependencies();
    deps.sendOrderNotification.mockResolvedValue({ outcome: "already-handled" });
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(orderJob.id)).resolves.toMatchObject({ outcome: "completed" });
    expect(deps.markOrderNotificationSent).not.toHaveBeenCalled();
    expect(deps.markOrderNotificationSuppressed).not.toHaveBeenCalled();
    expect(deps.completeJob).toHaveBeenCalledWith(orderJob);
  });

  it.each([
    new OrderNotificationPermanentError("order_not_found"),
    new TransactionalEmailProviderError("invalid_parameter", 400)
  ])("marks permanent failures dead and acknowledges them", async (error) => {
    const deps = dependencies();
    deps.sendOrderNotification.mockRejectedValue(error);
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(orderJob.id)).resolves.toEqual({
      outcome: "dead",
      jobId: orderJob.id,
      errorCode: "safe_error"
    });
    expect(deps.markJobDead).toHaveBeenCalledWith(orderJob, "safe_error");
    expect(deps.releaseJobForQueueRetry).not.toHaveBeenCalled();
  });

  it("retries repairable environment configuration failures", async () => {
    const deps = dependencies();
    deps.sendOrderNotification.mockRejectedValue(
      new EnvironmentConfigurationError("Missing sender", ["RESEND_API_KEY"])
    );
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(orderJob.id)).rejects.toBeInstanceOf(BackgroundJobRetryError);
    expect(deps.releaseJobForQueueRetry).toHaveBeenCalled();
    expect(deps.markJobDead).not.toHaveBeenCalled();
  });

  it("releases transient failures before asking the queue to retry", async () => {
    const deps = dependencies();
    deps.sendOrderNotification.mockRejectedValue(
      new TransactionalEmailProviderError("request_failed", null)
    );
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(orderJob.id)).rejects.toEqual(new BackgroundJobRetryError(30));
    expect(deps.releaseJobForQueueRetry).toHaveBeenCalledWith(
      orderJob,
      "safe_error",
      new Date("2026-08-13T12:00:30.000Z")
    );
    expect(deps.deferJobForRecovery).not.toHaveBeenCalled();
  });

  it("defers an exhausted transient failure for recovery and acknowledges the queue message", async () => {
    const exhausted = { ...orderJob, attempts: BACKGROUND_JOB_MAX_ATTEMPTS };
    const deps = dependencies(exhausted);
    deps.sendOrderNotification.mockRejectedValue(new Error("temporary database outage"));
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(exhausted.id)).resolves.toEqual({
      outcome: "deferred",
      jobId: exhausted.id,
      errorCode: "safe_error"
    });
    expect(deps.deferJobForRecovery).toHaveBeenCalledWith(
      exhausted,
      "safe_error",
      new Date("2026-08-13T12:00:30.000Z")
    );
    expect(deps.releaseJobForQueueRetry).not.toHaveBeenCalled();
  });

  it("stops transient retries at the total attempt ceiling", async () => {
    const exhausted = { ...orderJob, attempts: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS };
    const deps = dependencies(exhausted);
    deps.sendOrderNotification.mockRejectedValue(new Error("temporary provider outage"));
    const processJob = createBackgroundJobProcessor(deps);

    await expect(processJob(exhausted.id)).resolves.toEqual({
      outcome: "dead",
      jobId: exhausted.id,
      errorCode: "safe_error"
    });
    expect(deps.markJobDead).toHaveBeenCalledWith(exhausted, "safe_error");
    expect(deps.deferJobForRecovery).not.toHaveBeenCalled();
  });
});
