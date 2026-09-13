import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createClerkWebhookHandler,
  type ClerkWebhookDependencies
} from "@/lib/server/clerk-webhook";
import { EnvironmentConfigurationError } from "@/lib/server/env";

const createdAt = Date.UTC(2026, 6, 17, 9, 30);
const updatedAt = Date.UTC(2026, 6, 18, 10, 45);

const clerkUser = {
  id: "user_2abc",
  object: "user",
  first_name: "  Ada  ",
  last_name: " Lovelace ",
  image_url: "https://img.clerk.com/user.png",
  primary_email_address_id: "idn_primary",
  email_addresses: [
    { id: "idn_primary", email_address: "ADA@EXAMPLE.COM" }
  ],
  created_at: createdAt,
  updated_at: updatedAt
};

function request() {
  return new Request("https://shop.example/api/webhooks/clerk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
}

function dependencies(): ClerkWebhookDependencies {
  return {
    verify: vi.fn().mockResolvedValue({ type: "user.created", data: clerkUser }),
    syncUser: vi.fn().mockResolvedValue({ outcome: "synced" }),
    cleanupUser: vi.fn().mockResolvedValue({ outcome: "cleaned" }),
    enqueueWelcome: vi.fn().mockResolvedValue({ status: "published" })
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("direct Clerk lifecycle webhook", () => {
  it("rejects an invalid signature without running any side effects", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockRejectedValue(new Error("contains verifier detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid webhook signature." });
    expect(deps.syncUser).not.toHaveBeenCalled();
    expect(deps.cleanupUser).not.toHaveBeenCalled();
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns a retryable server error when webhook verification is not configured", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockRejectedValue(
      new EnvironmentConfigurationError("missing secret", ["CLERK_WEBHOOK_SIGNING_SECRET"])
    );

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook is temporarily unavailable."
    });
    expect(deps.syncUser).not.toHaveBeenCalled();
    expect(deps.cleanupUser).not.toHaveBeenCalled();
  });

  it("ignores unsupported signed events with a successful response", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockResolvedValue({
      type: "session.created",
      data: { account: "must-not-be-logged" }
    });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(deps.syncUser).not.toHaveBeenCalled();
    expect(deps.cleanupUser).not.toHaveBeenCalled();
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });

  it("syncs a created user before publishing one welcome job", async () => {
    const deps = dependencies();
    const sequence: string[] = [];
    vi.mocked(deps.syncUser).mockImplementation(async () => {
      sequence.push("synced");
      return { outcome: "synced" };
    });
    vi.mocked(deps.enqueueWelcome).mockImplementation(async () => {
      sequence.push("enqueued");
      return { status: "published" };
    });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(sequence).toEqual(["synced", "enqueued"]);
    expect(deps.syncUser).toHaveBeenCalledWith(
      {
        userId: "user_2abc",
        primaryEmail: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        imageUrl: "https://img.clerk.com/user.png",
        sourceCreatedAt: new Date(createdAt).toISOString(),
        sourceUpdatedAt: new Date(updatedAt).toISOString()
      },
      "created"
    );
    expect(deps.enqueueWelcome).toHaveBeenCalledWith("user_2abc");
  });

  it("does not enqueue a welcome email when a deletion tombstone wins", async () => {
    const deps = dependencies();
    vi.mocked(deps.syncUser).mockResolvedValue({ outcome: "deleted" });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });

  it("syncs user updates without publishing a welcome job", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockResolvedValue({ type: "user.updated", data: clerkUser });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(deps.syncUser).toHaveBeenCalledWith(expect.any(Object), "updated");
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });

  it("publishes the one deferred welcome job when an update adds a primary email", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockResolvedValue({ type: "user.updated", data: clerkUser });
    vi.mocked(deps.syncUser).mockResolvedValue({ outcome: "synced", enqueueWelcome: true });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(deps.enqueueWelcome).toHaveBeenCalledWith("user_2abc");
  });

  it("runs account cleanup for a deleted user", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockResolvedValue({
      type: "user.deleted",
      data: { id: "user_2abc", object: "user", deleted: true }
    });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(deps.cleanupUser).toHaveBeenCalledWith("user_2abc");
    expect(deps.syncUser).not.toHaveBeenCalled();
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });

  it("returns 500 for a transient database failure so Clerk retries", async () => {
    const deps = dependencies();
    vi.mocked(deps.syncUser).mockRejectedValue(new Error("temporary database outage"));

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to process webhook." });
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });

  it("returns 500 when welcome-job publication fails after an idempotent sync", async () => {
    const deps = dependencies();
    vi.mocked(deps.enqueueWelcome).mockRejectedValue(new Error("temporary queue outage"));

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(500);
    expect(deps.syncUser).toHaveBeenCalledTimes(1);
    expect(deps.enqueueWelcome).toHaveBeenCalledWith("user_2abc");
  });

  it("rejects a malformed signed lifecycle payload without leaking it", async () => {
    const deps = dependencies();
    vi.mocked(deps.verify).mockResolvedValue({
      type: "user.created",
      data: { id: "secret-user", object: "not-a-user" }
    });

    const response = await createClerkWebhookHandler(deps)(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid webhook payload." });
    expect(deps.syncUser).not.toHaveBeenCalled();
    expect(deps.enqueueWelcome).not.toHaveBeenCalled();
  });
});
