import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeText, parseDeliveryDetails } from "@/lib/address-validation";
import { deleteUserAddress, updateUserAddress } from "@/lib/server/addresses";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const details = parseDeliveryDetails(body);
  if (!details) {
    return NextResponse.json({ error: "Enter valid Lagos address and contact details." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const address = await updateUserAddress(user.id, id, details, normalizeText(body?.label) || undefined);
    return NextResponse.json({ address });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Address could not be updated.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteUserAddress(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Address could not be deleted.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
