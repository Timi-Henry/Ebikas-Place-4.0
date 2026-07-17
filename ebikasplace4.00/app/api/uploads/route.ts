import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { uploadImage } from "@/lib/server/cloudinary";
import { allowedImageTypes, maxUploadBytes } from "@/lib/validation";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (!allowedImageTypes.has(file.type)) {
    return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, or AVIF image." }, { status: 400 });
  }

  if (file.size > maxUploadBytes) {
    return NextResponse.json({ error: "Images must be 5MB or smaller." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await uploadImage(buffer);
  return NextResponse.json({ image });
}
