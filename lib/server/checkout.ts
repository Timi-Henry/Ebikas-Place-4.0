import "server-only";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import {
  createCheckout,
  DuplicateCheckoutError,
  type CheckoutOrderRecord,
  type CheckoutProduct,
  type CheckoutStore,
  type CheckoutTransaction,
  type ExistingCheckoutOrder
} from "@/lib/checkout";
import { withOrderNotificationEnqueue } from "@/lib/checkout-notifications";
import { getCurrentPrice } from "@/lib/pricing";
import { revalidateCatalogProducts } from "@/lib/server/catalog-cache";
import {
  ensureAddressIndexes,
  ensureOrderIndexes,
  ensureProductIndexes
} from "@/lib/server/database-indexes";
import { getDb, getMongoClient } from "@/lib/server/mongodb";
import {
  enqueuePendingOrderNotification,
  logOrderNotificationEnqueueFailure
} from "@/lib/server/order-notification-state";
import { toOrder, type OrderDocument } from "@/lib/server/orders";
import type { DeliveryDetails, ProductSize, SavedAddress } from "@/lib/types";

type CheckoutProductDocument = {
  _id: ObjectId;
  name: string;
  imageUrl: string;
  price: number;
  salePrice?: number;
  sizes?: ProductSize[];
  stock: number;
};

type AddressDocument = Omit<SavedAddress, "id" | "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt?: Date;
};

function toSavedAddress(doc: AddressDocument): SavedAddress {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    label: doc.label,
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone,
    whatsapp: doc.whatsapp,
    addressLine: doc.addressLine,
    street: doc.street,
    area: doc.area,
    state: "Lagos",
    address: doc.address,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt?.toISOString()
  };
}

class MongoCheckoutTransaction implements CheckoutTransaction {
  constructor(
    private readonly db: Db,
    private readonly session: ClientSession
  ) {}

  async findOrderByIdempotency(userId: string, idempotencyKey: string): Promise<ExistingCheckoutOrder | null> {
    const document = await this.db.collection<OrderDocument>("orders").findOne(
      { userId, idempotencyKey },
      { session: this.session }
    );
    return document ? { order: toOrder(document), requestHash: document.requestHash || "" } : null;
  }

  async loadProducts(productIds: readonly string[]): Promise<CheckoutProduct[]> {
    const ids = productIds.map((id) => new ObjectId(id));
    const documents = await this.db
      .collection<CheckoutProductDocument>("products")
      .find({ _id: { $in: ids } }, { session: this.session })
      .toArray();

    return documents.map((document) => ({
      id: document._id.toString(),
      name: document.name,
      imageUrl: document.imageUrl,
      price: getCurrentPrice(document),
      sizes: document.sizes || [],
      stock: document.stock
    }));
  }

  async findAddress(userId: string, addressId: string): Promise<SavedAddress | null> {
    const document = await this.db.collection<AddressDocument>("addresses").findOne(
      { _id: new ObjectId(addressId), userId },
      { session: this.session }
    );
    return document ? toSavedAddress(document) : null;
  }

  async reserveStock(productId: string, quantity: number) {
    const result = await this.db.collection<CheckoutProductDocument>("products").updateOne(
      { _id: new ObjectId(productId), stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { session: this.session }
    );
    return result.modifiedCount === 1;
  }

  async insertAddress(userId: string, details: DeliveryDetails, label?: string): Promise<SavedAddress> {
    const now = new Date();
    const document = {
      userId,
      label,
      ...details,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.db.collection<Omit<AddressDocument, "_id">>("addresses").insertOne(document, {
      session: this.session
    });
    return toSavedAddress({ _id: result.insertedId, ...document });
  }

  async insertOrder(order: CheckoutOrderRecord) {
    const createdAt = new Date(order.createdAt);
    const document = {
      ...order,
      createdAt,
      statusUpdatedAt: order.statusUpdatedAt ? new Date(order.statusUpdatedAt) : undefined,
      orderNotification: {
        status: "pending" as const,
        createdAt
      }
    };
    const result = await this.db.collection<Omit<OrderDocument, "_id">>("orders").insertOne(document, {
      session: this.session
    });
    return toOrder({ _id: result.insertedId, ...document });
  }
}

class MongoCheckoutStore implements CheckoutStore {
  async transaction<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T> {
    await Promise.all([ensureOrderIndexes(), ensureProductIndexes(), ensureAddressIndexes()]);
    const client = await getMongoClient();
    const db = await getDb();
    const session = client.startSession();
    let result: T | undefined;

    try {
      await session.withTransaction(
        async () => {
          result = await work(new MongoCheckoutTransaction(db, session));
        },
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary"
        }
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new DuplicateCheckoutError();
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (result === undefined) {
      throw new Error("Checkout transaction did not return a result.");
    }
    return result;
  }

  async findOrderByIdempotency(userId: string, idempotencyKey: string): Promise<ExistingCheckoutOrder | null> {
    const db = await getDb();
    const document = await db.collection<OrderDocument>("orders").findOne({ userId, idempotencyKey });
    return document ? { order: toOrder(document), requestHash: document.requestHash || "" } : null;
  }
}

const atomicCheckout = createCheckout(new MongoCheckoutStore());

const placeCommittedOrder = async (...args: Parameters<typeof atomicCheckout.place>) => {
  const result = await atomicCheckout.place(...args);
  if (!result.replayed) {
    revalidateCatalogProducts(result.order.items.map((item) => item.productId));
  }
  return result;
};

export const checkout = {
  place: withOrderNotificationEnqueue(
    placeCommittedOrder,
    enqueuePendingOrderNotification,
    logOrderNotificationEnqueueFailure
  )
};
