import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  RequestSecurityError,
  assertSameOrigin,
  createRequestContext,
  getRequestId,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { logServerError, safeErrorResponse } from "@/lib/server/safe-errors";

const jsonSchema = z.object({ name: z.string().min(1) }).strict();

function jsonRequest(body: string, headers: HeadersInit = {}) {
  return new Request("https://shop.example/api/example", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers }
  });
}

describe("assertSameOrigin", () => {
  it("accepts an exact same-origin mutation", () => {
    const request = jsonRequest("{}", { origin: "https://shop.example" });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("accepts the Referer origin when Origin is unavailable", () => {
    const request = jsonRequest("{}", { referer: "https://shop.example/checkout" });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects missing and cross-origin mutation callers", () => {
    expect(() => assertSameOrigin(jsonRequest("{}"))).toThrow(RequestSecurityError);
    expect(() => assertSameOrigin(jsonRequest("{}", { origin: "https://attacker.example" }))).toThrow(
      expect.objectContaining({ code: "request_origin_not_allowed", status: 403 })
    );
  });

  it("bypasses origin checks for safe methods", () => {
    expect(() => assertSameOrigin(new Request("https://shop.example/api/example"))).not.toThrow();
  });

  it("supports an explicit trusted-origin allowlist", () => {
    const request = jsonRequest("{}", { origin: "https://admin.example" });
    expect(() => assertSameOrigin(request, { allowedOrigins: ["https://admin.example"] })).not.toThrow();
  });

  it("can use a canonical origin instead of trusting the request host", () => {
    const canonicalCaller = new Request("https://preview.example/api/example", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", origin: "https://shop.example" }
    });
    const reflectedHostCaller = new Request("https://preview.example/api/example", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", origin: "https://preview.example" }
    });

    expect(() => assertSameOrigin(canonicalCaller, { expectedOrigin: "https://shop.example" })).not.toThrow();
    expect(() => assertSameOrigin(reflectedHostCaller, { expectedOrigin: "https://shop.example" })).toThrow(
      RequestSecurityError
    );
  });
});

describe("parseBoundedJson", () => {
  it("parses and validates a bounded JSON payload", async () => {
    await expect(parseBoundedJson(jsonRequest('{"name":"Ada"}'), jsonSchema)).resolves.toEqual({ name: "Ada" });
  });

  it("rejects unsupported media types", async () => {
    const request = new Request("https://shop.example/api/example", {
      method: "POST",
      body: "name=Ada",
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    await expect(parseBoundedJson(request, jsonSchema)).rejects.toMatchObject({
      code: "invalid_content_type",
      status: 415
    });
  });

  it("rejects announced and streamed bodies over the limit", async () => {
    await expect(
      parseBoundedJson(jsonRequest('{"name":"Ada"}', { "content-length": "500" }), jsonSchema, { maxBytes: 32 })
    ).rejects.toMatchObject({ code: "request_body_too_large", status: 413 });

    await expect(
      parseBoundedJson(jsonRequest(`{"name":"${"a".repeat(40)}"}`), jsonSchema, { maxBytes: 32 })
    ).rejects.toMatchObject({ code: "request_body_too_large", status: 413 });
  });

  it("rejects malformed and schema-invalid JSON without returning schema details", async () => {
    await expect(parseBoundedJson(jsonRequest("{"), jsonSchema)).rejects.toMatchObject({
      code: "invalid_json",
      status: 400
    });
    await expect(parseBoundedJson(jsonRequest('{"name":"","extra":true}'), jsonSchema)).rejects.toMatchObject({
      code: "invalid_request_body",
      status: 422,
      message: "Request body is invalid."
    });
  });
});

describe("request correlation and safe errors", () => {
  it("keeps safe request IDs and replaces unsafe values", () => {
    const safe = new Request("https://shop.example/api/example", { headers: { "x-request-id": "req-1234" } });
    const unsafe = new Request("https://shop.example/api/example", { headers: { "x-request-id": "bad value" } });

    expect(getRequestId(safe)).toBe("req-1234");
    expect(getRequestId(unsafe)).toMatch(/^[0-9a-f-]{36}$/);
    expect(withRequestId(new Response(null), "req-1234").headers.get("x-request-id")).toBe("req-1234");
  });

  it("logs structured identifiers while excluding raw errors and sensitive metadata", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const context = {
      ...createRequestContext(new Request("https://shop.example/api/orders?private=true")),
      event: "order.create.failed",
      metadata: { productCount: 2, password: "never-log-this" }
    };

    logServerError(new Error("mongodb://user:secret@example.invalid"), context);
    const output = String(log.mock.calls[0]?.[0]);

    expect(output).toContain('"pathname":"/api/orders"');
    expect(output).toContain('"password":"[REDACTED]"');
    expect(output).not.toContain("never-log-this");
    expect(output).not.toContain("mongodb://");
  });

  it("returns a generic correlated 500 response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const context = {
      ...createRequestContext(new Request("https://shop.example/api/orders")),
      event: "order.create.failed"
    };
    const response = safeErrorResponse(new Error("private detail"), context);

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Unable to complete this request.",
      code: "internal_error",
      requestId: context.requestId
    });
  });
});
