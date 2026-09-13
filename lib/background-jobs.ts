import { createHash } from "node:crypto";
import { z } from "zod";

export const backgroundJobKinds = ["order-notification", "welcome-notification"] as const;
export const backgroundJobStatuses = [
  "pending",
  "publishing",
  "published",
  "processing",
  "retryable",
  "completed",
  "dead"
] as const;

export type BackgroundJobKind = (typeof backgroundJobKinds)[number];
export type BackgroundJobStatus = (typeof backgroundJobStatuses)[number];

export type BackgroundJobDocument = {
  _id: string;
  kind: BackgroundJobKind;
  entityId: string;
  status: BackgroundJobStatus;
  attempts: number;
  publishGeneration: number;
  nextAttemptAt: Date;
  leaseId?: string;
  leaseUntil?: Date;
  lastErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
  deadAt?: Date;
  purgeAt?: Date;
};

export const BACKGROUND_JOB_BASE_BACKOFF_MS = 30_000;
export const BACKGROUND_JOB_MAX_BACKOFF_MS = 6 * 60 * 60 * 1_000;

const entityIdentifierMaxLength = 256;
const errorCodeMaxLength = 64;
const jobIdPattern = /^job_(?:order|welcome)_[a-f0-9]{40}$/;

function requireEntityIdentifier(entityId: string) {
  if (
    typeof entityId !== "string" ||
    entityId.length === 0 ||
    entityId.length > entityIdentifierMaxLength ||
    entityId !== entityId.trim() ||
    /[\u0000-\u001f\u007f]/.test(entityId)
  ) {
    throw new TypeError("Background job entityId must be a bounded identifier without surrounding whitespace.");
  }
  return entityId;
}

/**
 * Produces a stable, non-reversible queue identifier. The entity identifier is
 * retained only in MongoDB and is never embedded in the external queue body.
 */
export function backgroundJobId(kind: BackgroundJobKind, entityId: string) {
  if (!backgroundJobKinds.includes(kind)) throw new TypeError("Unsupported background job kind.");
  const safeEntityId = requireEntityIdentifier(entityId);
  const digest = createHash("sha256")
    .update("ebikas-place:background-job:v1\0", "utf8")
    .update(kind, "utf8")
    .update("\0", "utf8")
    .update(safeEntityId, "utf8")
    .digest("hex")
    .slice(0, 40);
  const prefix = kind === "order-notification" ? "order" : "welcome";
  return `job_${prefix}_${digest}`;
}

export function orderNotificationJobId(orderId: string) {
  return backgroundJobId("order-notification", orderId);
}

export function welcomeNotificationJobId(userId: string) {
  return backgroundJobId("welcome-notification", userId);
}

export function backgroundJobPublicationId(jobId: string, publishGeneration: number) {
  if (!jobIdPattern.test(jobId)) throw new TypeError("Invalid background job ID.");
  if (!Number.isSafeInteger(publishGeneration) || publishGeneration < 1) {
    throw new TypeError("Publish generation must be a positive safe integer.");
  }
  return `publication_${jobId}_${publishGeneration}`;
}

const jobQueueEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.literal("job"),
  jobId: z.string().regex(jobIdPattern)
}).strict();

export const backgroundQueueEnvelopeSchema = jobQueueEnvelopeSchema;

export type BackgroundQueueEnvelope = z.infer<typeof backgroundQueueEnvelopeSchema>;

export function backgroundJobEnvelope(jobId: string): BackgroundQueueEnvelope {
  return jobQueueEnvelopeSchema.parse({ v: 1, type: "job", jobId });
}

export function backgroundJobBackoffMs(
  attempt: number,
  options: { baseMs?: number; maxMs?: number } = {}
) {
  const baseMs = options.baseMs ?? BACKGROUND_JOB_BASE_BACKOFF_MS;
  const maxMs = options.maxMs ?? BACKGROUND_JOB_MAX_BACKOFF_MS;
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new TypeError("Background job attempt must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(baseMs) || baseMs < 1 || !Number.isSafeInteger(maxMs) || maxMs < baseMs) {
    throw new TypeError("Background job backoff bounds are invalid.");
  }

  const exponent = Math.min(30, attempt - 1);
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

/** Persists only a bounded category, never an exception message or provider response. */
export function sanitizeBackgroundJobErrorCode(error: unknown) {
  let candidate = "unknown_error";
  if (typeof error === "string" || typeof error === "number") {
    candidate = String(error);
  } else if (error && typeof error === "object") {
    const value = "code" in error ? error.code : "name" in error ? error.name : undefined;
    if (typeof value === "string" || typeof value === "number") candidate = String(value);
  }

  const normalized = candidate.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > errorCodeMaxLength ||
    !/^[a-z0-9][a-z0-9_.-]*$/.test(normalized)
  ) {
    return "unknown_error";
  }
  return normalized;
}
