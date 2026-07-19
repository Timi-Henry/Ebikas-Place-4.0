import { createHash, randomUUID } from "node:crypto";

export const PRODUCT_MEDIA_MAX_FILES = 8;
export const PRODUCT_MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const PRODUCT_MEDIA_DEFAULT_CONCURRENCY = 3;

export const productMediaContentTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type ProductMediaContentType = (typeof productMediaContentTypes)[number];

export type ProductMediaState = "uploading" | "staged" | "committed" | "retired" | "deleted";
export type ProductMediaRetireReason =
  | "product-deleted"
  | "image-replaced"
  | "stage-abandoned"
  | "stage-expired"
  | "upload-failed"
  | "manual-cleanup";

export type ProductMediaAssetRecord = {
  stageId: string;
  ownerId: string;
  requestId: string;
  ordinal: number;
  contentSha256: string;
  contentType: ProductMediaContentType;
  bytes: number;
  publicId: string;
  secureUrl?: string;
  state: ProductMediaState;
  productId?: string;
  retireReason?: ProductMediaRetireReason;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  committedAt?: Date;
  retiredAt?: Date;
  deletedAt?: Date;
};

export type ProductMediaCleanupState = "pending" | "leased" | "done" | "dead";

export type ProductMediaCleanupRecord = {
  publicId: string;
  state: ProductMediaCleanupState;
  reason: ProductMediaRetireReason;
  actorId: string;
  productId?: string;
  attempts: number;
  nextAttemptAt: Date;
  leaseId?: string;
  leaseUntil?: Date;
  lastAttemptAt?: Date;
  lastFailureCategory?: ProductMediaFailureCategory;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
};

export type ProductMediaFailureCategory =
  | "invalid_asset"
  | "authentication"
  | "rate_limited"
  | "temporary_provider_failure"
  | "provider_rejected"
  | "unknown_provider_failure";

export type ProductMediaUploadInput = {
  buffer: Buffer;
  contentType: string;
};

export type StagedProductMedia = {
  stageId: string;
  publicId: string;
  secureUrl: string;
  state: "staged" | "committed";
};

export type ProductMediaStageResult = {
  requestId: string;
  media: StagedProductMedia[];
};

export type ProductMediaCommitResult = {
  productId: string;
  media: Array<StagedProductMedia & { state: "committed" }>;
};

export type ProductMediaRetireResult = {
  queued: string[];
  alreadyQueued: string[];
  alreadyDeleted: string[];
};

export type ProductMediaSweepResult = {
  expiredStagesQueued: number;
  claimed: number;
  deleted: number;
  alreadyMissing: number;
  retryScheduled: number;
  dead: number;
};

export type ProductMediaErrorCode =
  | "INVALID_MEDIA_INPUT"
  | "MEDIA_STAGE_CONFLICT"
  | "MEDIA_STAGE_IN_PROGRESS"
  | "MEDIA_STAGE_FAILED"
  | "MEDIA_COMMIT_CONFLICT";

export class ProductMediaError extends Error {
  constructor(
    readonly code: ProductMediaErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "ProductMediaError";
  }
}

export type ProductMediaCloudDeleteResult =
  | { status: "deleted" }
  | { status: "missing" }
  | { status: "failed"; retryable: boolean; category: ProductMediaFailureCategory };

export interface ProductMediaCloud {
  isManagedPublicId(publicId: string): boolean;
  makeStagedPublicId(stageId: string): string;
  upload(input: { buffer: Buffer; publicId: string }): Promise<{ secureUrl: string; publicId: string }>;
  destroy(publicId: string): Promise<ProductMediaCloudDeleteResult>;
}

type PrepareStageResult = { created: boolean; record: ProductMediaAssetRecord };
type CommitStagesResult =
  | { ok: true; records: ProductMediaAssetRecord[] }
  | { ok: false; reason: "missing" | "owner" | "state" | "product" };

