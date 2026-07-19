import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { deleteImages, uploadImage } from "@/lib/server/cloudinary";
import { getCloudinaryEnvironment } from "@/lib/server/env";
import { getDb } from "@/lib/server/mongodb";
import {
  createProductMediaLifecycle,
  isManagedProductMediaPublicId,
  normalizeManagedPublicIdPrefix,
  ProductMediaError,
  type ProductMediaAssetRecord,
  type ProductMediaCleanupRecord,
  type ProductMediaCloud,
  type ProductMediaCommitResult,
  type ProductMediaFailureCategory,
  type ProductMediaLifecycle,
  type ProductMediaRetireReason,
  type ProductMediaRetireResult,
  type ProductMediaStageResult,
  type ProductMediaStore,
  type ProductMediaSweepResult,
  type ProductMediaUploadInput
} from "@/lib/server/product-media-core";

type ProductMediaAssetDocument = ProductMediaAssetRecord & { _id: string };
type ProductMediaCleanupDocument = ProductMediaCleanupRecord & { _id: string };

const assetCollectionName = "product_media_assets";
const cleanupCollectionName = "product_media_cleanup_outbox";
let indexPromise: Promise<void> | undefined;

function withoutId<T extends { _id: string }>(document: T): Omit<T, "_id"> {
  const record: Partial<T> = { ...document };
  delete record._id;
  return record as Omit<T, "_id">;
}

async function ensureProductMediaIndexes(db: Db) {
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection<ProductMediaAssetDocument>(assetCollectionName).createIndexes([
        { key: { publicId: 1 }, unique: true, name: "product_media_public_id_unique" },
        { key: { state: 1, expiresAt: 1 }, name: "product_media_stage_expiry" },
        { key: { state: 1, updatedAt: 1 }, name: "product_media_commit_reconciliation" },
        { key: { ownerId: 1, requestId: 1 }, name: "product_media_owner_request" },
        { key: { productId: 1, state: 1 }, sparse: true, name: "product_media_product_state" }
      ]),
      db.collection<ProductMediaCleanupDocument>(cleanupCollectionName).createIndexes([
        { key: { state: 1, nextAttemptAt: 1, leaseUntil: 1 }, name: "product_media_cleanup_claim" },
        { key: { completedAt: 1 }, sparse: true, name: "product_media_cleanup_completed" }
      ])
    ])
      .then(() => undefined)
      .catch((error) => {
        indexPromise = undefined;
        throw error;
      });
  }
  await indexPromise;
}

async function collections() {
  const db = await getDb();
  await ensureProductMediaIndexes(db);
  return {
    db,
    assets: db.collection<ProductMediaAssetDocument>(assetCollectionName),
    cleanup: db.collection<ProductMediaCleanupDocument>(cleanupCollectionName)
  };
}

