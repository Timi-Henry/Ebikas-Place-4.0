export type ProductSize = "S" | "M" | "L" | "XL" | "XXL";
export type ProductBadge = "new" | "best-seller";

// Structured catalog facets used by products and admin-created catalog entries.
export type ProductTaxonomyAttribute = {
  name: string;
  values: string[];
};

export type ProductTaxonomy = {
  version: 1;
  departmentId: string;
  familyId: string;
  productTypeId: string;
  audienceIds: string[];
  attributes: ProductTaxonomyAttribute[];
};

export type CatalogTaxonomyKind = "department" | "family" | "product-type" | "audience";
export type CatalogTaxonomySource = "default" | "admin";

type CatalogTaxonomyOptionBase = {
  id: string;
  label: string;
  source: CatalogTaxonomySource;
};

export type CatalogDepartmentOption = CatalogTaxonomyOptionBase & {
  kind: "department";
};

export type CatalogFamilyOption = CatalogTaxonomyOptionBase & {
  kind: "family";
  departmentId: string;
};

export type CatalogProductTypeOption = CatalogTaxonomyOptionBase & {
  kind: "product-type";
  familyId: string;
};

export type CatalogAudienceOption = CatalogTaxonomyOptionBase & {
  kind: "audience";
};

export type CatalogTaxonomyOption =
  | CatalogDepartmentOption
  | CatalogFamilyOption
  | CatalogProductTypeOption
  | CatalogAudienceOption;

export type CatalogTaxonomy = {
  departments: CatalogDepartmentOption[];
  families: CatalogFamilyOption[];
  productTypes: CatalogProductTypeOption[];
  audiences: CatalogAudienceOption[];
};

export type Product = {
  id: string;
  version?: number;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  taxonomy?: ProductTaxonomy;
  price: number;
  originalPrice?: number;
  salePrice?: number;
  imageUrl: string;
  imageUrls?: string[];
  imagePublicId?: string;
  imagePublicIds?: string[];
  sizes?: ProductSize[];
  stock: number;
  featured: boolean;
  badges?: ProductBadge[];
  ratingAverage?: number;
  reviewCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CloudinaryCleanupIssue = {
  publicId: string;
  attemptedPublicIds: string[];
  attempts: number;
  message: string;
  suggestion: string;
  retryable: boolean;
};

export type CloudinaryCleanupRecovery = {
  publicId: string;
  usedPublicId: string;
  message: string;
};

export type CloudinaryCleanupResult = {
  requested: string[];
  deleted: string[];
  alreadyMissing: string[];
  recovered: CloudinaryCleanupRecovery[];
  failed: CloudinaryCleanupIssue[];
};

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  lineTotal: number;
  quantity: number;
  imageUrl: string;
  selectedSize?: ProductSize;
};

export type CustomerContact = {
  fullName: string;
  email: string;
  phone: string;
  whatsapp: string;
};

export type FulfillmentMethod = "store-delivery" | "customer-rider";
export type OrderStatus = "placed" | "confirmed" | "rejected" | "out-for-delivery" | "delivered" | "cancelled";

export type DeliveryDetails = CustomerContact & {
  addressLine: string;
  street: string;
  area: string;
  state: "Lagos";
  address: string;
};

export type SavedAddress = DeliveryDetails & {
  id: string;
  userId: string;
  label?: string;
  createdAt: string;
  updatedAt?: string;
};

export type Order = {
  id: string;
  version: number;
  userId: string;
  customerEmail?: string;
  customerName?: string;
  customerContact: CustomerContact;
  fulfillmentMethod: FulfillmentMethod;
  deliveryDetails?: DeliveryDetails;
  pickupAddress?: string;
  items: OrderItem[];
  subtotal: number;
  currency: "NGN";
  status: OrderStatus;
  rejectionReason?: string;
  createdAt: string;
  statusUpdatedAt?: string;
};
