import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminInventory } from "@/components/admin-inventory";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { CatalogUnavailableNotice } from "@/components/catalog-unavailable-notice";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getProductsResult } from "@/lib/server/products";

export default async function ManageProductsPage() {
  const admin = await requireAdmin();
  const catalog = admin.ok ? await getProductsResult({ includeSamples: false }) : null;

  return (
    <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
        <Nav />
        <div className="admin-main admin-main-wide">
          <section className="admin-card">
            <span className="eyebrow">Admin</span>
            <h1 className="admin-page-title">Manage products</h1>
            <p className="admin-page-intro">
              Review inventory, filter by category, sort products, and open product records for updates or deletion.
            </p>
            <AdminSectionNav active="manage" />
            {admin.ok ? (
              catalog?.ok ? <AdminInventory products={catalog.value} /> : <CatalogUnavailableNotice />
            ) : (
              <AdminAccessDenied message={admin.message} />
            )}
          </section>
        </div>
    </main>
  );
}