export interface ProductMediaStore {
  prepareStage(record: ProductMediaAssetRecord): Promise<PrepareStageResult>;
  markStageUploaded(stageId: string, secureUrl: string, now: Date): Promise<ProductMediaAssetRecord>;
  abandonStageAndEnqueue(input: {
    stageId: string;
    actorId: string;
    reason: "stage-abandoned" | "upload-failed";
    now: Date;
  }): Promise<void>;
  commitStages(input: { stageIds: string[]; ownerId: string; productId: string; now: Date }): Promise<CommitStagesResult>;
  retirePublicIds(input: {
    publicIds: string[];
    actorId: string;
    productId?: string;
    reason: ProductMediaRetireReason;
    now: Date;
  }): Promise<ProductMediaRetireResult>;
  enqueueExpiredStages(now: Date, limit: number): Promise<number>;
  claimCleanup(input: {
    now: Date;
    limit: number;
    leaseMs: number;
    maxAttempts: number;
  }): Promise<ProductMediaCleanupRecord[]>;
  completeCleanup(input: {
    publicId: string;
    leaseId: string;
    now: Date;
  }): Promise<void>;
  failCleanup(input: {
    publicId: string;
    leaseId: string;
    category: ProductMediaFailureCategory;
    retry: boolean;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<void>;
}

export type ProductMediaLifecycleOptions = {
  store: ProductMediaStore;
  cloud: ProductMediaCloud;
  now?: () => Date;
  createId?: () => string;
  uploadConcurrency?: number;
  cleanupConcurrency?: number;
  stagedTtlMs?: number;
  cleanupLeaseMs?: number;
  cleanupMaxAttempts?: number;
  cleanupBaseRetryMs?: number;
  cleanupMaxRetryMs?: number;
};

export interface ProductMediaLifecycle {
  stage(input: {
    ownerId: string;
    requestId?: string;
    files: readonly ProductMediaUploadInput[];
  }): Promise<ProductMediaStageResult>;
  commit(input: { ownerId: string; productId: string; stageIds: readonly string[] }): Promise<ProductMediaCommitResult>;
  retire(input: {
    actorId: string;
    productId?: string;
    publicIds: readonly string[];
    reason: ProductMediaRetireReason;
  }): Promise<ProductMediaRetireResult>;
  sweepCleanup(input?: { limit?: number }): Promise<ProductMediaSweepResult>;
}

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const identifierPattern = /^[^\u0000-\u001f\u007f]{1,160}$/;

function invalidInput(message: string): never {
  throw new ProductMediaError("INVALID_MEDIA_INPUT", message);
}

function requireIdentifier(value: string, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!identifierPattern.test(normalized)) invalidInput(`${label} is invalid.`);
  return normalized;
}

function detectImageContentType(buffer: Buffer): ProductMediaContentType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer.subarray(1, 4).toString("ascii") === "PNG" &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = buffer.subarray(8, Math.min(buffer.length, 40)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return null;
}

export function validateProductMediaUpload(input: ProductMediaUploadInput) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) invalidInput("An image file is required.");
  if (input.buffer.length > PRODUCT_MEDIA_MAX_UPLOAD_BYTES) invalidInput("Images must be 5MB or smaller.");

  const claimedType = input.contentType.trim().toLowerCase();
  const detectedType = detectImageContentType(input.buffer);
  if (!detectedType || detectedType !== claimedType) {
    invalidInput("The image contents do not match an allowed JPEG, PNG, WebP, or AVIF file.");
  }

  return {
    buffer: input.buffer,
    contentType: detectedType,
    bytes: input.buffer.length,
    contentSha256: createHash("sha256").update(input.buffer).digest("hex")
  };
}

export function normalizeManagedPublicIdPrefix(prefix: string) {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.length > 160 ||
    parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(part))
  ) {
    throw new ProductMediaError("INVALID_MEDIA_INPUT", "The configured product media folder is invalid.");
  }
  return normalized;
}

