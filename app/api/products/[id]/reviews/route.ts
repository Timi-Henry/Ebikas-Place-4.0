import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  addProductReview,
  CatalogDomainError,
  isCatalogUnavailableError
} from "@/lib/server/products";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { objectIdSchema, reviewSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const user = await currentUser();
    if (!user) {
      return withRequestId(
        NextResponse.json({ error: "Sign in to leave a rating." }, { status: 401 }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "product-review.create",
      limit: 20,
      windowMs: 60 * 60 * 1000,
      userId: user.id
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Product not found." }, { status: 404 }), context.requestId);
    }

    const review = await parseBoundedJson(request, reviewSchema, { maxBytes: 1024 });
    const summary = await addProductReview(idResult.data, user.id, review.rating);
    return withRequestId(NextResponse.json(summary), context.requestId);
  } catch (error) {
    if (isCatalogUnavailableError(error)) {
      return withRequestId(NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
      ), context.requestId);
    }

    if (error instanceof CatalogDomainError) {
      return withRequestId(NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "PRODUCT_NOT_FOUND" ? 404 : 400 }
      ), context.requestId);
    }

    return safeErrorResponse(error, { ...context, event: "product.review.create.failed" });
  }
}
