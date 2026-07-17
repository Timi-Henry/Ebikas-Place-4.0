import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { createCatalogTaxonomyOption, getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";
import type { CatalogTaxonomyKind } from "@/lib/types";

const allowedKinds = new Set<CatalogTaxonomyKind>(["department", "family", "product-type", "audience"]);

export async function GET() {
  return NextResponse.json(
    { taxonomy: await getCatalogTaxonomy() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const body = await request.json().catch(() => null) as { kind?: CatalogTaxonomyKind; label?: string; parentId?: string } | null;
  if (!body?.kind || !allowedKinds.has(body.kind) || typeof body.label !== "string") {
    return NextResponse.json({ error: "Invalid catalog entry." }, { status: 400 });
  }
  try {
    const option = await createCatalogTaxonomyOption({
      kind: body.kind,
      label: body.label,
      parentId: body.parentId
    });
    const taxonomy = await getCatalogTaxonomy();
    return NextResponse.json({ option, taxonomy }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalog entry could not be created." },
      { status: 400 }
    );
  }
}
