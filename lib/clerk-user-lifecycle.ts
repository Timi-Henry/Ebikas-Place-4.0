import { createHash } from "node:crypto";
import { z } from "zod";

const maxJavaScriptTimestamp = 8_640_000_000_000_000;

export const clerkUserLifecycleEventNames = [
  "clerk/user.created",
  "clerk/user.updated",
  "clerk/user.deleted"
] as const;

export type ClerkUserLifecycleEventName = (typeof clerkUserLifecycleEventNames)[number];

const emailAddressSchema = z.object({
  id: z.string().min(1).max(128),
  email_address: z.string().email().max(254)
}).passthrough();

const clerkUserSchema = z.object({
  id: z.string().trim().min(1).max(128),
  object: z.literal("user"),
  first_name: z.string().max(120).nullable(),
  last_name: z.string().max(120).nullable(),
  image_url: z.string().url().max(2_048).optional(),
  primary_email_address_id: z.string().max(128).nullable(),
  email_addresses: z.array(emailAddressSchema).max(100),
  created_at: z.number().int().nonnegative().max(maxJavaScriptTimestamp),
  updated_at: z.number().int().nonnegative().max(maxJavaScriptTimestamp)
}).passthrough();

const deletedClerkUserSchema = z.object({
  id: z.string().trim().min(1).max(128),
  object: z.literal("user"),
  deleted: z.literal(true)
}).passthrough();

export type ClerkUserSnapshot = {
  userId: string;
  primaryEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
};

export type ParsedClerkUserLifecycleEvent =
  | { kind: "created" | "updated"; user: ClerkUserSnapshot }
  | { kind: "deleted"; userId: string };

function cleanName(value: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

export function parseClerkUserLifecycleEvent(
  eventName: string,
  data: unknown
): ParsedClerkUserLifecycleEvent {
  if (eventName === "clerk/user.deleted") {
    const deleted = deletedClerkUserSchema.parse(data);
    return { kind: "deleted", userId: deleted.id };
  }

  if (eventName !== "clerk/user.created" && eventName !== "clerk/user.updated") {
    throw new TypeError("Unsupported Clerk user lifecycle event.");
  }

  const user = clerkUserSchema.parse(data);
  const primaryEmail = user.email_addresses.find((email) => email.id === user.primary_email_address_id);
  return {
    kind: eventName === "clerk/user.created" ? "created" : "updated",
    user: {
      userId: user.id,
      primaryEmail: primaryEmail?.email_address.toLowerCase() || null,
      firstName: cleanName(user.first_name),
      lastName: cleanName(user.last_name),
      imageUrl: user.image_url || null,
      sourceCreatedAt: new Date(user.created_at).toISOString(),
      sourceUpdatedAt: new Date(user.updated_at).toISOString()
    }
  };
}

/** Removes the reusable Clerk identifier while retaining commerce/audit relationships. */
export function deletedUserPseudonym(userId: string) {
  const digest = createHash("sha256")
    .update("ebikas-place:deleted-clerk-user:")
    .update(userId)
    .digest("hex")
    .slice(0, 40);
  return `deleted-user:${digest}`;
}

export function isDeletedUserPseudonym(value: string) {
  return /^deleted-user:[a-f0-9]{40}$/.test(value);
}
