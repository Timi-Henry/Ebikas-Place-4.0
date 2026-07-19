import "server-only";
import type { ClientSession } from "mongodb";
import { deletedUserPseudonym, type ClerkUserSnapshot } from "@/lib/clerk-user-lifecycle";
import { ensureClerkUserIndexes } from "@/lib/server/database-indexes";
import { getDb, getMongoClient } from "@/lib/server/mongodb";

export type WelcomeNotificationStatus = "pending" | "enqueued" | "sent" | "suppressed";

type WelcomeNotificationState = {
  status: WelcomeNotificationStatus;
  createdAt: Date;
  enqueuedAt?: Date;
  sentAt?: Date;
  suppressedAt?: Date;
};

type ClerkUserDocument = {
  _id: string;
  primaryEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  sourceCreatedAt: Date;
  sourceUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  welcomeNotification?: WelcomeNotificationState;
};

type ClerkUserLifecycleGuard = {
  _id: string;
  // Missing status is treated as deleted for compatibility with tombstones
  // written by the first version of this workflow.
  status?: "active" | "deleted";
  createdAt?: Date;
  deletedAt?: Date;
  cleanupCompletedAt?: Date;
};

export type ClerkUserCleanupResult = {
  outcome: "cleaned" | "already-cleaned";
  profileDeleted: number;
  addressesDeleted: number;
  ordersUnlinked: number;
  reviewsUnlinked: number;
  legacyReviewsUnlinked: number;
  mediaAssetsUnlinked: number;
  mediaCleanupJobsUnlinked: number;
};

function usersCollection(db: Awaited<ReturnType<typeof getDb>>) {
  return db.collection<ClerkUserDocument>("clerk_users");
}

function lifecycleGuardsCollection(db: Awaited<ReturnType<typeof getDb>>) {
  return db.collection<ClerkUserLifecycleGuard>("clerk_user_tombstones");
}

function welcomeState(now: Date): WelcomeNotificationState {
  return { status: "pending", createdAt: now };
}

/**
 * Mirrors only the Clerk fields the storefront needs. A hashed tombstone wins
 * over late or replayed create/update webhooks so deletion cannot be undone.
 */
export async function syncClerkUserProfile(
  snapshot: ClerkUserSnapshot,
  kind: "created" | "updated"
) {
  await ensureClerkUserIndexes();
  const [client, db] = await Promise.all([getMongoClient(), getDb()]);
  const session = client.startSession();
  const pseudonym = deletedUserPseudonym(snapshot.userId);
  const sourceCreatedAt = new Date(snapshot.sourceCreatedAt);
  const sourceUpdatedAt = new Date(snapshot.sourceUpdatedAt);

  try {
    const result = await session.withTransaction(
      async () => {
        const guards = lifecycleGuardsCollection(db);
        const guard = await guards.findOne(
          { _id: pseudonym },
          { session, projection: { _id: 1, status: 1 } }
        );
        if (guard && guard.status !== "active") {
          return { outcome: "deleted" as const };
        }

        const users = usersCollection(db);
        const existing = await users.findOne({ _id: snapshot.userId }, { session });
        const now = new Date();
        let outcome: "synced" | "stale" = "synced";

        // Sync and deletion both write this pseudonymous guard. That forces
        // concurrent transactions to serialize instead of allowing a snapshot
        // read race to recreate a profile after deletion.
        if (!guard) {
          await guards.insertOne(
            { _id: pseudonym, status: "active", createdAt: now },
            { session }
          );
        }

        // Equal source timestamps are the same Clerk revision. Avoid rewriting
        // it so webhook retries remain a true no-op at the database boundary.
        if (!existing || existing.sourceUpdatedAt < sourceUpdatedAt) {
          await users.updateOne(
            { _id: snapshot.userId },
            {
              $set: {
                primaryEmail: snapshot.primaryEmail,
                firstName: snapshot.firstName,
                lastName: snapshot.lastName,
                imageUrl: snapshot.imageUrl,
                sourceCreatedAt,
                sourceUpdatedAt,
                updatedAt: now
              },
              $setOnInsert: { createdAt: now }
            },
            { upsert: true, session }
          );
        } else {
          outcome = "stale";
        }

        if (kind === "created") {
          await users.updateOne(
            { _id: snapshot.userId, welcomeNotification: { $exists: false } },
            { $set: { welcomeNotification: welcomeState(now) } },
            { session }
          );
        }

        return { outcome };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary"
      }
    );
    if (!result) throw new Error("Clerk user synchronization did not complete.");
    return result;
  } finally {
    await session.endSession();
  }
}

export async function loadClerkUserForWelcome(userId: string) {
  const db = await getDb();
  const user = await usersCollection(db).findOne({ _id: userId });
  if (!user) return null;

  // Profiles first seen through user.updated are intentionally not treated as
  // new accounts, preventing a deployment from emailing existing customers.
  return {
    userId: user._id,
    primaryEmail: user.primaryEmail,
    firstName: user.firstName,
    status: user.welcomeNotification?.status || ("suppressed" as const)
  };
}

