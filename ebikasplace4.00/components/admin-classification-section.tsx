"use client";

import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatTaxonomyLabel,
  getCatalogAudience,
  getCatalogDepartment,
  getCatalogFamily,
  getCatalogProductType
} from "@/lib/product-taxonomy";
import type { CatalogTaxonomy, CatalogTaxonomyKind, CatalogTaxonomyOption, ProductTaxonomy } from "@/lib/types";

function label(option: CatalogTaxonomyOption | undefined, fallback: string) {
  return option?.label || formatTaxonomyLabel(fallback);
}

function selectOption(catalog: CatalogTaxonomy, value: ProductTaxonomy, kind: CatalogTaxonomyKind, id: string) {
  if (kind === "department") {
    const family = catalog.families.find((item) => item.departmentId === id);
    const type = family ? catalog.productTypes.find((item) => item.familyId === family.id) : undefined;
    return { ...value, departmentId: id, familyId: family?.id || "", productTypeId: type?.id || "" };
  }
  if (kind === "family") {
    return { ...value, familyId: id, productTypeId: catalog.productTypes.find((item) => item.familyId === id)?.id || "" };
  }
  if (kind === "product-type") return { ...value, productTypeId: id };
  return value.audienceIds.includes(id) ? value : { ...value, audienceIds: [...value.audienceIds, id] };
}

