import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminProductForm } from "@/components/admin-product-form";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const catalog = admin.ok ? await getCatalogTaxonomy() : null;

  return (
    <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
        <Nav />
        <div className="admin-main">
          <section className="admin-card">
            <span className="eyebrow">Admin</span>
            <h1 className="admin-page-title">Add product</h1>
            <p className="admin-page-intro">
              Upload a product image to Cloudinary or paste a hosted image URL. Product writes are checked again on the server.
            </p>
            <AdminSectionNav active="add" />
            {admin.ok && catalog ? <AdminProductForm catalog={catalog} /> : <AdminAccessDenied message={admin.message} />}
          </section>
        </div>
    </main>
  );
}
