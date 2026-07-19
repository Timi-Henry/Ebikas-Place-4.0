import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseDeliveryDetails, normalizeText } from "@/lib/address-validation";
import { createUserAddress, getUserAddresses } from "@/lib/server/addresses";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { addressMutationSchema } from "@/lib/validation";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const addresses = await getUserAddresses(user.id);
  return NextResponse.json({ addresses }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
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
      scope: "address.create",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: user.id
    });

    const body = await parseBoundedJson(request, addressMutationSchema, { maxBytes: 4096 });
    const details = parseDeliveryDetails(body);
    if (!details) {
      return withRequestId(
        NextResponse.json({ error: "Enter valid Lagos address and contact details." }, { status: 422 }),
        context.requestId
      );
    }

    const label = normalizeText(body.label) || undefined;
    const address = await createUserAddress(user.id, details, label);
    return withRequestId(NextResponse.json({ address }, { status: 201 }), context.requestId);
  } catch (error) {
    return safeErrorResponse(error, { ...context, event: "address.create.failed" });
  }
}