export function isManagedProductMediaPublicId(publicId: string, prefix: string) {
  if (typeof publicId !== "string" || publicId.length > 220 || publicId.includes("\\") || publicId.includes("%")) {
    return false;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(publicId)) return false;
  if (publicId.split("/").some((part) => !part || part === "." || part === "..")) return false;
  return publicId.startsWith(`${normalizeManagedPublicIdPrefix(prefix)}/`);
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

function stageIdFor(ownerId: string, requestId: string, ordinal: number) {
  return createHash("sha256").update(`${ownerId}\u0000${requestId}\u0000${ordinal}`).digest("hex").slice(0, 40);
}

function toStagedMedia(record: ProductMediaAssetRecord): StagedProductMedia {
  if (!record.secureUrl || (record.state !== "staged" && record.state !== "committed")) {
    throw new ProductMediaError("MEDIA_STAGE_CONFLICT", "The staged image is not ready.");
  }
  return {
    stageId: record.stageId,
    publicId: record.publicId,
    secureUrl: record.secureUrl,
    state: record.state
  };
}

export function createProductMediaLifecycle(options: ProductMediaLifecycleOptions): ProductMediaLifecycle {
  const now = options.now || (() => new Date());
  const createId = options.createId || randomUUID;
  const uploadConcurrency = Math.min(4, Math.max(1, options.uploadConcurrency || PRODUCT_MEDIA_DEFAULT_CONCURRENCY));
  const cleanupConcurrency = Math.min(5, Math.max(1, options.cleanupConcurrency || PRODUCT_MEDIA_DEFAULT_CONCURRENCY));
  const stagedTtlMs = options.stagedTtlMs || 60 * 60 * 1000;
  const cleanupLeaseMs = options.cleanupLeaseMs || 60_000;
  const cleanupMaxAttempts = options.cleanupMaxAttempts || 8;
  const cleanupBaseRetryMs = options.cleanupBaseRetryMs || 30_000;
  const cleanupMaxRetryMs = options.cleanupMaxRetryMs || 6 * 60 * 60 * 1000;

  return {
    async stage(input) {
      const ownerId = requireIdentifier(input.ownerId, "Media owner");
      if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > PRODUCT_MEDIA_MAX_FILES) {
        invalidInput(`Upload between 1 and ${PRODUCT_MEDIA_MAX_FILES} images at a time.`);
      }
      const requestId = input.requestId?.trim() || createId();
      if (!requestIdPattern.test(requestId)) invalidInput("Media request ID is invalid.");
      const uploads = input.files.map(validateProductMediaUpload);

      type StageOutcome =
        | { ok: true; record: ProductMediaAssetRecord; abandonOnBatchFailure: boolean }
        | { ok: false; error: ProductMediaError };

      const outcomes = await mapWithConcurrency(uploads, uploadConcurrency, async (upload, ordinal): Promise<StageOutcome> => {
        const operationNow = now();
        const stageId = stageIdFor(ownerId, requestId, ordinal);
        const publicId = options.cloud.makeStagedPublicId(stageId);
        if (!options.cloud.isManagedPublicId(publicId)) {
          return { ok: false, error: new ProductMediaError("MEDIA_STAGE_FAILED", "Image storage is misconfigured.") };
        }
        const candidate: ProductMediaAssetRecord = {
          stageId,
          ownerId,
          requestId,
          ordinal,
          contentSha256: upload.contentSha256,
          contentType: upload.contentType,
          bytes: upload.bytes,
          publicId,
          state: "uploading",
          createdAt: operationNow,
          updatedAt: operationNow,
          expiresAt: new Date(operationNow.getTime() + stagedTtlMs)
        };

        let prepared: PrepareStageResult;
        try {
          prepared = await options.store.prepareStage(candidate);
        } catch {
          return { ok: false, error: new ProductMediaError("MEDIA_STAGE_FAILED", "Image staging is temporarily unavailable.", true) };
        }

        const existing = prepared.record;
        if (
          existing.ownerId !== ownerId ||
          existing.requestId !== requestId ||
          existing.ordinal !== ordinal ||
          existing.contentSha256 !== upload.contentSha256 ||
          existing.contentType !== upload.contentType ||
          existing.bytes !== upload.bytes
        ) {
          return { ok: false, error: new ProductMediaError("MEDIA_STAGE_CONFLICT", "This media request ID was already used for different files.") };
        }
        if (!prepared.created) {
          if (existing.state === "staged" || existing.state === "committed") {
            return { ok: true, record: existing, abandonOnBatchFailure: existing.state === "staged" };
          }
          if (existing.state === "uploading") {
            return { ok: false, error: new ProductMediaError("MEDIA_STAGE_IN_PROGRESS", "This image upload is still in progress.", true) };
          }
          return { ok: false, error: new ProductMediaError("MEDIA_STAGE_CONFLICT", "This media request can no longer be staged.") };
        }

        try {
          const uploaded = await options.cloud.upload({ buffer: upload.buffer, publicId });
          if (uploaded.publicId !== publicId || !options.cloud.isManagedPublicId(uploaded.publicId)) {
            throw new ProductMediaError("MEDIA_STAGE_FAILED", "Image storage returned an unexpected asset identifier.");
          }
          const record = await options.store.markStageUploaded(stageId, uploaded.secureUrl, now());
          return { ok: true, record, abandonOnBatchFailure: true };
        } catch {
          try {
            await options.store.abandonStageAndEnqueue({
              stageId,
              actorId: ownerId,
              reason: "upload-failed",
              now: now()
            });
          } catch {
            // The deterministic public ID and durable uploading record let a later expiry sweep reconcile this failure.
          }
          return { ok: false, error: new ProductMediaError("MEDIA_STAGE_FAILED", "One or more images could not be staged.", true) };
        }
      });

      const failed = outcomes.find((outcome): outcome is Extract<StageOutcome, { ok: false }> => !outcome.ok);
      if (failed) {
        await Promise.allSettled(
          outcomes.flatMap((outcome) =>
            outcome.ok && outcome.abandonOnBatchFailure
              ? [
                  options.store.abandonStageAndEnqueue({
                    stageId: outcome.record.stageId,
                    actorId: ownerId,
                    reason: "stage-abandoned",
                    now: now()
                  })
                ]
              : []
          )
        );
        throw failed.error;
      }

      return {
        requestId,
        media: outcomes.map((outcome) => toStagedMedia((outcome as Extract<StageOutcome, { ok: true }>).record))
      };
    },

    async commit(input) {
      const ownerId = requireIdentifier(input.ownerId, "Media owner");
      const productId = requireIdentifier(input.productId, "Product");
      const stageIds = [...new Set(input.stageIds.map((stageId) => stageId.trim()))];
      if (stageIds.length === 0 || stageIds.length > PRODUCT_MEDIA_MAX_FILES || stageIds.some((id) => !/^[a-f0-9]{40}$/.test(id))) {
        invalidInput("Staged image IDs are invalid.");
      }

      const result = await options.store.commitStages({ stageIds, ownerId, productId, now: now() });
      if (!result.ok) {
        throw new ProductMediaError("MEDIA_COMMIT_CONFLICT", "The staged images could not be committed to this product.");
      }
      return {
        productId,
        media: result.records.map((record) => ({ ...toStagedMedia(record), state: "committed" as const }))
      };
    },

    async retire(input) {
      const actorId = requireIdentifier(input.actorId, "Media actor");
      const productId = input.productId ? requireIdentifier(input.productId, "Product") : undefined;
      const publicIds = [...new Set(input.publicIds.map((publicId) => publicId.trim()))];
      if (publicIds.length === 0 || publicIds.length > 25 || publicIds.some((id) => !options.cloud.isManagedPublicId(id))) {
        invalidInput("Product media public IDs are invalid or outside the managed product folder.");
      }
      return options.store.retirePublicIds({ publicIds, actorId, productId, reason: input.reason, now: now() });
    },

    async sweepCleanup(input = {}) {
      const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 25)));
      const sweepNow = now();
      const expiredStagesQueued = await options.store.enqueueExpiredStages(sweepNow, limit);
      const jobs = await options.store.claimCleanup({
        now: sweepNow,
        limit,
        leaseMs: cleanupLeaseMs,
        maxAttempts: cleanupMaxAttempts
      });

      const results = await mapWithConcurrency(jobs, cleanupConcurrency, async (job) => {
        const leaseId = job.leaseId;
        if (!leaseId) return "dead" as const;
        let deletion: ProductMediaCloudDeleteResult;
        try {
          deletion = await options.cloud.destroy(job.publicId);
        } catch {
          deletion = { status: "failed", retryable: true, category: "unknown_provider_failure" };
        }

        if (deletion.status === "deleted" || deletion.status === "missing") {
          await options.store.completeCleanup({ publicId: job.publicId, leaseId, now: now() });
          return deletion.status;
        }

        const retry = deletion.retryable && job.attempts < cleanupMaxAttempts;
        const delay = Math.min(cleanupMaxRetryMs, cleanupBaseRetryMs * 2 ** Math.max(0, job.attempts - 1));
        const failureNow = now();
        await options.store.failCleanup({
          publicId: job.publicId,
          leaseId,
          category: deletion.category,
          retry,
          nextAttemptAt: new Date(failureNow.getTime() + delay),
          now: failureNow
        });
        return retry ? ("retry" as const) : ("dead" as const);
      });

      return {
        expiredStagesQueued,
        claimed: jobs.length,
        deleted: results.filter((result) => result === "deleted").length,
        alreadyMissing: results.filter((result) => result === "missing").length,
        retryScheduled: results.filter((result) => result === "retry").length,
        dead: results.filter((result) => result === "dead").length
      };
    }
  };
}

