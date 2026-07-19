"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Heart, Pause, Play, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import {
  defaultCatalogTaxonomy,
  formatTaxonomyLabel,
  getCatalogAudience,
  getCatalogDepartment,
  getCatalogFamily,
  getCatalogProductType,
  hydrateProductTaxonomy,
  matchesProductFacets,
  normalizeTaxonomyValue
} from "@/lib/product-taxonomy";
import { formatPrice, getCompareAtPrice, getCurrentPrice, getDiscountPercent } from "@/lib/pricing";
import type { Product, ProductSize } from "@/lib/types";

type SortKey = "popular" | "newest" | "rating" | "price-low" | "price-high" | "name";
type StockFilter = "all" | "in-stock" | "featured" | "new" | "best-seller" | "discounted" | "has-sizes";
type PriceFilter = "all" | "under-20000" | "20000-50000" | "over-50000";
type SizeFilter = "all" | ProductSize;

function productFacetSummary(product: Product) {
  const taxonomy = hydrateProductTaxonomy(product);
  const typeLabel = getCatalogProductType(defaultCatalogTaxonomy, taxonomy.productTypeId)?.label || formatTaxonomyLabel(taxonomy.productTypeId);
  const audienceLabel = taxonomy.audienceIds
    .map((id) => getCatalogAudience(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id))
    .join(", ");
  return audienceLabel ? `${audienceLabel} / ${typeLabel}` : typeLabel;
}

