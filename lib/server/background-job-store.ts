import "server-only";
import { randomUUID } from "node:crypto";
import type { ClientSession, Db, Filter } from "mongodb";
import {
  backgroundJobBackoffMs,
  backgroundJobEnvelope,
  backgroundJobId,
  backgroundJobPublicationId,
  sanitizeBackgroundJobErrorCode,
  type BackgroundJobDocument,
  type BackgroundJobKind,
  type BackgroundJobStatus
} from "@/lib/background-jobs";

const collectionName = "background_jobs";

export const BACKGROUND_JOB_PUBLICATION_TIMEOUT_MS = 2 * 60 * 1_000;
export const BACKGROUND_JOB_PUBLISHED_RECOVERY_MS = 15 * 60 * 1_000;
export const BACKGROUND_JOB_DEFAULT_LEASE_MS = 60_000;
export const BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS = 12;
export const BACKGROUND_JOB_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

const indexPromises = new WeakMap<Db, Promise<void>>();

function jobs(db: Db) {
  return db.collection<BackgroundJobDocument>(collectionName);
}

function requireDate(value: Date | undefined) {
  const resolved = value ? new Date(value) : new Date();
  if (!Number.isFinite(resolved.getTime())) throw new TypeError("Background job time must be a valid date.");
  return resolved;
}

function requireDuration(value: number | undefined, fallback: number) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1_000 || resolved > 24 * 60 * 60 * 1_000) {
    throw new TypeError("Background job duration must be between one second and one day.");
  }
  return resolved;
}

function requireLeaseId(value: string | undefined) {
  const leaseId = value || randomUUID();
  if (leaseId.length > 128 || leaseId !== leaseId.trim() || /[\u0000-\u001f\u007f]/.test(leaseId)) {
    throw new TypeError("Background job lease ID is invalid.");
  }
  return leaseId;
}

async function ensureIndexes(db: Db) {
  const existing = indexPromises.get(db);
  if (existing) return existing;

  const promise = jobs(db)
    .createIndexes([
      { key: { status: 1, nextAttemptAt: 1, createdAt: 1 }, name: "background_jobs_due" },
      { key: { status: 1, leaseUntil: 1 }, name: "background_jobs_expired_lease" },
      {
        key: { purgeAt: 1 },
        name: "background_jobs_terminal_ttl",
        expireAfterSeconds: 0,
        partialFilterExpression: { purgeAt: { $type: "date" } }
      }
    ])
    .then(() => undefined)
    .catch((error) => {
      indexPromises.delete(db);
      throw error;
    });
  indexPromises.set(db, promise);
  return promise;
}

export type InsertBackgroundJobInput = {
  kind: BackgroundJobKind;
  entityId: string;
  now?: Date;
};

export type InsertBackgroundJobResult = {
  jobId: string;
  inserted: boolean;
};

export type ReopenTerminalBackgroundJobInput = {
  jobId: string;
  kind: BackgroundJobKind;
  entityId: string;
  now?: Date;
};

/** Writes the durable intent in the caller's existing business transaction. */
export async function insertBackgroundJobInTransaction(
  db: Db,
  session: ClientSession,
  input: InsertBackgroundJobInput
): Promise<InsertBackgroundJobResult> {
  const now = requireDate(input.now);
  const jobId = backgroundJobId(input.kind, input.entityId);
  const document: BackgroundJobDocument = {
    _id: jobId,
    kind: input.kind,
    entityId: input.entityId,
    status: "pending",
    attempts: 0,
    publishGeneration: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now
  };
  const result = await jobs(db).updateOne(
    { _id: jobId },
    { $setOnInsert: document },
    { upsert: true, session }
  );
  return { jobId, inserted: result.upsertedCount === 1 };
}

/**
 * Reopens one terminal intent inside a caller-owned transaction. This is used
 * only when the domain record has independently returned to a pending state.
 */
export async function reopenTerminalBackgroundJobInTransaction(
  db: Db,
  session: ClientSession,
  input: ReopenTerminalBackgroundJobInput
) {
  const now = requireDate(input.now);
  return jobs(db).findOneAndUpdate(
    {
      _id: input.jobId,
      kind: input.kind,
      entityId: input.entityId,
      status: { $in: ["completed", "dead"] },
      lastErrorCode: { $ne: "account_deleted" }
    },
    {
      $set: {
        status: "retryable",
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now
      },
      $unset: {
        completedAt: "",
        deadAt: "",
        purgeAt: "",
        leaseId: "",
        leaseUntil: "",
        lastErrorCode: ""
      }
    },
    { returnDocument: "after", session }
  );
}