function newCleanupDocument(input: {
  publicId: string;
  actorId: string;
  productId?: string;
  reason: ProductMediaRetireReason;
  now: Date;
}): ProductMediaCleanupDocument {
  return {
    _id: input.publicId,
    publicId: input.publicId,
    state: "pending",
    reason: input.reason,
    actorId: input.actorId,
    productId: input.productId,
    attempts: 0,
    nextAttemptAt: input.now,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export class MongoProductMediaStore implements ProductMediaStore {
  async prepareStage(record: ProductMediaAssetRecord) {
    const { assets } = await collections();
    const document: ProductMediaAssetDocument = { _id: record.stageId, ...record };
    const write = await assets.updateOne({ _id: record.stageId }, { $setOnInsert: document }, { upsert: true });
    const persisted = await assets.findOne({ _id: record.stageId });
    if (!persisted) throw new Error("Product media stage was not persisted.");
    return { created: write.upsertedCount === 1, record: withoutId(persisted) };
  }

  async markStageUploaded(stageId: string, secureUrl: string, now: Date) {
    const { assets } = await collections();
    const updated = await assets.findOneAndUpdate(
      { _id: stageId, state: "uploading" },
      { $set: { secureUrl, state: "staged", updatedAt: now } },
      { returnDocument: "after" }
    );
    if (updated) return withoutId(updated);

    const existing = await assets.findOne({ _id: stageId });
    if (existing?.secureUrl === secureUrl && (existing.state === "staged" || existing.state === "committed")) {
      return withoutId(existing);
    }
    throw new Error("Product media stage is no longer uploadable.");
  }

  private async enqueueCleanup(input: {
    publicId: string;
    actorId: string;
    productId?: string;
    reason: ProductMediaRetireReason;
    now: Date;
  }) {
    const { cleanup } = await collections();
    const existing = await cleanup.findOne({ _id: input.publicId });
    if (existing?.state === "done") return "deleted" as const;
    if (existing?.state === "dead") {
      await cleanup.updateOne(
        { _id: input.publicId, state: "dead" },
        {
          $set: {
            state: "pending",
            reason: input.reason,
            actorId: input.actorId,
            productId: input.productId,
            attempts: 0,
            nextAttemptAt: input.now,
            updatedAt: input.now
          },
          $unset: { leaseId: "", leaseUntil: "", lastFailureCategory: "" }
        }
      );
      return "queued" as const;
    }
    if (existing) return "existing" as const;

    const document = newCleanupDocument(input);
    const write = await cleanup.updateOne({ _id: input.publicId }, { $setOnInsert: document }, { upsert: true });
    return write.upsertedCount === 1 ? ("queued" as const) : ("existing" as const);
  }

  async abandonStageAndEnqueue(input: {
    stageId: string;
    actorId: string;
    reason: "stage-abandoned" | "upload-failed";
    now: Date;
  }) {
    const { assets } = await collections();
    const asset = await assets.findOne({ _id: input.stageId });
    if (!asset || asset.state === "committed" || asset.state === "deleted") return;

    // The outbox is written first: a crash may leave stale asset metadata, but never an untracked remote asset.
    await this.enqueueCleanup({
      publicId: asset.publicId,
      actorId: input.actorId,
      productId: asset.productId,
      reason: input.reason,
      now: input.now
    });
    await assets.updateOne(
      { _id: input.stageId, state: { $in: ["uploading", "staged", "retired"] } },
      {
        $set: {
          state: "retired",
          retireReason: input.reason,
          retiredAt: input.now,
          updatedAt: input.now
        }
      }
    );
  }

  async commitStages(input: { stageIds: string[]; ownerId: string; productId: string; now: Date }) {
    const { db, assets } = await collections();
    const session = db.client.startSession();
    let failure: "missing" | "owner" | "state" | "product" | undefined;
    let committed: ProductMediaAssetDocument[] | undefined;

    try {
      await session.withTransaction(async () => {
        const documents = await assets.find({ _id: { $in: input.stageIds } }, { session }).toArray();
        if (documents.length !== input.stageIds.length) failure = "missing";
        else if (documents.some((document) => document.ownerId !== input.ownerId)) failure = "owner";
        else if (documents.some((document) => document.state === "committed" && document.productId !== input.productId)) {
          failure = "product";
        } else if (documents.some((document) => document.state !== "staged" && document.state !== "committed")) {
          failure = "state";
        } else {
          await assets.updateMany(
            {
              _id: { $in: input.stageIds },
              ownerId: input.ownerId,
              $or: [{ state: "staged" }, { state: "committed", productId: input.productId }]
            },
            {
              $set: {
                state: "committed",
                productId: input.productId,
                committedAt: input.now,
                updatedAt: input.now
              }
            },
            { session }
          );
          committed = await assets.find({ _id: { $in: input.stageIds } }, { session }).toArray();
          if (
            committed.length !== input.stageIds.length ||
            committed.some(
              (document) =>
                document.ownerId !== input.ownerId ||
                document.state !== "committed" ||
                document.productId !== input.productId
            )
          ) {
            throw new Error("Product media commit was not atomic.");
          }
        }
      });
    } finally {
      await session.endSession();
    }

    if (failure) return { ok: false as const, reason: failure };
    if (!committed) throw new Error("Product media commit did not complete.");
    const byId = new Map(committed.map((document) => [document.stageId, withoutId(document)]));
    return {
      ok: true as const,
      records: input.stageIds.map((stageId) => byId.get(stageId)).filter((record): record is ProductMediaAssetRecord => Boolean(record))
    };
  }

  async retirePublicIds(input: {
    publicIds: string[];
    actorId: string;
    productId?: string;
    reason: ProductMediaRetireReason;
    now: Date;
  }) {
    const { assets } = await collections();
    const result: ProductMediaRetireResult = { queued: [], alreadyQueued: [], alreadyDeleted: [] };

    for (const publicId of input.publicIds) {
      const outcome = await this.enqueueCleanup({
        publicId,
        actorId: input.actorId,
        productId: input.productId,
        reason: input.reason,
        now: input.now
      });
      if (outcome === "deleted") result.alreadyDeleted.push(publicId);
      else if (outcome === "existing") result.alreadyQueued.push(publicId);
      else result.queued.push(publicId);

      if (outcome !== "deleted") {
        await assets.updateOne(
          { publicId, state: { $ne: "deleted" } },
          {
            $set: {
              state: "retired",
              retireReason: input.reason,
              retiredAt: input.now,
              updatedAt: input.now
            }
          }
        );
      }
    }
    return result;
  }

  async enqueueExpiredStages(now: Date, limit: number) {
    const { db, assets } = await collections();
    const expired = await assets
      .find({ state: { $in: ["uploading", "staged"] }, expiresAt: { $lte: now } })
      .sort({ expiresAt: 1 })
      .limit(limit)
      .toArray();
    let queued = 0;

    for (const asset of expired) {
      await this.enqueueCleanup({
        publicId: asset.publicId,
        actorId: asset.ownerId,
        productId: asset.productId,
        reason: "stage-expired",
        now
      });
      const update = await assets.updateOne(
        { _id: asset._id, state: { $in: ["uploading", "staged"] }, expiresAt: { $lte: now } },
        {
          $set: {
            state: "retired",
            retireReason: "stage-expired",
            retiredAt: now,
            updatedAt: now
          }
        }
      );
      queued += update.modifiedCount;
    }

    const remaining = Math.max(0, limit - queued);
    if (remaining > 0) {
      const reconciliationCutoff = new Date(now.getTime() - 60 * 60 * 1000);
      const committed = await assets
        .find({ state: "committed", updatedAt: { $lte: reconciliationCutoff } })
        .sort({ updatedAt: 1 })
        .limit(remaining)
        .toArray();

      for (const asset of committed) {
        const product = asset.productId && ObjectId.isValid(asset.productId)
          ? await db.collection<{ _id: ObjectId; imagePublicId?: string; imagePublicIds?: string[] }>("products").findOne(
              { _id: new ObjectId(asset.productId) },
              { projection: { imagePublicId: 1, imagePublicIds: 1 } }
            )
          : null;
        const attachedPublicIds = new Set([
          ...(product?.imagePublicIds || []),
          ...(product?.imagePublicId ? [product.imagePublicId] : [])
        ]);
        if (product && attachedPublicIds.has(asset.publicId)) {
          await assets.updateOne({ _id: asset._id, state: "committed" }, { $set: { updatedAt: now } });
          continue;
        }

        await this.enqueueCleanup({
          publicId: asset.publicId,
          actorId: asset.ownerId,
          productId: asset.productId,
          reason: product ? "image-replaced" : "product-deleted",
          now
        });
        const update = await assets.updateOne(
          { _id: asset._id, state: "committed" },
          {
            $set: {
              state: "retired",
              retireReason: product ? "image-replaced" : "product-deleted",
              retiredAt: now,
              updatedAt: now
            }
          }
        );
        queued += update.modifiedCount;
      }
    }
    return queued;
  }

  async claimCleanup(input: { now: Date; limit: number; leaseMs: number; maxAttempts: number }) {
    const { cleanup } = await collections();
    const claimed: ProductMediaCleanupRecord[] = [];

    for (let index = 0; index < input.limit; index += 1) {
      const leaseId = randomUUID();
      const document = await cleanup.findOneAndUpdate(
        {
          attempts: { $lt: input.maxAttempts },
          $or: [
            { state: "pending", nextAttemptAt: { $lte: input.now } },
            { state: "leased", leaseUntil: { $lte: input.now } }
          ]
        },
        {
          $set: {
            state: "leased",
            leaseId,
            leaseUntil: new Date(input.now.getTime() + input.leaseMs),
            lastAttemptAt: input.now,
            updatedAt: input.now
          },
          $inc: { attempts: 1 }
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: "after" }
      );
      if (!document) break;
      claimed.push(withoutId(document));
    }
    return claimed;
  }

  async completeCleanup(input: { publicId: string; leaseId: string; now: Date }) {
    const { assets, cleanup } = await collections();
    await assets.updateOne(
      { publicId: input.publicId },
      { $set: { state: "deleted", deletedAt: input.now, updatedAt: input.now } }
    );
    await cleanup.updateOne(
      { _id: input.publicId, state: "leased", leaseId: input.leaseId },
      {
        $set: { state: "done", completedAt: input.now, updatedAt: input.now },
        $unset: { leaseId: "", leaseUntil: "", lastFailureCategory: "" }
      }
    );
  }

  async failCleanup(input: {
    publicId: string;
    leaseId: string;
    category: ProductMediaFailureCategory;
    retry: boolean;
    nextAttemptAt: Date;
    now: Date;
  }) {
    const { cleanup } = await collections();
    await cleanup.updateOne(
      { _id: input.publicId, state: "leased", leaseId: input.leaseId },
      {
        $set: {
          state: input.retry ? "pending" : "dead",
          nextAttemptAt: input.nextAttemptAt,
          lastFailureCategory: input.category,
          updatedAt: input.now
        },
        $unset: { leaseId: "", leaseUntil: "" }
      }
    );
  }
}

function classifyCleanupFailure(message: string): ProductMediaFailureCategory {
  if (/credentials|permissions/i.test(message)) return "authentication";
  if (/rate limited/i.test(message)) return "rate_limited";
  if (/temporarily unavailable/i.test(message)) return "temporary_provider_failure";
  if (/asset identifier/i.test(message)) return "invalid_asset";
  if (/rejected/i.test(message)) return "provider_rejected";
  return "unknown_provider_failure";
}

function validateCloudinaryDeliveryUrl(value: string, cloudName: string) {
  try {
    const url = new URL(value);
    const pathPrefix = `/${encodeURIComponent(cloudName)}/image/upload/`;
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && url.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

export function createCloudinaryProductMediaCloud(): ProductMediaCloud {
  const environment = getCloudinaryEnvironment();
  const managedPrefix = normalizeManagedPublicIdPrefix(environment.uploadFolder);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(environment.cloudName)) {
    throw new ProductMediaError("INVALID_MEDIA_INPUT", "The configured Cloudinary cloud name is invalid.");
  }

  return {
    isManagedPublicId(publicId) {
      return isManagedProductMediaPublicId(publicId, managedPrefix);
    },
    makeStagedPublicId(stageId) {
      return `${managedPrefix}/staged/${stageId}`;
    },
    async upload(input) {
      if (!isManagedProductMediaPublicId(input.publicId, managedPrefix)) {
        throw new ProductMediaError("INVALID_MEDIA_INPUT", "The product media public ID is invalid.");
      }
      const relativePublicId = input.publicId.slice(managedPrefix.length + 1);
      const uploaded = await uploadImage(input.buffer, { publicId: relativePublicId });
      if (
        uploaded.publicId !== input.publicId ||
        !isManagedProductMediaPublicId(uploaded.publicId, managedPrefix) ||
        !validateCloudinaryDeliveryUrl(uploaded.secureUrl, environment.cloudName)
      ) {
        throw new ProductMediaError("MEDIA_STAGE_FAILED", "Cloudinary returned unexpected product media metadata.");
      }
      return uploaded;
    },
    async destroy(publicId) {
      if (!isManagedProductMediaPublicId(publicId, managedPrefix)) {
        return { status: "failed", retryable: false, category: "invalid_asset" };
      }
      const result = await deleteImages([publicId]);
      if (result.deleted.length > 0) return { status: "deleted" };
      if (result.alreadyMissing.length > 0) return { status: "missing" };
      const issue = result.failed[0];
      return {
        status: "failed",
        retryable: issue?.retryable ?? true,
        category: classifyCleanupFailure(issue?.message || "")
      };
    }
  };
}

let lifecycle: ProductMediaLifecycle | undefined;

function productMediaLifecycle() {
  if (!lifecycle) {
    lifecycle = createProductMediaLifecycle({
      store: new MongoProductMediaStore(),
      cloud: createCloudinaryProductMediaCloud()
    });
  }
  return lifecycle;
}

export function stageProductMedia(input: {
  ownerId: string;
  requestId?: string;
  files: readonly ProductMediaUploadInput[];
}): Promise<ProductMediaStageResult> {
  return productMediaLifecycle().stage(input);
}

export function commitProductMedia(input: {
  ownerId: string;
  productId: string;
  stageIds: readonly string[];
}): Promise<ProductMediaCommitResult> {
  return productMediaLifecycle().commit(input);
}

export function retireProductMedia(input: {
  actorId: string;
  productId?: string;
  publicIds: readonly string[];
  reason: ProductMediaRetireReason;
}): Promise<ProductMediaRetireResult> {
  return productMediaLifecycle().retire(input);
}

export function sweepProductMediaCleanup(input?: { limit?: number }): Promise<ProductMediaSweepResult> {
  return productMediaLifecycle().sweepCleanup(input);
}

export { ProductMediaError };
export type {
  ProductMediaCommitResult,
  ProductMediaRetireReason,
  ProductMediaRetireResult,
  ProductMediaStageResult,
  ProductMediaSweepResult,
  ProductMediaUploadInput
};
