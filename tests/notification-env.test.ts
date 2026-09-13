import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EnvironmentConfigurationError,
  getClerkWebhookEnvironment,
  getOrderNotificationEnvironment,
  getTransactionalEmailEnvironment
} from "@/lib/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notification environment", () => {
  it("accepts Clerk's official webhook signing-secret name", () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_test-signing-secret-value");
    expect(getClerkWebhookEnvironment()).toEqual({
      signingSecret: "whsec_test-signing-secret-value"
    });
  });

  it("rejects a missing or malformed Clerk webhook signing secret", () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "not-a-secret");
    expect(() => getClerkWebhookEnvironment()).toThrow(EnvironmentConfigurationError);
  });

  it("requires and validates the transactional email configuration", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "not-an-email");
    vi.stubEnv("RESEND_FROM_NAME", "Ebika's Place");

    expect(() => getTransactionalEmailEnvironment()).toThrow(EnvironmentConfigurationError);

    vi.stubEnv("RESEND_FROM_EMAIL", "Orders@Example.com");
    expect(getTransactionalEmailEnvironment()).toEqual({
      apiKey: "re_test-key",
      sender: {
        email: "orders@example.com",
        name: "Ebika's Place"
      }
    });
  });

  it("validates the order admin independently of the Resend sender", () => {
    vi.stubEnv("ORDER_ADMIN_EMAIL", "not-an-email");
    expect(() => getOrderNotificationEnvironment()).toThrow(EnvironmentConfigurationError);

    vi.stubEnv("ORDER_ADMIN_EMAIL", "Owner@Example.com");
    expect(getOrderNotificationEnvironment()).toEqual({ adminEmail: "owner@example.com" });
  });

  it("rejects overly long Resend sender names", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "orders@example.com");
    vi.stubEnv("RESEND_FROM_NAME", "x".repeat(101));

    expect(() => getTransactionalEmailEnvironment()).toThrow(EnvironmentConfigurationError);
  });
});