export type PreparedBackgroundJobPublication = {
  jobId: string;
  generation: number;
  publicationId: string;
  envelope: ReturnType<typeof backgroundJobEnvelope>;
};

export type BackgroundJobClaimResult =
  | { outcome: "claimed"; document: BackgroundJobDocument }
  | { outcome: "missing" | "busy" | "handled" | "not-due" };

export type PreparePublicationInput = {
  jobId: string;
  now?: Date;
  publicationTimeoutMs?: number;
};

/**
 * Reserves a queue publication generation. A stale `publishing` record reuses
 * its generation so a lost queue acknowledgement is retried with the same
 * provider deduplication ID. Known retries and stale deliveries advance it.
 */
export async function preparePublication(
  db: Db,
  input: PreparePublicationInput
): Promise<PreparedBackgroundJobPublication | null> {
  const now = requireDate(input.now);
  const publicationTimeoutMs = requireDuration(
    input.publicationTimeoutMs,
    BACKGROUND_JOB_PUBLICATION_TIMEOUT_MS
  );
  const current = await jobs(db).findOne({ _id: input.jobId });
  if (!current || current.status === "completed" || current.status === "dead") return null;

  const filter: Filter<BackgroundJobDocument> = {
    _id: current._id,
    status: current.status,
    publishGeneration: current.publishGeneration
  };

  if (current.status === "processing") {
    if (!current.leaseId || !current.leaseUntil || current.leaseUntil > now) return null;
    filter.leaseId = current.leaseId;
    filter.leaseUntil = { $lte: now };
  } else {
    if (current.nextAttemptAt > now) return null;
    filter.nextAttemptAt = { $lte: now };
  }

  const generation = current.status === "publishing"
    ? Math.max(1, current.publishGeneration)
    : current.publishGeneration + 1;
  const updated = await jobs(db).findOneAndUpdate(
    filter,
    {
      $set: {
        status: "publishing",
        publishGeneration: generation,
        nextAttemptAt: new Date(now.getTime() + publicationTimeoutMs),
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "" }
    },
    { returnDocument: "after" }
  );
  if (!updated) return null;

  return {
    jobId: updated._id,
    generation: updated.publishGeneration,
    publicationId: backgroundJobPublicationId(updated._id, updated.publishGeneration),
    envelope: backgroundJobEnvelope(updated._id)
  };
}

export type MarkPublishedInput = {
  jobId: string;
  generation: number;
  now?: Date;
  recoverAfterMs?: number;
};

export async function markPublished(db: Db, input: MarkPublishedInput) {
  const now = requireDate(input.now);
  const recoverAfterMs = requireDuration(input.recoverAfterMs, BACKGROUND_JOB_PUBLISHED_RECOVERY_MS);
  return jobs(db).findOneAndUpdate(
    {
      _id: input.jobId,
      status: "publishing",
      publishGeneration: input.generation
    },
    {
      $set: {
        status: "published",
        publishedAt: now,
        nextAttemptAt: new Date(now.getTime() + recoverAfterMs),
        updatedAt: now
      }
    },
    { returnDocument: "after" }
  );
}

export type MarkPublicationFailedInput = {
  jobId: string;
  generation: number;
  errorCode: unknown;
  now?: Date;
};

/** Makes a rejected publication immediately eligible for the same-generation retry. */
export async function markPublicationFailed(db: Db, input: MarkPublicationFailedInput) {
  const now = requireDate(input.now);
  return jobs(db).findOneAndUpdate(
    {
      _id: input.jobId,
      status: "publishing",
      publishGeneration: input.generation
    },
    {
      $set: {
        // The send may have reached the queue even when its acknowledgement
        // was lost. Keep `publishing` so the same dedupe generation is reused.
        status: "publishing",
        lastErrorCode: sanitizeBackgroundJobErrorCode(input.errorCode),
        nextAttemptAt: now,
        updatedAt: now
      }
    },
    { returnDocument: "after" }
  );
}

