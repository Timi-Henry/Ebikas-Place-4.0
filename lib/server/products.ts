import "server-only";
import { cache } from "react";
import { ObjectId } from "mongodb";
import {
  decodeSeekCursor,
  encodeSeekCursor,
  InvalidCursorError,
  normalizePageSize,
  type CursorPage
} from "@/lib/cursor-pagination";
import { revalidateCatalog } from "@/lib/server/catalog-cache";
import { ensureProductIndexes, ensureReviewIndexes } from "@/lib/server/database-indexes";
import { isDevelopmentSampleCatalogEnabled } from "@/lib/server/env";
import { createdBefore, decodeMongoCursor, toCursorPage } from "@/lib/server/mongo-pagination";
import { getDb, getMongoClient } from "@/lib/server/mongodb";
import {
  addProductReview as addAtomicProductReview,
  deleteProductReviews,
  ProductReviewInputError,
  ProductReviewProductNotFoundError
} from "@/lib/server/reviews";
import {
  deriveLegacyTaxonomy,
  hydrateProductTaxonomy,
  normalizeProductCategory,
  normalizeProductSubcategory
} from "@/lib/product-taxonomy";
import { sampleProducts } from "@/lib/sample-products";
import type { Product, ProductBadge } from "@/lib/types";

type ProductDocument = Omit<Product, "id" | "createdAt" | "updatedAt"> & {
  _id: ObjectId;
  createdAt: Date;
  updatedAt?: Date;
  reviews?: Array<{ userId: string; rating: number; createdAt: Date }>;
};

export type ProductWriteInput = Omit<
  Product,
  "id" | "createdAt" | "updatedAt" | "version" | "ratingAverage" | "reviewCount"
>;

function toProduct(doc: ProductDocument): Product {
  const reviewCount = doc.reviewCount ?? doc.reviews?.length ?? 0;
  const ratingAverage =
    doc.ratingAverage ??
    (doc.reviews?.length ? doc.reviews.reduce((sum, review) => sum + review.rating, 0) / doc.reviews.length : 0);

  const taxonomy = hydrateProductTaxonomy(doc);
  const compatibility = doc.taxonomy
    ? deriveLegacyTaxonomy(taxonomy)
    : {
        category: normalizeProductCategory(doc.category),
        subcategory: normalizeProductSubcategory(doc.category, doc.subcategory)
      };
  return {
    id: doc._id.toString(),
    version: doc.version ?? 1,
    name: doc.name,
    description: doc.description,
    category: compatibility.category,
    subcategory: compatibility.subcategory,
    taxonomy,
    price: doc.price,
    originalPrice: doc.originalPrice,
    salePrice: doc.salePrice,
    imageUrl: doc.imageUrl,
    imageUrls: doc.imageUrls?.length ? doc.imageUrls : [doc.imageUrl],
    imagePublicId: doc.imagePublicId,
    imagePublicIds: doc.imagePublicIds,
    sizes: doc.sizes || [],
    stock: doc.stock,
    featured: doc.featured,
    badges: doc.badges || [],
    ratingAverage,
    reviewCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt?.toISOString()
  };
}

export type ProductQueryOptions = {
  includeSamples?: boolean;
};

export type ProductPageOptions = ProductQueryOptions & {
  cursor?: string;
  limit?: number;
};

export const MAX_PRODUCTS_BY_ID = 50;

type CatalogOperation =
  | "list-products"
  | "list-products-by-id"
  | "get-product"
  | "create-product"
  | "update-product"
  | "delete-product"
  | "add-product-review";

export class CatalogUnavailableError extends Error {
  readonly code = "CATALOG_UNAVAILABLE";
  readonly operation: CatalogOperation;

  constructor(operation: CatalogOperation) {
    super("The product catalog is temporarily unavailable.");
    this.name = "CatalogUnavailableError";
    this.operation = operation;
  }
}

export class CatalogDomainError extends Error {
  readonly code: "PRODUCT_NOT_FOUND" | "UNSUPPORTED_PRODUCT" | "INVALID_QUERY" | "VERSION_CONFLICT";

