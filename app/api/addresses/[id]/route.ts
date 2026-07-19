import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeText, parseDeliveryDetails } from "@/lib/address-validation";
import { deleteUserAddress, updateUserAddress } from "@/lib/server/addresses";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { addressMutationSchema, objectIdSchema } from "@/lib/validation";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const user = await currentUser();
    if (!user) {
      return withRequestId(
        NextResponse.json({ error: "Sign in required." }, { status: 401 }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "address.update",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: user.id
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Address not found." }, { status: 404 }), context.requestId);
    }

    const body = await parseBoundedJson(request, addressMutationSchema, { maxBytes: 4096 });
    const details = parseDeliveryDetails(body);
    if (!details) {
      return withRequestId(
        NextResponse.json({ error: "Enter valid Lagos address and contact details." }, { status: 422 }),
        context.requestId
      );
    }

    const id = idResult.data;
    const address = await updateUserAddress(user.id, id, details, normalizeText(body?.label) || undefined);
    return withRequestId(NextResponse.json({ address }), context.requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "Address not found.") {
      return withRequestId(NextResponse.json({ error: "Address not found." }, { status: 404 }), context.requestId);
    }
    return safeErrorResponse(error, { ...context, event: "address.update.failed" });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const user = await currentUser();
    if (!user) {
      return withRequestId(
        NextResponse.json({ error: "Sign in required." }, { status: 401 }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "address.delete",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: user.id
    });

    const idResult = objectIdSchema.safeParse((await params).id);
    if (!idResult.success) {
      return withRequestId(NextResponse.json({ error: "Address not found." }, { status: 404 }), context.requestId);
    }

    await deleteUserAddress(user.id, idResult.data);
    return withRequestId(NextResponse.json({ ok: true }), context.requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "Address not found.") {
      return withRequestId(NextResponse.json({ error: "Address not found." }, { status: 404 }), context.requestId);
    }
    return safeErrorResponse(error, { ...context, event: "address.delete.failed" });
  }
}
