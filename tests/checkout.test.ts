import { describe, expect, it } from "vitest";
import {
  CheckoutError,
  DuplicateCheckoutError,
  createCheckout,
  type CheckoutOrderRecord,
  type CheckoutProduct,
  type CheckoutStore,
  type CheckoutTransaction,
  type ExistingCheckoutOrder
} from "@/lib/checkout";
import type { DeliveryDetails, Order, SavedAddress } from "@/lib/types";

const PRODUCT_ID = "64b000000000000000000001";
const SECOND_PRODUCT_ID = "64b000000000000000000002";

const deliveryDetails: DeliveryDetails = {
  fullName: "Ada Customer",
  email: "ada@example.com",
  phone: "+234 801 234 5678",
  whatsapp: "+234 801 234 5678",
  addressLine: "Flat 2",
  street: "Palm Street",
  area: "Lekki",
  state: "Lagos",
  address: "Flat 2, Palm Street, Lekki, Lagos"
};

function payload(
  items: Array<{ productId: string; quantity: number; selectedSize?: "S" | "M" | "L" | "XL" | "XXL" }> = [
    { productId: PRODUCT_ID, quantity: 2, selectedSize: "M" }
  ]
) {
  return {
    items,
    fulfillment: {
      method: "store-delivery" as const,
      destination: { source: "new" as const, details: deliveryDetails, saveAddress: false }
    }
  };
}

type MemoryState = {
  products: Map<string, CheckoutProduct>;
  addresses: Map<string, SavedAddress>;
  orders: Map<string, { order: Order; requestHash: string; idempotencyKey: string }>;
};

function copyState(state: MemoryState): MemoryState {
  return {
    products: new Map([...state.products].map(([key, value]) => [key, structuredClone(value)])),
    addresses: new Map([...state.addresses].map(([key, value]) => [key, structuredClone(value)])),
    orders: new Map([...state.orders].map(([key, value]) => [key, structuredClone(value)]))
  };
}

class MemoryCheckoutStore implements CheckoutStore {
  private state: MemoryState;
  private queue = Promise.resolve();
  private orderSequence = 10;
  private addressSequence = 10;

  constructor(products: CheckoutProduct[], private readonly failOrderInsert = false) {
    this.state = {
      products: new Map(products.map((product) => [product.id, structuredClone(product)])),
      addresses: new Map(),
      orders: new Map()
    };
  }

  getStock(productId: string) {
    return this.state.products.get(productId)?.stock;
  }

  get orderCount() {
    return this.state.orders.size;
  }

  async transaction<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T> {
    let release: (value?: void) => void = () => undefined;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const draft = copyState(this.state);
    const transaction: CheckoutTransaction = {
      findOrderByIdempotency: async (userId, idempotencyKey) => {
        const stored = draft.orders.get(`${userId}:${idempotencyKey}`);
        return stored ? { order: structuredClone(stored.order), requestHash: stored.requestHash } : null;
      },
      loadProducts: async (productIds) =>
        productIds.flatMap((id) => {
          const product = draft.products.get(id);
          return product ? [structuredClone(product)] : [];
        }),
      findAddress: async (userId, addressId) => {
        const address = draft.addresses.get(addressId);
        return address?.userId === userId ? structuredClone(address) : null;
      },
      reserveStock: async (productId, quantity) => {
        const product = draft.products.get(productId);
        if (!product || product.stock < quantity) return false;
        product.stock -= quantity;
        return true;
      },
      insertAddress: async (userId, details, label) => {
        const id = String(++this.addressSequence).padStart(24, "0");
        const address: SavedAddress = {
          id,
          userId,
          label,
          ...details,
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z"
        };
        draft.addresses.set(id, address);
        return structuredClone(address);
      },
      insertOrder: async (record: CheckoutOrderRecord) => {
        if (this.failOrderInsert) throw new Error("simulated insert failure");
        const key = `${record.userId}:${record.idempotencyKey}`;
        if (draft.orders.has(key)) throw new DuplicateCheckoutError();
        const order: Order = {
          id: String(++this.orderSequence).padStart(24, "0"),
          version: record.version,
          userId: record.userId,
          customerEmail: record.customerEmail,
          customerName: record.customerName,
          customerContact: record.customerContact,
          fulfillmentMethod: record.fulfillmentMethod,
          deliveryDetails: record.deliveryDetails,
          pickupAddress: record.pickupAddress,
          items: structuredClone(record.items),
          subtotal: record.subtotal,
          currency: record.currency,
          status: record.status,
          rejectionReason: record.rejectionReason,
          createdAt: record.createdAt,
          statusUpdatedAt: record.statusUpdatedAt
        };
        draft.orders.set(key, {
          order,
          requestHash: record.requestHash,
          idempotencyKey: record.idempotencyKey
        });
        return structuredClone(order);
      }
    };

    try {
      const result = await work(transaction);
      this.state = draft;
      return result;
    } finally {
      release();
    }
  }

  async findOrderByIdempotency(userId: string, idempotencyKey: string): Promise<ExistingCheckoutOrder | null> {
    const stored = this.state.orders.get(`${userId}:${idempotencyKey}`);
    return stored ? { order: structuredClone(stored.order), requestHash: stored.requestHash } : null;
  }
}