export type ClaimBackgroundJobInput = {
  jobId: string;
  now?: Date;
  leaseMs?: number;
  leaseId?: string;
};

/** Claims a queue delivery once; an expired processing lease is reclaimable. */
export async function claimBackgroundJob(
  db: Db,
  input: ClaimBackgroundJobInput
): Promise<BackgroundJobClaimResult> {
  const now = requireDate(input.now);
  const leaseMs = requireDuration(input.leaseMs, BACKGROUND_JOB_DEFAULT_LEASE_MS);
  const leaseId = requireLeaseId(input.leaseId);
  const claimed = await jobs(db).findOneAndUpdate(
    {
      _id: input.jobId,
      attempts: { $lt: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS },
      $or: [
        { status: { $in: ["publishing", "published"] } },
        { status: "retryable", nextAttemptAt: { $lte: now } },
        { status: "processing", leaseUntil: { $lte: now } }
      ]
    },
    {
      $set: {
        status: "processing",
        leaseId,
        leaseUntil: new Date(now.getTime() + leaseMs),
        processingStartedAt: now,
        updatedAt: now
      },
      $inc: { attempts: 1 }
    },
    { returnDocument: "after" }
  );
  if (claimed) return { outcome: "claimed", document: claimed };

  const current = await jobs(db).findOne(
    { _id: input.jobId },
    { projection: { status: 1, attempts: 1, nextAttemptAt: 1, leaseUntil: 1 } }
  );
  if (!current) return { outcome: "missing" };
  if (current.status === "completed" || current.status === "dead") return { outcome: "handled" };
  if (current.status === "processing" && current.leaseUntil && current.leaseUntil > now) {
    return { outcome: "busy" };
  }
  if (current.attempts >= BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS) {
    await jobs(db).updateOne(
      {
        _id: input.jobId,
        attempts: { $gte: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS },
        $or: [
          { status: { $in: ["pending", "publishing", "published", "retryable"] } },
          { status: "processing", leaseUntil: { $lte: now } }
        ]
      },
      {
        $set: {
          status: "dead",
          deadAt: now,
          purgeAt: new Date(now.getTime() + BACKGROUND_JOB_TERMINAL_RETENTION_MS),
          lastErrorCode: "attempt_limit_reached",
          nextAttemptAt: now,
          updatedAt: now
        },
        $unset: { leaseId: "", leaseUntil: "" }
      }
    );
    return { outcome: "handled" };
  }
  if (current.nextAttemptAt > now) return { outcome: "not-due" };
  return { outcome: "busy" };
}

export type LeasedBackgroundJobInput = {
  jobId: string;
  leaseId: string;
  now?: Date;
};

export type ReleaseForQueueRetryInput = LeasedBackgroundJobInput & {
  errorCode: unknown;
  recoverAfterMs?: number;
};

/** Releases the lease while the external queue still owns redelivery. */
export async function releaseForQueueRetry(db: Db, input: ReleaseForQueueRetryInput) {
  const now = requireDate(input.now);
  const recoverAfterMs = requireDuration(input.recoverAfterMs, BACKGROUND_JOB_PUBLISHED_RECOVERY_MS);
  return jobs(db).findOneAndUpdate(
    { _id: input.jobId, status: "processing", leaseId: input.leaseId },
    {
      $set: {
        status: "published",
        lastErrorCode: sanitizeBackgroundJobErrorCode(input.errorCode),
        nextAttemptAt: new Date(now.getTime() + recoverAfterMs),
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "" }
    },
    { returnDocument: "after" }
  );
}

export type DeferForRecoveryInput = LeasedBackgroundJobInput & {
  errorCode: unknown;
  delayMs?: number;
};

/** Hands retry ownership from the queue to the scheduled recovery publisher. */
export async function deferForRecovery(db: Db, input: DeferForRecoveryInput) {
  const now = requireDate(input.now);
  const current = await jobs(db).findOne({
    _id: input.jobId,
    status: "processing",
    leaseId: input.leaseId
  });
  if (!current) return null;
  const delayMs = input.delayMs === undefined
    ? backgroundJobBackoffMs(Math.max(1, current.attempts))
    : requireDuration(input.delayMs, input.delayMs);

  return jobs(db).findOneAndUpdate(
    {
      _id: current._id,
      status: "processing",
      leaseId: input.leaseId,
      attempts: current.attempts
    },
    {
      $set: {
        status: "retryable",
        lastErrorCode: sanitizeBackgroundJobErrorCode(input.errorCode),
        nextAttemptAt: new Date(now.getTime() + delayMs),
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "" }
    },
    { returnDocument: "after" }
  );
}

