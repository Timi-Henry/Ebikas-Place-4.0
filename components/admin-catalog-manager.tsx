"use client";

import { Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import type { CatalogTaxonomy, CatalogTaxonomyKind } from "@/lib/types";

const labels: Record<CatalogTaxonomyKind, string> = {
  department: "Department",
  family: "Category",
  "product-type": "Product type",
  audience: "Audience"
};

export function AdminCatalogManager({ initialCatalog }: { initialCatalog: CatalogTaxonomy }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [kind, setKind] = useState<CatalogTaxonomyKind>("product-type");
  const [label, setLabel] = useState("");
  const [departmentId, setDepartmentId] = useState(initialCatalog.departments[0]?.id || "");
  const [familyId, setFamilyId] = useState(initialCatalog.families[0]?.id || "");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [message, setMessage] = useState("");
  const families = catalog.families.filter((item) => item.departmentId === departmentId);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parentId = kind === "family" ? departmentId : kind === "product-type" ? familyId : undefined;
    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/catalog-taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, label, parentId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus("error");
      setMessage(data.error || "Catalog entry could not be created.");
      return;
    }
    setCatalog(data.taxonomy);
    setLabel("");
    setStatus("done");
    setMessage(`${labels[kind]} added. It is now available in the product editor.`);
  }

  return (
    <div className="admin-catalog-manager">
      <section className="admin-catalog-create" aria-labelledby="catalog-create-title">
        <div>
          <span className="eyebrow">Create reusable entry</span>
          <h2 id="catalog-create-title">Extend your catalog safely</h2>
          <p>Names are normalized once and duplicate entries are blocked to keep filtering consistent.</p>
        </div>
        <form onSubmit={addEntry}>
          <label>
            Entry type
            <select value={kind} onChange={(event) => setKind(event.target.value as CatalogTaxonomyKind)}>
              <option value="department">Department</option>
              <option value="family">Category</option>
              <option value="product-type">Product type</option>
              <option value="audience">Audience</option>
            </select>
          </label>
          {kind === "family" || kind === "product-type" ? (
            <label>
              Department
              <select
                value={departmentId}
                onChange={(event) => {
                  const nextDepartment = event.target.value;
                  setDepartmentId(nextDepartment);
                  setFamilyId(catalog.families.find((item) => item.departmentId === nextDepartment)?.id || "");
                }}
              >
                {catalog.departments.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
          ) : null}
          {kind === "product-type" ? (
            <label>
              Category
              <select value={familyId} onChange={(event) => setFamilyId(event.target.value)}>
                {families.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            {labels[kind]} name
            <input value={label} onChange={(event) => setLabel(event.target.value)} required minLength={2} maxLength={60} placeholder="Enter a clear customer-facing name" />
          </label>
          <button className="primary-button" type="submit" disabled={status === "saving" || !label.trim()}>
            <Plus size={17} /> {status === "saving" ? "Adding..." : `Add ${labels[kind].toLowerCase()}`}
          </button>
          {message ? <p className={status === "error" ? "notice admin-catalog-error" : "notice"} role="status">{message}</p> : null}
        </form>
      </section>

      <section className="admin-catalog-overview" aria-labelledby="catalog-overview-title">
        <div><span className="eyebrow">Current structure</span><h2 id="catalog-overview-title">Catalog map</h2></div>
        <div className="admin-catalog-tree">
          {catalog.departments.map((department) => (
            <article key={department.id}>
              <header><strong>{department.label}</strong><small>{department.source === "admin" ? "Custom" : "Default"}</small></header>
              {catalog.families.filter((item) => item.departmentId === department.id).map((family) => (
                <div key={family.id}>
                  <b>{family.label}</b>
                  <p>{catalog.productTypes.filter((item) => item.familyId === family.id).map((item) => item.label).join(", ") || "No product types yet"}</p>
                </div>
              ))}
            </article>
          ))}
          <article>
            <header><strong>Audiences</strong><small>{catalog.audiences.length} entries</small></header>
            <p>{catalog.audiences.map((item) => item.label).join(", ")}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