function product(overrides: Partial<CheckoutProduct> = {}): CheckoutProduct {
  return {
    id: PRODUCT_ID,
    name: "Authoritative dress",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/dress.jpg",
    price: 12_500,
    sizes: ["S", "M", "L"],
    stock: 5,
    ...overrides
  };
}

describe("Checkout.place", () => {
  it("snapshots authoritative catalog data and calculates the total", async () => {
    const store = new MemoryCheckoutStore([product()]);
    const checkout = createCheckout(store, () => new Date("2026-07-17T00:00:00.000Z"));

    const result = await checkout.place({ userId: "user-1", idempotencyKey: "checkout-key-0001", payload: payload() });

    expect(result.replayed).toBe(false);
    expect(result.order.items[0]).toMatchObject({
      name: "Authoritative dress",
      price: 12_500,
      lineTotal: 25_000,
      quantity: 2,
      selectedSize: "M"
    });
    expect(result.order.subtotal).toBe(25_000);
    expect(store.getStock(PRODUCT_ID)).toBe(3);
  });

  it("strictly rejects client-supplied price or product snapshots", async () => {
    const store = new MemoryCheckoutStore([product()]);
    const checkout = createCheckout(store);
    const tampered = payload() as ReturnType<typeof payload> & { items: Array<Record<string, unknown>> };
    tampered.items[0].price = 1;

    await expect(
      checkout.place({ userId: "user-1", idempotencyKey: "checkout-key-0002", payload: tampered })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.getStock(PRODUCT_ID)).toBe(5);
  });

  it("rejects the entire cart for an invalid size without changing stock", async () => {
    const store = new MemoryCheckoutStore([product()]);
    const checkout = createCheckout(store);

    await expect(
      checkout.place({
        userId: "user-1",
        idempotencyKey: "checkout-key-0003",
        payload: payload([{ productId: PRODUCT_ID, quantity: 1, selectedSize: "XXL" }])
      })
    ).rejects.toMatchObject({ code: "CART_REJECTED" });
    expect(store.getStock(PRODUCT_ID)).toBe(5);
    expect(store.orderCount).toBe(0);
  });

  it("replays the same idempotent request without reserving stock twice", async () => {
    const store = new MemoryCheckoutStore([product()]);
    const checkout = createCheckout(store);
    const input = { userId: "user-1", idempotencyKey: "checkout-key-0004", payload: payload() };

    const first = await checkout.place(input);
    const replay = await checkout.place(input);

    expect(replay.replayed).toBe(true);
    expect(replay.order.id).toBe(first.order.id);
    expect(store.getStock(PRODUCT_ID)).toBe(3);
    expect(store.orderCount).toBe(1);
  });

  it("rejects reuse of an idempotency key for a different cart", async () => {
    const store = new MemoryCheckoutStore([product()]);
    const checkout = createCheckout(store);
    await checkout.place({ userId: "user-1", idempotencyKey: "checkout-key-0005", payload: payload() });

    await expect(
      checkout.place({
        userId: "user-1",
        idempotencyKey: "checkout-key-0005",
        payload: payload([{ productId: PRODUCT_ID, quantity: 1, selectedSize: "M" }])
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(store.getStock(PRODUCT_ID)).toBe(3);
  });

  it("allows only one concurrent checkout to buy the last unit", async () => {
    const store = new MemoryCheckoutStore([product({ stock: 1 })]);
    const checkout = createCheckout(store);
    const singleItem = payload([{ productId: PRODUCT_ID, quantity: 1, selectedSize: "M" }]);

    const results = await Promise.allSettled([
      checkout.place({ userId: "user-1", idempotencyKey: "checkout-key-0006", payload: singleItem }),
      checkout.place({ userId: "user-2", idempotencyKey: "checkout-key-0007", payload: singleItem })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.objectContaining({ code: "CART_REJECTED" }) });
    expect(store.getStock(PRODUCT_ID)).toBe(0);
  });

  it("rolls back stock when order persistence fails", async () => {
    const store = new MemoryCheckoutStore([product()], true);
    const checkout = createCheckout(store);

    await expect(
      checkout.place({ userId: "user-1", idempotencyKey: "checkout-key-0008", payload: payload() })
    ).rejects.toBeInstanceOf(CheckoutError);
    expect(store.getStock(PRODUCT_ID)).toBe(5);
    expect(store.orderCount).toBe(0);
  });

  it("aggregates stock across sizes of the same product", async () => {
    const store = new MemoryCheckoutStore([
      product({ stock: 3 }),
      product({ id: SECOND_PRODUCT_ID, name: "Second product", sizes: [], stock: 5 })
    ]);
    const checkout = createCheckout(store);

    await expect(
      checkout.place({
        userId: "user-1",
        idempotencyKey: "checkout-key-0009",
        payload: payload([
          { productId: PRODUCT_ID, quantity: 2, selectedSize: "S" },
          { productId: PRODUCT_ID, quantity: 2, selectedSize: "M" }
        ])
      })
    ).rejects.toMatchObject({ code: "CART_REJECTED" });
    expect(store.getStock(PRODUCT_ID)).toBe(3);
  });
});
