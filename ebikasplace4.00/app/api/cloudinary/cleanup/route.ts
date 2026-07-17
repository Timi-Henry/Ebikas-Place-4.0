import { NextResponse } from "next/server";
import { deleteImages } from "@/lib/server/cloudinary";
import { requireAdmin } from "@/lib/server/auth";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const publicIds = Array.isArray(body?.publicIds)
    ? body.publicIds
        .map((publicId: unknown) => (typeof publicId === "string" ? publicId.trim() : ""))
        .filter(Boolean)
        .slice(0, 25)
    : [];

  if (publicIds.length === 0) {
    return NextResponse.json({ error: "At least one Cloudinary public ID is required." }, { status: 400 });
  }

  const cloudinaryCleanup = await deleteImages(publicIds);
  return NextResponse.json({ cloudinaryCleanup });
}
