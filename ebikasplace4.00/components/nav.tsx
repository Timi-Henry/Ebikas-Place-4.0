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
import Link from "next/link";
import { useEffect, useState } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import { OrdersDrawer } from "@/components/orders-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { useOverlayDialog } from "@/components/use-overlay-dialog";
import { WishlistDrawer } from "@/components/wishlist-drawer";
import { useCart } from "@/components/cart-provider";
import { businessInfo, primaryCategoryLinks } from "@/lib/business-info";

const utilityLinks = [
  { label: "Home", href: "/" },
  { label: "New arrivals", href: "/shop?filter=new" },
  { label: "Popular", href: "/shop?filter=best-seller" },
  { label: "Under NGN 20k", href: "/shop?price=under-20000" },
  { label: "About", href: "/#about" }
];

export function Nav() {
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mobileDialogRef = useOverlayDialog<HTMLDivElement>(mobileOpen, () => setMobileOpen(false));
  const { count, wishlistCount } = useCart();
  const { isSignedIn, isLoaded, user } = useUser();
  const publicMetadata = user?.publicMetadata as { role?: string; admin?: boolean } | undefined;
  const isAdmin = publicMetadata?.role === "admin" || publicMetadata?.admin === true;

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 24);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  function submitSearch() {
    const query = searchQuery.trim();
    if (isAdmin && /^[a-f\d]{24}$/i.test(query)) {
      window.location.href = "/products/" + query;
      return;
    }
    window.location.href = query ? "/shop?search=" + encodeURIComponent(query) : "/shop";
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

        <nav className="nav" aria-label="Main navigation">
          <div className="nav-inner">
            <Link className="brand" href="/" aria-label="Ebika's Place home">
              <span className="brand-mark">E</span>
              <span className="brand-copy">
                <strong>Ebika’s <b>Place</b></strong>
                <small>Online fashion store</small>
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
                type="search"
                placeholder={isAdmin ? "Search products or paste a product ID" : "Search clothes, shoes, bags and more"}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button type="submit" aria-label="Search">
                <Search size={20} />
              </button>
              <button className="mobile-search-close" type="button" onClick={() => setMobileSearchOpen(false)} aria-label="Close search">
                <X size={19} />
              </button>
            </form>

            <div className="nav-actions">
              <button
                className="nav-action nav-mobile-search-trigger"
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                aria-label="Open search"
              >
                <span className="nav-action-icon"><Search size={20} /></span>
                <small>Search</small>
              </button>
              <ThemeToggle className="nav-action nav-theme-action" />
              <button className="nav-action" type="button" onClick={() => setWishlistOpen(true)} aria-label="Open wishlist">
                <span className="nav-action-icon">
                  <Heart size={20} />
                  {wishlistCount > 0 ? <b>{wishlistCount}</b> : null}
                </span>
                <small>Saved</small>
              </button>
              <button className="nav-action" type="button" onClick={() => setOrdersOpen(true)} aria-label="Open orders">
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
                  <UserButton />
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
                  <strong>Shop Ebika’s Place</strong>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-dialog-close><X size={20} /></button>
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

      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} />
      <OrdersDrawer open={ordersOpen} onClose={() => setOrdersOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