  constructor(
    message: string,
    code: "PRODUCT_NOT_FOUND" | "UNSUPPORTED_PRODUCT" | "INVALID_QUERY" | "VERSION_CONFLICT"
  ) {
    super(message);
    this.name = "CatalogDomainError";
    this.code = code;
  }
}

class CatalogProductNotFoundError extends CatalogDomainError {
  constructor() {
    super("Product not found.", "PRODUCT_NOT_FOUND");
    this.name = "CatalogProductNotFoundError";
  }
}

class CatalogUnsupportedProductError extends CatalogDomainError {
  constructor(message: string) {
    super(message, "UNSUPPORTED_PRODUCT");
    this.name = "CatalogUnsupportedProductError";
  }
}

class CatalogInvalidQueryError extends CatalogDomainError {
  constructor(message: string) {
    super(message, "INVALID_QUERY");
    this.name = "CatalogInvalidQueryError";
  }
}

export class CatalogProductVersionConflictError extends CatalogDomainError {
  constructor() {
    super("This product changed in another session. Refresh and try again.", "VERSION_CONFLICT");
    this.name = "CatalogProductVersionConflictError";
  }
}

export function isCatalogUnavailableError(error: unknown): error is CatalogUnavailableError {
  return error instanceof CatalogUnavailableError;
}

export type CatalogResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogUnavailableError };

function logCatalogFailure(operation: CatalogOperation, error: unknown) {
  // Never log error messages/stacks here: database driver errors can contain connection details.
  console.error("[catalog] Data source operation failed.", {
    operation,
    errorType: error instanceof Error ? error.name : typeof error
  });
}

async function runCatalogOperation<T>(operation: CatalogOperation, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CatalogDomainError || error instanceof CatalogUnavailableError) {
      throw error;
    }

    logCatalogFailure(operation, error);
    throw new CatalogUnavailableError(operation);
  }
}

const getDatabaseProducts = cache(() =>
  runCatalogOperation("list-products", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    const docs = await db.collection<ProductDocument>("products").find({}).sort({ createdAt: -1, _id: -1 }).toArray();
    return docs.map(toProduct);
  })
);

const getDatabaseProductById = cache((id: string) =>
  runCatalogOperation("get-product", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    const doc = await db.collection<ProductDocument>("products").findOne({ _id: new ObjectId(id) });
    return doc ? toProduct(doc) : null;
  })
);

export async function getProducts(options: ProductQueryOptions = {}): Promise<Product[]> {
  const includeSamples = options.includeSamples ?? true;

  if (includeSamples && isDevelopmentSampleCatalogEnabled()) {
    return sampleProducts;
  }

  return getDatabaseProducts();
}

export async function getProductById(id: string, options: ProductQueryOptions = {}): Promise<Product | null> {
  const includeSamples = options.includeSamples ?? true;

  if (includeSamples && isDevelopmentSampleCatalogEnabled()) {
    return sampleProducts.find((product) => product.id === id) || null;
  }

  if (!ObjectId.isValid(id)) {
    return null;
  }

  return getDatabaseProductById(id);
}

function getSampleProductsPage(options: ProductPageOptions, limit: number): CursorPage<Product> {
  let start = 0;
  if (options.cursor) {
    const cursor = decodeSeekCursor(options.cursor);
    if (cursor.sortAt.getTime() !== 0) throw new InvalidCursorError();
    const index = sampleProducts.findIndex((product) => product.id === cursor.id);
    if (index < 0) throw new InvalidCursorError();
    start = index + 1;
  }

  const items = sampleProducts.slice(start, start + limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      start + items.length < sampleProducts.length && last
        ? encodeSeekCursor({ sortAt: new Date(0), id: last.id })
        : undefined
  };
}

