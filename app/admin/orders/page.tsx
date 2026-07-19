import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminOrdersManager } from "@/components/admin-orders-manager";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { Nav } from "@/components/nav";
import { requireAdmin } from "@/lib/server/auth";
import { getAllOrders } from "@/lib/server/orders";

export default async function AdminOrdersPage() {
  const admin = await requireAdmin();
  const orders = admin.ok ? await getAllOrders() : [];

  return (
    <main className="shell storefront-shell admin-shell" id="main-content" tabIndex={-1}>
        <Nav />
        <div className="admin-main admin-main-wide">
          <section className="admin-card">
            <span className="eyebrow">Admin</span>
            <h1 className="admin-page-title">All orders</h1>
            <p className="admin-page-intro">
              View orders placed by every signed-in customer.
            </p>
            <AdminSectionNav active="orders" />
            {admin.ok ? (
              <AdminOrdersManager orders={orders} />
            ) : (
              <AdminAccessDenied message={admin.message} />
            )}
          </section>
        </div>
    </main>
  );
}
