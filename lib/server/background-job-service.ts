import "server-only";
import { send } from "@vercel/queue";
import type { Db } from "mongodb";
import { welcomeNotificationJobId } from "@/lib/background-jobs";
import {
  deadExhaustedBackgroundJobs,
  findRecoverableBackgroundJobs,
  insertBackgroundJobInTransaction,
  markPublicationFailed,
  markPublished,
  preparePublication,
  reopenTerminalBackgroundJobInTransaction,
  type InsertBackgroundJobResult
} from "@/lib/server/background-job-store";
import { touchActiveClerkUserGuardForWelcomeInTransaction } from "@/lib/server/clerk-users";
import { getDb, getMongoClient } from "@/lib/server/mongodb";

export const BACKGROUND_JOB_TOPIC = "store-background-jobs-v1";
const QUEUE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

async function publishPreparedJob(
  db: Db,
  prepared: NonNullable<Awaited<ReturnType<typeof preparePublication>>>
) {
  let result: Awaited<ReturnType<typeof send>>;
  try {
    result = await send(BACKGROUND_JOB_TOPIC, prepared.envelope, {
      idempotencyKey: prepared.publicationId,
      retentionSeconds: QUEUE_RETENTION_SECONDS
    });
  } catch (error) {
    await markPublicationFailed(db, {
      jobId: prepared.jobId,
      generation: prepared.generation,
      errorCode: error
    }).catch(() => null);
    throw error;
  }
  await markPublished(db, {
    jobId: prepared.jobId,
    generation: prepared.generation
  });
  return { jobId: prepared.jobId, messageId: result.messageId };
}

/**
 * Publishes one already-persisted job. If the queue accepted the message but
 * its acknowledgement was lost, `preparePublication` reuses the same
 * generation and Vercel's idempotency key prevents a duplicate publication.
 */
export async function publishBackgroundJob(jobId: string) {
  const db = await getDb();
  const prepared = await preparePublication(db, { jobId });
  if (!prepared) return { jobId, outcome: "not-due" as const };
  const published = await publishPreparedJob(db, prepared);
  return { ...published, outcome: "published" as const };
}

async function insertStandaloneJob(kind: "welcome-notification", entityId: string) {
  const [client, db] = await Promise.all([getMongoClient(), getDb()]);
  const session = client.startSession();
  let inserted: InsertBackgroundJobResult | undefined;
  try {
    await session.withTransaction(
      async () => {
        const pendingUser = await db.collection<{ _id: string }>("clerk_users").findOne(
          { _id: entityId, "welcomeNotification.status": "pending" },
          { session, projection: { _id: 1 } }
        );
        if (!pendingUser) {
          inserted = {
            jobId: welcomeNotificationJobId(entityId),
            inserted: false
          };
          return;
        }
        const activeLifecycle = await touchActiveClerkUserGuardForWelcomeInTransaction(
          db,
          session,
          entityId
        );
        if (!activeLifecycle) {
          inserted = {
            jobId: welcomeNotificationJobId(entityId),
            inserted: false
          };
          return;
        }
        inserted = await insertBackgroundJobInTransaction(db, session, { kind, entityId });
        if (!inserted.inserted) {
          await reopenTerminalBackgroundJobInTransaction(db, session, {
            jobId: inserted.jobId,
            kind,
            entityId
          });
        }
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
  if (!inserted) throw new Error("Background job transaction did not complete.");
  return inserted;
}

/** Persists the welcome intent before publishing its opaque job ID. */
export async function enqueueWelcomeNotificationJob(userId: string) {
  const job = await insertStandaloneJob("welcome-notification", userId);
  return publishBackgroundJob(job.jobId);
}

/**
 * Bounded recovery for queue publication failures, expired messages, and
 * processing leases. Failed jobs remain recoverable for the next sweep.
 */
export async function recoverBackgroundJobs(limit = 50) {
  const db = await getDb();
  const dead = await deadExhaustedBackgroundJobs(db);
  const recoverable = await findRecoverableBackgroundJobs(db, { limit });
  const results = await Promise.allSettled(
    recoverable.map(async ({ jobId }) => {
      const prepared = await preparePublication(db, { jobId });
      return prepared ? publishPreparedJob(db, prepared) : null;
    })
  );
  const summary = {
    dead,
    found: recoverable.length,
    published: results.filter(
      (result) => result.status === "fulfilled" && result.value !== null
    ).length,
    failed: results.filter((result) => result.status === "rejected").length
  };
  if (summary.failed > 0) {
    throw new Error(`Background job recovery failed to publish ${summary.failed} job(s).`);
  }
  return summary;
}
