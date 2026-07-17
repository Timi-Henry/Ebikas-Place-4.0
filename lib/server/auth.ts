import "server-only";
import { currentUser } from "@clerk/nextjs/server";

export async function requireAdmin() {
  const user = await currentUser();
  if (!user) {
    return { ok: false as const, status: 401, message: "Sign in required." };
  }

  const identifiers = (process.env.ADMIN_IDENTIFIERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress.toLowerCase();
  const role = typeof user.publicMetadata.role === "string" ? user.publicMetadata.role.toLowerCase() : "";
  const allowed = role === "admin" || identifiers.includes(user.id.toLowerCase()) || (email ? identifiers.includes(email) : false);

  if (!allowed) {
    return { ok: false as const, status: 403, message: "Admin access required." };
  }

  return { ok: true as const, user };
}
