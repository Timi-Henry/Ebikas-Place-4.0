import "server-only";
import { ObjectId } from "mongodb";
import { enqueueOrderPlacedNotification } from "@/lib/inngest/order-events";
import { ensureOrderIndexes } from "@/lib/server/database-indexes";
import { getDb } from "@/lib/server/mongodb";
import { toOrder, type OrderDocument } from "@/lib/server/orders";

export type PersistedOrderNotificationStatus = "pending" | "enqueued" | "sent" | "suppressed";

export async function loadOrderForNotification(orderId: string) {
  if (!ObjectId.isValid(orderId)) return null;
  const db = await getDb();
  const document = await db.collection<OrderDocument>("orders").findOne({ _id: new ObjectId(orderId) });
  if (!document) return null;

  return {
    order: toOrder(document),
    // Orders created before this feature are intentionally treated as already
    // handled so deployment cannot email the historical order collection.
    status: document.orderNotification?.status || "sent"
  };
}

export async function markOrderNotificationSent(orderId: string) {
  if (!ObjectId.isValid(orderId)) return;
  const db = await getDb();
  await db.collection<OrderDocument>("orders").updateOne(
    { _id: new ObjectId(orderId), "orderNotification.status": { $ne: "sent" } },
    {
      $set: {
        "orderNotification.status": "sent",
        "orderNotification.sentAt": new Date()
      }
    }
  );
}

export async function markOrderNotificationEnqueued(orderId: string) {
  if (!ObjectId.isValid(orderId)) return;
  const db = await getDb();
  await db.collection<OrderDocument>("orders").updateOne(
    { _id: new ObjectId(orderId), "orderNotification.status": "pending" },
    {
      $set: {
        "orderNotification.status": "enqueued",
        "orderNotification.enqueuedAt": new Date()
      }
    }
  );
}

export async function markOrderNotificationSuppressed(orderId: string) {
  if (!ObjectId.isValid(orderId)) return;
  const db = await getDb();
  await db.collection<OrderDocument>("orders").updateOne(
    { _id: new ObjectId(orderId), "orderNotification.status": { $nin: ["sent", "suppressed"] } },
    {
      $set: {
        "orderNotification.status": "suppressed",
        "orderNotification.suppressedAt": new Date()
      }
    }
  );
}

export async function enqueuePendingOrderNotification(orderId: string) {
  if (!ObjectId.isValid(orderId)) return { status: "not-found" as const };
  const db = await getDb();
  const _id = new ObjectId(orderId);
  const document = await db.collection<OrderDocument>("orders").findOne(
    { _id },
    { projection: { orderNotification: 1 } }
  );
  const currentStatus = document?.orderNotification?.status;

  if (!currentStatus) return { status: "not-managed" as const };
  if (currentStatus !== "pending") {
    return { status: currentStatus };
  }

  await enqueueOrderPlacedNotification(orderId);
  await db.collection<OrderDocument>("orders").updateOne(
    { _id, "orderNotification.status": "pending" },
    {
      $set: {
        "orderNotification.status": "enqueued",
        "orderNotification.enqueuedAt": new Date()
      }
    }
  );
  return { status: "enqueued" as const };
}

export async function findOrderIdsNeedingNotificationRecovery(limit = 25) {
  await ensureOrderIndexes();
  const db = await getDb();
  const olderThan = new Date(Date.now() - 30 * 60 * 1000);
  const documents = await db.collection<OrderDocument>("orders")
    .find({
      // Only producer-side failures are recovered here. Once Inngest accepts
      // an event, its own retries/dashboard own that run and prevent a poison
      // record from consuming this recovery queue forever.
      "orderNotification.status": "pending",
      createdAt: { $lte: olderThan }
    })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
  return documents.map((document) => document._id.toString());
}

export function logOrderNotificationEnqueueFailure(error: unknown, orderId: string) {
  const errorName = error instanceof Error
    ? error.name.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 80)
    : "UnknownError";
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "order.notification.enqueue_failed",
    orderId,
    error: { name: errorName }
  }));
}
