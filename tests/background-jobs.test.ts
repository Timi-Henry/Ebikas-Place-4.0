import { describe, expect, it } from "vitest";
import {
  BACKGROUND_JOB_MAX_BACKOFF_MS,
  backgroundJobBackoffMs,
  backgroundJobEnvelope,
  backgroundJobId,
  backgroundJobPublicationId,
  backgroundQueueEnvelopeSchema,
  orderNotificationJobId,
  sanitizeBackgroundJobErrorCode,
  welcomeNotificationJobId
} from "@/lib/background-jobs";

describe("background job identifiers", () => {
  it("creates stable opaque IDs without embedding the entity identifier", () => {
    const entityId = "user_personal-identifier";
    const first = welcomeNotificationJobId(entityId);

    expect(first).toBe(welcomeNotificationJobId(entityId));
    expect(first).not.toContain(entityId);
    expect(first).toMatch(/^job_welcome_[a-f0-9]{40}$/);
    expect(orderNotificationJobId(entityId)).not.toBe(first);
    expect(backgroundJobId("order-notification", "another-order")).not.toBe(
      backgroundJobId("order-notification", entityId)
    );
  });

  it("gives every publish generation a deterministic deduplication ID", () => {
    const jobId = orderNotificationJobId("64b000000000000000000001");

    expect(backgroundJobPublicationId(jobId, 1)).toBe(backgroundJobPublicationId(jobId, 1));
    expect(backgroundJobPublicationId(jobId, 2)).not.toBe(backgroundJobPublicationId(jobId, 1));
    expect(() => backgroundJobPublicationId(jobId, 0)).toThrow(TypeError);
  });
});

describe("background queue envelopes", () => {
  it("accepts only the versioned opaque job envelope", () => {
    const job = backgroundJobEnvelope(orderNotificationJobId("64b000000000000000000001"));

    expect(backgroundQueueEnvelopeSchema.parse(job)).toEqual(job);
    expect(Object.keys(job)).toEqual(["v", "type", "jobId"]);
  });

  it("rejects payload fields and malformed identifiers", () => {
    expect(() => backgroundQueueEnvelopeSchema.parse({
      ...backgroundJobEnvelope(orderNotificationJobId("order-one")),
      email: "must-not-enter-the-queue@example.test"
    })).toThrow();
    expect(() => backgroundQueueEnvelopeSchema.parse({ v: 1, type: "job", jobId: "order-one" })).toThrow();
    expect(() => backgroundQueueEnvelopeSchema.parse({ v: 1, type: "recovery", bucket: "1" })).toThrow();
  });
});

describe("background job retry metadata", () => {
  it("uses bounded exponential backoff", () => {
    expect(backgroundJobBackoffMs(1)).toBe(30_000);
    expect(backgroundJobBackoffMs(2)).toBe(60_000);
    expect(backgroundJobBackoffMs(100)).toBe(BACKGROUND_JOB_MAX_BACKOFF_MS);
    expect(() => backgroundJobBackoffMs(0)).toThrow(TypeError);
  });

  it("keeps bounded error categories and drops messages or personal data", () => {
    expect(sanitizeBackgroundJobErrorCode({ code: "PROVIDER_TIMEOUT" })).toBe("provider_timeout");
    expect(sanitizeBackgroundJobErrorCode(new TypeError("private provider response"))).toBe("typeerror");
    expect(sanitizeBackgroundJobErrorCode("failed for person@example.test")).toBe("unknown_error");
    expect(sanitizeBackgroundJobErrorCode({})).toBe("unknown_error");
  });
});
