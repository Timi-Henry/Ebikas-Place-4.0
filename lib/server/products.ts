import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/server/mongodb";
import {
  deriveLegacyTaxonomy,
  hydrateProductTaxonomy,
  normalizeProductCategory,
  normalizeProductSubcategory
} from "@/lib/product-taxonomy";
import { sampleProducts } from "@/lib/sample-products";
import type { Product, ProductBadge } from "@/lib/types";

type ProductDocument = Omit<Product, "id"> & {
  _id: ObjectId;
  createdAt: Date;
  reviews?: Array<{ userId: string; rating: number; createdAt: Date }>;
};

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
    createdAt: doc.createdAt.toISOString()
  };
}

type GetProductsOptions = {
  includeSamples?: boolean;
};

function withSampleProducts(products: Product[], includeSamples = true) {
  if (!includeSamples) {
    return products;
  }

  const existingIds = new Set(products.map((product) => product.id));
  const missingSamples = sampleProducts.filter((product) => !existingIds.has(product.id));
  return [...products, ...missingSamples];
}

export async function getProducts(options: GetProductsOptions = {}): Promise<Product[]> {
  const includeSamples = options.includeSamples ?? true;

  try {
    const db = await getDb();
    const docs = await db.collection<ProductDocument>("products").find({}).sort({ createdAt: -1 }).toArray();
    return withSampleProducts(docs.map(toProduct), includeSamples);
  } catch {
    return includeSamples ? sampleProducts : [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const sampleProduct = sampleProducts.find((product) => product.id === id);

  try {
    if (!ObjectId.isValid(id)) {
      return sampleProduct || null;
    }

    const db = await getDb();
    const doc = await db.collection<ProductDocument>("products").findOne({ _id: new ObjectId(id) });
    return doc ? toProduct(doc) : sampleProduct || null;
  } catch {
    return sampleProduct || null;
  }
}

export async function createProduct(input: Omit<Product, "id" | "createdAt">) {
  const db = await getDb();
  const createdAt = new Date();
  const imageUrls = input.imageUrls?.length ? input.imageUrls : [input.imageUrl];
  const taxonomy = hydrateProductTaxonomy(input);
  const { category, subcategory } = deriveLegacyTaxonomy(taxonomy);
  const badges = [...new Set<ProductBadge>(["new", ...(input.badges || [])])];
  const result = await db.collection("products").insertOne({
    ...input,
    category,
    subcategory,
    taxonomy,
    imageUrl: imageUrls[0],
    imageUrls,
    sizes: input.sizes || [],
    badges,
    ratingAverage: 0,
    reviewCount: 0,
    reviews: [],
    createdAt
  });
  return { ...input, category, subcategory, taxonomy, badges, id: result.insertedId.toString(), createdAt: createdAt.toISOString() };
}

export async function updateProduct(productId: string, input: Omit<Product, "id" | "createdAt" | "ratingAverage" | "reviewCount">) {
  if (!ObjectId.isValid(productId)) {
    throw new Error("Only database-backed products can be updated.");
  }

  const db = await getDb();
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

  const result = await db.collection<ProductDocument>("products").findOneAndUpdate(
    { _id },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new Error("Product not found.");
  }

  return toProduct(result);
}

export async function deleteProduct(productId: string) {
  if (!ObjectId.isValid(productId)) {
    throw new Error("Only database-backed products can be deleted.");
  }

  const db = await getDb();
  const _id = new ObjectId(productId);
  const product = await db.collection<ProductDocument>("products").findOne({ _id });
  if (!product) {
    throw new Error("Product not found.");
  }

  await db.collection("products").deleteOne({ _id });
  return toProduct(product);
}

export async function addProductReview(productId: string, userId: string, rating: number) {
  if (!ObjectId.isValid(productId)) {
    throw new Error("Product reviews require a database-backed product.");
  }

  const db = await getDb();
  const _id = new ObjectId(productId);
  const product = await db.collection<ProductDocument>("products").findOne({ _id });
  if (!product) {
    throw new Error("Product not found.");
  }

  const reviews = (product.reviews || []).filter((review) => review.userId !== userId);
  reviews.push({ userId, rating, createdAt: new Date() });
  const reviewCount = reviews.length;
  const ratingAverage = reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount;

  await db.collection("products").updateOne(
    { _id },
    {
      $set: {
        reviews,
        reviewCount,
        ratingAverage
      }
    }
  );

  return { ratingAverage, reviewCount };
}
