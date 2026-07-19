import "server-only";
import { ObjectId, type ClientSession, type Collection } from "mongodb";
import { revalidateCatalog } from "@/lib/server/catalog-cache";
import { ensureProductIndexes, ensureReviewIndexes } from "@/lib/server/database-indexes";
import { getDb, getMongoClient } from "@/lib/server/mongodb";

type LegacyReview = {
  userId: string;
  rating: number;
  createdAt: Date;
};

type ProductRatingDocument = {
  _id: ObjectId;
  ratingAverage?: number;
  reviewCount?: number;
  reviews?: LegacyReview[];
};

type ReviewDocument = {
  _id: ObjectId;
  productId: ObjectId;
  userId: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductRatingSummary = {
  ratingAverage: number;
  reviewCount: number;
};

export class ProductReviewInputError extends Error {
  readonly code = "INVALID_REVIEW";

  constructor(message: string) {
    super(message);
    this.name = "ProductReviewInputError";
  }
}

export class ProductReviewProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor() {
    super("Product not found.");
    this.name = "ProductReviewProductNotFoundError";
  }
}

function normalizeReviewInput(productId: string, userId: string, rating: number) {
  if (!ObjectId.isValid(productId)) {
    throw new ProductReviewInputError("Product reviews require a database-backed product.");
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || normalizedUserId.length > 128) {
    throw new ProductReviewInputError("A valid reviewer is required.");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ProductReviewInputError("Choose a rating from 1 to 5 stars.");
  }
  return { productId: new ObjectId(productId), userId: normalizedUserId, rating };
}

function validLegacyReviews(reviews: LegacyReview[] | undefined) {
  if (!reviews?.length) return [];
  return reviews.filter(
    (review) =>
      typeof review.userId === "string" &&
      review.userId.length > 0 &&
      review.userId.length <= 128 &&
      Number.isInteger(review.rating) &&
      review.rating >= 1 &&
      review.rating <= 5 &&
      review.createdAt instanceof Date &&
      !Number.isNaN(review.createdAt.getTime())
  );
}

async function migrateLegacyReviews(
  productId: ObjectId,
  legacyReviews: LegacyReview[] | undefined,
  session: ClientSession,
  reviews: Collection<ReviewDocument>
) {
  const legacy = validLegacyReviews(legacyReviews);
  if (!legacy.length) return;

  await reviews.bulkWrite(
    legacy.map((review) => ({
      updateOne: {
        filter: { productId, userId: review.userId },
        update: {
          $set: { rating: review.rating, updatedAt: review.createdAt },
          $setOnInsert: { createdAt: review.createdAt }
        },
        upsert: true
      }
    })),
    { ordered: true, session }
  );
}

/**
 * Owns review uniqueness, legacy migration, and the denormalized product summary.
 * The transaction retries safely on write conflicts, so concurrent ratings cannot lose updates.
 */
export async function addProductReview(
  productId: string,
  userId: string,
  rating: number
): Promise<ProductRatingSummary> {
  const input = normalizeReviewInput(productId, userId, rating);
  const [client, db] = await Promise.all([
    getMongoClient(),
    getDb(),
    ensureProductIndexes(),
    ensureReviewIndexes()
  ]);
  const session = client.startSession();

  try {
    const summary = await session.withTransaction(
      async () => {
        const products = db.collection<ProductRatingDocument>("products");
        const reviews = db.collection<ReviewDocument>("reviews");
        const product = await products.findOne({ _id: input.productId }, { session });
        if (!product) throw new ProductReviewProductNotFoundError();

        await migrateLegacyReviews(input.productId, product.reviews, session, reviews);

        const now = new Date();
        await reviews.updateOne(
          { productId: input.productId, userId: input.userId },
          {
            $set: { rating: input.rating, updatedAt: now },
            $setOnInsert: { createdAt: now }
          },
          { upsert: true, session }
        );

        const [aggregate] = await reviews
          .aggregate<{ _id: ObjectId; ratingAverage: number; reviewCount: number }>(
            [
              { $match: { productId: input.productId } },
              { $group: { _id: "$productId", ratingAverage: { $avg: "$rating" }, reviewCount: { $sum: 1 } } }
            ],
            { session }
          )
          .toArray();

        if (!aggregate) {
          throw new Error("Review summary could not be calculated.");
        }

        const update = await products.updateOne(
          { _id: input.productId },
          {
            $set: {
              ratingAverage: aggregate.ratingAverage,
              reviewCount: aggregate.reviewCount
            },
            $unset: { reviews: "" }
          },
          { session }
        );
        if (update.matchedCount !== 1) throw new ProductReviewProductNotFoundError();

        return {
          ratingAverage: aggregate.ratingAverage,
          reviewCount: aggregate.reviewCount
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary"
      }
    );

    if (!summary) throw new Error("Review transaction did not return a summary.");
    revalidateCatalog(productId);
    return summary;
  } finally {
    await session.endSession();
  }
}

export async function deleteProductReviews(productId: ObjectId, session?: ClientSession) {
  const db = await getDb();
  await db.collection<ReviewDocument>("reviews").deleteMany({ productId }, { session });
}
