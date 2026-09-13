import "server-only";
import type { Db } from "mongodb";
import {
  sanitizeBackgroundJobErrorCode,
  type BackgroundJobDocument
} from "@/lib/background-jobs";

const collectionName = "background_jobs";

/** Reopens only a terminal job; completed and active work cannot be duplicated. */
export async function replayDeadBackgroundJob(db: Db, jobId: string, now = new Date()) {
  const result = await db.collection<BackgroundJobDocument>(collectionName).findOneAndUpdate(
    { _id: jobId, status: "dead", lastErrorCode: { $ne: "account_deleted" } },
    {
      $set: {
        status: "retryable",
        attempts: 0,
        nextAttemptAt: now,
        updatedAt: now,
        lastErrorCode: sanitizeBackgroundJobErrorCode("manual_replay")
      },
      $unset: { deadAt: "", purgeAt: "", leaseId: "", leaseUntil: "" }
    },
    { returnDocument: "after" }
  );
  return result;
}
