import "server-only";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

const booleanString = z.preprocess((value) => {
  if (value === undefined || value === "") {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean());

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: optionalString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalString,
  VERCEL_URL: optionalString,
  ENABLE_SAMPLE_CATALOG: booleanString,
  MONGODB_URI: optionalString,
  MONGODB_DB: optionalString,
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  CLOUDINARY_UPLOAD_FOLDER: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CRON_SECRET: optionalString,
  ADMIN_IDENTIFIERS: optionalString,
  INNGEST_DEV: optionalString,
  INNGEST_EVENT_KEY: optionalString,
  INNGEST_SIGNING_KEY: optionalString,
  BREVO_API_KEY: optionalString,
  BREVO_SENDER_EMAIL: optionalString,
  BREVO_SENDER_NAME: optionalString,
  ORDER_ADMIN_EMAIL: optionalString
});

type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly code = "ENVIRONMENT_CONFIGURATION_ERROR";
  readonly variables: readonly string[];

  constructor(message: string, variables: readonly string[]) {
    super(message);
    this.name = "EnvironmentConfigurationError";
    this.variables = variables;
  }
}

function getEnvironment(): Environment {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0] || "environment")))];
    throw new EnvironmentConfigurationError(
      `Environment configuration is invalid for: ${variables.join(", ")}.`,
      variables
    );
  }

  return result.data;
}

function requireEnvironmentValue<K extends keyof Environment>(
  environment: Environment,
  key: K
): NonNullable<Environment[K]> {
  const value = environment[key];

  if (value === undefined || value === "") {
    throw new EnvironmentConfigurationError(`Required environment variable ${String(key)} is not configured.`, [
      String(key)
    ]);
  }

  return value as NonNullable<Environment[K]>;
}

function normalizeHttpOrigin(variable: string, value: string, addHttps: boolean) {
  try {
    const candidate = addHttps && !/^https?:\/\//i.test(value) ? `https://${value}` : value;
    const url = new URL(candidate);

    if (!(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
      throw new Error("Unsupported protocol");
    }

    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Site URL must be an origin");
    }

    return url.origin;
  } catch {
    throw new EnvironmentConfigurationError(`${variable} must be a valid HTTP(S) origin.`, [variable]);
  }
}

/**
 * Returns the public canonical origin without deriving it from request headers.
 * Vercel's production domain is preferred over a preview domain when no custom URL is configured.
 */
