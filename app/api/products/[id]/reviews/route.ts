import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { addProductReview } from "@/lib/server/products";
import { reviewSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to leave a rating." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
  }

  const { id } = await params;

  try {
    const summary = await addProductReview(id, user.id, parsed.data.rating);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save rating.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
