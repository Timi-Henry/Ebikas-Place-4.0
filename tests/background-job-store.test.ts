import type { ClientSession, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orderNotificationJobId, type BackgroundJobDocument } from "@/lib/background-jobs";
import {
  claimBackgroundJob,
  completeBackgroundJob,
  deadExhaustedBackgroundJobs,
  deadBackgroundJob,
  deferForRecovery,
  findRecoverableBackgroundJobs,
  insertBackgroundJobInTransaction,
  markPublicationFailed,
  markPublished,
  preparePublication,
  releaseForQueueRetry
} from "@/lib/server/background-job-store";

const now = new Date("2026-08-13T12:00:00.000Z");
const orderId = "64b000000000000000000001";
const jobId = orderNotificationJobId(orderId);

function document(overrides: Partial<BackgroundJobDocument> = {}): BackgroundJobDocument {
  return {
    _id: jobId,
    kind: "order-notification",
    entityId: orderId,
    status: "pending",
    attempts: 0,
    publishGeneration: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function database(collection: object) {
  return { collection: vi.fn(() => collection) } as unknown as Db;
}

describe("background job transactional insertion", () => {
  it("inserts one deterministic, payload-free intent in the caller's transaction", async () => {
    const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
    const db = database({ updateOne });
    const session = {} as ClientSession;

    await expect(insertBackgroundJobInTransaction(db, session, {
      kind: "order-notification",
      entityId: orderId,
      now
    })).resolves.toEqual({ jobId, inserted: true });

    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: jobId });
    expect(options).toEqual({ upsert: true, session });
    expect(update.$setOnInsert).toEqual(document());
    expect(Object.keys(update.$setOnInsert)).toEqual([
      "_id",
      "kind",
      "entityId",
      "status",
      "attempts",
      "publishGeneration",
      "nextAttemptAt",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("reports an existing deterministic intent without rewriting it", async () => {
    const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 0 });
    const db = database({ updateOne });

    await expect(insertBackgroundJobInTransaction(db, {} as ClientSession, {
      kind: "order-notification",
      entityId: orderId,
      now
    })).resolves.toEqual({ jobId, inserted: false });
  });
});

describe("background job publication", () => {
  it("reuses a generation after an uncertain queue send", async () => {
    const stalePublishing = document({
      status: "publishing",
      publishGeneration: 3,
      nextAttemptAt: new Date(now.getTime() - 1)
    });
    const updated = document({
      ...stalePublishing,
      nextAttemptAt: new Date(now.getTime() + 120_000),
      updatedAt: now
    });
    const findOneAndUpdate = vi.fn().mockResolvedValue(updated);
    const db = database({ findOne: vi.fn().mockResolvedValue(stalePublishing), findOneAndUpdate });

    const publication = await preparePublication(db, { jobId, now });

    expect(publication).toMatchObject({ jobId, generation: 3 });
    expect(publication?.envelope).toEqual({ v: 1, type: "job", jobId });
    expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      _id: jobId,
      status: "publishing",
      publishGeneration: 3,
      nextAttemptAt: { $lte: now }
    });
    expect(findOneAndUpdate.mock.calls[0][1].$set.publishGeneration).toBe(3);
  });

  it("increments the generation when recovery republishes a known retry", async () => {
    const retryable = document({
      status: "retryable",
      publishGeneration: 3,
      nextAttemptAt: new Date(now.getTime() - 1)
    });
    const republishing = document({ ...retryable, status: "publishing", publishGeneration: 4 });
    const findOneAndUpdate = vi.fn().mockResolvedValue(republishing);
    const db = database({ findOne: vi.fn().mockResolvedValue(retryable), findOneAndUpdate });

    await expect(preparePublication(db, { jobId, now })).resolves.toMatchObject({ generation: 4 });
    expect(findOneAndUpdate.mock.calls[0][1].$set.publishGeneration).toBe(4);
  });

  it("increments the generation when recovery reclaims an expired processing lease", async () => {
    const staleProcessing = document({
      status: "processing",
      publishGeneration: 4,
      leaseId: "expired-lease",
      leaseUntil: new Date(now.getTime() - 1)
    });
    const republishing = document({ status: "publishing", publishGeneration: 5 });
    const findOneAndUpdate = vi.fn().mockResolvedValue(republishing);
    const db = database({ findOne: vi.fn().mockResolvedValue(staleProcessing), findOneAndUpdate });

    await expect(preparePublication(db, { jobId, now })).resolves.toMatchObject({ generation: 5 });
    expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({
      status: "processing",
      leaseId: "expired-lease",
      leaseUntil: { $lte: now }
    });
  });

  it("marks only the matching reserved generation as published", async () => {
    const published = document({ status: "published", publishGeneration: 2, publishedAt: now });
    const findOneAndUpdate = vi.fn().mockResolvedValue(published);
    const db = database({ findOneAndUpdate });

    await expect(markPublished(db, { jobId, generation: 2, now })).resolves.toEqual(published);
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({
      _id: jobId,
      status: "publishing",
      publishGeneration: 2
    });
    expect(findOneAndUpdate.mock.calls[0][1].$set.status).toBe("published");
  });

  it("makes a rejected queue publication immediately retryable with the same generation", async () => {
    const publishing = document({ status: "publishing", publishGeneration: 2 });
    const findOneAndUpdate = vi.fn().mockResolvedValue(publishing);
    const db = database({ findOneAndUpdate });

    await expect(markPublicationFailed(db, {
      jobId,
      generation: 2,
      errorCode: { code: "QUEUE_UNAVAILABLE" },
      now
    })).resolves.toEqual(publishing);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: jobId, status: "publishing", publishGeneration: 2 },
      {
        $set: {
          status: "publishing",
          lastErrorCode: "queue_unavailable",
          nextAttemptAt: now,
          updatedAt: now
        }
      },
      { returnDocument: "after" }
    );
  });
});

