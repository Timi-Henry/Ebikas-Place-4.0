import { notFound } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminProductForm } from "@/components/admin-product-form";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { CatalogUnavailableNotice } from "@/components/catalog-unavailable-notice";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";
import { getProductByIdResult } from "@/lib/server/products";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin.ok) {
    return (
      <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
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
    );
  }

  const [productResult, catalog] = await Promise.all([
    getProductByIdResult(id, { includeSamples: false }),
    getCatalogTaxonomy()
  ]);

  if (!productResult.ok) {
    return (
      <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
          <Nav />
          <div className="admin-main">
            <section className="admin-card">
              <span className="eyebrow">Admin</span>
              <h1 className="admin-page-title">Update product</h1>
              <AdminSectionNav active="manage" />
              <CatalogUnavailableNotice />
            </section>
          </div>
      </main>
    );
  }

  const product = productResult.value;

  if (!product) {
    notFound();
  }

  return (
    <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
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
  );
}
