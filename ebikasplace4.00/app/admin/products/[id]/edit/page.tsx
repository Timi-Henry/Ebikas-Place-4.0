import { notFound } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminProductForm } from "@/components/admin-product-form";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { CartProvider } from "@/components/cart-provider";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";
import { getProductById } from "@/lib/server/products";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin.ok) {
    return (
      <CartProvider>
        <main className="shell storefront-shell admin-shell" id="main-content">
          <Nav />
          <div className="admin-main">
            <section className="admin-card">
              <span className="eyebrow">Admin</span>
              <h1 className="admin-page-title">Update product</h1>
              <AdminSectionNav active="manage" />
              <AdminAccessDenied message={admin.message} />
            </section>
          </div>
        </main>
      </CartProvider>
    );
  }

  const [product, catalog] = await Promise.all([getProductById(id), getCatalogTaxonomy()]);

  if (!product) {
    notFound();
  }

  return (
    <CartProvider>
      <main className="shell storefront-shell admin-shell" id="main-content">
        <Nav />
        <div className="admin-main">
          <section className="admin-card">
            <span className="eyebrow">Admin</span>
            <h1 className="admin-page-title">Update product</h1>
            <p className="admin-page-intro">
              Change product details, sizes, categories, or replace images. New Cloudinary images replace the old attached images.
            </p>
            <AdminSectionNav active="manage" />
            <AdminProductForm product={product} catalog={catalog} mode="update" />
          </section>
        </div>
      </main>
    </CartProvider>
  );
}
