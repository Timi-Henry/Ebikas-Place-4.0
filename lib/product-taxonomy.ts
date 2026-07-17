import type { CatalogTaxonomy, CatalogTaxonomyOption, Product, ProductTaxonomy } from "@/lib/types";

export type ProductCategoryOption = {
  label: string;
  value: string;
  subcategories: string[];
};

export type ProductTaxonomyMembership = {
  category: string;
  subcategory: string;
};

export const productCategories: ProductCategoryOption[] = [
  {
    label: "Men's clothing",
    value: "mens-clothing",
    subcategories: ["shirts", "pants", "shorts", "native-wear", "outerwear", "shoes"]
  },
  {
    label: "Women's clothing",
    value: "womens-clothing",
    subcategories: ["tops", "dresses", "skirts", "pants", "shorts", "shoes"]
  },
  {
    label: "Children's clothing",
    value: "childrens-clothing",
    subcategories: ["shirts", "pants", "shorts", "dresses", "sets", "shoes"]
  },
  {
    label: "Shoes",
    value: "shoes",
    subcategories: ["mens-shoes", "womens-shoes", "kids-shoes", "sandals", "sneakers", "heels"]
  },
  {
    label: "Accessories",
    value: "accessories",
    subcategories: ["jewelry", "watches", "belts", "scarves", "sunglasses"]
  },
  {
    label: "Bags",
    value: "bags",
    subcategories: ["handbags", "totes", "backpacks", "clutches", "crossbody-bags"]
  }
];

const legacyCategoryMap: Record<string, string> = {
  clothing: "womens-clothing",
  shoes: "shoes",
  "new-arrivals": "womens-clothing"
};

const legacySubcategoryMap: Record<string, string> = {
  clothing: "dresses",
  shoes: "shoes",
  accessories: "jewelry",
  "new-arrivals": "tops"
};

const taxonomyProjections: Record<string, Record<string, ProductTaxonomyMembership>> = {
  "mens-clothing": {
    shoes: { category: "shoes", subcategory: "mens-shoes" }
  },
  "womens-clothing": {
    shoes: { category: "shoes", subcategory: "womens-shoes" }
  },
  "childrens-clothing": {
    shoes: { category: "shoes", subcategory: "kids-shoes" }
  }
};

