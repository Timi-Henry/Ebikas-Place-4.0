import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EnvironmentConfigurationError,
  getInngestEnvironment,
  getOrderNotificationEnvironment,
  getTransactionalEmailEnvironment
} from "@/lib/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notification environment", () => {
  it("recognizes a custom Inngest development URL without cloud keys", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("INNGEST_DEV", "http://127.0.0.1:8288");
    vi.stubEnv("INNGEST_EVENT_KEY", "");
    vi.stubEnv("INNGEST_SIGNING_KEY", "");

    expect(getInngestEnvironment()).toEqual({ isDev: true });
  });

  it.each(["1", "true", "http://127.0.0.1:8288"])(
    "rejects Inngest development mode %s in production",
    (devValue) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("INNGEST_DEV", devValue);

      expect(() => getInngestEnvironment()).toThrow(EnvironmentConfigurationError);
    }
  );

  it("requires and validates the transactional email configuration", () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "not-an-email");
    vi.stubEnv("BREVO_SENDER_NAME", "Ebika's Place");

    expect(() => getTransactionalEmailEnvironment()).toThrow(EnvironmentConfigurationError);

    vi.stubEnv("BREVO_SENDER_EMAIL", "Orders@Example.com");
    expect(getTransactionalEmailEnvironment()).toEqual({
      apiKey: "xkeysib-test-key",
      sender: {
        email: "orders@example.com",
        name: "Ebika's Place"
      }
    });
  });

  it("validates the order admin independently of the Brevo sender", () => {
    vi.stubEnv("ORDER_ADMIN_EMAIL", "not-an-email");
    expect(() => getOrderNotificationEnvironment()).toThrow(EnvironmentConfigurationError);

    vi.stubEnv("ORDER_ADMIN_EMAIL", "Owner@Example.com");
    expect(getOrderNotificationEnvironment()).toEqual({ adminEmail: "owner@example.com" });
  });

  it("rejects Brevo sender names longer than the provider limit", () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "orders@example.com");
    vi.stubEnv("BREVO_SENDER_NAME", "x".repeat(71));

    expect(() => getTransactionalEmailEnvironment()).toThrow(EnvironmentConfigurationError);
  });
});