function copyAsset(record: ProductMediaAssetRecord) {
  return structuredClone(record);
}

function copyCleanup(record: ProductMediaCleanupRecord) {
  return structuredClone(record);
}

export class MemoryProductMediaStore implements ProductMediaStore {
  private readonly assets = new Map<string, ProductMediaAssetRecord>();
  private readonly cleanup = new Map<string, ProductMediaCleanupRecord>();

  inspectAssets() {
    return [...this.assets.values()].map(copyAsset);
  }

  inspectCleanup() {
    return [...this.cleanup.values()].map(copyCleanup);
  }

  async prepareStage(record: ProductMediaAssetRecord): Promise<PrepareStageResult> {
    const existing = this.assets.get(record.stageId);
    if (existing) return { created: false, record: copyAsset(existing) };
    this.assets.set(record.stageId, copyAsset(record));
    return { created: true, record: copyAsset(record) };
  }

  async markStageUploaded(stageId: string, secureUrl: string, now: Date) {
    const record = this.assets.get(stageId);
    if (!record || record.state !== "uploading") throw new Error("stage is not uploadable");
    record.secureUrl = secureUrl;
    record.state = "staged";
    record.updatedAt = now;
    return copyAsset(record);
  }

  private enqueue(record: ProductMediaAssetRecord, actorId: string, reason: ProductMediaRetireReason, now: Date) {
    const existing = this.cleanup.get(record.publicId);
    if (!existing) {
      this.cleanup.set(record.publicId, {
        publicId: record.publicId,
        state: "pending",
        reason,
        actorId,
        productId: record.productId,
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now
      });
    } else if (existing.state === "dead") {
      existing.state = "pending";
      existing.nextAttemptAt = now;
      existing.updatedAt = now;
    }
  }