export function normalizeTaxonomyValue(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeProductCategory(category?: string) {
  const normalized = normalizeTaxonomyValue(category || "");
  return legacyCategoryMap[normalized] || normalized || productCategories[0].value;
}

export function normalizeProductSubcategory(category?: string, subcategory?: string) {
  const normalizedCategory = normalizeTaxonomyValue(category || "");
  const normalizedSubcategory = normalizeTaxonomyValue(subcategory || "");
  return normalizedSubcategory || legacySubcategoryMap[normalizedCategory] || productCategories[0].subcategories[0];
}

export function getProductTaxonomyMemberships(category?: string, subcategory?: string) {
  const normalizedCategory = normalizeProductCategory(category);
  const normalizedSubcategory = normalizeProductSubcategory(normalizedCategory, subcategory);
  const primary = { category: normalizedCategory, subcategory: normalizedSubcategory };
  const projected = taxonomyProjections[normalizedCategory]?.[normalizedSubcategory];
  return projected ? [primary, projected] : [primary];
}

export function matchesProductTaxonomy(
  productCategory?: string,
  productSubcategory?: string,
  categoryFilter = "all",
  subcategoryFilter = "all"
) {
  const normalizedCategoryFilter = normalizeTaxonomyValue(categoryFilter) || "all";
  const normalizedSubcategoryFilter = normalizeTaxonomyValue(subcategoryFilter) || "all";
  return getProductTaxonomyMemberships(productCategory, productSubcategory).some(
    (membership) =>
      (normalizedCategoryFilter === "all" || membership.category === normalizedCategoryFilter) &&
      (normalizedSubcategoryFilter === "all" || membership.subcategory === normalizedSubcategoryFilter)
  );
}

export function formatTaxonomyLabel(value?: string) {
  if (!value) return "";
  const normalized = normalizeTaxonomyValue(value);
  const category = productCategories.find((item) => item.value === normalized);
  if (category) return category.label;
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDefaultSubcategory(category?: string) {
  const normalizedCategory = normalizeProductCategory(category);
  return productCategories.find((item) => item.value === normalizedCategory)?.subcategories[0] || productCategories[0].subcategories[0];
}

const department = (id: string, label: string) => ({ id, label, kind: "department" as const, source: "default" as const });
const family = (id: string, label: string, departmentId: string) => ({
  id,
  label,
  departmentId,
  kind: "family" as const,
  source: "default" as const
});
const productType = (id: string, label: string, familyId: string) => ({
  id,
  label,
  familyId,
  kind: "product-type" as const,
  source: "default" as const
});
const audience = (id: string, label: string) => ({ id, label, kind: "audience" as const, source: "default" as const });

export const defaultCatalogTaxonomy: CatalogTaxonomy = {
  departments: [
    department("fashion", "Fashion"),
    department("electronics", "Electronics")
  ],
  families: [
    family("clothing", "Clothing", "fashion"),
    family("footwear", "Shoes", "fashion"),
    family("bags", "Bags", "fashion"),
    family("accessories", "Accessories", "fashion"),
    family("cameras-and-photography", "Cameras & Photography", "electronics")
  ],
  productTypes: [
    productType("shirts", "Shirts", "clothing"),
    productType("t-shirts", "T-Shirts", "clothing"),
    productType("polos", "Polos", "clothing"),
    productType("tops", "Tops", "clothing"),
    productType("blouses", "Blouses", "clothing"),
    productType("crop-tops", "Crop tops", "clothing"),
    productType("dresses", "Dresses", "clothing"),
    productType("skirts", "Skirts", "clothing"),
    productType("pants", "Trousers & pants", "clothing"),
    productType("jeans", "Jeans", "clothing"),
    productType("shorts", "Shorts", "clothing"),
    productType("sets", "Sets", "clothing"),
    productType("native-wear", "Native wear", "clothing"),
    productType("outerwear", "Outerwear", "clothing"),
    productType("sneakers", "Sneakers", "footwear"),
    productType("sandals", "Sandals", "footwear"),
    productType("heels", "Heels", "footwear"),
    productType("boots", "Boots", "footwear"),
    productType("loafers", "Loafers", "footwear"),
    productType("mens-shoes", "Men's shoes", "footwear"),
    productType("womens-shoes", "Women's shoes", "footwear"),
    productType("kids-shoes", "Kids' shoes", "footwear"),
    productType("handbags", "Handbags", "bags"),
    productType("totes", "Totes", "bags"),
    productType("backpacks", "Backpacks", "bags"),
    productType("clutches", "Clutches", "bags"),
    productType("crossbody-bags", "Crossbody bags", "bags"),
    productType("jewelry", "Jewelry", "accessories"),
    productType("watches", "Watches", "accessories"),
    productType("belts", "Belts", "accessories"),
    productType("scarves", "Scarves", "accessories"),
    productType("sunglasses", "Sunglasses", "accessories"),
    productType("mirrorless-cameras", "Mirrorless cameras", "cameras-and-photography"),
    productType("dslr-cameras", "DSLR cameras", "cameras-and-photography"),
    productType("compact-cameras", "Compact cameras", "cameras-and-photography"),
    productType("camera-lenses", "Camera lenses", "cameras-and-photography"),
    productType("camera-accessories", "Camera accessories", "cameras-and-photography")
  ],
  audiences: [
    audience("men", "Men"),
    audience("women", "Women"),
    audience("boys", "Boys"),
    audience("girls", "Girls"),
    audience("baby", "Baby"),
    audience("unisex", "Unisex")
  ]
};

function cleanAttributes(attributes: ProductTaxonomy["attributes"] | undefined) {
  return (attributes || [])
    .map((attribute) => ({
      name: attribute.name.trim(),
      values: [...new Set(attribute.values.map((value) => value.trim()).filter(Boolean))]
    }))
    .filter((attribute) => attribute.name && attribute.values.length);
}

export function hydrateProductTaxonomy(source: {
  category?: string;
  subcategory?: string;
  taxonomy?: ProductTaxonomy;
}): ProductTaxonomy {
  if (source.taxonomy?.departmentId && source.taxonomy.familyId && source.taxonomy.productTypeId) {
    return {
      version: 1,
      departmentId: normalizeTaxonomyValue(source.taxonomy.departmentId),
      familyId: normalizeTaxonomyValue(source.taxonomy.familyId),
      productTypeId: normalizeTaxonomyValue(source.taxonomy.productTypeId),
      audienceIds: [...new Set(source.taxonomy.audienceIds.map(normalizeTaxonomyValue).filter(Boolean))],
      attributes: cleanAttributes(source.taxonomy.attributes)
    };
  }

  const category = normalizeTaxonomyValue(source.category || "");
  const subtype = normalizeTaxonomyValue(source.subcategory || "") || "unclassified";
  if (category === "mens-clothing") return { version: 1, departmentId: "fashion", familyId: "clothing", productTypeId: subtype, audienceIds: ["men"], attributes: [] };
  if (category === "womens-clothing" || category === "clothing" || category === "new-arrivals") {
    return { version: 1, departmentId: "fashion", familyId: "clothing", productTypeId: subtype, audienceIds: ["women"], attributes: [] };
  }
  if (category === "childrens-clothing") {
    return { version: 1, departmentId: "fashion", familyId: "clothing", productTypeId: subtype, audienceIds: ["boys", "girls"], attributes: [] };
  }
  if (category === "shoes" || category === "footwear") {
    const audienceIds = subtype === "mens-shoes" ? ["men"] : subtype === "womens-shoes" ? ["women"] : subtype === "kids-shoes" ? ["boys", "girls"] : ["unisex"];
    return { version: 1, departmentId: "fashion", familyId: "footwear", productTypeId: subtype, audienceIds, attributes: [] };
  }
  if (category === "bags" || category === "accessories") {
    return { version: 1, departmentId: "fashion", familyId: category, productTypeId: subtype, audienceIds: ["unisex"], attributes: [] };
  }
  return {
    version: 1,
    departmentId: category ? "other" : "unclassified",
    familyId: category || "unclassified",
    productTypeId: subtype,
    audienceIds: [],
    attributes: []
  };
}

export function deriveLegacyTaxonomy(taxonomy: ProductTaxonomy) {
  return { category: taxonomy.familyId, subcategory: taxonomy.productTypeId };
}

export function getCatalogDepartment(catalog: CatalogTaxonomy, id?: string) {
  return catalog.departments.find((item) => item.id === id);
}

export function getCatalogFamily(catalog: CatalogTaxonomy, id?: string) {
  return catalog.families.find((item) => item.id === id);
}

export function getCatalogProductType(catalog: CatalogTaxonomy, id?: string) {
  return catalog.productTypes.find((item) => item.id === id);
}

export function getCatalogAudience(catalog: CatalogTaxonomy, id?: string) {
  return catalog.audiences.find((item) => item.id === id);
}

export function getCatalogProductTypePath(catalog: CatalogTaxonomy, productTypeId: string) {
  const type = getCatalogProductType(catalog, productTypeId);
  const parentFamily = type ? getCatalogFamily(catalog, type.familyId) : undefined;
  const parentDepartment = parentFamily ? getCatalogDepartment(catalog, parentFamily.departmentId) : undefined;
  return [parentDepartment?.label, parentFamily?.label, type?.label].filter(Boolean).join(" / ");
}

export type ProductFacetFilters = {
  departmentId?: string;
  familyId?: string;
  productTypeId?: string;
  audienceId?: string;
};

export function matchesProductFacets(product: Pick<Product, "category" | "subcategory" | "taxonomy">, filters: ProductFacetFilters) {
  const taxonomy = hydrateProductTaxonomy(product);
  if (filters.departmentId && filters.departmentId !== "all" && taxonomy.departmentId !== filters.departmentId) return false;
  if (filters.familyId && filters.familyId !== "all" && taxonomy.familyId !== filters.familyId) return false;
  if (filters.productTypeId && filters.productTypeId !== "all" && taxonomy.productTypeId !== filters.productTypeId) return false;
  if (filters.audienceId && filters.audienceId !== "all") {
    const accepted = filters.audienceId === "kids" ? ["boys", "girls", "baby", "unisex"] : [filters.audienceId, "unisex"];
    if (!taxonomy.audienceIds.some((id) => accepted.includes(id))) return false;
  }
  return true;
}

export function mergeCatalogTaxonomies(base: CatalogTaxonomy, additions: CatalogTaxonomyOption[]): CatalogTaxonomy {
  const unique = <T extends CatalogTaxonomyOption>(items: T[]) =>
    [...new Map(items.map((item) => [item.id, item])).values()];
  return {
    departments: unique([...base.departments, ...additions.filter((item) => item.kind === "department")]),
    families: unique([...base.families, ...additions.filter((item) => item.kind === "family")]),
    productTypes: unique([...base.productTypes, ...additions.filter((item) => item.kind === "product-type")]),
    audiences: unique([...base.audiences, ...additions.filter((item) => item.kind === "audience")])
  };
}
