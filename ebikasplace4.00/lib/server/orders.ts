import "server-only";
import { ObjectId } from "mongodb";
import { canCustomerCancelOrder } from "@/lib/order-status";
import { storePickupAddress } from "@/lib/order-fulfillment";
import { getDb } from "@/lib/server/mongodb";
import type { CustomerContact, DeliveryDetails, FulfillmentMethod, Order, OrderItem, OrderStatus } from "@/lib/types";

type LegacyOrderStatus = OrderStatus | "processing" | "shipped";
type OrderDocument = Omit<Order, "id" | "createdAt" | "status" | "statusUpdatedAt"> & {
  _id: ObjectId;
  status?: LegacyOrderStatus;
  createdAt: Date;
  statusUpdatedAt?: Date;
};
type NewOrderDocument = Omit<OrderDocument, "_id"> & { status: OrderStatus };

const adminOrderActions = {
  confirm: "confirmed",
  reject: "rejected",
  "out-for-delivery": "out-for-delivery",
  delivered: "delivered"
} as const;

export type AdminOrderAction = keyof typeof adminOrderActions;

function normalizeOrderStatus(status: LegacyOrderStatus | undefined): OrderStatus {
  if (status === "processing") return "confirmed";
  if (status === "shipped") return "out-for-delivery";
  if (status === "confirmed" || status === "rejected" || status === "out-for-delivery" || status === "delivered" || status === "cancelled") {
    return status;
  }
  return "placed";
}

function toOrder(doc: OrderDocument): Order {
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
    userId: doc.userId,
    customerEmail: doc.customerEmail,
    customerName: doc.customerName,
    customerContact,
    fulfillmentMethod,
    deliveryDetails,
    pickupAddress: doc.pickupAddress || (fulfillmentMethod === "customer-rider" ? storePickupAddress : undefined),
    items: doc.items,
    subtotal: doc.subtotal,
    status: normalizeOrderStatus(doc.status),
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt.toISOString(),
    statusUpdatedAt: doc.statusUpdatedAt?.toISOString()
  };
}

export async function createOrder(input: {
  userId: string;
  customerEmail?: string;
  customerName?: string;
  customerContact: CustomerContact;
  fulfillmentMethod: FulfillmentMethod;
  deliveryDetails?: DeliveryDetails;
  pickupAddress?: string;
  items: OrderItem[];
}) {
  const db = await getDb();
  const createdAt = new Date();
  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const result = await db.collection<NewOrderDocument>("orders").insertOne({
    userId: input.userId,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    customerContact: input.customerContact,
    fulfillmentMethod: input.fulfillmentMethod,
    deliveryDetails: input.deliveryDetails,
    pickupAddress: input.pickupAddress,
    items: input.items,
    subtotal,
    status: "placed",
    rejectionReason: undefined,
    createdAt,
    statusUpdatedAt: createdAt
  });

  return {
    id: result.insertedId.toString(),
    userId: input.userId,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    customerContact: input.customerContact,
    fulfillmentMethod: input.fulfillmentMethod,
    deliveryDetails: input.deliveryDetails,
    pickupAddress: input.pickupAddress,
    items: input.items,
    subtotal,
    status: "placed" as const,
    createdAt: createdAt.toISOString(),
    statusUpdatedAt: createdAt.toISOString()
  };
}

export async function cancelUserOrder(orderId: string, userId: string) {
  if (!ObjectId.isValid(orderId)) {
    throw new Error("Order not found.");
  }

  const db = await getDb();
  const _id = new ObjectId(orderId);
  const order = await db.collection<OrderDocument>("orders").findOne({ _id, userId });
  if (!order) {
    throw new Error("Order not found.");
  }

  const status = normalizeOrderStatus(order.status);
  if (!canCustomerCancelOrder(status)) {
    throw new Error("This order can no longer be cancelled.");
  }

  const updated = await db.collection<OrderDocument>("orders").findOneAndUpdate(
    { _id, userId },
    {
      $set: {
        status: "cancelled" as const,
        statusUpdatedAt: new Date()
      },
      $unset: { rejectionReason: "" as const }
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    throw new Error("Order could not be cancelled.");
  }

  return toOrder(updated);
}

export async function updateOrderStatusByAdmin(orderId: string, action: AdminOrderAction, rejectionReason?: string) {
  if (!ObjectId.isValid(orderId)) {
    throw new Error("Order not found.");
  }

  const nextStatus = adminOrderActions[action];
  if (!nextStatus) {
    throw new Error("Unsupported order action.");
  }

  const reason = rejectionReason?.trim();
  if (nextStatus === "rejected" && !reason) {
    throw new Error("Enter a rejection reason.");
  }

  const db = await getDb();
  const _id = new ObjectId(orderId);
  const update =
    nextStatus === "rejected"
      ? {
          $set: {
            status: nextStatus,
            rejectionReason: reason,
            statusUpdatedAt: new Date()
          }
        }
      : {
          $set: {
            status: nextStatus,
            statusUpdatedAt: new Date()
          },
          $unset: { rejectionReason: "" as const }
        };

  const updated = await db.collection<OrderDocument>("orders").findOneAndUpdate({ _id }, update, { returnDocument: "after" });
  if (!updated) {
    throw new Error("Order not found.");
  }

  return toOrder(updated);
}

export async function getUserOrders(userId: string) {
  const db = await getDb();
  const docs = await db.collection<OrderDocument>("orders").find({ userId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toOrder);
}

export async function getAllOrders() {
  const db = await getDb();
  const docs = await db.collection<OrderDocument>("orders").find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map(toOrder);
}
