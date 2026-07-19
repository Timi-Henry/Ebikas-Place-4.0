import { createHash } from "node:crypto";
import { z } from "zod";
import { buildLagosAddress } from "@/lib/address-validation";
import { storePickupAddress } from "@/lib/order-fulfillment";
import type {
  CustomerContact,
  DeliveryDetails,
  FulfillmentMethod,
  Order,
  OrderItem,
  ProductSize,
  SavedAddress
} from "@/lib/types";

const MAX_CART_LINES = 25;
const MAX_QUANTITY_PER_PRODUCT = 10;

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i);
const productSizeSchema = z.enum(["S", "M", "L", "XL", "XXL"]);
const phoneSchema = z.string().trim().min(8).max(24).regex(/^[+\d][\d\s()+-]{7,20}$/);
const contactSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: phoneSchema,
    whatsapp: phoneSchema
  })
  .strict();
const deliveryDetailsSchema = contactSchema
  .extend({
    addressLine: z.string().trim().min(2).max(160),
    street: z.string().trim().min(2).max(120),
    area: z.string().trim().min(2).max(120),
    state: z.literal("Lagos").optional(),
    address: z.string().max(500).optional()
  })
  .strict()
  .transform((details): DeliveryDetails => ({
    fullName: details.fullName,
    email: details.email,
    phone: details.phone,
    whatsapp: details.whatsapp,
    addressLine: details.addressLine,
    street: details.street,
    area: details.area,
    state: "Lagos",
    address: buildLagosAddress(details)
  }));

const checkoutPayloadSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: objectIdSchema,
            quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_PRODUCT),
            selectedSize: productSizeSchema.optional()
          })
          .strict()
      )
      .min(1)
      .max(MAX_CART_LINES),
    fulfillment: z.discriminatedUnion("method", [
      z
        .object({
          method: z.literal("store-delivery"),
          destination: z.discriminatedUnion("source", [
            z.object({ source: z.literal("saved"), addressId: objectIdSchema }).strict(),
            z
              .object({
                source: z.literal("new"),
                details: deliveryDetailsSchema,
                saveAddress: z.boolean().default(true),
                label: z.string().trim().min(1).max(80).optional()
              })
              .strict()
          ])
        })
        .strict(),
      z.object({ method: z.literal("customer-rider"), contact: contactSchema }).strict()
    ])
  })
  .strict();

type ParsedCheckoutPayload = z.infer<typeof checkoutPayloadSchema>;

export type CheckoutLine = {
  productId: string;
  quantity: number;
  selectedSize?: ProductSize;
};

export type CheckoutProduct = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  sizes: ProductSize[];
  stock: number;
};

export type CheckoutOrderRecord = Omit<Order, "id"> & {
  idempotencyKey: string;
  requestHash: string;
};

export type ExistingCheckoutOrder = {
  order: Order;
  requestHash: string;
};

export interface CheckoutTransaction {
  findOrderByIdempotency(userId: string, idempotencyKey: string): Promise<ExistingCheckoutOrder | null>;
  loadProducts(productIds: readonly string[]): Promise<CheckoutProduct[]>;
  findAddress(userId: string, addressId: string): Promise<SavedAddress | null>;
  reserveStock(productId: string, quantity: number): Promise<boolean>;
  insertAddress(userId: string, details: DeliveryDetails, label?: string): Promise<SavedAddress>;
  insertOrder(order: CheckoutOrderRecord): Promise<Order>;
}

export interface CheckoutStore {
  transaction<T>(work: (transaction: CheckoutTransaction) => Promise<T>): Promise<T>;
  findOrderByIdempotency(userId: string, idempotencyKey: string): Promise<ExistingCheckoutOrder | null>;
}

export type CheckoutIssueCode =
  | "PRODUCT_NOT_FOUND"
  | "SIZE_REQUIRED"
  | "SIZE_NOT_AVAILABLE"
  | "SIZE_NOT_ALLOWED"
  | "OUT_OF_STOCK"
  | "PRODUCT_UNAVAILABLE";

export type CheckoutIssue = {
  productId: string;
  code: CheckoutIssueCode;
  message: string;
  requested?: number;
  available?: number;
};

export type CheckoutErrorCode =
  | "INVALID_REQUEST"
  | "CART_REJECTED"
  | "ADDRESS_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "CHECKOUT_UNAVAILABLE";