export async function markWelcomeNotificationEnqueued(userId: string) {
  const db = await getDb();
  await usersCollection(db).updateOne(
    { _id: userId, "welcomeNotification.status": "pending" },
    {
      $set: {
        "welcomeNotification.status": "enqueued",
        "welcomeNotification.enqueuedAt": new Date()
      }
    }
  );
}

export async function markWelcomeNotificationSent(userId: string) {
  const db = await getDb();
  await usersCollection(db).updateOne(
    { _id: userId, "welcomeNotification.status": { $nin: ["sent", "suppressed"] } },
    {
      $set: {
        "welcomeNotification.status": "sent",
        "welcomeNotification.sentAt": new Date()
      }
    }
  );
}

export async function markWelcomeNotificationSuppressed(userId: string) {
  const db = await getDb();
  await usersCollection(db).updateOne(
    { _id: userId, "welcomeNotification.status": { $nin: ["sent", "suppressed"] } },
    {
      $set: {
        "welcomeNotification.status": "suppressed",
        "welcomeNotification.suppressedAt": new Date()
      }
    }
  );
}

async function unlinkRetainedUserData(
  db: Awaited<ReturnType<typeof getDb>>,
  session: ClientSession,
  userId: string,
  pseudonym: string,
  now: Date
) {
  const orders = await db.collection("orders").updateMany(
    { userId },
    {
      $set: { userId: pseudonym, accountDeletedAt: now },
      $unset: { idempotencyKey: "", requestHash: "" }
    },
    { session }
  );
  const reviews = await db.collection("reviews").updateMany(
    { userId },
    { $set: { userId: pseudonym, updatedAt: now } },
    { session }
  );
  const legacyReviews = await db.collection("products").updateMany(
    { "reviews.userId": userId },
    { $set: { "reviews.$[review].userId": pseudonym } },
    { arrayFilters: [{ "review.userId": userId }], session }
  );
  const mediaAssets = await db.collection("product_media_assets").updateMany(
    { ownerId: userId },
    { $set: { ownerId: pseudonym, updatedAt: now } },
    { session }
  );
  const mediaCleanupJobs = await db.collection("product_media_cleanup_outbox").updateMany(
    { actorId: userId },
    { $set: { actorId: pseudonym, updatedAt: now } },
    { session }
  );

  return {
    ordersUnlinked: orders.modifiedCount,
    reviewsUnlinked: reviews.modifiedCount,
    legacyReviewsUnlinked: legacyReviews.modifiedCount,
    mediaAssetsUnlinked: mediaAssets.modifiedCount,
    mediaCleanupJobsUnlinked: mediaCleanupJobs.modifiedCount
  };
}

/**
 * Deletes the mirrored profile and saved addresses. Commerce records and
 * reviews are retained for fulfillment/accounting and aggregate integrity,
 * but their reusable Clerk identifier is replaced with a one-way pseudonym.
 */
export async function cleanupDeletedClerkUser(userId: string): Promise<ClerkUserCleanupResult> {
  const [client, db] = await Promise.all([getMongoClient(), getDb()]);
  const session = client.startSession();
  const pseudonym = deletedUserPseudonym(userId);
  const emptyResult: ClerkUserCleanupResult = {
    outcome: "already-cleaned",
    profileDeleted: 0,
    addressesDeleted: 0,
    ordersUnlinked: 0,
    reviewsUnlinked: 0,
    legacyReviewsUnlinked: 0,
    mediaAssetsUnlinked: 0,
    mediaCleanupJobsUnlinked: 0
  };
  let result = emptyResult;

  try {
    await session.withTransaction(
      async () => {
        const guards = lifecycleGuardsCollection(db);
        const guard = await guards.findOne({ _id: pseudonym }, { session, projection: { _id: 1, status: 1 } });
        if (guard && guard.status !== "active") {
          result = emptyResult;
          return;
        }

        const now = new Date();
        if (guard) {
          await guards.updateOne(
            { _id: pseudonym, status: "active" },
            { $set: { status: "deleted", deletedAt: now, cleanupCompletedAt: now } },
            { session }
          );
        } else {
          await guards.insertOne(
            {
              _id: pseudonym,
              status: "deleted",
              createdAt: now,
              deletedAt: now,
              cleanupCompletedAt: now
            },
            { session }
          );
        }
        const profile = await usersCollection(db).deleteOne({ _id: userId }, { session });
        const addresses = await db.collection("addresses").deleteMany({ userId }, { session });
        const unlinked = await unlinkRetainedUserData(db, session, userId, pseudonym, now);

        result = {
          outcome: "cleaned",
          profileDeleted: profile.deletedCount,
          addressesDeleted: addresses.deletedCount,
          ...unlinked
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary"
      }
    );
  } finally {
    await session.endSession();
  }

  return result;
}