export function AdminClassificationSection({
  catalog,
  taxonomy,
  onCatalogChange,
  onChange,
  saleActive,
  featured,
  bestSeller
}: {
  catalog: CatalogTaxonomy;
  taxonomy: ProductTaxonomy;
  onCatalogChange: (value: CatalogTaxonomy) => void;
  onChange: (value: ProductTaxonomy) => void;
  saleActive: boolean;
  featured: boolean;
  bestSeller: boolean;
}) {
  const [customKind, setCustomKind] = useState<CatalogTaxonomyKind | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customStatus, setCustomStatus] = useState<"idle" | "saving" | "error">("idle");
  const [customMessage, setCustomMessage] = useState("");
  const families = useMemo(() => catalog.families.filter((item) => item.departmentId === taxonomy.departmentId), [catalog.families, taxonomy.departmentId]);
  const productTypes = useMemo(() => catalog.productTypes.filter((item) => item.familyId === taxonomy.familyId), [catalog.productTypes, taxonomy.familyId]);
  const audienceLabels = taxonomy.audienceIds.map((id) => label(getCatalogAudience(catalog, id), id));
  const complete = Boolean(taxonomy.departmentId && taxonomy.familyId && taxonomy.productTypeId && taxonomy.audienceIds.length);

  function beginCustom(kind: CatalogTaxonomyKind) {
    setCustomKind(kind);
    setCustomLabel("");
    setCustomStatus("idle");
    setCustomMessage("");
  }

  function closeCustom() {
    setCustomKind(null);
    setCustomLabel("");
    setCustomStatus("idle");
    setCustomMessage("");
  }

  async function saveCustom() {
    const value = customLabel.trim();
    if (!customKind || !value) return;
    const parentId = customKind === "family" ? taxonomy.departmentId : customKind === "product-type" ? taxonomy.familyId : undefined;
    if ((customKind === "family" || customKind === "product-type") && !parentId) {
      setCustomStatus("error");
      setCustomMessage("Choose the parent classification first.");
      return;
    }
    setCustomStatus("saving");
    setCustomMessage("");
    const response = await fetch("/api/catalog-taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: customKind, label: value, parentId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCustomStatus("error");
      setCustomMessage(data.error || "This catalog entry could not be created.");
      return;
    }
    const nextCatalog = data.taxonomy as CatalogTaxonomy;
    const option = data.option as CatalogTaxonomyOption;
    onCatalogChange(nextCatalog);
    onChange(selectOption(nextCatalog, taxonomy, customKind, option.id));
    closeCustom();
  }

  const departmentLabel = label(getCatalogDepartment(catalog, taxonomy.departmentId), taxonomy.departmentId);
  const familyLabel = label(getCatalogFamily(catalog, taxonomy.familyId), taxonomy.familyId);
  const typeLabel = label(getCatalogProductType(catalog, taxonomy.productTypeId), taxonomy.productTypeId);
  const customTitle = customKind === "department" ? "Add department" : customKind === "family" ? "Add category" : customKind === "product-type" ? "Add product type" : "Add audience";

  return (
    <section className="admin-form-section admin-classification-section wide" aria-labelledby="classification-heading">
      <div className="admin-form-section-head">
        <span>02</span>
        <div><h2 id="classification-heading">Classification</h2><p>Classify the item once. Matching storefront views are generated automatically.</p></div>
      </div>
      <div className="admin-classification-grid">
        <div className="admin-taxonomy-field">
          <label htmlFor="product-department">Department</label>
          <div className="admin-taxonomy-control">
            <select id="product-department" value={taxonomy.departmentId} onChange={(event) => onChange(selectOption(catalog, taxonomy, "department", event.target.value))} required>
              {catalog.departments.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
            <button type="button" onClick={() => beginCustom("department")}><Plus size={16} /> Add</button>
          </div>
        </div>
        <div className="admin-taxonomy-field">
          <label htmlFor="product-family">Category</label>
          <div className="admin-taxonomy-control">
            <select id="product-family" value={taxonomy.familyId} onChange={(event) => onChange(selectOption(catalog, taxonomy, "family", event.target.value))} required>
              {!families.length ? <option value="">Add a category first</option> : null}
              {families.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
            <button type="button" onClick={() => beginCustom("family")}><Plus size={16} /> Add</button>
          </div>
        </div>
        <div className="admin-taxonomy-field">
          <label htmlFor="product-type">Product type</label>
          <div className="admin-taxonomy-control">
            <select id="product-type" value={taxonomy.productTypeId} onChange={(event) => onChange(selectOption(catalog, taxonomy, "product-type", event.target.value))} required disabled={!taxonomy.familyId}>
              {!productTypes.length ? <option value="">Add a product type first</option> : null}
              {productTypes.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
            <button type="button" onClick={() => beginCustom("product-type")} disabled={!taxonomy.familyId}><Plus size={16} /> Add</button>
          </div>
        </div>
        <fieldset className="admin-audience-picker">
          <legend>Audience</legend>
          <div>
            {catalog.audiences.map((item) => {
              const active = taxonomy.audienceIds.includes(item.id);
              return (
                <label className={active ? "active" : ""} key={item.id}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onChange({
                      ...taxonomy,
                      audienceIds: active ? taxonomy.audienceIds.filter((id) => id !== item.id) : [...taxonomy.audienceIds, item.id]
                    })}
                  />
                  <span>{active ? <Check size={14} /> : null}{item.label}</span>
                </label>
              );
            })}
            <button className="admin-add-audience" type="button" onClick={() => beginCustom("audience")}><Plus size={15} /> Add audience</button>
          </div>
          <small>Select every audience this product suits. Choose Unisex when appropriate.</small>
        </fieldset>
        {customKind ? (
          <div className="admin-custom-taxonomy" role="group" aria-label={customTitle}>
            <div><strong>{customTitle}</strong><small>It will be reusable throughout the admin catalog.</small></div>
            <label>
              Name
              <input
                autoFocus
                maxLength={60}
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveCustom();
                  }
                  if (event.key === "Escape") closeCustom();
                }}
                aria-invalid={customStatus === "error"}
              />
            </label>
            <div className="admin-custom-taxonomy-actions">
              <button className="primary-button" type="button" onClick={() => void saveCustom()} disabled={!customLabel.trim() || customStatus === "saving"}>
                {customStatus === "saving" ? "Saving..." : "Save"}
              </button>
              <button className="secondary-button" type="button" onClick={closeCustom}><X size={16} /> Cancel</button>
            </div>
            {customMessage ? <p role="alert">{customMessage}</p> : null}
          </div>
        ) : null}
        <aside className="admin-placement-preview" aria-live="polite">
          <span>Storefront placement</span>
          {complete ? (
            <>
              <strong>{departmentLabel} / {familyLabel} / {typeLabel}</strong>
              <p>{audienceLabels.join(", ")} / {familyLabel} / {typeLabel}, plus the main {familyLabel} catalog.</p>
              <div>
                <b>New arrivals</b>
                {saleActive ? <b>Sale</b> : null}
                {featured ? <b>Featured</b> : null}
                {bestSeller ? <b>Best seller</b> : null}
              </div>
            </>
          ) : <p>Choose a complete classification and at least one audience to preview placement.</p>}
        </aside>
      </div>
    </section>
  );
}
