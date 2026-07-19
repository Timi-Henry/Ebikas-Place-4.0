import { NextResponse } from "next/server";
import { collectImagePublicIds } from "@/lib/server/cloudinary";
import { requireAdmin } from "@/lib/server/auth";
import {
  CatalogDomainError,
  deleteProduct,
  getProductByIdResult,
  isCatalogUnavailableError,
  updateProduct
} from "@/lib/server/products";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { logServerError, safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { objectIdSchema, productDeleteSchema, productUpdateSchema } from "@/lib/validation";
import { commitProductMedia, ProductMediaError, retireProductMedia } from "@/lib/server/product-media";

function isExternalProductImage(value: string) {
  try {
    return new URL(value).hostname !== "res.cloudinary.com";
  } catch {
    return false;
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      scope: "product.update",
      limit: 60,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Product not found." }, { status: 404 }), context.requestId);
    }
    const id = idResult.data;
    const updateInput = await parseBoundedJson(request, productUpdateSchema, { maxBytes: 32 * 1024 });
    const { expectedVersion, imageStageIds = [], ...productInput } = updateInput;

    const existingResult = await getProductByIdResult(id, { includeSamples: false });
    if (!existingResult.ok) {
      return withRequestId(NextResponse.json(
        { error: existingResult.error.message, code: existingResult.error.code },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
      ), context.requestId);
    }

    const existing = existingResult.value;
    if (!existing) {
      return withRequestId(NextResponse.json({ error: "Product not found." }, { status: 404 }), context.requestId);
    }

    const requestedUrls = productInput.imageUrls?.length
      ? productInput.imageUrls
      : productInput.imageUrl
        ? [productInput.imageUrl]
        : [];
    const existingUrls = new Set(existing.imageUrls?.length ? existing.imageUrls : [existing.imageUrl]);
    const externalUrls = requestedUrls.filter(isExternalProductImage);
    if (externalUrls.length + new Set(imageStageIds).size > 8) {
      return withRequestId(
        NextResponse.json({ error: "A product can have up to 8 images." }, { status: 422 }),
        context.requestId
      );
    }

    const committed = imageStageIds.length
      ? await commitProductMedia({ ownerId: admin.user.id, productId: id, stageIds: imageStageIds })
      : { productId: id, media: [] };
    const committedByUrl = new Map(committed.media.map((media) => [media.secureUrl, media]));
    const committedPublicIds = new Set(committed.media.map((media) => media.publicId));
    const existingPublicIds = collectImagePublicIds(existing);
    const existingPublicIdSet = new Set(existingPublicIds);
    const requestedPublicIds = productInput.imagePublicIds || [];
    const invalidPublicId = requestedPublicIds.some(
      (publicId) => !existingPublicIdSet.has(publicId) && !committedPublicIds.has(publicId)
    );

    const retireCommitted = async () => {
      if (!committed.media.length) return;
      await retireProductMedia({
        actorId: admin.user.id,
        productId: id,
        publicIds: committed.media.map((media) => media.publicId),
        reason: "stage-abandoned"
      }).catch(() => undefined);
    };

    if (invalidPublicId) {
      await retireCommitted();
      return withRequestId(
        NextResponse.json({ error: "One or more product images are not attached to this product." }, { status: 422 }),
        context.requestId
      );
    }

    const imageUrls = requestedUrls.filter(
      (url) => committedByUrl.has(url) || existingUrls.has(url) || isExternalProductImage(url)
    );
    for (const media of committed.media) {
      if (!imageUrls.includes(media.secureUrl)) imageUrls.push(media.secureUrl);
    }
    if (imageUrls.length === 0 || imageUrls.length > 8) {
      await retireCommitted();
      return withRequestId(
        NextResponse.json({ error: "Add between 1 and 8 valid product images." }, { status: 422 }),
        context.requestId
      );
    }

    const nextPublicIds = [
      ...new Set([
        ...requestedPublicIds.filter((publicId) => existingPublicIdSet.has(publicId)),
        ...committed.media.map((media) => media.publicId)
      ])
    ];
    const requestedPrimaryPublicId = productInput.imagePublicId;
    const primaryPublicId =
      (requestedPrimaryPublicId && nextPublicIds.includes(requestedPrimaryPublicId) ? requestedPrimaryPublicId : undefined) ||
      committedByUrl.get(imageUrls[0])?.publicId ||
      nextPublicIds[0];

    let product;
    try {
      product = await updateProduct(
        id,
        {
          ...productInput,
          imageUrl: imageUrls[0],
          imageUrls,
          imagePublicId: primaryPublicId,
          imagePublicIds: nextPublicIds
        },
        expectedVersion
      );
    } catch (error) {
      await retireCommitted();
      throw error;
    }

    const nextPublicIdSet = new Set(collectImagePublicIds(product));
    const removedPublicIds = existingPublicIds.filter((publicId) => !nextPublicIdSet.has(publicId));
    let mediaCleanup = null;
    if (removedPublicIds.length) {
      try {
        mediaCleanup = await retireProductMedia({
          actorId: admin.user.id,
          productId: id,
          publicIds: removedPublicIds,
          reason: "image-replaced"
        });
      } catch (error) {
        logServerError(error, { ...context, event: "product.media-retirement-deferred", metadata: { productId: id } });
      }
    }

    return withRequestId(NextResponse.json({ product, mediaCleanup }), context.requestId);
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

    if (error instanceof CatalogDomainError) {
      return withRequestId(NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === "PRODUCT_NOT_FOUND"
              ? 404
              : error.code === "VERSION_CONFLICT"
                ? 409
                : 400
        }
      ), context.requestId);
    }

    return safeErrorResponse(error, { ...context, event: "product.update.failed" });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      scope: "product.delete",
      limit: 60,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Product not found." }, { status: 404 }), context.requestId);
    }

    const id = idResult.data;
    const { expectedVersion } = await parseBoundedJson(request, productDeleteSchema, { maxBytes: 1024 });
    const product = await deleteProduct(id, expectedVersion);
    const publicIds = collectImagePublicIds(product);
    let mediaCleanup = null;
    if (publicIds.length) {
      try {
        mediaCleanup = await retireProductMedia({
          actorId: admin.user.id,
          productId: id,
          publicIds,
          reason: "product-deleted"
        });
      } catch (error) {
        logServerError(error, { ...context, event: "product.media-retirement-deferred", metadata: { productId: id } });
      }
    }
    return withRequestId(NextResponse.json({ ok: true, mediaCleanup }), context.requestId);
  } catch (error) {
    if (error instanceof ProductMediaError) {
      const status = error.code === "INVALID_MEDIA_INPUT" ? 400 : 409;
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

    if (error instanceof CatalogDomainError) {
      return withRequestId(NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === "PRODUCT_NOT_FOUND"
              ? 404
              : error.code === "VERSION_CONFLICT"
                ? 409
                : 400
        }
      ), context.requestId);
    }

    return safeErrorResponse(error, { ...context, event: "product.delete.failed" });
  }
}
