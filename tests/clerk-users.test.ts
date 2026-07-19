import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => {
  const users = {
    findOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn()
  };
  const tombstones = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn()
  };
  const addresses = { deleteMany: vi.fn() };
  const orders = { updateMany: vi.fn() };
  const reviews = { updateMany: vi.fn() };
  const products = { updateMany: vi.fn() };
  const mediaAssets = { updateMany: vi.fn() };
  const mediaCleanup = { updateMany: vi.fn() };
  const collections: Record<string, unknown> = {
    clerk_users: users,
    clerk_user_tombstones: tombstones,
    addresses,
    orders,
    reviews,
    products,
    product_media_assets: mediaAssets,
    product_media_cleanup_outbox: mediaCleanup
  };
  const db = { collection: vi.fn((name: string) => collections[name]) };
  const session = {
    withTransaction: vi.fn(),
    endSession: vi.fn()
  };
  const client = { startSession: vi.fn(() => session) };

  return {
    users,
    tombstones,
    addresses,
    orders,
    reviews,
    products,
    mediaAssets,
    mediaCleanup,
    db,
    session,
    client
  };
});

const ensureClerkUserIndexes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/database-indexes", () => ({ ensureClerkUserIndexes }));
vi.mock("@/lib/server/mongodb", () => ({
  getDb: vi.fn(async () => database.db),
  getMongoClient: vi.fn(async () => database.client)
}));

import { deletedUserPseudonym } from "@/lib/clerk-user-lifecycle";
import {
  cleanupDeletedClerkUser,
  syncClerkUserProfile
} from "@/lib/server/clerk-users";

const snapshot = {
  userId: "user_2abc",
  primaryEmail: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  imageUrl: null,
  sourceCreatedAt: "2026-07-17T09:30:00.000Z",
  sourceUpdatedAt: "2026-07-18T10:45:00.000Z"
};

beforeEach(() => {
  vi.clearAllMocks();
  ensureClerkUserIndexes.mockResolvedValue(undefined);
  database.session.withTransaction.mockImplementation(async (callback: () => Promise<void>) => callback());
  database.session.endSession.mockResolvedValue(undefined);
  database.tombstones.findOne.mockResolvedValue(null);
  database.tombstones.insertOne.mockResolvedValue({ acknowledged: true });
  database.tombstones.updateOne.mockResolvedValue({ acknowledged: true });
  database.users.findOne.mockResolvedValue(null);
  database.users.updateOne.mockResolvedValue({ acknowledged: true });
  database.users.deleteOne.mockResolvedValue({ deletedCount: 1 });
  database.addresses.deleteMany.mockResolvedValue({ deletedCount: 2 });
  database.orders.updateMany.mockResolvedValue({ modifiedCount: 3 });
  database.reviews.updateMany.mockResolvedValue({ modifiedCount: 4 });
  database.products.updateMany.mockResolvedValue({ modifiedCount: 5 });
  database.mediaAssets.updateMany.mockResolvedValue({ modifiedCount: 6 });
  database.mediaCleanup.updateMany.mockResolvedValue({ modifiedCount: 7 });
});

describe("Clerk user synchronization", () => {
  it("does not resurrect a user after account-deletion cleanup", async () => {
    database.tombstones.findOne.mockResolvedValue({
      _id: deletedUserPseudonym(snapshot.userId),
      status: "deleted"
    });

    await expect(syncClerkUserProfile(snapshot, "created")).resolves.toEqual({ outcome: "deleted" });
    expect(ensureClerkUserIndexes).toHaveBeenCalledTimes(1);
    expect(database.users.findOne).not.toHaveBeenCalled();
    expect(database.users.updateOne).not.toHaveBeenCalled();
  });

  it("does not overwrite newer profile data with a stale Clerk update", async () => {
    database.users.findOne.mockResolvedValue({
      _id: snapshot.userId,
      sourceUpdatedAt: new Date("2026-07-19T00:00:00.000Z")
    });

    await expect(syncClerkUserProfile(snapshot, "updated")).resolves.toEqual({ outcome: "stale" });
    expect(database.users.updateOne).not.toHaveBeenCalled();
  });

  it("allows sync through an active pseudonymous lifecycle guard", async () => {
    database.tombstones.findOne.mockResolvedValue({
      _id: deletedUserPseudonym(snapshot.userId),
      status: "active"
    });

    await expect(syncClerkUserProfile(snapshot, "updated")).resolves.toEqual({ outcome: "synced" });
    expect(database.users.updateOne).toHaveBeenCalledTimes(1);
    expect(database.tombstones.insertOne).not.toHaveBeenCalled();
  });
});

