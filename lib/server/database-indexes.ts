import "server-only";
import { getDb } from "@/lib/server/mongodb";

type IndexGroup = "products" | "orders" | "addresses" | "reviews" | "clerk-users";

const indexPromises = new Map<IndexGroup, Promise<void>>();

function ensureOnce(group: IndexGroup, create: () => Promise<unknown>) {
  const existing = indexPromises.get(group);
  if (existing) return existing;

  const pending = create()
    .then(() => undefined)
    .catch((error) => {
      indexPromises.delete(group);
      throw error;
    });
  indexPromises.set(group, pending);
  return pending;
}

export function ensureProductIndexes() {
  return ensureOnce("products", async () => {
    const db = await getDb();
    await db.collection("products").createIndexes([
      { key: { createdAt: -1, _id: -1 }, name: "products_created_desc" },
      { key: { featured: 1, createdAt: -1, _id: -1 }, name: "products_featured_created_desc" }
    ]);
  });
}

export function ensureOrderIndexes() {
  return ensureOnce("orders", async () => {
    const db = await getDb();
    await db.collection("orders").createIndexes([
      { key: { userId: 1, createdAt: -1, _id: -1 }, name: "orders_user_created_desc" },
      { key: { status: 1, createdAt: -1, _id: -1 }, name: "orders_status_created_desc" },
      {
        key: { userId: 1, status: 1, createdAt: -1, _id: -1 },
        name: "orders_user_status_created_desc"
      },
      {
        key: { "orderNotification.status": 1, createdAt: 1 },
        name: "orders_notification_status_created"
      },
      {
        key: { userId: 1, idempotencyKey: 1 },
        name: "orders_user_idempotency_unique",
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } }
      }
    ]);
  });
}

export function ensureAddressIndexes() {
  return ensureOnce("addresses", async () => {
    const db = await getDb();
    await db.collection("addresses").createIndexes([
      {
        key: { userId: 1, updatedAt: -1, createdAt: -1, _id: -1 },
        name: "addresses_user_updated_desc"
      },
      { key: { userId: 1, createdAt: -1, _id: -1 }, name: "addresses_user_created_desc" }
    ]);
  });
}

export function ensureReviewIndexes() {
  return ensureOnce("reviews", async () => {
    const db = await getDb();
    await db.collection("reviews").createIndexes([
      {
        key: { productId: 1, userId: 1 },
        name: "reviews_product_user_unique",
        unique: true
      },
      { key: { productId: 1, createdAt: -1, _id: -1 }, name: "reviews_product_created_desc" },
      { key: { userId: 1, productId: 1 }, name: "reviews_user_product" }
    ]);
  });
}

export function ensureClerkUserIndexes() {
  return ensureOnce("clerk-users", async () => {
    const db = await getDb();
    await db.collection("clerk_users").createIndexes([
      { key: { primaryEmail: 1 }, name: "clerk_users_primary_email" },
      { key: { sourceUpdatedAt: -1 }, name: "clerk_users_source_updated_desc" }
    ]);
  });
}
