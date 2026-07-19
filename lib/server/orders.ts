import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { normalizePageSize, type CursorPage } from "@/lib/cursor-pagination";
import {
  adminOrderActions,
  decideOrderTransition,
  type AdminOrderAction,
  type OrderTransitionAction
} from "@/lib/order-lifecycle";
import { storePickupAddress } from "@/lib/order-fulfillment";
import { revalidateCatalogProducts } from "@/lib/server/catalog-cache";
import { ensureOrderIndexes } from "@/lib/server/database-indexes";
import { createdBefore, decodeMongoCursor, toCursorPage } from "@/lib/server/mongo-pagination";
import { getDb, getMongoClient } from "@/lib/server/mongodb";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

type LegacyOrderStatus = OrderStatus | "processing" | "shipped";
type PersistedOrderItem = Omit<OrderItem, "lineTotal"> & { lineTotal?: number };
export type OrderDocument = Omit<
  Order,
  "id" | "createdAt" | "status" | "statusUpdatedAt" | "version" | "currency" | "items"
> & {
  _id: ObjectId;
  version?: number;
  currency?: "NGN";
  items: PersistedOrderItem[];
  status?: LegacyOrderStatus;
  createdAt: Date;
  statusUpdatedAt?: Date;
  idempotencyKey?: string;
  requestHash?: string;
  orderNotification?: {
    status: "pending" | "enqueued" | "sent" | "suppressed";
    createdAt: Date;
    enqueuedAt?: Date;
    sentAt?: Date;
    suppressedAt?: Date;
  };
};

export type { AdminOrderAction } from "@/lib/order-lifecycle";

export type OrderPageOptions = {
  cursor?: string;
  limit?: number;
  status?: OrderStatus;
};

function normalizeOrderStatus(status: LegacyOrderStatus | undefined): OrderStatus {
  if (status === "processing") return "confirmed";
  if (status === "shipped") return "out-for-delivery";
  if (status === "confirmed" || status === "rejected" || status === "out-for-delivery" || status === "delivered" || status === "cancelled") {
    return status;
  }
  return "placed";
}

export function toOrder(doc: OrderDocument): Order {
  const deliveryDetails = doc.deliveryDetails;
  const customerContact =
    doc.customerContact ||
    (deliveryDetails
      ? {
          fullName: deliveryDetails.fullName,
          email: deliveryDetails.email,
          phone: deliveryDetails.phone,
          whatsapp: deliveryDetails.whatsapp
        }
      : {
          fullName: doc.customerName || "Customer",
          email: doc.customerEmail || "",
          phone: "",
          whatsapp: ""
        });
  const fulfillmentMethod = doc.fulfillmentMethod || "store-delivery";

  return {
    id: doc._id.toString(),
    version: doc.version ?? 1,
    userId: doc.userId,
    customerEmail: doc.customerEmail,
    customerName: doc.customerName,
    customerContact,
    fulfillmentMethod,
    deliveryDetails,
    pickupAddress: doc.pickupAddress || (fulfillmentMethod === "customer-rider" ? storePickupAddress : undefined),
    items: doc.items.map((item) => ({ ...item, lineTotal: item.lineTotal ?? item.price * item.quantity })),
    subtotal: doc.subtotal,
    currency: doc.currency || "NGN",
    status: normalizeOrderStatus(doc.status),
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt.toISOString(),
    statusUpdatedAt: doc.statusUpdatedAt?.toISOString()
  };
}

export type OrderTransitionCode = "INVALID_ACTION" | "ORDER_NOT_FOUND" | "VERSION_CONFLICT" | "TRANSITION_NOT_ALLOWED";