  async abandonStageAndEnqueue(input: {
    stageId: string;
    actorId: string;
    reason: "stage-abandoned" | "upload-failed";
    now: Date;
  }) {
    const record = this.assets.get(input.stageId);
    if (!record || record.state === "committed" || record.state === "deleted") return;
    this.enqueue(record, input.actorId, input.reason, input.now);
    record.state = "retired";
    record.retireReason = input.reason;
    record.retiredAt = input.now;
    record.updatedAt = input.now;
  }

  async commitStages(input: { stageIds: string[]; ownerId: string; productId: string; now: Date }): Promise<CommitStagesResult> {
    const records = input.stageIds.map((stageId) => this.assets.get(stageId));
    if (records.some((record) => !record)) return { ok: false, reason: "missing" };
    const present = records as ProductMediaAssetRecord[];
    if (present.some((record) => record.ownerId !== input.ownerId)) return { ok: false, reason: "owner" };
    if (present.some((record) => record.state === "committed" && record.productId !== input.productId)) {
      return { ok: false, reason: "product" };
    }
    if (present.some((record) => record.state !== "staged" && record.state !== "committed")) {
      return { ok: false, reason: "state" };
    }
    for (const record of present) {
      record.state = "committed";
      record.productId = input.productId;
      record.committedAt ||= input.now;
      record.updatedAt = input.now;
    }
    return { ok: true, records: present.map(copyAsset) };
  }