export function ProductBrowser({
  products,
  title = "Featured Products",
  eyebrow = "Our Collection",
  initialCategory = "all",
  initialSubcategory = "all",
  initialDepartment = "all",
  initialAudience: requestedAudience = "all",
  initialSearch = "",
  initialStockFilter = "all",
  initialPriceFilter = "all",
  initialSizeFilter = "all",
  initialSort = "popular",
  fullCatalog = false,
  showControls = true,
  productLimit,
  ctaHref,
  ctaLabel = "All products",
  secondaryCtaHref,
  secondaryCtaLabel,
  autoScroll = false,
  sectionId = "shop",
  compact = false,
  emptyMessage
}: {
  products: Product[];
  title?: string;
  eyebrow?: string;
  initialCategory?: string;
  initialSubcategory?: string;
  initialDepartment?: string;
  initialAudience?: string;
  initialSearch?: string;
  initialStockFilter?: StockFilter;
  initialPriceFilter?: PriceFilter;
  initialSizeFilter?: SizeFilter;
  initialSort?: SortKey;
  fullCatalog?: boolean;
  showControls?: boolean;
  productLimit?: number;
  ctaHref?: string;
  ctaLabel?: string;
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  autoScroll?: boolean;
  sectionId?: string;
  compact?: boolean;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselStep, setCarouselStep] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(1);
  const [carouselInteracting, setCarouselInteracting] = useState(false);
  const [carouselManuallyPaused, setCarouselManuallyPaused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const filterDialogRef = useOverlayDialog<HTMLElement>(filtersOpen, () => setFiltersOpen(false));
  const productTaxonomies = useMemo(() => products.map(hydrateProductTaxonomy), [products]);
  const legacyCategory = normalizeTaxonomyValue(initialCategory);
  const initialFamily = legacyCategory === "mens-clothing" || legacyCategory === "womens-clothing" || legacyCategory === "childrens-clothing"
    ? "clothing"
    : legacyCategory === "shoes" ? "footwear" : legacyCategory;
  const initialAudience = requestedAudience !== "all" ? normalizeTaxonomyValue(requestedAudience) : legacyCategory === "mens-clothing" ? "men" : legacyCategory === "womens-clothing" ? "women" : legacyCategory === "childrens-clothing" ? "kids" : "all";
  const [departmentFilter, setDepartmentFilter] = useState(normalizeTaxonomyValue(initialDepartment) || "all");
  const [filter, setFilter] = useState(initialFamily || "all");
  const [subcategoryFilter, setSubcategoryFilter] = useState(initialSubcategory !== "all" ? normalizeTaxonomyValue(initialSubcategory) : "all");
  const [audienceFilter, setAudienceFilter] = useState(initialAudience);
  const availableDepartments = useMemo(() => {
    const ids = [...new Set(productTaxonomies.map((item) => item.departmentId).filter(Boolean))];
    return [{ label: "All departments", value: "all" }, ...ids.map((id) => ({
      label: getCatalogDepartment(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id),
      value: id
    }))];
  }, [productTaxonomies]);
  const categorySuggestions = useMemo(() => {
    const ids = [...new Set(productTaxonomies.map((item) => item.familyId).filter(Boolean))];
    return ids.map((id) => ({
      label: getCatalogFamily(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id),
      value: id
    }));
  }, [productTaxonomies]);
  const availableCategories = useMemo(() => [
    { label: "All categories", value: "all" },
    ...categorySuggestions.filter(({ value }) => departmentFilter === "all" || productTaxonomies.some((item) => item.departmentId === departmentFilter && item.familyId === value))
  ], [categorySuggestions, departmentFilter, productTaxonomies]);
  const [search, setSearch] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialStockFilter);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>(initialPriceFilter);
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>(initialSizeFilter);
  const { addItem, isWishlisted, toggleWishlist } = useCart();

  useEffect(() => {
    if (!fullCatalog) return;
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const setParam = (name: string, value: string, fallback = "all") => {
        if (!value || value === fallback) params.delete(name);
        else params.set(name, value);
      };
      setParam("department", departmentFilter);
      setParam("family", filter);
      setParam("type", subcategoryFilter);
      setParam("audience", audienceFilter);
      setParam("filter", stockFilter);
      setParam("price", priceFilter);
      setParam("size", sizeFilter);
      setParam("sort", sort, "popular");
      const normalizedSearch = search.trim();
      if (normalizedSearch) params.set("search", normalizedSearch);
      else params.delete("search");
      params.delete("category");
      params.delete("subcategory");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [audienceFilter, departmentFilter, filter, fullCatalog, priceFilter, search, sizeFilter, sort, stockFilter, subcategoryFilter]);
  const availableSubcategories = useMemo(() => {
    const ids = [...new Set(productTaxonomies.filter((item) => filter === "all" || item.familyId === filter).map((item) => item.productTypeId))];
    return [{ label: "All product types", value: "all" }, ...ids.map((id) => ({
      label: getCatalogProductType(defaultCatalogTaxonomy, id)?.label || formatTaxonomyLabel(id),
      value: id
    }))];
  }, [filter, productTaxonomies]);
  const availableAudiences = useMemo(() => [
    { label: "All audiences", value: "all" },
    ...defaultCatalogTaxonomy.audiences.map((item) => ({ label: item.label, value: item.id })),
    { label: "Kids", value: "kids" }
  ], []);
  const visibleProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    if (!showControls) {
      return products;
    }

    const filtered = products.filter((product) => {
      const productTaxonomy = hydrateProductTaxonomy(product);
      const matchesTaxonomy = matchesProductFacets(product, {
        departmentId: departmentFilter,
        familyId: filter,
        productTypeId: subcategoryFilter,
        audienceId: audienceFilter
      });
      const taxonomySearch = [
        productTaxonomy.departmentId,
        productTaxonomy.familyId,
        productTaxonomy.productTypeId,
        ...productTaxonomy.audienceIds,
        ...productTaxonomy.attributes.flatMap((attribute) => [attribute.name, ...attribute.values])
      ].join(" ").toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        taxonomySearch.includes(normalizedSearch);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in-stock" && product.stock > 0) ||
        (stockFilter === "featured" && product.featured) ||
        (stockFilter === "new" && product.badges?.includes("new")) ||
        (stockFilter === "best-seller" && product.badges?.includes("best-seller")) ||
        (stockFilter === "discounted" && getDiscountPercent(product) > 0) ||
        (stockFilter === "has-sizes" && Boolean(product.sizes?.length));
      const currentPrice = getCurrentPrice(product);
      const matchesPrice =
        priceFilter === "all" ||
        (priceFilter === "under-20000" && currentPrice < 20000) ||
        (priceFilter === "20000-50000" && currentPrice >= 20000 && currentPrice <= 50000) ||
        (priceFilter === "over-50000" && currentPrice > 50000);
      const matchesSize = sizeFilter === "all" || product.sizes?.includes(sizeFilter);
      return matchesTaxonomy && matchesSearch && matchesStock && matchesPrice && matchesSize;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "newest") return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sort === "rating") return (b.ratingAverage || 0) - (a.ratingAverage || 0);
      if (sort === "price-low") return getCurrentPrice(a) - getCurrentPrice(b);
      if (sort === "price-high") return getCurrentPrice(b) - getCurrentPrice(a);
      if (sort === "name") return a.name.localeCompare(b.name);
      const bPopular = (b.reviewCount || 0) * 8 + (b.ratingAverage || 0) + (b.featured ? 20 : 0);
      const aPopular = (a.reviewCount || 0) * 8 + (a.ratingAverage || 0) + (a.featured ? 20 : 0);
      return bPopular - aPopular;
    });
  }, [audienceFilter, deferredSearch, departmentFilter, filter, priceFilter, products, showControls, sizeFilter, sort, stockFilter, subcategoryFilter]);

  const searchSuggestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!showControls || normalizedSearch.length < 2) return [];

    return products
      .filter((product) => {
        const taxonomy = hydrateProductTaxonomy(product);
        const facetText = [taxonomy.familyId, taxonomy.productTypeId, ...taxonomy.audienceIds, ...taxonomy.attributes.flatMap((item) => [item.name, ...item.values])].join(" ").toLowerCase();
        return product.name.toLowerCase().includes(normalizedSearch) || facetText.includes(normalizedSearch);
      })
      .slice(0, 5);
  }, [products, search, showControls]);

  function resetFilters() {
    setDepartmentFilter("all");
    setFilter("all");
    setSubcategoryFilter("all");
    setAudienceFilter("all");
    setStockFilter("all");
    setPriceFilter("all");
    setSizeFilter("all");
    setSearch("");
  }

  function browseSuggestedCategory(category: string) {
    resetFilters();
    setFilter(category);
  }

  const activeFilters = useMemo(() => {
    const filters = [
      departmentFilter !== "all" ? { label: formatTaxonomyLabel(departmentFilter), action: () => setDepartmentFilter("all") } : null,
      filter !== "all" ? { label: formatTaxonomyLabel(filter), action: () => setFilter("all") } : null,
      subcategoryFilter !== "all" ? { label: formatTaxonomyLabel(subcategoryFilter), action: () => setSubcategoryFilter("all") } : null,
      audienceFilter !== "all" ? { label: formatTaxonomyLabel(audienceFilter), action: () => setAudienceFilter("all") } : null,
      stockFilter !== "all" ? { label: formatTaxonomyLabel(stockFilter), action: () => setStockFilter("all") } : null,
      priceFilter !== "all" ? { label: priceFilter === "under-20000" ? "Under NGN 20k" : priceFilter === "20000-50000" ? "NGN 20k - NGN 50k" : "Over NGN 50k", action: () => setPriceFilter("all") } : null,
      sizeFilter !== "all" ? { label: `Size ${sizeFilter}`, action: () => setSizeFilter("all") } : null,
      search.trim() ? { label: `Search: ${search.trim()}`, action: () => setSearch("") } : null
    ];

    return filters.filter((item): item is { label: string; action: () => void } => Boolean(item));
  }, [audienceFilter, departmentFilter, filter, priceFilter, search, sizeFilter, stockFilter, subcategoryFilter]);

  const displayedProducts = productLimit ? visibleProducts.slice(0, productLimit) : visibleProducts;

  const maxCarouselIndex = Math.max(0, displayedProducts.length - cardsPerView);
  const canCarousel = autoScroll && displayedProducts.length > cardsPerView;
  const carouselPaused = carouselInteracting || carouselManuallyPaused;

  useEffect(() => {
    if (!autoScroll) return;

    const measureCarousel = () => {
      const rail = railRef.current;
      const track = trackRef.current;
      const card = track?.querySelector<HTMLElement>(".product-card");
      if (!rail || !track || !card) return;

      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
      const step = card.offsetWidth + gap;
      const nextCardsPerView = step > 0 ? Math.max(1, Math.floor((rail.clientWidth + gap) / step)) : 1;

      setCarouselStep(step);
      setCardsPerView(nextCardsPerView);
      setCarouselIndex((current) => Math.min(current, Math.max(0, displayedProducts.length - nextCardsPerView)));
    };

    measureCarousel();
    const observer = new ResizeObserver(measureCarousel);
    if (railRef.current) observer.observe(railRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    window.addEventListener("resize", measureCarousel);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureCarousel);
    };
  }, [autoScroll, displayedProducts.length]);

  useEffect(() => {
    if (!canCarousel || carouselPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setCarouselIndex((current) => (current >= maxCarouselIndex ? 0 : current + 1));
    }, 3600);

    return () => window.clearInterval(interval);
  }, [canCarousel, carouselPaused, maxCarouselIndex]);

  function moveCarousel(direction: -1 | 1) {
    setCarouselIndex((current) => {
      if (direction < 0) {
        return current <= 0 ? maxCarouselIndex : current - 1;
      }
      return current >= maxCarouselIndex ? 0 : current + 1;
    });
  }

  function productBadges(product: Product) {
    const badges = [
      product.stock > 0 && product.stock <= 3 ? { label: `Only ${product.stock} left`, tone: "stock" } : null,
      product.stock === 0 ? { label: "Sold out", tone: "sold" } : null,
      product.featured ? { label: "Featured", tone: "featured" } : null,
      product.badges?.includes("best-seller") ? { label: "Best seller", tone: "best-seller" } : null,
      product.badges?.includes("new") ? { label: "New", tone: "new" } : null
    ].filter((badge): badge is { label: string; tone: string } => Boolean(badge));
    return badges;
  }

  function renderProductCard(product: Product, index: number) {
    const currentPrice = getCurrentPrice(product);
    const compareAt = getCompareAtPrice(product);
    const discount = getDiscountPercent(product);
    const badges = productBadges(product);
    const imageBadges = badges.filter((badge) => badge.tone === "stock" || badge.tone === "sold");
    const merchandisingBadges = badges.filter((badge) => badge.tone !== "stock" && badge.tone !== "sold");
    const hasReviews = (product.reviewCount || 0) > 0;

    return (
      <article className="product-card reveal" key={product.id}>
        <Link className="product-link" href={`/products/${product.id}`}>
          <div className="product-image">
            {discount > 0 || imageBadges.length ? (
              <span className="product-label-rail" aria-label="Product highlights">
                {discount > 0 ? <span className="product-discount-ribbon">{discount}% Off</span> : null}
                {imageBadges.length ? (
                  <span className="product-badge-stack">
                    {imageBadges.map((badge) => (
                      <span className={`product-badge product-badge-${badge.tone}`} key={badge.label}>
                        {badge.label}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
            <Image
              className="product-primary-image"
              src={product.imageUrl}
              alt={product.name}
              fill
              priority={fullCatalog && index === 0}
              sizes={fullCatalog ? "(max-width: 760px) 50vw, (max-width: 1020px) 33vw, (max-width: 1240px) 25vw, 18vw" : "(max-width: 760px) 64vw, (max-width: 1020px) 25vw, (max-width: 1240px) 20vw, 17vw"}
            />
            <span className="product-view-link">View details <ArrowUpRight size={15} /></span>
          </div>
        </Link>
        <button
          className={`product-fav ${isWishlisted(product.id) ? "active" : ""}`}
          type="button"
          onClick={() => toggleWishlist(product)}
          aria-label={`${isWishlisted(product.id) ? "Remove" : "Favorite"} ${product.name}`}
        >
          <Heart size={16} fill={isWishlisted(product.id) ? "currentColor" : "none"} />
        </button>
        <div className="product-content">
          <div className="product-meta">
            <span>{productFacetSummary(product)}</span>
            <span className="product-stock-status">
              <span className={product.stock > 0 ? "stock-dot" : "stock-dot stock-dot-out"} />
              {product.stock > 0 ? "In stock" : "Unavailable"}
            </span>
          </div>
          <div className={`product-card-rating ${hasReviews ? "" : "product-card-rating-empty"}`}>
            <Star size={14} fill="currentColor" />
            {hasReviews ? (
              <>
                <span>{product.ratingAverage ? product.ratingAverage.toFixed(1) : "0.0"}</span>
                <small>({product.reviewCount || 0})</small>
              </>
            ) : (
              <span>No reviews yet</span>
            )}
          </div>
          <Link className="product-copy-link" href={`/products/${product.id}`}>
            <h3 className="product-title">{product.name}</h3>
          </Link>
          {merchandisingBadges.length ? (
            <div className="product-merchandising-tags" aria-label="Product labels">
              {merchandisingBadges.map((badge) => (
                <span className={`product-badge product-badge-${badge.tone}`} key={badge.label}>{badge.label}</span>
              ))}
            </div>
          ) : null}
          <div className="price-row">
            <span className="price-block">
              {compareAt ? <small>{formatPrice(compareAt)}</small> : null}
              <span className="price">{formatPrice(currentPrice)}</span>
            </span>
            <button
              className="add-to-cart-btn"
              type="button"
              onClick={() => {
                if (product.sizes?.length) {
                  router.push(`/products/${product.id}`);
                  return;
                }
                addItem(product);
              }}
              aria-label={product.sizes?.length ? `Choose a size for ${product.name}` : `Add ${product.name} to cart`}
            >
              <Plus size={18} />
              <span>{product.sizes?.length ? "Select size" : "Add to bag"}</span>
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section
      className={`${fullCatalog ? "section shop-catalog" : "section"}${filtersOpen ? " shop-catalog-filters-open" : ""}`}
      id={sectionId}
    >
      <div className="section-head">
        <div>
          <span className="eyebrow reveal">{eyebrow}</span>
          <h2 className="reveal">{title}</h2>
          {fullCatalog ? (
            <p className="catalog-count reveal" role="status" aria-live="polite" aria-atomic="true">
              Showing {visibleProducts.length} of {products.length} product{products.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {showControls ? (
          <div className="catalog-controls reveal">
            <div
              className="catalog-search-wrap"
              onFocus={() => setSearchFocused(true)}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setSearchFocused(false);
                }
              }}
            >
              <label className="product-search">
                <Search size={17} />
                <input
                  aria-label="Search catalog"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearchFocused(false);
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="Search products"
                />
              </label>
              {searchFocused && searchSuggestions.length > 0 ? (
                <div className="search-suggestions">
                  {searchSuggestions.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => {
                        setSearch(product.name);
                        setDepartmentFilter("all");
                        setFilter("all");
                        setSubcategoryFilter("all");
                        setAudienceFilter("all");
                        setSearchFocused(false);
                      }}
                    >
                      <Image src={product.imageUrl} alt="" width={40} height={48} sizes="40px" />
                      <span>
                        <strong>{product.name}</strong>
                        <small>{productFacetSummary(product)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {fullCatalog ? (
              <button
                aria-controls="catalog-filter-dialog"
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                className="catalog-filter-trigger"
                type="button"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={17} />
                Filters
                {activeFilters.length > 0 ? <span>{activeFilters.length}</span> : null}
              </button>
            ) : null}
            <label className="catalog-select catalog-sort-select">
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="popular">Most popular</option>
                <option value="newest">Newest</option>
                <option value="rating">Highest rated</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label className="catalog-select catalog-stock-select">
              Product filter
              <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)}>
                <option value="all">All items</option>
                <option value="in-stock">In stock</option>
                <option value="featured">Featured</option>
                <option value="new">New arrivals</option>
                <option value="best-seller">Best sellers</option>
                <option value="discounted">On sale</option>
                <option value="has-sizes">Size options</option>
              </select>
            </label>
            <label className="catalog-select catalog-price-select">
              Price
              <select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}>
                <option value="all">All prices</option>
                <option value="under-20000">Under NGN 20k</option>
                <option value="20000-50000">NGN 20k - NGN 50k</option>
                <option value="over-50000">Over NGN 50k</option>
              </select>
            </label>
            <label className="catalog-select catalog-size-select">
              Size
              <select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value as SizeFilter)}>
                <option value="all">All sizes</option>
                {(["S", "M", "L", "XL", "XXL"] as ProductSize[]).map((size) => <option value={size} key={size}>{size}</option>)}
              </select>
            </label>
            <label className="catalog-select">
              Department
              <select value={departmentFilter} onChange={(event) => {
                setDepartmentFilter(event.target.value);
                setFilter("all");
                setSubcategoryFilter("all");
              }}>
                {availableDepartments.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="catalog-select">
              Audience
              <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)}>
                {availableAudiences.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="catalog-select catalog-subcategory-select">
              Product type
              <select value={subcategoryFilter} onChange={(event) => setSubcategoryFilter(event.target.value)}>
                {availableSubcategories.map((item) => (
                  <option value={item.value} key={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {!fullCatalog ? <div className="filters" aria-label="Product categories">
              {availableCategories.map((item) => (
                <button
                  aria-pressed={filter === item.value}
                  className={`chip ${filter === item.value ? "active" : ""}`}
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setFilter(item.value);
                    setSubcategoryFilter("all");
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div> : null}
          </div>
        ) : null}
      </div>
      {fullCatalog ? (
        <div className="catalog-market-layout">
          {filtersOpen ? (
            <button className="catalog-sidebar-backdrop" type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          ) : null}
          <aside
            id="catalog-filter-dialog"
            ref={filterDialogRef}
            className={"catalog-sidebar " + (filtersOpen ? "catalog-sidebar-open" : "")}
            role={filtersOpen ? "dialog" : undefined}
            aria-modal={filtersOpen ? "true" : undefined}
            aria-label="Shop filters"
            tabIndex={filtersOpen ? -1 : undefined}
          >
            <div className="catalog-sidebar-head">
              <span>
                <SlidersHorizontal size={18} />
                <strong>Filter products</strong>
              </span>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" data-dialog-close><X size={18} /></button>
            </div>
            <div>
              <strong>Departments</strong>
              <div className="sidebar-filter-list">
                {availableDepartments.map((item) => (
                  <button
                    aria-pressed={departmentFilter === item.value}
                    className={departmentFilter === item.value ? "active" : ""}
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setDepartmentFilter(item.value);
                      setFilter("all");
                      setSubcategoryFilter("all");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Categories</strong>
              <div className="sidebar-filter-list">
                {availableCategories.map((item) => (
                  <button
                    aria-pressed={filter === item.value}
                    className={filter === item.value ? "active" : ""}
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setFilter(item.value);
                      setSubcategoryFilter("all");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Product types</strong>
              <div className="sidebar-filter-list">
                {availableSubcategories.map((item) => (
                  <button
                    aria-pressed={subcategoryFilter === item.value}
                    className={subcategoryFilter === item.value ? "active" : ""}
                    key={item.value}
                    type="button"
                    onClick={() => setSubcategoryFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Audience</strong>
              <div className="sidebar-filter-list">
                {availableAudiences.map((item) => (
                  <button
                    aria-pressed={audienceFilter === item.value}
                    className={audienceFilter === item.value ? "active" : ""}
                    key={item.value}
                    type="button"
                    onClick={() => setAudienceFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Quick filters</strong>
              <div className="sidebar-filter-grid">
                {[
                  ["in-stock", "In stock"],
                  ["discounted", "Sale"],
                  ["new", "New"],
                  ["best-seller", "Best seller"],
                  ["featured", "Featured"],
                  ["has-sizes", "Has sizes"]
                ].map(([value, label]) => (
                  <button
                    aria-pressed={stockFilter === value}
                    className={stockFilter === value ? "active" : ""}
                    key={value}
                    type="button"
                    onClick={() => setStockFilter(stockFilter === value ? "all" : value as StockFilter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Price range</strong>
              <div className="sidebar-filter-list">
                {([
                  ["all", "All prices"],
                  ["under-20000", "Under NGN 20k"],
                  ["20000-50000", "NGN 20k – 50k"],
                  ["over-50000", "Over NGN 50k"]
                ] as const).map(([value, label]) => (
                  <button
                    aria-pressed={priceFilter === value}
                    className={priceFilter === value ? "active" : ""}
                    key={value}
                    type="button"
                    onClick={() => setPriceFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Available size</strong>
              <div className="sidebar-size-grid">
                {(["all", "S", "M", "L", "XL", "XXL"] as SizeFilter[]).map((size) => (
                  <button
                    aria-pressed={sizeFilter === size}
                    className={sizeFilter === size ? "active" : ""}
                    key={size}
                    type="button"
                    onClick={() => setSizeFilter(size)}
                  >
                    {size === "all" ? "Any" : size}
                  </button>
                ))}
              </div>
            </div>
            <button className="catalog-sidebar-apply" type="button" onClick={() => setFiltersOpen(false)}>
              Show {visibleProducts.length} product{visibleProducts.length === 1 ? "" : "s"}
            </button>
          </aside>
          <div className="catalog-results">
            {activeFilters.length > 0 ? (
              <div className="active-filter-row" aria-label="Active filters">
                {activeFilters.map((item) => (
                  <button type="button" key={item.label} onClick={item.action}>
                    {item.label}
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
                <button
                  className="reset-filters-button"
                  type="button"
                  onClick={resetFilters}
                >
                  Reset all
                </button>
              </div>
            ) : null}
            {displayedProducts.length > 0 ? (
              <div className={`product-grid ${compact ? "product-grid-compact" : ""}`}>
                {displayedProducts.map(renderProductCard)}
              </div>
            ) : (
              <div className="catalog-empty" role="region" aria-labelledby={`${sectionId}-empty-title`}>
                <span className="catalog-empty-icon" aria-hidden="true"><Search size={24} /></span>
                <h3 id={`${sectionId}-empty-title`}>No products found</h3>
                <p>{emptyMessage || "Try a shorter search, choose fewer filters, or start again with the full collection."}</p>
                <button className="btn-primary" type="button" onClick={resetFilters}>Clear all filters</button>
                {categorySuggestions.length > 0 ? (
                  <div className="catalog-empty-suggestions">
                    <span>Or browse a category</span>
                    <div>
                      {categorySuggestions.slice(0, 4).map((item) => (
                        <button key={item.value} type="button" onClick={() => browseSuggestedCategory(item.value)}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : autoScroll ? (
        <div
          className="product-carousel"
          onFocusCapture={(event) => {
            const target = event.target;
            setCarouselInteracting(!(target instanceof Element && target.closest(".carousel-automation-controls")));
          }}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setCarouselInteracting(false);
            }
          }}
        >
          <button className="carousel-arrow carousel-arrow-left" type="button" onClick={() => moveCarousel(-1)} aria-label="Previous featured products" disabled={!canCarousel}>
            <ChevronLeft size={22} />
          </button>
          <div className="featured-viewport" ref={railRef}>
            <div className="featured-track" ref={trackRef} style={{ transform: `translate3d(-${carouselIndex * carouselStep}px, 0, 0)` }}>
              {displayedProducts.map(renderProductCard)}
            </div>
          </div>
          <button className="carousel-arrow carousel-arrow-right" type="button" onClick={() => moveCarousel(1)} aria-label="Next featured products" disabled={!canCarousel}>
            <ChevronRight size={22} />
          </button>
          {canCarousel ? (
            <div className="carousel-automation-controls">
              <button
                aria-pressed={carouselManuallyPaused}
                type="button"
                onClick={() => setCarouselManuallyPaused((paused) => !paused)}
              >
                {carouselManuallyPaused ? <Play size={15} /> : <Pause size={15} />}
                {carouselManuallyPaused ? "Play carousel" : "Pause carousel"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={`product-grid ${compact ? "product-grid-compact" : ""}`}>
          {displayedProducts.map(renderProductCard)}
        </div>
      )}
      {!fullCatalog && visibleProducts.length === 0 ? (
        <p className="notice">{emptyMessage || (showControls ? "No products match those filters." : "No featured products yet.")}</p>
      ) : null}
      {ctaHref || secondaryCtaHref ? (
        <div className="section-cta reveal">
          {secondaryCtaHref && secondaryCtaLabel ? (
            <Link className="btn-ghost" href={secondaryCtaHref}>
              {secondaryCtaLabel}
            </Link>
          ) : null}
          {ctaHref ? (
            <Link className="btn-primary" href={ctaHref}>
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