export function getSiteUrl() {
  const environment = getEnvironment();

  if (environment.NEXT_PUBLIC_SITE_URL) {
    return normalizeHttpOrigin("NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL, false);
  }

  if (environment.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalizeHttpOrigin(
      "VERCEL_PROJECT_PRODUCTION_URL",
      environment.VERCEL_PROJECT_PRODUCTION_URL,
      true
    );
  }

  if (environment.VERCEL_URL) {
    return normalizeHttpOrigin("VERCEL_URL", environment.VERCEL_URL, true);
  }

  if (environment.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new EnvironmentConfigurationError(
    "A canonical site origin is required in production. Configure NEXT_PUBLIC_SITE_URL or enable Vercel system environment variables.",
    ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"]
  );
}

/** Samples are an explicit local/test presentation mode and can never be enabled in production. */
export function isDevelopmentSampleCatalogEnabled() {
  const environment = getEnvironment();
  return environment.NODE_ENV !== "production" && environment.ENABLE_SAMPLE_CATALOG;
}

export function getMongoEnvironment() {
  const environment = getEnvironment();
  return Object.freeze({
    uri: requireEnvironmentValue(environment, "MONGODB_URI"),
    dbName: environment.MONGODB_DB || "ebikas_place"
  });
}

export function getCloudinaryEnvironment() {
  const environment = getEnvironment();
  return Object.freeze({
    cloudName: requireEnvironmentValue(environment, "CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnvironmentValue(environment, "CLOUDINARY_API_KEY"),
    apiSecret: requireEnvironmentValue(environment, "CLOUDINARY_API_SECRET"),
    uploadFolder: environment.CLOUDINARY_UPLOAD_FOLDER || "ebikas-place/products"
  });
}

export function getAdminIdentifiers() {
  const environment = getEnvironment();
  return (environment.ADMIN_IDENTIFIERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getCronSecret() {
  const environment = getEnvironment();
  const secret = requireEnvironmentValue(environment, "CRON_SECRET");
  if (secret.length < 32) {
    throw new EnvironmentConfigurationError("CRON_SECRET must contain at least 32 characters.", ["CRON_SECRET"]);
  }
  return secret;
}

function validateEmailConfiguration(variable: string, value: string, allowDisplayName = false) {
  const match = allowDisplayName ? value.match(/<([^<>]+)>\s*$/) : null;
  const address = (match?.[1] || value).trim().toLowerCase();
  const parsed = z.string().email().safeParse(address);
  if (!parsed.success) {
    throw new EnvironmentConfigurationError(`${variable} must contain a valid email address.`, [variable]);
  }
  return value.trim();
}

export function getInngestEnvironment() {
  const environment = getEnvironment();
  const devValue = environment.INNGEST_DEV?.toLowerCase();
  let isDev = devValue === "1" || devValue === "true";

  if (devValue && !isDev && devValue !== "0" && devValue !== "false") {
    try {
      const candidate = /^https?:\/\//i.test(devValue) ? devValue : `http://${devValue}`;
      new URL(candidate);
      isDev = true;
    } catch {
      throw new EnvironmentConfigurationError(
        "INNGEST_DEV must be a boolean value or a valid development-server URL.",
        ["INNGEST_DEV"]
      );
    }
  }

  if (environment.NODE_ENV === "production" && isDev) {
    throw new EnvironmentConfigurationError("INNGEST_DEV must not be enabled in production.", ["INNGEST_DEV"]);
  }
  if (isDev) return Object.freeze({ isDev: true as const });

  return Object.freeze({
    isDev: false as const,
    eventKey: requireEnvironmentValue(environment, "INNGEST_EVENT_KEY"),
    signingKey: requireEnvironmentValue(environment, "INNGEST_SIGNING_KEY")
  });
}

export function getOrderNotificationEnvironment() {
  const environment = getEnvironment();
  const adminEmail = requireEnvironmentValue(environment, "ORDER_ADMIN_EMAIL");

  return Object.freeze({
    adminEmail: validateEmailConfiguration("ORDER_ADMIN_EMAIL", adminEmail).toLowerCase()
  });
}

export function getTransactionalEmailEnvironment() {
  const environment = getEnvironment();
  const senderEmail = requireEnvironmentValue(environment, "BREVO_SENDER_EMAIL");
  const senderName = environment.BREVO_SENDER_NAME?.trim();
  if (senderName && senderName.length > 70) {
    throw new EnvironmentConfigurationError("BREVO_SENDER_NAME must contain at most 70 characters.", [
      "BREVO_SENDER_NAME"
    ]);
  }

  return Object.freeze({
    apiKey: requireEnvironmentValue(environment, "BREVO_API_KEY"),
    sender: Object.freeze({
      email: validateEmailConfiguration("BREVO_SENDER_EMAIL", senderEmail).toLowerCase(),
      ...(senderName ? { name: senderName } : {})
    })
  });
}

export function getClerkEnvironment() {
  const environment = getEnvironment();
  const publishableKey = requireEnvironmentValue(environment, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = requireEnvironmentValue(environment, "CLERK_SECRET_KEY");

  if (environment.NODE_ENV === "production" && (publishableKey.startsWith("pk_test_") || secretKey.startsWith("sk_test_"))) {
    throw new EnvironmentConfigurationError(
      "Production requires Clerk live keys.",
      ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]
    );
  }

  return Object.freeze({
    publishableKey,
    secretKey
  });
}
