import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { replayDeadBackgroundJob } from "@/lib/server/background-job-admin";

describe("dead background job replay", () => {
  it("atomically reopens only a dead job and resets its bounded attempt count", async () => {
    const reopened = { _id: "job_order_0123456789abcdef0123456789abcdef01234567", status: "retryable" };
    const findOneAndUpdate = vi.fn().mockResolvedValue(reopened);
    const db = {
      collection: vi.fn(() => ({ findOneAndUpdate }))
    };
    const now = new Date("2026-08-13T12:00:00.000Z");

    await expect(replayDeadBackgroundJob(db as never, reopened._id, now)).resolves.toBe(reopened);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: reopened._id, status: "dead", lastErrorCode: { $ne: "account_deleted" } },
      {
        $set: {
          status: "retryable",
          attempts: 0,
          nextAttemptAt: now,
          updatedAt: now,
          lastErrorCode: "manual_replay"
        },
        $unset: { deadAt: "", purgeAt: "", leaseId: "", leaseUntil: "" }
      },
      { returnDocument: "after" }
    );
  });
});
