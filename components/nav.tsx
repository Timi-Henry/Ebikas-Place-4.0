"use client";

import {
  Grid2X2,
  Heart,
  MapPin,
  Menu,
  PackageCheck,
  Phone,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import { useCart } from "@/components/cart-provider";
import { businessInfo, primaryCategoryLinks } from "@/lib/business-info";

const CartDrawer = dynamic(() => import("@/components/cart-drawer").then((module) => module.CartDrawer), { ssr: false });
const OrdersDrawer = dynamic(() => import("@/components/orders-drawer").then((module) => module.OrdersDrawer), { ssr: false });
const WishlistDrawer = dynamic(() => import("@/components/wishlist-drawer").then((module) => module.WishlistDrawer), { ssr: false });

const utilityLinks = [
  { label: "Home", href: "/" },
  { label: "New arrivals", href: "/shop?filter=new" },
  { label: "Popular", href: "/shop?filter=best-seller" },
  { label: "Under NGN 20k", href: "/shop?price=under-20000" },
  { label: "About", href: "/#about" }
];

function AccountUserButton({
  onOpenWishlist,
  onOpenOrders
}: {
  onOpenWishlist: () => void;
  onOpenOrders: () => void;
}) {
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action
          label="Wishlist"
          labelIcon={<Heart size={15} />}
          onClick={onOpenWishlist}
        />
        <UserButton.Action
          label="Orders"
          labelIcon={<PackageCheck size={15} />}
          onClick={onOpenOrders}
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}

export function Nav() {
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [verifiedAdminUserId, setVerifiedAdminUserId] = useState<string | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useOverlayDialog<HTMLDivElement>(mobileOpen, () => setMobileOpen(false));
  const { count, wishlistCount } = useCart();
  const { isSignedIn, isLoaded, user } = useUser();
  const publicMetadata = user?.publicMetadata as { role?: string; admin?: boolean } | undefined;
  const metadataAdmin = publicMetadata?.role === "admin" || publicMetadata?.admin === true;
  const isAdmin = metadataAdmin || Boolean(user?.id && verifiedAdminUserId === user.id);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || metadataAdmin) return;
    const controller = new AbortController();
    fetch("/api/admin/access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.isAdmin) setVerifiedAdminUserId(user.id);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isLoaded, isSignedIn, metadataAdmin, user?.id]);

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 24);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  function submitSearch() {
    const query = searchQuery.trim();
    setMobileSearchOpen(false);
    if (isAdmin && /^[a-f\d]{24}$/i.test(query)) {
      window.location.href = "/products/" + query;
      return;
    }
    window.location.href = query ? "/shop?search=" + encodeURIComponent(query) : "/shop";
  }

  function openMobileSearch() {
    setMobileOpen(false);
    setMobileSearchOpen(true);
    window.requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
  }

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    window.requestAnimationFrame(() => mobileSearchTriggerRef.current?.focus());
  }

  return (
    <>
      <header className={"site-header " + (scrolled ? "site-header-scrolled" : "")}>
        <div className="commerce-top-strip">
          <div className="top-strip-inner">
            <span className="top-strip-promise"><Truck size={14} /> Delivery within Lagos State</span>
            <div className="top-strip-links">
              <a href={businessInfo.phoneHref}><Phone size={14} /> {businessInfo.phone}</a>
              <button type="button" onClick={() => setOrdersOpen(true)}><PackageCheck size={14} /> Track an order</button>
              <a href="/addresses"><MapPin size={14} /> Saved addresses</a>
            </div>
          </div>
        </div>

        <nav className={`nav${mobileSearchOpen ? " nav-search-active" : ""}`} aria-label="Main navigation">
          <div className="nav-inner">
            <Link className="brand" href="/" aria-label="Ebika's Place home">
              <BrandMark priority />
              <span className="brand-copy">
                <strong>Ebika’s <b>Place</b></strong>
                <small>{businessInfo.tagline}</small>
              </span>
            </Link>

            <form
              className={"market-search " + (mobileSearchOpen ? "market-search-mobile-open" : "")}
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <label className="sr-only" htmlFor="site-search">Search Ebika’s Place</label>
              <span className="search-department">All products</span>
              <input
                id="site-search"
                ref={mobileSearchInputRef}
                type="search"
                placeholder={isAdmin ? "Search products or paste a product ID" : "Search clothes, shoes, bags and more"}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeMobileSearch();
                }}
              />
              <button type="submit" aria-label="Search">
                <Search size={20} />
              </button>
              <button className="mobile-search-close" type="button" onClick={closeMobileSearch} aria-label="Close search">
                <X size={19} />
              </button>
            </form>

            <div className="nav-actions">
              <button
                className="nav-action nav-mobile-search-trigger"
                ref={mobileSearchTriggerRef}
                type="button"
                onClick={openMobileSearch}
                aria-label="Open search"
                aria-expanded={mobileSearchOpen}
              >
                <span className="nav-action-icon"><Search size={20} /></span>
                <small>Search</small>
              </button>
              <ThemeToggle className="nav-action nav-theme-action" />
              <button className="nav-action wishlist-nav-action" type="button" onClick={() => setWishlistOpen(true)} aria-label="Open wishlist">
                <span className="nav-action-icon">
                  <Heart size={20} />
                  {wishlistCount > 0 ? <b>{wishlistCount}</b> : null}
                </span>
                <small>Wishlist</small>
              </button>
              <button className="nav-action orders-nav-action" type="button" onClick={() => setOrdersOpen(true)} aria-label="Open orders">
                <span className="nav-action-icon"><PackageCheck size={20} /></span>
                <small>Orders</small>
              </button>
              <button className="nav-action cart-nav-action" type="button" onClick={() => setCartOpen(true)} aria-label="Open cart">
                <span className="nav-action-icon">
                  <ShoppingBag size={21} />
                  {count > 0 ? <b>{count}</b> : null}
                </span>
                <small>Cart</small>
              </button>
              {isLoaded && !isSignedIn ? (
                <SignInButton mode="modal">
                  <button className="nav-action account-nav-action" type="button" aria-label="Sign in">
                    <span className="nav-action-icon"><UserRound size={20} /></span>
                    <small>Sign in</small>
                  </button>
                </SignInButton>
              ) : null}
              {isLoaded && isSignedIn ? (
                <div className="nav-user-wrap" aria-label="Account menu">
                  <AccountUserButton
                    onOpenWishlist={() => setWishlistOpen(true)}
                    onOpenOrders={() => setOrdersOpen(true)}
                  />
                  <small>Account</small>
                </div>
              ) : null}
              <button
                className="nav-action mobile-menu-trigger"
                type="button"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((value) => !value)}
              >
                <span className="nav-action-icon">{mobileOpen ? <X size={22} /> : <Menu size={22} />}</span>
                <small>Menu</small>
              </button>
            </div>
          </div>

          <div className="department-nav">
            <div className="department-nav-inner">
              <Link className="department-nav-all" href="/shop">
                <Grid2X2 size={16} /> All products
              </Link>
              {primaryCategoryLinks.map((link) => (
                <Link href={link.href} key={link.value}>{link.label}</Link>
              ))}
              <span className="department-nav-divider" />
              {utilityLinks.slice(1, 4).map((link) => (
                <Link className="department-nav-offer" href={link.href} key={link.href}>{link.label}</Link>
              ))}
              {isAdmin ? <Link className="department-nav-admin" href="/admin">Admin dashboard</Link> : null}
            </div>
          </div>

          {mobileOpen ? (
            <>
              <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
              <div ref={mobileDialogRef} className="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Mobile navigation" tabIndex={-1}>
                <div className="mobile-nav-head">
                  <span className="mobile-nav-brand"><BrandMark /><strong>Menu</strong></span>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-dialog-close><X size={20} /></button>
                </div>
                <div className="mobile-nav-account-tools" aria-label="Account and appearance">
                  {isLoaded && !isSignedIn ? (
                    <SignInButton mode="modal">
                      <button type="button" onClick={() => setMobileOpen(false)}>
                        <UserRound size={18} />
                        <span><strong>Sign in</strong><small>Access orders and saved details</small></span>
                      </button>
                    </SignInButton>
                  ) : null}
                  {isLoaded && isSignedIn ? (
                    <div className="mobile-nav-account-summary">
                      <AccountUserButton
                        onOpenWishlist={() => {
                          setMobileOpen(false);
                          setWishlistOpen(true);
                        }}
                        onOpenOrders={() => {
                          setMobileOpen(false);
                          setOrdersOpen(true);
                        }}
                      />
                      <span><strong>Account</strong><small>Manage your profile</small></span>
                    </div>
                  ) : null}
                  <div className="mobile-nav-theme-row">
                    <ThemeToggle className="mobile-nav-theme-toggle" />
                    <span><strong>Change theme</strong><small>Switch light or dark mode</small></span>
                  </div>
                </div>
                <div className="mobile-nav-categories">
                  <span>Departments</span>
                  <Link href="/shop" onClick={() => setMobileOpen(false)}>All products</Link>
                  {primaryCategoryLinks.map((link) => (
                    <Link href={link.href} key={"mobile-" + link.value} onClick={() => setMobileOpen(false)}>{link.label}</Link>
                  ))}
                </div>
                <div className="mobile-nav-utilities">
                  {utilityLinks.map((link) => (
                    <Link href={link.href} key={"mobile-" + link.href} onClick={() => setMobileOpen(false)}>{link.label}</Link>
                  ))}
                  <button
                    className="mobile-nav-utility-button"
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setWishlistOpen(true);
                    }}
                  >
                    <Heart size={17} />
                    <span>Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ""}</span>
                  </button>
                  <button
                    className="mobile-nav-utility-button"
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      setOrdersOpen(true);
                    }}
                  >
                    <PackageCheck size={17} />
                    <span>Orders</span>
                  </button>
                  {isAdmin ? <Link href="/admin" onClick={() => setMobileOpen(false)}>Admin dashboard</Link> : null}
                  {isSignedIn ? <Link href="/addresses" onClick={() => setMobileOpen(false)}>Saved addresses</Link> : null}
                </div>
                <a className="mobile-help-card" href={businessInfo.whatsappHref}>
                  <Phone size={19} />
                  <span><strong>Need help ordering?</strong><small>Call or WhatsApp {businessInfo.phone}</small></span>
                </a>
              </div>
            </>
          ) : null}
        </nav>
      </header>

      {wishlistOpen ? <WishlistDrawer open onClose={() => setWishlistOpen(false)} /> : null}
      {ordersOpen ? <OrdersDrawer open onClose={() => setOrdersOpen(false)} /> : null}
      {cartOpen ? <CartDrawer open onClose={() => setCartOpen(false)} /> : null}
    </>
  );
}
