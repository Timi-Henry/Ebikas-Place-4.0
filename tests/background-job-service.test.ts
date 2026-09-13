import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const queue = vi.hoisted(() => ({ send: vi.fn() }));
const store = vi.hoisted(() => ({
  deadExhaustedBackgroundJobs: vi.fn(),
  findRecoverableBackgroundJobs: vi.fn(),
  insertBackgroundJobInTransaction: vi.fn(),
  markPublicationFailed: vi.fn(),
  markPublished: vi.fn(),
  preparePublication: vi.fn(),
  reopenTerminalBackgroundJobInTransaction: vi.fn()
}));
const clerkUsers = vi.hoisted(() => ({
  touchActiveClerkUserGuardForWelcomeInTransaction: vi.fn()
}));
const mongo = vi.hoisted(() => {
  const users = { findOne: vi.fn() };
  const db = { collection: vi.fn(() => users) };
  const session = { withTransaction: vi.fn(), endSession: vi.fn() };
  const client = { startSession: vi.fn(() => session) };
  return { users, db, session, client };
});

vi.mock("@vercel/queue", () => ({ send: queue.send }));
vi.mock("@/lib/server/background-job-store", () => store);
vi.mock("@/lib/server/clerk-users", () => clerkUsers);
vi.mock("@/lib/server/mongodb", () => ({
  getDb: vi.fn(async () => mongo.db),
  getMongoClient: vi.fn(async () => mongo.client)
}));

import { welcomeNotificationJobId } from "@/lib/background-jobs";
import {
  enqueueWelcomeNotificationJob,
  recoverBackgroundJobs
} from "@/lib/server/background-job-service";

const userId = "user_2abc";
const jobId = welcomeNotificationJobId(userId);

beforeEach(() => {
  vi.clearAllMocks();
  mongo.session.withTransaction.mockImplementation(async (callback: () => Promise<void>) => callback());
  mongo.session.endSession.mockResolvedValue(undefined);
  mongo.users.findOne.mockResolvedValue({ _id: userId });
  clerkUsers.touchActiveClerkUserGuardForWelcomeInTransaction.mockResolvedValue(true);
  store.insertBackgroundJobInTransaction.mockResolvedValue({ jobId, inserted: true });
  store.reopenTerminalBackgroundJobInTransaction.mockResolvedValue({ jobId, reopened: true });
  store.deadExhaustedBackgroundJobs.mockResolvedValue(0);
  store.findRecoverableBackgroundJobs.mockResolvedValue([]);
  store.preparePublication.mockResolvedValue(null);
});

describe("background-job recovery", () => {
  it("terminalizes exhausted work before finding jobs that can be republished", async () => {
    const sequence: string[] = [];
    store.deadExhaustedBackgroundJobs.mockImplementation(async () => {
      sequence.push("dead");
      return 2;
    });
    store.findRecoverableBackgroundJobs.mockImplementation(async () => {
      sequence.push("find");
      return [];
    });

    await expect(recoverBackgroundJobs(25)).resolves.toEqual({
      dead: 2,
      found: 0,
      published: 0,
      failed: 0
    });

    expect(sequence).toEqual(["dead", "find"]);
    expect(store.deadExhaustedBackgroundJobs).toHaveBeenCalledWith(mongo.db);
    expect(store.findRecoverableBackgroundJobs).toHaveBeenCalledWith(mongo.db, { limit: 25 });
  });
});

describe("welcome background-job persistence", () => {
  it("writes the active deletion guard before inserting the welcome job", async () => {
    const sequence: string[] = [];
    clerkUsers.touchActiveClerkUserGuardForWelcomeInTransaction.mockImplementation(async () => {
      sequence.push("guard");
      return true;
    });
    store.insertBackgroundJobInTransaction.mockImplementation(async () => {
      sequence.push("job");
      return { jobId, inserted: true };
    });

    await enqueueWelcomeNotificationJob(userId);

    expect(sequence).toEqual(["guard", "job"]);
    expect(clerkUsers.touchActiveClerkUserGuardForWelcomeInTransaction).toHaveBeenCalledWith(
      mongo.db,
      mongo.session,
      userId
    );
  });

  it("does not insert or reopen a welcome job after deletion wins", async () => {
    clerkUsers.touchActiveClerkUserGuardForWelcomeInTransaction.mockResolvedValue(false);

    await enqueueWelcomeNotificationJob(userId);

    expect(store.insertBackgroundJobInTransaction).not.toHaveBeenCalled();
    expect(store.reopenTerminalBackgroundJobInTransaction).not.toHaveBeenCalled();
  });

  it("reopens the deterministic job when a pending welcome event is replayed", async () => {
    store.insertBackgroundJobInTransaction.mockResolvedValue({ jobId, inserted: false });

    await enqueueWelcomeNotificationJob(userId);

    expect(store.reopenTerminalBackgroundJobInTransaction).toHaveBeenCalledWith(
      mongo.db,
      mongo.session,
      { jobId, kind: "welcome-notification", entityId: userId }
    );
  });
});