  async retirePublicIds(input: {
    publicIds: string[];
    actorId: string;
    productId?: string;
    reason: ProductMediaRetireReason;
    now: Date;
  }) {
    const result: ProductMediaRetireResult = { queued: [], alreadyQueued: [], alreadyDeleted: [] };
    for (const publicId of input.publicIds) {
      const existingJob = this.cleanup.get(publicId);
      if (existingJob?.state === "done") {
        result.alreadyDeleted.push(publicId);
        continue;
      }
      if (existingJob && existingJob.state !== "dead") {
        result.alreadyQueued.push(publicId);
      } else {
        const asset = [...this.assets.values()].find((record) => record.publicId === publicId);
        const placeholder =
          asset ||
          ({ publicId, productId: input.productId } as Pick<ProductMediaAssetRecord, "publicId" | "productId"> as ProductMediaAssetRecord);
        this.enqueue(placeholder, input.actorId, input.reason, input.now);
        result.queued.push(publicId);
      }
      const asset = [...this.assets.values()].find((record) => record.publicId === publicId);
      if (asset && asset.state !== "deleted") {
        asset.state = "retired";
        asset.retireReason = input.reason;
        asset.retiredAt = input.now;
        asset.updatedAt = input.now;
      }
    }
    return result;
  }

  async enqueueExpiredStages(now: Date, limit: number) {
    const expired = [...this.assets.values()]
      .filter((record) => (record.state === "uploading" || record.state === "staged") && record.expiresAt <= now)
      .slice(0, limit);
    for (const record of expired) {
      this.enqueue(record, record.ownerId, "stage-expired", now);
      record.state = "retired";
      record.retireReason = "stage-expired";
      record.retiredAt = now;
      record.updatedAt = now;
    }
    return expired.length;
  }

  async claimCleanup(input: { now: Date; limit: number; leaseMs: number; maxAttempts: number }) {
    const claimable = [...this.cleanup.values()]
      .filter(
        (record) =>
          record.attempts < input.maxAttempts &&
          ((record.state === "pending" && record.nextAttemptAt <= input.now) ||
            (record.state === "leased" && Boolean(record.leaseUntil && record.leaseUntil <= input.now)))
      )
      .sort((left, right) => left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime())
      .slice(0, input.limit);
    for (const record of claimable) {
      record.state = "leased";
      record.leaseId = randomUUID();
      record.leaseUntil = new Date(input.now.getTime() + input.leaseMs);
      record.lastAttemptAt = input.now;
      record.attempts += 1;
      record.updatedAt = input.now;
    }
    return claimable.map(copyCleanup);
  }

  async completeCleanup(input: { publicId: string; leaseId: string; now: Date }) {
    const record = this.cleanup.get(input.publicId);
    if (!record || record.state !== "leased" || record.leaseId !== input.leaseId) return;
    const asset = [...this.assets.values()].find((item) => item.publicId === input.publicId);
    if (asset) {
      asset.state = "deleted";
      asset.deletedAt = input.now;
      asset.updatedAt = input.now;
    }
    record.state = "done";
    record.completedAt = input.now;
    record.updatedAt = input.now;
    delete record.leaseId;
    delete record.leaseUntil;
  }

  async failCleanup(input: {
    publicId: string;
    leaseId: string;
    category: ProductMediaFailureCategory;
    retry: boolean;
    nextAttemptAt: Date;
    now: Date;
  }) {
    const record = this.cleanup.get(input.publicId);
    if (!record || record.state !== "leased" || record.leaseId !== input.leaseId) return;
    record.state = input.retry ? "pending" : "dead";
    record.nextAttemptAt = input.nextAttemptAt;
    record.lastFailureCategory = input.category;
    record.updatedAt = input.now;
    delete record.leaseId;
    delete record.leaseUntil;
  }
}

export function createMemoryProductMediaStore() {
  return new MemoryProductMediaStore();
}
