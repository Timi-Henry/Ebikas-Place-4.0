import { describe, expect, it } from "vitest";
import {
  ProductMediaError,
  createMemoryProductMediaStore,
  createProductMediaLifecycle,
  isManagedProductMediaPublicId,
  type ProductMediaCloud,
  type ProductMediaCloudDeleteResult
} from "@/lib/server/product-media-core";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

class FakeProductMediaCloud implements ProductMediaCloud {
  uploadCalls = 0;
  destroyCalls = 0;
  maxActiveUploads = 0;
  failUploadCall?: number;
  uploadDelayMs = 0;
  readonly destroyPlans = new Map<string, ProductMediaCloudDeleteResult[]>();
  private activeUploads = 0;

  isManagedPublicId(publicId: string) {
    return isManagedProductMediaPublicId(publicId, "ebikas-place/products");
  }

  makeStagedPublicId(stageId: string) {
    return `ebikas-place/products/staged/${stageId}`;
  }

  async upload(input: { buffer: Buffer; publicId: string }) {
    this.uploadCalls += 1;
    const call = this.uploadCalls;
    this.activeUploads += 1;
    this.maxActiveUploads = Math.max(this.maxActiveUploads, this.activeUploads);
    if (this.uploadDelayMs) await new Promise((resolve) => setTimeout(resolve, this.uploadDelayMs));
    this.activeUploads -= 1;
    if (this.failUploadCall === call) throw new Error("provider details must not escape");
    return {
      publicId: input.publicId,
      secureUrl: `https://res.cloudinary.com/demo/image/upload/v1/${input.publicId}.png`
    };
  }

  async destroy(publicId: string) {
    this.destroyCalls += 1;
    const plan = this.destroyPlans.get(publicId);
    return plan?.shift() || ({ status: "missing" } as const);
  }
}

function upload(contentType = "image/png") {
  return { buffer: Buffer.from(png), contentType };
}

