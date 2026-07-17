import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseDeliveryDetails, normalizeText } from "@/lib/address-validation";
import { createUserAddress, getUserAddresses } from "@/lib/server/addresses";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const addresses = await getUserAddresses(user.id);
  return NextResponse.json({ addresses }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const details = parseDeliveryDetails(body);
  if (!details) {
    return NextResponse.json({ error: "Enter valid Lagos address and contact details." }, { status: 400 });
  }

  const label = normalizeText(body?.label) || undefined;
  const address = await createUserAddress(user.id, details, label);
  return NextResponse.json({ address }, { status: 201 });
}
