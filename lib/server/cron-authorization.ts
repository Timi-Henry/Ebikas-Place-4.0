import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getCronSecret } from "@/lib/server/env";

/** Constant-time verification for Vercel's CRON_SECRET bearer header. */
export function hasValidCronAuthorization(request: Request) {
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${getCronSecret()}`;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
