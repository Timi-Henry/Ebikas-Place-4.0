import type { MetadataRoute } from "next";
import { primaryCategoryLinks } from "@/lib/business-info";
import { getProducts } from "@/lib/server/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ebikas-place.example.com";
  const products = await getProducts({ includeSamples: false });
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
    },
    {
      url: `${siteUrl}/addresses`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3
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