export class OrderTransitionError extends Error {
  constructor(
    public readonly code: OrderTransitionCode,
    message: string,
    public readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

type OrderTransitionActor = { kind: "customer"; userId: string } | { kind: "admin" };

function nextOrderStatus(order: OrderDocument, actor: OrderTransitionActor, action: OrderTransitionAction): OrderStatus {
  const decision = decideOrderTransition({
    actor: actor.kind,
    action,
    currentStatus: normalizeOrderStatus(order.status),
    fulfillmentMethod: order.fulfillmentMethod
  });
  if (!decision.ok) {
    throw new OrderTransitionError("TRANSITION_NOT_ALLOWED", decision.message, 409);
  }
  return decision.nextStatus;
}

function aggregateOrderInventory(items: readonly PersistedOrderItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!ObjectId.isValid(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  return quantities;
}

export async function transitionOrderLifecycle(input: {
  orderId: string;
  actor: OrderTransitionActor;
  action: OrderTransitionAction;
  expectedVersion: number;
  rejectionReason?: string;
}) {
  if (!ObjectId.isValid(input.orderId)) {
    throw new OrderTransitionError("ORDER_NOT_FOUND", "Order not found.", 404);
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new OrderTransitionError("INVALID_ACTION", "A valid order version is required.", 400);
  }
  if (input.actor.kind === "customer" && input.action !== "cancel") {
    throw new OrderTransitionError("INVALID_ACTION", "Unsupported order action.", 400);
  }
  if (input.actor.kind === "admin" && !adminOrderActions.includes(input.action as AdminOrderAction)) {
    throw new OrderTransitionError("INVALID_ACTION", "Unsupported order action.", 400);
  }

  const rejectionReason = input.rejectionReason?.trim();
  if (input.action === "reject" && !rejectionReason) {
    throw new OrderTransitionError("INVALID_ACTION", "Enter a rejection reason.", 400);
  }

  const [client, db] = await Promise.all([getMongoClient(), getDb(), ensureOrderIndexes()]);
  const session = client.startSession();
  const _id = new ObjectId(input.orderId);
  let result: Order | undefined;
  let restoredProductIds: string[] = [];

  try {
    await session.withTransaction(
      async () => {
        const ownerFilter = input.actor.kind === "customer" ? { userId: input.actor.userId } : {};
        const order = await db.collection<OrderDocument>("orders").findOne({ _id, ...ownerFilter }, { session });
        if (!order) {
          throw new OrderTransitionError("ORDER_NOT_FOUND", "Order not found.", 404);
        }

        const currentVersion = order.version ?? 1;
        if (currentVersion !== input.expectedVersion) {
          throw new OrderTransitionError(
            "VERSION_CONFLICT",
            "This order changed in another session. Refresh and try again.",
            409
          );
        }

        const nextStatus = nextOrderStatus(order, input.actor, input.action);
        const statusFilter = order.status === undefined ? { status: { $exists: false } } : { status: order.status };
        const versionFilter = order.version === undefined ? { version: { $exists: false } } : { version: order.version };
        const update =
          nextStatus === "rejected"
            ? {
                $set: {
                  status: nextStatus,
                  rejectionReason,
                  statusUpdatedAt: new Date(),
                  version: currentVersion + 1
                }
              }
            : {
                $set: {
                  status: nextStatus,
                  statusUpdatedAt: new Date(),
                  version: currentVersion + 1
                },
                $unset: { rejectionReason: "" as const }
              };

        const updated = await db.collection<OrderDocument>("orders").findOneAndUpdate(
          { _id, ...ownerFilter, ...statusFilter, ...versionFilter },
          update,
          { returnDocument: "after", session }
        );
        if (!updated) {
          throw new OrderTransitionError(
            "VERSION_CONFLICT",
            "This order changed in another session. Refresh and try again.",
            409
          );
        }

        if (nextStatus === "cancelled" || nextStatus === "rejected") {
          const inventory = aggregateOrderInventory(order.items);
          for (const [productId, quantity] of inventory) {
            await db.collection("products").updateOne(
              { _id: new ObjectId(productId) },
              { $inc: { stock: quantity } },
              { session }
            );
          }
          restoredProductIds = [...inventory.keys()];
        }

        result = toOrder(updated);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary"
      }
    );
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new OrderTransitionError("VERSION_CONFLICT", "Order could not be updated. Refresh and try again.", 409);
  }
  if (restoredProductIds.length) revalidateCatalogProducts(restoredProductIds);
  return result;
}

export function cancelUserOrder(orderId: string, userId: string, expectedVersion: number) {
  return transitionOrderLifecycle({
    orderId,
    actor: { kind: "customer", userId },
    action: "cancel",
    expectedVersion
  });
}

export function updateOrderStatusByAdmin(
  orderId: string,
  action: AdminOrderAction,
  expectedVersion: number,
  rejectionReason?: string
) {
  return transitionOrderLifecycle({
    orderId,
    actor: { kind: "admin" },
    action,
    expectedVersion,
    rejectionReason
  });
}

export async function getUserOrders(userId: string) {
  await ensureOrderIndexes();
  const db = await getDb();
  const docs = await db.collection<OrderDocument>("orders").find({ userId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toOrder);
}

export async function getAllOrders() {
  await ensureOrderIndexes();
  const db = await getDb();
  const docs = await db.collection<OrderDocument>("orders").find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map(toOrder);
}

function persistedStatuses(status: OrderStatus): LegacyOrderStatus[] {
  if (status === "confirmed") return ["confirmed", "processing"];
  if (status === "out-for-delivery") return ["out-for-delivery", "shipped"];
  return [status];
}

async function getOrdersPage(
  baseFilter: Filter<OrderDocument>,
  options: OrderPageOptions
): Promise<CursorPage<Order>> {
  const limit = normalizePageSize(options.limit, 25, 100);
  const cursor = decodeMongoCursor(options.cursor);
  const statusFilter: Filter<OrderDocument> =
    options.status === "placed"
      ? { $or: [{ status: "placed" }, { status: { $exists: false } }] }
      : options.status
        ? { status: { $in: persistedStatuses(options.status) } }
        : {};
  await ensureOrderIndexes();
  const db = await getDb();
  const docs = await db
    .collection<OrderDocument>("orders")
    .find({ $and: [baseFilter, statusFilter, createdBefore(cursor)] })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  return toCursorPage(docs, limit, toOrder);
}

export function getUserOrdersPage(userId: string, options: OrderPageOptions = {}) {
  return getOrdersPage({ userId }, options);
}

export function getAllOrdersPage(options: OrderPageOptions = {}) {
  return getOrdersPage({}, options);
}
