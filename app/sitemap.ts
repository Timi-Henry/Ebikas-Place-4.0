import type { MetadataRoute } from "next";
import { primaryCategoryLinks } from "@/lib/business-info";
import { getSiteUrl } from "@/lib/server/env";
import { getProductsResult } from "@/lib/server/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const catalog = await getProductsResult({ includeSamples: false });
  const products = catalog.ok ? catalog.value : [];
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${siteUrl}/shop`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9
    }
  ];

  const categoryRoutes: MetadataRoute.Sitemap = primaryCategoryLinks.map((link) => ({
    url: `${siteUrl}${link.href}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/products/${product.id}`,
    lastModified: product.createdAt ? new Date(product.createdAt) : now,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
