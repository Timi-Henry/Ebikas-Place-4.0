import Link from "next/link";

const sections = [
  { value: "add", label: "Add product", href: "/admin" },
  { value: "manage", label: "Manage products", href: "/admin/products" },
  { value: "catalog", label: "Catalog setup", href: "/admin/catalog" },
  { value: "orders", label: "Manage orders", href: "/admin/orders" }
] as const;

export function AdminSectionNav({ active }: { active: typeof sections[number]["value"] }) {
  return (
    <nav className="admin-section-nav" aria-label="Admin sections">
      {sections.map((section) => (
        <Link
          className={active === section.value ? "active" : ""}
          href={section.href}
          key={section.value}
          aria-current={active === section.value ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
