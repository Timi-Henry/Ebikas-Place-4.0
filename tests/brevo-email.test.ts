import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createBrevoTransactionalPayload,
  emailOperationUuid
} from "@/lib/brevo-email";
import { TransactionalEmailProviderError } from "@/lib/email-delivery";
import { sendTransactionalEmails } from "@/lib/server/email-delivery";

const customerMessage = {
  to: "ada@example.com",
  toName: "Ada Lovelace",
  replyTo: "owner@example.com",
  subject: "Your order",
  html: "<p>Customer copy</p>",
  text: "Customer copy",
  tags: ["order", "customer"]
};

const adminMessage = {
  to: "owner@example.com",
  replyTo: "ada@example.com",
  subject: "New order",
  html: "<p>Admin copy</p>",
  text: "Admin copy",
  tags: ["order", "admin"]
};

function configureBrevoEnvironment() {
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test-key");
  vi.stubEnv("BREVO_SENDER_EMAIL", "orders@example.com");
  vi.stubEnv("BREVO_SENDER_NAME", "Ebika's Place");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Brevo transactional payload", () => {
  it("derives a stable version-5 UUID from the logical operation", () => {
    const first = emailOperationUuid("order-placed:order-1");
    const again = emailOperationUuid("order-placed:order-1");
    const other = emailOperationUuid("order-placed:order-2");

    expect(first).toBe(again);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("builds a single-recipient request with body-level idempotency", () => {
    const payload = createBrevoTransactionalPayload(
      [customerMessage],
      { email: "orders@example.com", name: "Ebika's Place" },
      "welcome:v1:user-1"
    );

    expect(payload).toMatchObject({
      sender: { email: "orders@example.com", name: "Ebika's Place" },
      to: [{ email: "ada@example.com", name: "Ada Lovelace" }],
      replyTo: { email: "owner@example.com" },
      subject: "Your order",
      htmlContent: "<p>Customer copy</p>",
      textContent: "Customer copy",
      headers: { idempotencyKey: emailOperationUuid("welcome:v1:user-1") }
    });
    expect(payload).not.toHaveProperty("messageVersions");
  });

  it("uses heterogeneous message versions for a two-recipient order notification", () => {
    const payload = createBrevoTransactionalPayload(
      [customerMessage, adminMessage],
      { email: "orders@example.com" },
      "order-placed:order-1"
    );

    expect(payload).not.toHaveProperty("to");
    expect(payload.tags).toEqual(["order"]);
    expect(payload.messageVersions).toEqual([
      expect.objectContaining({
        to: [{ email: "ada@example.com", name: "Ada Lovelace" }],
        replyTo: { email: "owner@example.com" },
        subject: "Your order",
        htmlContent: "<p>Customer copy</p>"
      }),
      expect.objectContaining({
        to: [{ email: "owner@example.com" }],
        replyTo: { email: "ada@example.com" },
        subject: "New order",
        htmlContent: "<p>Admin copy</p>"
      })
    ]);
  });

  it("rejects an empty provider request", () => {
    expect(() => createBrevoTransactionalPayload([], { email: "orders@example.com" }, "empty"))
      .toThrow(TypeError);
  });

  it("caps sender and recipient display names at Brevo's 70-character limit", () => {
    const longName = "x".repeat(80);
    const payload = createBrevoTransactionalPayload(
      [{ ...customerMessage, toName: longName }],
      { email: "orders@example.com", name: longName },
      "welcome:v1:user-1"
    );

    expect(payload.sender.name).toHaveLength(70);
    expect(payload.to?.[0].name).toHaveLength(70);
  });
});

describe("Brevo delivery adapter", () => {
  it("posts credentials and an idempotent batch body and returns both message IDs", async () => {
    configureBrevoEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageIds: ["brevo-customer", "brevo-admin"]
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTransactionalEmails(
      [customerMessage, adminMessage],
      { operationId: "order-placed:order-1" }
    )).resolves.toEqual({ messageIds: ["brevo-customer", "brevo-admin"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "api-key": "xkeysib-test-key",
      "content-type": "application/json"
    });
    expect(init.headers).not.toHaveProperty("idempotency-key");
    const body = JSON.parse(String(init.body));
    expect(body.headers.idempotencyKey).toBe(emailOperationUuid("order-placed:order-1"));
    expect(body.messageVersions).toHaveLength(2);
  });

  it("accepts Brevo's single-message success response for welcome email", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageId: "brevo-welcome"
    }), { status: 201, headers: { "content-type": "application/json" } })));

    await expect(sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    )).resolves.toEqual({ messageIds: ["brevo-welcome"] });
  });

  it("normalizes Brevo's duplicate-idempotency response as accepted", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "duplicate_parameter",
      message: "duplicate idempotency key"
    }), { status: 400, headers: { "content-type": "application/json" } })));

    const result = await sendTransactionalEmails(
      [customerMessage, adminMessage],
      { operationId: "order-placed:order-1" }
    );

    expect(result.messageIds).toHaveLength(2);
    expect(result.messageIds.every((id) => id.startsWith("brevo-idempotent-"))).toBe(true);
  });

  it("classifies rate limits as retryable without exposing the provider message", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "rate limit/sensitive",
      message: "a sensitive provider diagnostic"
    }), { status: 429, headers: { "content-type": "application/json" } })));

    const error = await sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({ code: "rate_limit_sensitive", statusCode: 429, retryable: true });
    expect(error.message).not.toContain("sensitive provider diagnostic");
  });

  it("classifies non-idempotency client errors as permanent", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "invalid_parameter",
      message: "bad recipient"
    }), { status: 400, headers: { "content-type": "application/json" } })));

    const error = await sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({ code: "invalid_parameter", statusCode: 400, retryable: false });
  });

  it("normalizes network failures as safe retryable provider errors", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private socket detail")));

    const error = await sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({ code: "request_failed", statusCode: null, retryable: true });
    expect(error.message).not.toContain("private socket detail");
  });

  it("rejects a success response that does not account for every recipient", async () => {
    configureBrevoEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageIds: ["only-one-id"]
    }), { status: 201, headers: { "content-type": "application/json" } })));

    const error = await sendTransactionalEmails(
      [customerMessage, adminMessage],
      { operationId: "order-placed:order-1" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({ code: "invalid_provider_response", retryable: true });
  });
});