describe("deleted Clerk user cleanup", () => {
  it("deletes profile/address data and pseudonymizes retained history atomically", async () => {
    const pseudonym = deletedUserPseudonym(snapshot.userId);

    await expect(cleanupDeletedClerkUser(snapshot.userId)).resolves.toEqual({
      outcome: "cleaned",
      profileDeleted: 1,
      addressesDeleted: 2,
      ordersUnlinked: 3,
      reviewsUnlinked: 4,
      legacyReviewsUnlinked: 5,
      mediaAssetsUnlinked: 6,
      mediaCleanupJobsUnlinked: 7
    });

    expect(database.users.deleteOne).toHaveBeenCalledWith(
      { _id: snapshot.userId },
      expect.objectContaining({ session: database.session })
    );
    expect(database.addresses.deleteMany).toHaveBeenCalledWith(
      { userId: snapshot.userId },
      expect.objectContaining({ session: database.session })
    );
    expect(database.orders.updateMany).toHaveBeenCalledWith(
      { userId: snapshot.userId },
      {
        $set: { userId: pseudonym, accountDeletedAt: expect.any(Date) },
        $unset: { idempotencyKey: "", requestHash: "" }
      },
      expect.objectContaining({ session: database.session })
    );
    expect(database.reviews.updateMany).toHaveBeenCalledWith(
      { userId: snapshot.userId },
      { $set: { userId: pseudonym, updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: database.session })
    );
    expect(database.products.updateMany).toHaveBeenCalledWith(
      { "reviews.userId": snapshot.userId },
      { $set: { "reviews.$[review].userId": pseudonym } },
      expect.objectContaining({
        arrayFilters: [{ "review.userId": snapshot.userId }],
        session: database.session
      })
    );
    expect(database.mediaAssets.updateMany).toHaveBeenCalledWith(
      { ownerId: snapshot.userId },
      { $set: { ownerId: pseudonym, updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: database.session })
    );
    expect(database.mediaCleanup.updateMany).toHaveBeenCalledWith(
      { actorId: snapshot.userId },
      { $set: { actorId: pseudonym, updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: database.session })
    );
    expect(database.tombstones.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: pseudonym, status: "deleted" }),
      expect.objectContaining({ session: database.session })
    );
    expect(database.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(database.session.endSession).toHaveBeenCalledTimes(1);
  });

  it("makes a replay a no-op once the pseudonymous tombstone exists", async () => {
    database.tombstones.findOne.mockResolvedValue({
      _id: deletedUserPseudonym(snapshot.userId),
      status: "deleted"
    });

    await expect(cleanupDeletedClerkUser(snapshot.userId)).resolves.toMatchObject({
      outcome: "already-cleaned",
      profileDeleted: 0,
      addressesDeleted: 0,
      ordersUnlinked: 0
    });
    expect(database.users.deleteOne).not.toHaveBeenCalled();
    expect(database.addresses.deleteMany).not.toHaveBeenCalled();
    expect(database.orders.updateMany).not.toHaveBeenCalled();
    expect(database.tombstones.insertOne).not.toHaveBeenCalled();
    expect(database.session.endSession).toHaveBeenCalledTimes(1);
  });

  it("turns an active guard into a tombstone before unlinking retained data", async () => {
    const pseudonym = deletedUserPseudonym(snapshot.userId);
    database.tombstones.findOne.mockResolvedValue({ _id: pseudonym, status: "active" });

    await expect(cleanupDeletedClerkUser(snapshot.userId)).resolves.toMatchObject({ outcome: "cleaned" });
    expect(database.tombstones.updateOne).toHaveBeenCalledWith(
      { _id: pseudonym, status: "active" },
      {
        $set: {
          status: "deleted",
          deletedAt: expect.any(Date),
          cleanupCompletedAt: expect.any(Date)
        }
      },
      expect.objectContaining({ session: database.session })
    );
    expect(database.tombstones.insertOne).not.toHaveBeenCalled();
  });
});
