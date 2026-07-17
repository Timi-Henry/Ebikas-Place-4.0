import { z } from "zod";

const taxonomyId = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/);
const productTaxonomySchema = z.object({
  version: z.literal(1),
  departmentId: taxonomyId,
  familyId: taxonomyId,
  productTypeId: taxonomyId,
  audienceIds: z.array(taxonomyId).min(1).max(12),
  attributes: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    values: z.array(z.string().trim().min(1).max(80)).min(1).max(30)
  })).max(24).default([])
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(700),
  category: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9 -]*$/i),
  subcategory: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9 -]*$/i),
  taxonomy: productTaxonomySchema.optional(),
  price: z.coerce.number().positive().max(100000000),
  originalPrice: z.coerce.number().positive().max(100000000).optional().or(z.literal("").transform(() => undefined)),
  salePrice: z.coerce.number().positive().max(100000000).optional().or(z.literal("").transform(() => undefined)),
  stock: z.coerce.number().int().min(0).max(100000),
  featured: z.coerce.boolean().default(false),
  badges: z.array(z.enum(["new", "best-seller"])).max(2).default([]),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(8).optional(),
  imagePublicId: z.string().trim().max(220).optional(),
  imagePublicIds: z.array(z.string().trim().max(220)).max(8).optional(),
  sizes: z.array(z.enum(["S", "M", "L", "XL", "XXL"])).max(5).default([])
}).superRefine(({ price, salePrice }, context) => {
  if (salePrice !== undefined && salePrice >= price) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salePrice"],
      message: "Discounted price must be lower than the normal price."
    });
  }
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5)
});

export const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const maxUploadBytes = 5 * 1024 * 1024;
