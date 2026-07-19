import "server-only";
import { revalidatePath } from "next/cache";

export function revalidateCatalogProducts(productIds: readonly string[] = []) {
  try {
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/admin");
    revalidatePath("/admin/products");
    revalidatePath("/sitemap.xml");
    for (const productId of new Set(productIds)) {
      revalidatePath(`/products/${productId}`);
      revalidatePath(`/admin/products/${productId}/edit`);
    }
  } catch (error) {
    // A committed mutation must not be reported as failed solely because a cache refresh failed.
    console.error("[catalog-cache] Path revalidation failed.", {
      errorType: error instanceof Error ? error.name : typeof error
    });
  }
}

export function revalidateCatalog(productId?: string) {
  revalidateCatalogProducts(productId ? [productId] : []);
}
