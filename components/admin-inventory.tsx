"use client";

import { ArrowUpDown, Eye, Pencil, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminToast, type AdminToastData, buildCloudinaryCleanupToast, retryCloudinaryCleanup } from "@/components/admin-toast";
import { CopyTextButton } from "@/components/copy-text-button";
import {
  defaultCatalogTaxonomy,
  formatTaxonomyLabel,
  getCatalogAudience,
  getCatalogFamily,
  getCatalogProductType,
  hydrateProductTaxonomy
} from "@/lib/product-taxonomy";
import { formatPrice, getCurrentPrice } from "@/lib/pricing";
import type { Product } from "@/lib/types";

type SortKey = "newest" | "name" | "category" | "price-low" | "price-high" | "stock" | "rating";
const productsPerPage = 50;

function productClassification(product: Product) {
  const taxonomy = hydrateProductTaxonomy(product);
  const family = getCatalogFamily(defaultCatalogTaxonomy, taxonomy.familyId)?.label || formatTaxonomyLabel(taxonomy.familyId);
  const type = getCatalogProductType(defaultCatalogTaxonomy, taxonomy.productTypeId)?.label || formatTaxonomyLabel(taxonomy.productTypeId);
  const audiences = taxonomy.audienceIds
    .map((id) => getCatalogAudience(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id))
    .join(", ");
  return `${family} / ${type}${audiences ? ` � ${audiences}` : ""}`;
}

