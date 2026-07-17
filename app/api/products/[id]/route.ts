import { NextResponse } from "next/server";
import { collectImagePublicIds, deleteImages } from "@/lib/server/cloudinary";
import { requireAdmin } from "@/lib/server/auth";
import { deleteProduct, getProductById, updateProduct } from "@/lib/server/products";
import { productSchema } from "@/lib/validation";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product details." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await getProductById(id);
  if (!existing) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const imageUrls = parsed.data.imageUrls?.length ? parsed.data.imageUrls : parsed.data.imageUrl ? [parsed.data.imageUrl] : [];
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "At least one product image is required." }, { status: 400 });
  }

  try {
    const product = await updateProduct(id, {
      ...parsed.data,
      imageUrl: imageUrls[0],
      imageUrls,
      imagePublicId: parsed.data.imagePublicId || parsed.data.imagePublicIds?.[0],
      imagePublicIds: parsed.data.imagePublicIds || []
    });

    const nextPublicIds = new Set(collectImagePublicIds(product));
    const existingPublicIds = collectImagePublicIds(existing);
    const removedPublicIds = existingPublicIds.filter((publicId) => !nextPublicIds.has(publicId));
    const cloudinaryCleanup = await deleteImages(removedPublicIds);

    return NextResponse.json({ product, cloudinaryCleanup });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product could not be updated.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const { id } = await params;

  try {
    const product = await deleteProduct(id);
    const cloudinaryCleanup = await deleteImages(collectImagePublicIds(product));
    return NextResponse.json({ ok: true, cloudinaryCleanup });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product could not be deleted.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
