import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { createCatalogTaxonomyOption, getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import { getSiteUrl } from "@/lib/server/env";
import { catalogTaxonomyMutationSchema } from "@/lib/validation";

const catalogInputMessages = new Set([
  "Enter a clear catalog name between 2 and 60 characters.",
  "That catalog entry already exists.",
  "Choose a valid department before adding a category.",
  "Choose a valid category before adding a product type."
]);

export async function GET() {
  return NextResponse.json(
    { taxonomy: await getCatalogTaxonomy() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const context = createRequestContext(request);

  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });

    const admin = await requireAdmin();
    if (!admin.ok) {
      return withRequestId(
        NextResponse.json({ error: admin.message }, { status: admin.status }),
        context.requestId
      );
    }

    await enforceMutationRateLimit({
      request,
      scope: "catalog-taxonomy.create",
      limit: 30,
      windowMs: 10 * 60 * 1000,
      userId: admin.user.id
    });

    const body = await parseBoundedJson(request, catalogTaxonomyMutationSchema, { maxBytes: 2048 });
    const option = await createCatalogTaxonomyOption({
      kind: body.kind,
      label: body.label,
      parentId: body.parentId
    });
    const taxonomy = await getCatalogTaxonomy();
    return withRequestId(NextResponse.json({ option, taxonomy }, { status: 201 }), context.requestId);
  } catch (error) {
    if (error instanceof Error && catalogInputMessages.has(error.message)) {
      return withRequestId(NextResponse.json({ error: error.message }, { status: 400 }), context.requestId);
    }
    return safeErrorResponse(error, { ...context, event: "catalog-taxonomy.create.failed" });
  }
}
