import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  return NextResponse.json(
    { isAdmin: admin.ok },
    { headers: { "Cache-Control": "no-store" } }
  );
}