export async function getProductsPage(options: ProductPageOptions = {}): Promise<CursorPage<Product>> {
  let limit: number;
  try {
    limit = normalizePageSize(options.limit);
    if ((options.includeSamples ?? true) && isDevelopmentSampleCatalogEnabled()) {
      return getSampleProductsPage(options, limit);
    }
  } catch (error) {
    if (error instanceof InvalidCursorError || error instanceof RangeError) {
      throw new CatalogInvalidQueryError(error.message);
    }
    throw error;
  }

  let cursor: ReturnType<typeof decodeMongoCursor>;
  try {
    cursor = decodeMongoCursor(options.cursor);
  } catch (error) {
    if (error instanceof InvalidCursorError) throw new CatalogInvalidQueryError(error.message);
    throw error;
  }
  return runCatalogOperation("list-products", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    const docs = await db
      .collection<ProductDocument>("products")
      .find(createdBefore(cursor))
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    return toCursorPage(docs, limit, toProduct);
  });
}

export async function getProductsByIds(
  ids: readonly string[],
  options: ProductQueryOptions = {}
): Promise<Product[]> {
  if (!Array.isArray(ids) || ids.length > MAX_PRODUCTS_BY_ID) {
    throw new CatalogInvalidQueryError(`Request between 0 and ${MAX_PRODUCTS_BY_ID} product IDs.`);
  }
  if (ids.length === 0) return [];
  if (ids.some((id) => typeof id !== "string" || id.length === 0 || id.length > 128)) {
    throw new CatalogInvalidQueryError("Every product ID must be a bounded string.");
  }

  if ((options.includeSamples ?? true) && isDevelopmentSampleCatalogEnabled()) {
    const samplesById = new Map(sampleProducts.map((product) => [product.id, product]));
    return ids.flatMap((id) => {
      const product = samplesById.get(id);
      return product ? [product] : [];
    });
  }

  if (ids.some((id) => !ObjectId.isValid(id))) {
    throw new CatalogInvalidQueryError("Every product ID must be a valid database identifier.");
  }

  return runCatalogOperation("list-products-by-id", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    const uniqueIds = [...new Set(ids)].map((id) => new ObjectId(id));
    const documents = await db
      .collection<ProductDocument>("products")
      .find({ _id: { $in: uniqueIds } })
      .toArray();
    const productsById = new Map(documents.map((document) => [document._id.toString(), toProduct(document)]));
    return ids.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
  });
}

export async function getProductsByIdsResult(
  ids: readonly string[],
  options: ProductQueryOptions = {}
): Promise<CatalogResult<Product[]>> {
  try {
    return { ok: true, value: await getProductsByIds(ids, options) };
  } catch (error) {
    if (isCatalogUnavailableError(error)) return { ok: false, error };
    throw error;
  }
}

export async function getProductsResult(options: ProductQueryOptions = {}): Promise<CatalogResult<Product[]>> {
  try {
    return { ok: true, value: await getProducts(options) };
  } catch (error) {
    if (isCatalogUnavailableError(error)) {
      return { ok: false, error };
    }

    throw error;
  }
}

export async function getProductsPageResult(
  options: ProductPageOptions = {}
): Promise<CatalogResult<CursorPage<Product>>> {
  try {
    return { ok: true, value: await getProductsPage(options) };
  } catch (error) {
    if (isCatalogUnavailableError(error)) return { ok: false, error };
    throw error;
  }
}

export async function getProductByIdResult(
  id: string,
  options: ProductQueryOptions = {}
): Promise<CatalogResult<Product | null>> {
  try {
    return { ok: true, value: await getProductById(id, options) };
  } catch (error) {
    if (isCatalogUnavailableError(error)) {
      return { ok: false, error };
    }

    throw error;
  }
}

export async function createProduct(input: ProductWriteInput, options: { productId?: string } = {}) {
  if (options.productId && !ObjectId.isValid(options.productId)) {
    throw new CatalogInvalidQueryError("A valid product identifier is required.");
  }
  const _id = options.productId ? new ObjectId(options.productId) : new ObjectId();
  const createdAt = new Date();
  const imageUrls = input.imageUrls?.length ? input.imageUrls : [input.imageUrl];
  const taxonomy = hydrateProductTaxonomy(input);
  const { category, subcategory } = deriveLegacyTaxonomy(taxonomy);
  const badges = [...new Set<ProductBadge>(["new", ...(input.badges || [])])];
  const result = await runCatalogOperation("create-product", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    return db.collection("products").insertOne({
      _id,
      ...input,
      category,
      subcategory,
      taxonomy,
      imageUrl: imageUrls[0],
      imageUrls,
      sizes: input.sizes || [],
      badges,
      version: 1,
      ratingAverage: 0,
      reviewCount: 0,
      createdAt,
      updatedAt: createdAt
    });
  });
  const product = {
    ...input,
    category,
    subcategory,
    taxonomy,
    badges,
    id: result.insertedId.toString(),
    version: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString()
  };
  revalidateCatalog(product.id);
  return product;
}

