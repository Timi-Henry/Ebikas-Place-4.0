import { describe, expect, it } from "vitest";
import {
  clerkUserLifecycleEventNames,
  deletedUserPseudonym,
  isDeletedUserPseudonym,
  parseClerkUserLifecycleEvent
} from "@/lib/clerk-user-lifecycle";

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
    { id: "idn_secondary", email_address: "second@example.com", verification: {} },
    { id: "idn_primary", email_address: "ADA@EXAMPLE.COM", verification: {} }
  ],
  created_at: createdAt,
  updated_at: updatedAt,
  username: null
};

describe("Clerk user lifecycle parsing", () => {
  it("keeps the lifecycle handler limited to the three required Clerk events", () => {
    expect(clerkUserLifecycleEventNames).toEqual([
      "user.created",
      "user.updated",
      "user.deleted"
    ]);
  });

  it("parses the direct user.created webhook data and selects the primary email", () => {
    expect(parseClerkUserLifecycleEvent("user.created", clerkUser)).toEqual({
      kind: "created",
      user: {
        userId: "user_2abc",
        primaryEmail: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        imageUrl: "https://img.clerk.com/user.png",
        sourceCreatedAt: new Date(createdAt).toISOString(),
        sourceUpdatedAt: new Date(updatedAt).toISOString()
      }
    });
  });

  it("accepts an update with no matching primary email and normalizes blank names", () => {
    const parsed = parseClerkUserLifecycleEvent("user.updated", {
      ...clerkUser,
      first_name: "  ",
      last_name: null,
      image_url: undefined,
      primary_email_address_id: "missing"
    });

    expect(parsed).toMatchObject({
      kind: "updated",
      user: {
        primaryEmail: null,
        firstName: null,
        lastName: null,
        imageUrl: null
      }
    });
  });

  it("parses Clerk's minimal deleted-user shape", () => {
    expect(parseClerkUserLifecycleEvent("user.deleted", {
      id: "user_2abc",
      object: "user",
      deleted: true,
      external_id: null
    })).toEqual({ kind: "deleted", userId: "user_2abc" });
  });

  it("rejects a non-deletion payload on the deleted event", () => {
    expect(() => parseClerkUserLifecycleEvent("user.deleted", {
      id: "user_2abc",
      object: "user",
      deleted: false
    })).toThrow();
  });

  it("rejects timestamps outside JavaScript's supported date range", () => {
    expect(() => parseClerkUserLifecycleEvent("user.created", {
      ...clerkUser,
      updated_at: Number.MAX_SAFE_INTEGER
    })).toThrow();
  });

  it("rejects a wrapped payload because Clerk forwards data directly", () => {
    expect(() => parseClerkUserLifecycleEvent("user.created", { user: clerkUser }))
      .toThrow();
  });

  it("rejects unknown lifecycle event names", () => {
    expect(() => parseClerkUserLifecycleEvent("clerk/session.created", clerkUser))
      .toThrow("Unsupported Clerk user lifecycle event.");
  });
});

describe("deleted Clerk user pseudonyms", () => {
  it("is stable, does not expose the raw ID, and differs between Clerk IDs", () => {
    const first = deletedUserPseudonym("user_2abc");
    const again = deletedUserPseudonym("user_2abc");
    const other = deletedUserPseudonym("user_2xyz");

    expect(first).toBe(again);
    expect(first).not.toBe(other);
    expect(first).not.toContain("user_2abc");
    expect(isDeletedUserPseudonym(first)).toBe(true);
  });

  it("does not misclassify raw or malformed user IDs", () => {
    expect(isDeletedUserPseudonym("user_2abc")).toBe(false);
    expect(isDeletedUserPseudonym("deleted-user:not-a-hash")).toBe(false);
    expect(isDeletedUserPseudonym(`deleted-user:${"A".repeat(40)}`)).toBe(false);
  });
});
