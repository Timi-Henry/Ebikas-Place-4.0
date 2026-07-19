import { z } from "zod";

export const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i);
const taxonomyId = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/);
const boundedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const cloudinaryPublicId = z.string().trim().min(1).max(220).refine(
  (value) => /^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(value) && !value.split("/").some((part) => !part || part === "." || part === ".."),
  "Invalid Cloudinary public ID."
);
const productMediaStageId = z.string().regex(/^[a-f0-9]{40}$/);
const allowedImageHosts = new Set(["res.cloudinary.com", "images.unsplash.com", "fakestoreapi.com"]);
const productImageUrl = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedImageHosts.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use an approved HTTPS image host.");

const productTaxonomySchema = z.object({
  version: z.literal(1),
  departmentId: taxonomyId,
  familyId: taxonomyId,
  productTypeId: taxonomyId,
  audienceIds: z.array(taxonomyId).min(1).max(12),
  attributes: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    values: z.array(z.string().trim().min(1).max(80)).min(1).max(30)
  }).strict()).max(24).default([])
}).strict();

const productInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(700),
  category: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9 -]*$/i),
  subcategory: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9 -]*$/i),
  taxonomy: productTaxonomySchema.optional(),
  price: z.coerce.number().int().positive().max(100000000),
  originalPrice: z.coerce.number().int().positive().max(100000000).optional().or(z.literal("").transform(() => undefined)),
  salePrice: z.coerce.number().int().positive().max(100000000).optional().or(z.literal("").transform(() => undefined)),
  stock: z.coerce.number().int().min(0).max(100000),
  featured: z.coerce.boolean().default(false),
  badges: z.array(z.enum(["new", "best-seller"])).max(2).default([]),
  imageUrl: productImageUrl.optional(),
  imageUrls: z.array(productImageUrl).max(8).optional(),
  imagePublicId: cloudinaryPublicId.optional(),
  imagePublicIds: z.array(cloudinaryPublicId).max(8).optional(),
  imageStageIds: z.array(productMediaStageId).max(8).optional(),
  sizes: z.array(z.enum(["S", "M", "L", "XL", "XXL"])).max(5).default([])
}).strict();

export const productSchema = productInputSchema.superRefine(({ price, salePrice }, context) => {
  if (salePrice !== undefined && salePrice >= price) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salePrice"],
      message: "Discounted price must be lower than the normal price."
    });
  }
});

export const productUpdateSchema = productInputSchema.extend({
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
}).superRefine(({ price, salePrice }, context) => {
  if (salePrice !== undefined && salePrice >= price) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salePrice"],
      message: "Discounted price must be lower than the normal price."
    });
  }
});

export const productDeleteSchema = z.object({
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
}).strict();

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5)
}).strict();

export const addressMutationSchema = z.object({
  fullName: boundedText(1, 120),
  email: z.string().trim().toLowerCase().min(3).max(254).email(),
  phone: boundedText(8, 24),
  whatsapp: boundedText(8, 24),
  addressLine: boundedText(1, 160),
  street: boundedText(1, 160),
  area: boundedText(1, 120),
  state: z.literal("Lagos").optional(),
  address: z.string().trim().max(500).optional(),
  label: z.string().trim().max(80).optional()
}).strict();

export const orderActionSchema = z.object({
  action: z.enum(["cancel", "accept", "confirm", "reject", "out-for-delivery", "delivered"]),
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  rejectionReason: z.string().trim().max(500).optional()
}).strict();

export const catalogTaxonomyMutationSchema = z.object({
  kind: z.enum(["department", "family", "product-type", "audience"]),
  label: boundedText(2, 60),
  parentId: taxonomyId.optional()
}).strict();

export const cloudinaryCleanupSchema = z.object({
  publicIds: z.array(cloudinaryPublicId).min(1).max(25)
}).strict().transform(({ publicIds }) => ({ publicIds: [...new Set(publicIds)] }));

/** Checkout performs the authoritative deep parse; this only bounds and requires a JSON object envelope. */
export const checkoutEnvelopeSchema = z.record(z.string().min(1).max(100), z.unknown());

export const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const maxUploadBytes = 5 * 1024 * 1024;
