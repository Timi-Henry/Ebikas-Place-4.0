import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/server/mongodb";
import { RequestSecurityError } from "@/lib/server/request-security";

type RateLimitDocument = {
  _id: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
};

export type MutationRateLimit = {
  /** Stable, non-user-controlled operation name such as `checkout.create`. */
  scope: string;
  limit: number;
  windowMs: number;
  request: Request;
  /** Prefer an authenticated, server-verified user ID whenever one is available. */
  userId?: string;
};

let ttlIndexPromise: Promise<string> | undefined;

function ensureTtlIndex(collection: Collection<RateLimitDocument>) {
  ttlIndexPromise ??= collection
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch((error) => {
      ttlIndexPromise = undefined;
      throw error;
    });
  return ttlIndexPromise;
}

function firstValidForwardedIp(value: string | null) {
  if (!value || value.length > 1024) return undefined;
  for (const candidate of value.split(",").slice(0, 5)) {
    const ip = candidate.trim();
    if (ip.length <= 64 && isIP(ip)) return ip;
  }
  return undefined;
}

function clientIp(request: Request) {
  return (
    firstValidForwardedIp(request.headers.get("x-vercel-forwarded-for")) ||
    firstValidForwardedIp(request.headers.get("x-forwarded-for")) ||
    firstValidForwardedIp(request.headers.get("x-real-ip")) ||
    "unavailable"
  );
}

function principalHash(request: Request, userId: string | undefined) {
  const principal = userId ? `user:${userId}` : `ip:${clientIp(request)}`;
  return createHash("sha256").update(principal).digest("hex");
}

function validateConfiguration({ scope, limit, windowMs }: MutationRateLimit) {
  if (!/^[a-z][a-z0-9.-]{1,63}$/.test(scope)) {
    throw new TypeError("Rate-limit scope must be a stable operation identifier.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new TypeError("Rate-limit count is invalid.");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000 || windowMs > 24 * 60 * 60 * 1000) {
    throw new TypeError("Rate-limit window is invalid.");
  }
}

/**
 * Applies a Mongo-backed atomic fixed window. Only a one-way principal hash is persisted;
 * raw IP addresses and Clerk identifiers are never written to the limiter collection.
 */
export async function enforceMutationRateLimit(input: MutationRateLimit) {
  validateConfiguration(input);

  const now = Date.now();
  const windowStart = Math.floor(now / input.windowMs) * input.windowMs;
  const windowEnd = windowStart + input.windowMs;
  const principal = principalHash(input.request, input.userId);
  const key = `${input.scope}:${principal}:${windowStart}`;

  const db = await getDb();
  const collection = db.collection<RateLimitDocument>("mutation_rate_limits");
  await ensureTtlIndex(collection);
  const result = await collection.findOneAndUpdate(
    { _id: key },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        windowStartedAt: new Date(windowStart),
        expiresAt: new Date(windowEnd)
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  if (!result || result.count > input.limit) {
    throw new RequestSecurityError(
      "rate_limit_exceeded",
      429,
      "Too many requests. Please try again shortly."
    );
  }
}