describe("background job processing leases", () => {
  it("claims published work with an atomic lease and increments attempts", async () => {
    const processing = document({ status: "processing", attempts: 1, leaseId: "lease-one" });
    const findOneAndUpdate = vi.fn().mockResolvedValue(processing);
    const db = database({ findOneAndUpdate });

    await expect(claimBackgroundJob(db, {
      jobId,
      leaseId: "lease-one",
      leaseMs: 60_000,
      now
    })).resolves.toEqual({ outcome: "claimed", document: processing });

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter.$or).toContainEqual({ status: "processing", leaseUntil: { $lte: now } });
    expect(update.$set).toMatchObject({ status: "processing", leaseId: "lease-one" });
    expect(update.$inc).toEqual({ attempts: 1 });
  });

  it("releases a lease for queue retry without persisting an unsafe error message", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue(document({ status: "published" }));
    const db = database({ findOneAndUpdate });

    await releaseForQueueRetry(db, {
      jobId,
      leaseId: "lease-one",
      errorCode: "failed for private@example.test",
      now
    });

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: jobId, status: "processing", leaseId: "lease-one" });
    expect(update.$set).toMatchObject({ status: "published", lastErrorCode: "unknown_error" });
    expect(update.$unset).toEqual({ leaseId: "", leaseUntil: "" });
  });

  it("defers exhausted queue work with attempt-based recovery backoff", async () => {
    const processing = document({ status: "processing", attempts: 3, leaseId: "lease-one" });
    const findOneAndUpdate = vi.fn().mockResolvedValue(document({ status: "retryable", attempts: 3 }));
    const db = database({
      findOne: vi.fn().mockResolvedValue(processing),
      findOneAndUpdate
    });

    await deferForRecovery(db, {
      jobId,
      leaseId: "lease-one",
      errorCode: { code: "PROVIDER_TIMEOUT" },
      now
    });

    expect(findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({
      status: "retryable",
      lastErrorCode: "provider_timeout",
      nextAttemptAt: new Date(now.getTime() + 120_000)
    });
  });

  it("finishes or kills only the holder of the active processing lease", async () => {
    const findOneAndUpdate = vi.fn()
      .mockResolvedValueOnce(document({ status: "completed", completedAt: now }))
      .mockResolvedValueOnce(document({ status: "dead", deadAt: now }));
    const db = database({ findOneAndUpdate });

    await completeBackgroundJob(db, { jobId, leaseId: "lease-one", now });
    await deadBackgroundJob(db, {
      jobId,
      leaseId: "lease-two",
      errorCode: "INVALID_RECIPIENT",
      now
    });

    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({
      _id: jobId,
      status: "processing",
      leaseId: "lease-one"
    });
    expect(findOneAndUpdate.mock.calls[0][1].$set.status).toBe("completed");
    expect(findOneAndUpdate.mock.calls[1][1].$set).toMatchObject({
      status: "dead",
      lastErrorCode: "invalid_recipient"
    });
  });
});

describe("background job recovery", () => {
  it("terminalizes exhausted due work and expired leases without touching active processing", async () => {
    const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    const db = database({ updateMany });

    await expect(deadExhaustedBackgroundJobs(db, { now })).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith(
      {
        attempts: { $gte: 12 },
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
          purgeAt: new Date("2026-09-12T12:00:00.000Z"),
          lastErrorCode: "attempt_limit_reached",
          nextAttemptAt: now,
          updatedAt: now
        },
        $unset: { leaseId: "", leaseUntil: "" }
      }
    );
  });

  it("finds only due publish states and expired processing leases", async () => {
    const cursor = {
      sort: vi.fn(),
      limit: vi.fn(),
      toArray: vi.fn().mockResolvedValue([
        { _id: jobId, status: "retryable" },
        { _id: orderNotificationJobId("order-two"), status: "processing" }
      ])
    };
    cursor.sort.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    const find = vi.fn().mockReturnValue(cursor);
    const createIndexes = vi.fn().mockResolvedValue([]);
    const db = database({ find, createIndexes });

    await expect(findRecoverableBackgroundJobs(db, { now, limit: 2 })).resolves.toEqual([
      { jobId, status: "retryable" },
      { jobId: orderNotificationJobId("order-two"), status: "processing" }
    ]);

    expect(createIndexes).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][0]).toEqual({
      $or: [
        {
          status: { $in: ["pending", "publishing", "published", "retryable"] },
          attempts: { $lt: 12 },
          nextAttemptAt: { $lte: now }
        },
        { status: "processing", attempts: { $lt: 12 }, leaseUntil: { $lte: now } }
      ]
    });
    expect(cursor.limit).toHaveBeenCalledWith(2);
  });
});
