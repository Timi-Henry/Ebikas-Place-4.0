import { NextResponse } from "next/server";
import { createProduct, getProducts } from "@/lib/server/products";
import { requireAdmin } from "@/lib/server/auth";
import { productSchema } from "@/lib/validation";

export async function GET() {
  const products = await getProducts();
  return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product details." }, { status: 400 });
  }

  const imageUrls = parsed.data.imageUrls?.length ? parsed.data.imageUrls : parsed.data.imageUrl ? [parsed.data.imageUrl] : [];
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "Invalid product details." }, { status: 400 });
  }

  const product = await createProduct({
    ...parsed.data,
    imageUrl: imageUrls[0],
    imageUrls,
    imagePublicId: parsed.data.imagePublicId,
    imagePublicIds: parsed.data.imagePublicIds || []
  });

  return NextResponse.json({ product }, { status: 201 });
}
