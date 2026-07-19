import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  CatalogDomainError,
  createProduct,
  getProductsByIdsResult,
  getProductsResult,
  isCatalogUnavailableError,
  MAX_PRODUCTS_BY_ID
} from "@/lib/server/products";
import { requireAdmin } from "@/lib/server/auth";
import { productSchema } from "@/lib/validation";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { commitProductMedia, ProductMediaError, retireProductMedia } from "@/lib/server/product-media";

function isExternalProductImage(value: string) {
  try {
    return new URL(value).hostname !== "res.cloudinary.com";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const requestedIds = new URL(request.url).searchParams.get("ids");
  const ids = requestedIds
    ? requestedIds.split(",").map((id) => id.trim()).filter(Boolean)
    : undefined;

  if (ids && (ids.length > MAX_PRODUCTS_BY_ID || ids.some((id) => id.length > 80))) {
    return NextResponse.json({ error: "Invalid product IDs." }, { status: 400 });
  }

  let catalog;
  try {
    catalog = ids ? await getProductsByIdsResult(ids) : await getProductsResult();
  } catch (error) {
    if (error instanceof CatalogDomainError && error.code === "INVALID_QUERY") {
      return NextResponse.json({ error: "Invalid product IDs." }, { status: 400 });
    }
    throw error;
  }

  if (!catalog.ok) {
    return NextResponse.json(
      { error: "The product catalog is temporarily unavailable.", code: catalog.error.code },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
    );
  }

  return NextResponse.json(
    { products: catalog.value },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const admin = await requireAdmin();
    if (!admin.ok) {
      return withRequestId(
        NextResponse.json({ error: admin.message }, { status: admin.status }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "product.create",
      limit: 60,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const parsedInput = await parseBoundedJson(request, productSchema, { maxBytes: 32 * 1024 });
    const { imageStageIds = [], ...productInput } = parsedInput;
    const requestedUrls = productInput.imageUrls?.length
      ? productInput.imageUrls
      : productInput.imageUrl
        ? [productInput.imageUrl]
        : [];
    const externalUrls = requestedUrls.filter(isExternalProductImage);
    if (externalUrls.length + new Set(imageStageIds).size > 8) {
      return withRequestId(
        NextResponse.json({ error: "A product can have up to 8 images." }, { status: 422 }),
        context.requestId
      );
    }
    const productId = new ObjectId().toString();
    const committed = imageStageIds.length
      ? await commitProductMedia({ ownerId: admin.user.id, productId, stageIds: imageStageIds })
      : { productId, media: [] };
    const committedByUrl = new Map(committed.media.map((media) => [media.secureUrl, media]));
    const imageUrls = requestedUrls.filter((url) => committedByUrl.has(url) || isExternalProductImage(url));
    for (const media of committed.media) {
      if (!imageUrls.includes(media.secureUrl)) imageUrls.push(media.secureUrl);
    }
    if (imageUrls.length === 0) {
      return withRequestId(
        NextResponse.json({ error: "At least one product image is required." }, { status: 422 }),
        context.requestId
      );
    }

    const imagePublicIds = committed.media.map((media) => media.publicId);
    let product;
    try {
      product = await createProduct(
        {
          ...productInput,
          imageUrl: imageUrls[0],
          imageUrls,
          imagePublicId: imagePublicIds[0],
          imagePublicIds
        },
        { productId }
      );
    } catch (error) {
      if (imagePublicIds.length) {
        await retireProductMedia({
          actorId: admin.user.id,
          productId,
          publicIds: imagePublicIds,
          reason: "stage-abandoned"
        }).catch(() => undefined);
      }
      throw error;
    }

    return withRequestId(NextResponse.json({ product }, { status: 201 }), context.requestId);
  } catch (error) {
    if (error instanceof ProductMediaError) {
      const status = error.code === "INVALID_MEDIA_INPUT" ? 400 : error.code === "MEDIA_STAGE_FAILED" ? 503 : 409;
      return withRequestId(
        NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status }),
        context.requestId
      );
    }
    if (isCatalogUnavailableError(error)) {
      return withRequestId(NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
      ), context.requestId);
    }

    return safeErrorResponse(error, { ...context, event: "product.create.failed" });
  }
}
