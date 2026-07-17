import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminCatalogManager } from "@/components/admin-catalog-manager";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { CartProvider } from "@/components/cart-provider";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getCatalogTaxonomy } from "@/lib/server/catalog-taxonomy";

export default async function AdminCatalogPage() {
  const admin = await requireAdmin();
  const catalog = await getCatalogTaxonomy();

  return (
    <CartProvider>
      <main className="shell storefront-shell admin-shell" id="main-content">
        <Nav />
        <div className="admin-main admin-main-wide">
          <section className="admin-card">
            <span className="eyebrow">Admin</span>
            <h1 className="admin-page-title">Catalog setup</h1>
            <p className="admin-page-intro">
              Manage reusable departments, categories, product types, and audiences without creating duplicate product records.
            </p>
            <AdminSectionNav active="catalog" />
            {admin.ok ? <AdminCatalogManager initialCatalog={catalog} /> : <AdminAccessDenied message={admin.message} />}
          </section>
        </div>
      </main>
    </CartProvider>
  );
}