export async function updateProduct(productId: string, input: ProductWriteInput, expectedVersion?: number) {
  if (!ObjectId.isValid(productId)) {
    throw new CatalogUnsupportedProductError("Only database-backed products can be updated.");
  }
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
    throw new CatalogInvalidQueryError("A valid product version is required.");
  }

  const _id = new ObjectId(productId);
  const imageUrls = input.imageUrls?.length ? input.imageUrls : [input.imageUrl];
  const taxonomy = hydrateProductTaxonomy(input);
  const { category, subcategory } = deriveLegacyTaxonomy(taxonomy);
  const update = {
    name: input.name,
    description: input.description,
    category,
    subcategory,
    taxonomy,
    price: input.price,
    originalPrice: input.originalPrice,
    salePrice: input.salePrice,
    stock: input.stock,
    featured: input.featured,
    badges: input.badges || [],
    imageUrl: imageUrls[0],
    imageUrls,
    imagePublicId: input.imagePublicId || input.imagePublicIds?.[0],
    imagePublicIds: input.imagePublicIds || [],
    sizes: input.sizes || []
  };

  const result = await runCatalogOperation("update-product", async () => {
    await ensureProductIndexes();
    const db = await getDb();
    const products = db.collection<ProductDocument>("products");
    await products.updateOne({ _id, version: { $exists: false } }, { $set: { version: 1 } });
    const filter = expectedVersion === undefined ? { _id } : { _id, version: expectedVersion };
    const updated = await products.findOneAndUpdate(
      filter,
      { $set: { ...update, updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: "after" }
    );
    if (!updated && expectedVersion !== undefined) {
      const exists = await products.findOne({ _id }, { projection: { _id: 1 } });
      if (exists) throw new CatalogProductVersionConflictError();
    }
    return updated;
  });

  if (!result) {
    throw new CatalogProductNotFoundError();
  }

  const product = toProduct(result);
  revalidateCatalog(product.id);
  return product;
}

export async function deleteProduct(productId: string, expectedVersion?: number) {
  if (!ObjectId.isValid(productId)) {
    throw new CatalogUnsupportedProductError("Only database-backed products can be deleted.");
  }
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
    throw new CatalogInvalidQueryError("A valid product version is required.");
  }

  const _id = new ObjectId(productId);
  const product = await runCatalogOperation("delete-product", async () => {
    const [client, db] = await Promise.all([
      getMongoClient(),
      getDb(),
      ensureProductIndexes(),
      ensureReviewIndexes()
    ]);
    const session = client.startSession();
    let existing: ProductDocument | null = null;
    try {
      await session.withTransaction(
        async () => {
          existing = await db.collection<ProductDocument>("products").findOne({ _id }, { session });
          if (!existing) return;
          if (expectedVersion !== undefined && (existing.version ?? 1) !== expectedVersion) {
            throw new CatalogProductVersionConflictError();
          }
          await db.collection("products").deleteOne({ _id }, { session });
          await deleteProductReviews(_id, session);
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
    return existing;
  });

  if (!product) {
    throw new CatalogProductNotFoundError();
  }

  const deleted = toProduct(product);
  revalidateCatalog(productId);
  return deleted;
}

export async function addProductReview(productId: string, userId: string, rating: number) {
  return runCatalogOperation("add-product-review", async () => {
    try {
      return await addAtomicProductReview(productId, userId, rating);
    } catch (error) {
      if (error instanceof ProductReviewProductNotFoundError) throw new CatalogProductNotFoundError();
      if (error instanceof ProductReviewInputError) {
        throw new CatalogUnsupportedProductError(error.message);
      }
      throw error;
    }
  });
}
