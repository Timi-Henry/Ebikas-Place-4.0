import "server-only";

import { ObjectId } from "mongodb";
import { defaultCatalogTaxonomy, mergeCatalogTaxonomies, normalizeTaxonomyValue } from "@/lib/product-taxonomy";
import { getDb } from "@/lib/server/mongodb";
import type { CatalogTaxonomy, CatalogTaxonomyKind, CatalogTaxonomyOption } from "@/lib/types";

type CatalogDocument = CatalogTaxonomyOption & {
  _id: ObjectId;
  createdAt: Date;
};

function withoutMongoFields(document: CatalogDocument): CatalogTaxonomyOption {
  const { _id: _ignoredId, createdAt: _ignoredDate, ...option } = document;
  return option;
}

export async function getCatalogTaxonomy(): Promise<CatalogTaxonomy> {
  try {
    const db = await getDb();
    const documents = await db.collection<CatalogDocument>("catalog_taxonomy").find({}).sort({ createdAt: 1 }).toArray();
    return mergeCatalogTaxonomies(defaultCatalogTaxonomy, documents.map(withoutMongoFields));
  } catch {
    return defaultCatalogTaxonomy;
  }
}

export async function createCatalogTaxonomyOption(input: {
  kind: CatalogTaxonomyKind;
  label: string;
  parentId?: string;
}) {
  const label = input.label.trim();
  const id = normalizeTaxonomyValue(label);
  if (label.length < 2 || label.length > 60 || !id) {
    throw new Error("Enter a clear catalog name between 2 and 60 characters.");
  }

  const catalog = await getCatalogTaxonomy();
  const everyOption = [
    ...catalog.departments,
    ...catalog.families,
    ...catalog.productTypes,
    ...catalog.audiences
  ];
  if (everyOption.some((option) => option.id === id)) {
    throw new Error("That catalog entry already exists.");
  }
  if (input.kind === "family" && !catalog.departments.some((item) => item.id === input.parentId)) {
    throw new Error("Choose a valid department before adding a category.");
  }
  if (input.kind === "product-type" && !catalog.families.some((item) => item.id === input.parentId)) {
    throw new Error("Choose a valid category before adding a product type.");
  }

  const base = { id, label, source: "admin" as const };
  const option: CatalogTaxonomyOption =
    input.kind === "department"
      ? { ...base, kind: "department" }
      : input.kind === "family"
        ? { ...base, kind: "family", departmentId: input.parentId as string }
        : input.kind === "product-type"
          ? { ...base, kind: "product-type", familyId: input.parentId as string }
          : { ...base, kind: "audience" };

  const db = await getDb();
  const collection = db.collection("catalog_taxonomy");
  await collection.createIndex({ id: 1 }, { unique: true });
  try {
    await collection.insertOne({ ...option, createdAt: new Date() });
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      throw new Error("That catalog entry already exists.");
    }
    throw error;
  }
  return option;
}