export function AdminInventory({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<AdminToastData | null>(null);
  const [retryingCleanup, setRetryingCleanup] = useState(false);
  const taxonomyByProduct = useMemo(
    () => new Map(items.map((product) => [product.id, hydrateProductTaxonomy(product)])),
    [items]
  );
  const categories = useMemo(
    () => [
      "all",
      ...new Set([
        ...defaultCatalogTaxonomy.families.map((item) => item.id),
        ...items.map((product) => taxonomyByProduct.get(product.id)?.familyId || "other")
      ])
    ],
    [items, taxonomyByProduct]
  );

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = items.filter((product) => {
      const taxonomy = taxonomyByProduct.get(product.id) || hydrateProductTaxonomy(product);
      const searchableTaxonomy = [
        taxonomy.departmentId,
        taxonomy.familyId,
        taxonomy.productTypeId,
        ...taxonomy.audienceIds,
        ...taxonomy.attributes.flatMap((attribute) => [attribute.name, ...attribute.values])
      ].join(" ").toLowerCase();
      const matchesCategory = category === "all" || taxonomy.familyId === category;
      const matchesQuery =
        !normalizedQuery ||
        product.id.toLowerCase().includes(normalizedQuery) ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.subcategory.toLowerCase().includes(normalizedQuery) ||
        searchableTaxonomy.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "category") {
        const aFamily = taxonomyByProduct.get(a.id)?.familyId || a.category;
        const bFamily = taxonomyByProduct.get(b.id)?.familyId || b.category;
        return aFamily.localeCompare(bFamily);
      }
      if (sort === "price-low") return getCurrentPrice(a) - getCurrentPrice(b);
      if (sort === "price-high") return getCurrentPrice(b) - getCurrentPrice(a);
      if (sort === "stock") return b.stock - a.stock;
      if (sort === "rating") return (b.ratingAverage || 0) - (a.ratingAverage || 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [category, items, query, sort, taxonomyByProduct]);

  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / productsPerPage));
  const currentPage = Math.min(page, pageCount);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * productsPerPage;
    return visibleProducts.slice(start, start + productsPerPage);
  }, [currentPage, visibleProducts]);

  useEffect(() => {
    setPage(1);
  }, [category, query, sort]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  async function retryCleanup(publicIds: string[]) {
    setRetryingCleanup(true);
    try {
      const cleanup = await retryCloudinaryCleanup(publicIds);
      const cleanupToast = buildCloudinaryCleanupToast(cleanup, "Cloudinary retry");
      setToast(
        cleanupToast || {
          tone: "success",
          title: "Cloudinary cleanup finished",
          message: "The selected Cloudinary images were deleted or were already missing."
        }
      );
    } catch (error) {
      setToast({
        tone: "error",
        title: "Cloudinary retry failed",
        message: error instanceof Error ? error.message : "Cloudinary cleanup retry failed."
      });
    } finally {
      setRetryingCleanup(false);
    }
  }

  async function deleteItem(product: Product) {
    const confirmed = window.confirm(`Delete ${product.name}? This removes it from MongoDB and deletes Cloudinary images attached to it.`);
    if (!confirmed) return;

    setDeletingId(product.id);
    setMessage("Deleting product...");
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: product.version ?? 1 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Product could not be deleted.");
        return;
      }

      setItems((current) => current.filter((item) => item.id !== product.id));
      setMessage("Product deleted.");
      setToast(
        buildCloudinaryCleanupToast(data.cloudinaryCleanup, `Deleting ${product.name}`) || {
          tone: "success",
          title: "Product deleted",
          message: "The product was removed from MongoDB and attached Cloudinary images were queued for cleanup."
        }
      );
    } catch {
      setMessage("The product could not be deleted because the network request failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="admin-inventory">
      <AdminToast
        toast={toast}
        retrying={retryingCleanup}
        onClose={() => setToast(null)}
        onRetry={toast?.retryPublicIds ? () => retryCleanup(toast.retryPublicIds || []) : undefined}
      />
      <div className="admin-section-head">
        <div>
          <span className="eyebrow">Inventory</span>
          <h2>Manage products</h2>
          <p>
            {visibleProducts.length} of {items.length} product{items.length === 1 ? "" : "s"} shown
            {visibleProducts.length > productsPerPage ? ` - Page ${currentPage} of ${pageCount}` : ""}
          </p>
        </div>
        <div className="admin-sort-controls">
          <label>
            Search
            <span className="admin-search-control">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, or product ID" />
            </span>
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option value={item} key={item}>{item === "all" ? "All categories" : formatTaxonomyLabel(item)}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="newest">Newest</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="stock">Stock</option>
              <option value="rating">Rating</option>
            </select>
          </label>
        </div>
      </div>
      <div className="admin-product-list">
        {paginatedProducts.map((product) => (
          <article className="admin-product-row" key={product.id}>
            <Image src={product.imageUrl} alt="" width={76} height={92} sizes="76px" />
            <div>
              <strong>{product.name}</strong>
              <span>{productClassification(product)} � {formatPrice(getCurrentPrice(product))} � {product.stock} in stock</span>
              <small>
                {product.sizes?.length ? `Sizes: ${product.sizes.join(", ")}` : "No sizes"} - {(product.ratingAverage || 0).toFixed(1)} rating
                {!/^[a-f\d]{24}$/i.test(product.id) ? " - Demo product" : ""}
              </small>
              <CopyTextButton
                className="copy-text-button copy-product-id-button"
                value={product.id}
                label={`Product ID: ${product.id}`}
                copiedLabel="Product ID"
              />
            </div>
            <div className="admin-row-actions">
              <Link className="secondary-button" href={`/products/${product.id}`}>
                <Eye size={16} />
                View
              </Link>
              {/^[a-f\d]{24}$/i.test(product.id) ? (
                <>
                  <Link className="secondary-button" href={`/admin/products/${product.id}/edit`}>
                    <Pencil size={16} />
                    Update
                  </Link>
                  <button className="secondary-button danger-button" type="button" onClick={() => deleteItem(product)} disabled={deletingId === product.id}>
                    <Trash2 size={16} />
                    {deletingId === product.id ? "Deleting" : "Delete"}
                  </button>
                </>
              ) : (
                <span className="demo-pill">Connect MongoDB to manage</span>
              )}
            </div>
          </article>
        ))}
      </div>
      {visibleProducts.length === 0 ? (
        <p className="notice"><ArrowUpDown size={16} /> No products match this filter.</p>
      ) : null}
      {pageCount > 1 ? (
        <nav className="admin-pagination" aria-label="Inventory pages">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
            Previous
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              className={pageNumber === currentPage ? "active" : ""}
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
              aria-current={pageNumber === currentPage ? "page" : undefined}
            >
              {pageNumber}
            </button>
          ))}
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>
            Next
          </button>
        </nav>
      ) : null}
      {message ? <p className="notice">{message}</p> : null}
    </section>
  );
}