describe("ProductMedia lifecycle", () => {
  it("bounds parallel uploads and replays an idempotent stage request", async () => {
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    cloud.uploadDelayMs = 5;
    const media = createProductMediaLifecycle({ store, cloud, uploadConcurrency: 2 });
    const input = {
      ownerId: "admin-user",
      requestId: "upload-request-0001",
      files: [upload(), upload(), upload(), upload(), upload()]
    };

    const first = await media.stage(input);
    const replay = await media.stage(input);

    expect(first.media).toHaveLength(5);
    expect(replay).toEqual(first);
    expect(cloud.uploadCalls).toBe(5);
    expect(cloud.maxActiveUploads).toBeLessThanOrEqual(2);
    expect(store.inspectAssets().every((asset) => asset.state === "staged")).toBe(true);
  });

  it("checks image bytes instead of trusting the supplied MIME type", async () => {
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    const media = createProductMediaLifecycle({ store, cloud });

    await expect(
      media.stage({ ownerId: "admin-user", requestId: "upload-request-0002", files: [upload("image/jpeg")] })
    ).rejects.toMatchObject({ code: "INVALID_MEDIA_INPUT" });
    expect(cloud.uploadCalls).toBe(0);
    expect(store.inspectAssets()).toHaveLength(0);
  });

  it("durably retires every deterministic stage when a batch only partially uploads", async () => {
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    cloud.failUploadCall = 2;
    const media = createProductMediaLifecycle({ store, cloud, uploadConcurrency: 1 });

    await expect(
      media.stage({
        ownerId: "admin-user",
        requestId: "upload-request-0003",
        files: [upload(), upload(), upload()]
      })
    ).rejects.toMatchObject({ code: "MEDIA_STAGE_FAILED" });

    expect(store.inspectAssets().every((asset) => asset.state === "retired")).toBe(true);
    expect(store.inspectCleanup()).toHaveLength(3);
    const sweep = await media.sweepCleanup();
    expect(sweep).toMatchObject({ claimed: 3, alreadyMissing: 3 });
    expect(store.inspectCleanup().every((job) => job.state === "done")).toBe(true);
  });

  it("commits stages idempotently and will not attach them to a second product", async () => {
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    const media = createProductMediaLifecycle({ store, cloud });
    const staged = await media.stage({
      ownerId: "admin-user",
      requestId: "upload-request-0004",
      files: [upload()]
    });
    const stageIds = staged.media.map((item) => item.stageId);

    const first = await media.commit({ ownerId: "admin-user", productId: "product-one", stageIds });
    const replay = await media.commit({ ownerId: "admin-user", productId: "product-one", stageIds });

    expect(replay).toEqual(first);
    await expect(
      media.commit({ ownerId: "admin-user", productId: "product-two", stageIds })
    ).rejects.toMatchObject({ code: "MEDIA_COMMIT_CONFLICT" });
  });

  it("leases cleanup once, records retry metadata, and treats retirement as idempotent", async () => {
    let clock = new Date("2026-07-18T00:00:00.000Z");
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    const media = createProductMediaLifecycle({
      store,
      cloud,
      now: () => new Date(clock),
      cleanupBaseRetryMs: 100,
      cleanupMaxAttempts: 3
    });
    const staged = await media.stage({
      ownerId: "admin-user",
      requestId: "upload-request-0005",
      files: [upload()]
    });
    const publicId = staged.media[0].publicId;
    cloud.destroyPlans.set(publicId, [
      { status: "failed", retryable: true, category: "temporary_provider_failure" },
      { status: "deleted" }
    ]);

    const queued = await media.retire({
      actorId: "admin-user",
      productId: "product-one",
      publicIds: [publicId],
      reason: "image-replaced"
    });
    const duplicate = await media.retire({
      actorId: "admin-user",
      productId: "product-one",
      publicIds: [publicId],
      reason: "image-replaced"
    });
    expect(queued.queued).toEqual([publicId]);
    expect(duplicate.alreadyQueued).toEqual([publicId]);

    expect(await media.sweepCleanup()).toMatchObject({ claimed: 1, retryScheduled: 1 });
    expect(await media.sweepCleanup()).toMatchObject({ claimed: 0 });
    let job = store.inspectCleanup()[0];
    expect(job).toMatchObject({ state: "pending", attempts: 1, lastFailureCategory: "temporary_provider_failure" });

    clock = new Date(clock.getTime() + 101);
    expect(await media.sweepCleanup()).toMatchObject({ claimed: 1, deleted: 1 });
    job = store.inspectCleanup()[0];
    expect(job).toMatchObject({ state: "done", attempts: 2 });

    const retiredAgain = await media.retire({
      actorId: "admin-user",
      publicIds: [publicId],
      reason: "manual-cleanup"
    });
    expect(retiredAgain.alreadyDeleted).toEqual([publicId]);
    expect(await media.sweepCleanup()).toMatchObject({ claimed: 0 });
    expect(cloud.destroyCalls).toBe(2);
  });

  it("expires abandoned stages into the cleanup outbox", async () => {
    let clock = new Date("2026-07-18T00:00:00.000Z");
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    const media = createProductMediaLifecycle({ store, cloud, now: () => new Date(clock), stagedTtlMs: 100 });
    await media.stage({ ownerId: "admin-user", requestId: "upload-request-0006", files: [upload()] });

    clock = new Date(clock.getTime() + 101);
    const result = await media.sweepCleanup();
    expect(result).toMatchObject({ expiredStagesQueued: 1, claimed: 1, alreadyMissing: 1 });
    expect(store.inspectAssets()[0].state).toBe("deleted");
  });

  it("rejects cleanup outside the configured Cloudinary product folder", async () => {
    const store = createMemoryProductMediaStore();
    const cloud = new FakeProductMediaCloud();
    const media = createProductMediaLifecycle({ store, cloud });

    await expect(
      media.retire({ actorId: "admin-user", publicIds: ["another-folder/image"], reason: "manual-cleanup" })
    ).rejects.toBeInstanceOf(ProductMediaError);
    expect(store.inspectCleanup()).toHaveLength(0);
  });
});