export async function completeBackgroundJob(db: Db, input: LeasedBackgroundJobInput) {
  const now = requireDate(input.now);
  return jobs(db).findOneAndUpdate(
    { _id: input.jobId, status: "processing", leaseId: input.leaseId },
    {
      $set: {
        status: "completed",
        completedAt: now,
        purgeAt: new Date(now.getTime() + BACKGROUND_JOB_TERMINAL_RETENTION_MS),
        nextAttemptAt: now,
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "", lastErrorCode: "" }
    },
    { returnDocument: "after" }
  );
}

export type DeadBackgroundJobInput = LeasedBackgroundJobInput & { errorCode: unknown };

export async function deadBackgroundJob(db: Db, input: DeadBackgroundJobInput) {
  const now = requireDate(input.now);
  return jobs(db).findOneAndUpdate(
    { _id: input.jobId, status: "processing", leaseId: input.leaseId },
    {
      $set: {
        status: "dead",
        deadAt: now,
        purgeAt: new Date(now.getTime() + BACKGROUND_JOB_TERMINAL_RETENTION_MS),
        lastErrorCode: sanitizeBackgroundJobErrorCode(input.errorCode),
        nextAttemptAt: now,
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "" }
    },
    { returnDocument: "after" }
  );
}

export type RecoverableBackgroundJob = {
  jobId: string;
  status: Exclude<BackgroundJobStatus, "completed" | "dead">;
};

export type DeadExhaustedBackgroundJobsInput = {
  now?: Date;
};

/**
 * Terminalizes work that reached the global attempt ceiling but lost its final
 * queue delivery before the processor could persist the terminal transition.
 * Active processing leases are deliberately excluded.
 */
export async function deadExhaustedBackgroundJobs(
  db: Db,
  input: DeadExhaustedBackgroundJobsInput = {}
) {
  const now = requireDate(input.now);
  const result = await jobs(db).updateMany(
    {
      attempts: { $gte: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS },
      $or: [
        {
          status: { $in: ["pending", "publishing", "published", "retryable"] },
          nextAttemptAt: { $lte: now }
        },
        { status: "processing", leaseUntil: { $lte: now } }
      ]
    },
    {
      $set: {
        status: "dead",
        deadAt: now,
        purgeAt: new Date(now.getTime() + BACKGROUND_JOB_TERMINAL_RETENTION_MS),
        lastErrorCode: "attempt_limit_reached",
        nextAttemptAt: now,
        updatedAt: now
      },
      $unset: { leaseId: "", leaseUntil: "" }
    }
  );
  return result.modifiedCount;
}

export type FindRecoverableBackgroundJobsInput = {
  now?: Date;
  limit?: number;
};

export async function findRecoverableBackgroundJobs(
  db: Db,
  input: FindRecoverableBackgroundJobsInput = {}
): Promise<RecoverableBackgroundJob[]> {
  const now = requireDate(input.now);
  const requestedLimit = input.limit ?? 25;
  if (!Number.isFinite(requestedLimit)) throw new TypeError("Background job recovery limit must be finite.");
  const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
  await ensureIndexes(db);
  const documents = await jobs(db)
    .find(
      {
        $or: [
          {
            status: { $in: ["pending", "publishing", "published", "retryable"] },
            attempts: { $lt: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS },
            nextAttemptAt: { $lte: now }
          },
          {
            status: "processing",
            attempts: { $lt: BACKGROUND_JOB_MAX_TOTAL_ATTEMPTS },
            leaseUntil: { $lte: now }
          }
        ]
      },
      { projection: { _id: 1, status: 1 } }
    )
    .sort({ nextAttemptAt: 1, createdAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
  return documents.map((document) => ({
    jobId: document._id,
    status: document.status as RecoverableBackgroundJob["status"]
  }));
}