export class CheckoutError extends Error {
  constructor(
    public readonly code: CheckoutErrorCode,
    message: string,
    public readonly status: 400 | 409 | 422 | 503,
    public readonly retryable = false,
    public readonly issues?: CheckoutIssue[]
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export class DuplicateCheckoutError extends Error {
  constructor() {
    super("The checkout idempotency key already exists.");
    this.name = "DuplicateCheckoutError";
  }
}

export type CheckoutResult = {
  order: Order;
  savedAddress?: SavedAddress;
  replayed: boolean;
};

type PlaceCheckoutInput = {
  userId: string;
  idempotencyKey: string;
  payload: unknown;
};

function normalizeLines(lines: ParsedCheckoutPayload["items"]): CheckoutLine[] {
  const merged = new Map<string, CheckoutLine>();
  const productQuantities = new Map<string, number>();

  for (const line of lines) {
    const productQuantity = (productQuantities.get(line.productId) || 0) + line.quantity;
    if (productQuantity > MAX_QUANTITY_PER_PRODUCT) {
      throw new CheckoutError(
        "INVALID_REQUEST",
        `You can order at most ${MAX_QUANTITY_PER_PRODUCT} of one product at a time.`,
        400
      );
    }
    productQuantities.set(line.productId, productQuantity);

    const key = `${line.productId}:${line.selectedSize || ""}`;
    const existing = merged.get(key);
    const quantity = (existing?.quantity || 0) + line.quantity;
    if (quantity > MAX_QUANTITY_PER_PRODUCT) {
      throw new CheckoutError(
        "INVALID_REQUEST",
        `You can order at most ${MAX_QUANTITY_PER_PRODUCT} of one product at a time.`,
        400
      );
    }
    merged.set(key, { ...line, quantity });
  }

  return [...merged.values()].sort((left, right) => {
    const byProduct = left.productId.localeCompare(right.productId);
    return byProduct || (left.selectedSize || "").localeCompare(right.selectedSize || "");
  });
}

function requestFingerprint(lines: readonly CheckoutLine[], fulfillment: ParsedCheckoutPayload["fulfillment"]) {
  return createHash("sha256").update(JSON.stringify({ lines, fulfillment })).digest("hex");
}

function validateIdempotencyKey(value: string) {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(key)) {
    throw new CheckoutError("INVALID_REQUEST", "A valid idempotency key is required.", 400);
  }
  return key;
}

function checkoutIssue(productId: string, code: CheckoutIssueCode, message: string, details: Partial<CheckoutIssue> = {}) {
  return { productId, code, message, ...details } satisfies CheckoutIssue;
}

function buildCustomerDetails(
  fulfillment: ParsedCheckoutPayload["fulfillment"],
  savedAddress: SavedAddress | null
): {
  customerContact: CustomerContact;
  fulfillmentMethod: FulfillmentMethod;
  deliveryDetails?: DeliveryDetails;
  pickupAddress?: string;
} {
  if (fulfillment.method === "customer-rider") {
    return {
      customerContact: fulfillment.contact,
      fulfillmentMethod: "customer-rider",
      pickupAddress: storePickupAddress
    };
  }

  const deliveryDetails =
    savedAddress ?? (fulfillment.destination.source === "new" ? fulfillment.destination.details : null);
  if (!deliveryDetails) {
    throw new CheckoutError("ADDRESS_NOT_FOUND", "Choose a valid delivery address.", 422);
  }

  return {
    customerContact: {
      fullName: deliveryDetails.fullName,
      email: deliveryDetails.email,
      phone: deliveryDetails.phone,
      whatsapp: deliveryDetails.whatsapp
    },
    fulfillmentMethod: "store-delivery",
    deliveryDetails
  };
}

export function createCheckout(store: CheckoutStore, clock: () => Date = () => new Date()) {
  async function replayResult(userId: string, idempotencyKey: string, requestHash: string): Promise<CheckoutResult> {
    const existing = await store.findOrderByIdempotency(userId, idempotencyKey);
    if (!existing) {
      throw new CheckoutError("CHECKOUT_UNAVAILABLE", "Checkout is temporarily unavailable. Please try again.", 503, true);
    }
    if (existing.requestHash !== requestHash) {
      throw new CheckoutError("IDEMPOTENCY_CONFLICT", "This checkout key was already used for a different cart.", 409);
    }
    return { order: existing.order, replayed: true };
  }

  async function place(input: PlaceCheckoutInput): Promise<CheckoutResult> {
    const parsed = checkoutPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new CheckoutError("INVALID_REQUEST", "Check the cart and fulfillment details, then try again.", 400);
    }

    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const lines = normalizeLines(parsed.data.items);
    const requestHash = requestFingerprint(lines, parsed.data.fulfillment);

    try {
      return await store.transaction(async (transaction) => {
        const existing = await transaction.findOrderByIdempotency(input.userId, idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new CheckoutError("IDEMPOTENCY_CONFLICT", "This checkout key was already used for a different cart.", 409);
          }
          return { order: existing.order, replayed: true };
        }

        let savedAddress: SavedAddress | null = null;
        if (parsed.data.fulfillment.method === "store-delivery" && parsed.data.fulfillment.destination.source === "saved") {
          savedAddress = await transaction.findAddress(input.userId, parsed.data.fulfillment.destination.addressId);
          if (!savedAddress) {
            throw new CheckoutError("ADDRESS_NOT_FOUND", "That saved address could not be found.", 422);
          }
        }

        const uniqueProductIds = [...new Set(lines.map((line) => line.productId))];
        const products = await transaction.loadProducts(uniqueProductIds);
        const productById = new Map(products.map((product) => [product.id, product]));
        const quantitiesByProduct = new Map<string, number>();
        const issues: CheckoutIssue[] = [];
        const items: OrderItem[] = [];

        for (const line of lines) {
          const product = productById.get(line.productId);
          if (!product) {
            issues.push(checkoutIssue(line.productId, "PRODUCT_NOT_FOUND", "A product in your cart is no longer available."));
            continue;
          }

          if (!Number.isSafeInteger(product.price) || product.price <= 0 || !Number.isSafeInteger(product.stock) || product.stock < 0) {
            issues.push(checkoutIssue(line.productId, "PRODUCT_UNAVAILABLE", `${product.name} is temporarily unavailable.`));
            continue;
          }

          if (product.sizes.length > 0 && !line.selectedSize) {
            issues.push(checkoutIssue(line.productId, "SIZE_REQUIRED", `Choose a size for ${product.name}.`));
            continue;
          }
          if (product.sizes.length === 0 && line.selectedSize) {
            issues.push(checkoutIssue(line.productId, "SIZE_NOT_ALLOWED", `${product.name} does not use sizes.`));
            continue;
          }
          if (line.selectedSize && !product.sizes.includes(line.selectedSize)) {
            issues.push(checkoutIssue(line.productId, "SIZE_NOT_AVAILABLE", `Size ${line.selectedSize} is unavailable for ${product.name}.`));
            continue;
          }

          quantitiesByProduct.set(product.id, (quantitiesByProduct.get(product.id) || 0) + line.quantity);
          const lineTotal = product.price * line.quantity;
          if (!Number.isSafeInteger(lineTotal)) {
            issues.push(checkoutIssue(line.productId, "PRODUCT_UNAVAILABLE", `${product.name} is temporarily unavailable.`));
            continue;
          }
          items.push({
            productId: product.id,
            name: product.name,
            imageUrl: product.imageUrl,
            price: product.price,
            lineTotal,
            quantity: line.quantity,
            selectedSize: line.selectedSize
          });
        }

        for (const [productId, quantity] of quantitiesByProduct) {
          const product = productById.get(productId);
          if (product && product.stock < quantity) {
            issues.push(
              checkoutIssue(productId, "OUT_OF_STOCK", `Only ${product.stock} of ${product.name} are available.`, {
                requested: quantity,
                available: product.stock
              })
            );
          }
        }

        if (issues.length > 0) {
          throw new CheckoutError("CART_REJECTED", issues[0].message, 409, false, issues);
        }

        for (const [productId, quantity] of quantitiesByProduct) {
          const reserved = await transaction.reserveStock(productId, quantity);
          if (!reserved) {
            const product = productById.get(productId);
            throw new CheckoutError(
              "CART_REJECTED",
              `${product?.name || "A product"} no longer has enough stock for this order.`,
              409,
              false,
              [checkoutIssue(productId, "OUT_OF_STOCK", "Stock changed while the order was being placed.", { requested: quantity })]
            );
          }
        }

        if (
          parsed.data.fulfillment.method === "store-delivery" &&
          parsed.data.fulfillment.destination.source === "new" &&
          parsed.data.fulfillment.destination.saveAddress
        ) {
          savedAddress = await transaction.insertAddress(
            input.userId,
            parsed.data.fulfillment.destination.details,
            parsed.data.fulfillment.destination.label || "Checkout address"
          );
        }

        const customer = buildCustomerDetails(parsed.data.fulfillment, savedAddress);
        const createdAt = clock();
        const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
        if (!Number.isSafeInteger(subtotal)) {
          throw new CheckoutError("CART_REJECTED", "The cart total is invalid.", 409);
        }

        const order = await transaction.insertOrder({
          version: 1,
          userId: input.userId,
          customerEmail: customer.customerContact.email,
          customerName: customer.customerContact.fullName,
          customerContact: customer.customerContact,
          fulfillmentMethod: customer.fulfillmentMethod,
          deliveryDetails: customer.deliveryDetails,
          pickupAddress: customer.pickupAddress,
          items,
          subtotal,
          currency: "NGN",
          status: "placed",
          createdAt: createdAt.toISOString(),
          statusUpdatedAt: createdAt.toISOString(),
          idempotencyKey,
          requestHash
        });

        return { order, savedAddress: savedAddress || undefined, replayed: false };
      });
    } catch (error) {
      if (error instanceof CheckoutError) throw error;
      if (error instanceof DuplicateCheckoutError) {
        return replayResult(input.userId, idempotencyKey, requestHash);
      }
      throw new CheckoutError("CHECKOUT_UNAVAILABLE", "Checkout is temporarily unavailable. Please try again.", 503, true);
    }
  }

  return { place };
}
