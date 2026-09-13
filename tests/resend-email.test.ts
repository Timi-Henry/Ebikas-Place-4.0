import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TransactionalEmailProviderError } from "@/lib/email-delivery";
import {
  createResendBatchPayload,
  resendIdempotencyKey
} from "@/lib/resend-email";
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

function configureResendEnvironment() {
  vi.stubEnv("RESEND_API_KEY", "re_test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "orders@example.com");
  vi.stubEnv("RESEND_FROM_NAME", "Ebika's Place");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Resend transactional payload", () => {
  it("derives an opaque stable idempotency key from the logical operation", () => {
    const first = resendIdempotencyKey("order-placed:order-1");
    const again = resendIdempotencyKey("order-placed:order-1");
    const other = resendIdempotencyKey("order-placed:order-2");

    expect(first).toBe(again);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^ebikas-place\/[0-9a-f]{64}$/);
    expect(first).not.toContain("order-1");
  });

  it("builds provider-native entries for a customer and admin batch", () => {
    const payload = createResendBatchPayload(
      [customerMessage, adminMessage],
      { email: "orders@example.com", name: "Ebika's Place" }
    );

    expect(payload).toEqual([
      {
        from: "Ebika's Place <orders@example.com>",
        to: ["Ada Lovelace <ada@example.com>"],
        reply_to: "owner@example.com",
        subject: "Your order",
        html: "<p>Customer copy</p>",
        text: "Customer copy",
        tags: [
          { name: "order", value: "true" },
          { name: "customer", value: "true" }
        ]
      },
      {
        from: "Ebika's Place <orders@example.com>",
        to: ["owner@example.com"],
        reply_to: "ada@example.com",
        subject: "New order",
        html: "<p>Admin copy</p>",
        text: "Admin copy",
        tags: [
          { name: "order", value: "true" },
          { name: "admin", value: "true" }
        ]
      }
    ]);
  });

  it("rejects empty and oversized batches", () => {
    expect(() => createResendBatchPayload([], { email: "orders@example.com" })).toThrow(TypeError);
    expect(() => createResendBatchPayload(
      Array.from({ length: 101 }, () => customerMessage),
      { email: "orders@example.com" }
    )).toThrow(TypeError);
  });

  it("sanitizes and caps display names", () => {
    const payload = createResendBatchPayload(
      [{ ...customerMessage, toName: `<${"x".repeat(110)}>\r\nInjected` }],
      { email: "orders@example.com", name: `<${"x".repeat(110)}>` }
    );

    expect(payload[0].from.match(/^(.+) <orders/)?.[1]).toHaveLength(100);
    expect(payload[0].to[0]).not.toContain("\r");
    expect(payload[0].to[0]).not.toContain("\n");
  });
});

describe("Resend delivery adapter", () => {
  it("posts one idempotent batch and returns every message ID", async () => {
    configureResendEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "resend-customer" }, { id: "resend-admin" }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTransactionalEmails(
      [customerMessage, adminMessage],
      { operationId: "order-placed:order-1" }
    )).resolves.toEqual({ messageIds: ["resend-customer", "resend-admin"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test-key",
      "content-type": "application/json",
      "idempotency-key": resendIdempotencyKey("order-placed:order-1")
    });
    expect(JSON.parse(String(init.body))).toHaveLength(2);
  });

  it("accepts the batch response for a welcome email", async () => {
    configureResendEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "resend-welcome" }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    )).resolves.toEqual({ messageIds: ["resend-welcome"] });
  });

  it("retries a concurrent idempotent request without exposing provider details", async () => {
    configureResendEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "concurrent_idempotent_requests",
      message: "a sensitive provider diagnostic"
    }), { status: 409, headers: { "content-type": "application/json" } })));

    const error = await sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransactionalEmailProviderError);
    expect(error).toMatchObject({
      code: "concurrent_idempotent_requests",
      statusCode: 409,
      retryable: true
    });
    expect(error.message).not.toContain("sensitive provider diagnostic");
  });

  it("treats a modified idempotent replay as permanent", async () => {
    configureResendEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "invalid_idempotent_request",
      message: "payload differs"
    }), { status: 409, headers: { "content-type": "application/json" } })));

    const error = await sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    ).catch((caught) => caught);

    expect(error).toMatchObject({
      code: "invalid_idempotent_request",
      statusCode: 409,
      retryable: false
    });
  });

  it("classifies rate limits and network failures as retryable", async () => {
    configureResendEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "rate_limit_exceeded"
    }), { status: 429, headers: { "content-type": "application/json" } })));

    await expect(sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-1" }
    )).rejects.toMatchObject({ code: "rate_limit_exceeded", retryable: true });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private socket detail")));
    await expect(sendTransactionalEmails(
      [customerMessage],
      { operationId: "welcome:v1:user-2" }
    )).rejects.toMatchObject({ code: "request_failed", statusCode: null, retryable: true });
  });

  it("rejects a success response that does not account for every recipient", async () => {
    configureResendEnvironment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "only-one-id" }]
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(sendTransactionalEmails(
      [customerMessage, adminMessage],
      { operationId: "order-placed:order-1" }
    )).rejects.toMatchObject({ code: "invalid_provider_response", retryable: true });
  });
});
