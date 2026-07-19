import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Grid2X2,
  Headphones,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { CatalogUnavailableNotice } from "@/components/catalog-unavailable-notice";
import { Footer } from "@/components/footer";
import { MarketTicker } from "@/components/market-ticker";
import { MemberCta } from "@/components/member-cta";
import { Nav } from "@/components/nav";
import { createProductCardModel } from "@/components/product-card";
import { ProductRail } from "@/components/product-rail";
import { StoreEffects } from "@/components/store-effects";
import { businessInfo } from "@/lib/business-info";
import { formatTaxonomyLabel, matchesProductFacets } from "@/lib/product-taxonomy";
import { formatPrice, getCurrentPrice, getDiscountPercent } from "@/lib/pricing";
import { getProductsResult } from "@/lib/server/products";

const categoryStories = [
  { value: "women", familyId: "clothing", audienceId: "women", href: "/shop?family=clothing&audience=women", shortLabel: "Women", copy: "Everyday polish and occasion-ready pieces.", tone: "peach" },
  { value: "men", familyId: "clothing", audienceId: "men", href: "/shop?family=clothing&audience=men", shortLabel: "Men", copy: "Sharp essentials built for work and weekends.", tone: "blue" },
  { value: "kids", familyId: "clothing", audienceId: "kids", href: "/shop?family=clothing&audience=kids", shortLabel: "Kids", copy: "Comfortable looks made for busy little people.", tone: "yellow" },
  { value: "footwear", familyId: "footwear", href: "/shop?family=footwear", shortLabel: "Shoes", copy: "The pairs that pull every outfit together.", tone: "lilac" },
  { value: "bags", familyId: "bags", href: "/shop?family=bags", shortLabel: "Bags", copy: "Roomy, compact, casual, and event-ready.", tone: "mint" },
  { value: "accessories", familyId: "accessories", href: "/shop?family=accessories", shortLabel: "Accessories", copy: "Small details with a big finishing effect.", tone: "rose" }
] as const;

export default async function HomePage() {
  const catalog = await getProductsResult();
  const products = catalog.ok ? catalog.value : [];
  const featuredProducts = products.filter((product) => product.featured);
  const heroProducts = (featuredProducts.length ? featuredProducts : products).slice(0, 5);
  const taggedNew = products.filter((product) => product.badges?.includes("new"));
  const taggedBest = products.filter((product) => product.badges?.includes("best-seller") || (product.reviewCount || 0) > 20);
  const newArrivals = (taggedNew.length ? taggedNew : products.slice(4)).slice(0, 10);
  const bestSellers = (taggedBest.length ? taggedBest : [...products].sort((a, b) => Number(b.featured) - Number(a.featured))).slice(0, 10);
  const discountedProducts = products
    .filter((product) => product.stock > 0 && getDiscountPercent(product) > 0)
    .sort((a, b) => getDiscountPercent(b) - getDiscountPercent(a))
    .slice(0, 10);
  const spotlight = products.find((product) => getCurrentPrice(product) < 20000) || products[0];
  const productCardsById = new Map(
    products.map((product) => [
      product.id,
      createProductCardModel(product)
    ])
  );
  const cardsFor = (selection: typeof products) => selection.flatMap((product) => {
    const card = productCardsById.get(product.id);
    return card ? [card] : [];
  });

  return (
    <main className="shell storefront-shell" id="main-content" tabIndex={-1}>
        <div className="bg-aurora" aria-hidden="true">
          <span className="aurora aurora-1" />
          <span className="aurora aurora-2" />
          <span className="aurora aurora-3" />
          <span className="aurora aurora-4" />
        </div>
        <div className="noise-overlay" aria-hidden="true" />
        <StoreEffects />
        <Nav />

        {!catalog.ok ? <CatalogUnavailableNotice framed /> : null}

        <MarketTicker />

        <section className="market-hero section-frame" id="home">
          <div className="market-hero-copy">
            <div className="hero-kicker reveal">
              <span className="pulse-dot" />
              {businessInfo.tagline}
            </div>
            <h1 className="reveal">
              Your next favorite look is <em>already here.</em>
            </h1>
            <p className="reveal">
              Shop clothes, shoes, bags, and accessories for women, men, and kids—with clear prices and easy ordering.
            </p>
            <div className="hero-actions reveal">
              <Link className="btn-primary btn-primary-large" href="/shop">
                Shop the collection
                <ArrowRight size={18} />
              </Link>
              <a className="btn-ghost btn-ghost-light" href="#categories">
                <Grid2X2 size={18} />
                Browse categories
              </a>
            </div>
            <div className="hero-proof-row reveal" aria-label="Shopping benefits">
              <span><BadgeCheck size={17} /> Curated quality</span>
              <span><Clock3 size={17} /> Quick ordering</span>
              <span><Headphones size={17} /> Local support</span>
            </div>
          </div>

          <div className="storefront-window reveal" aria-label="Featured styles">
            {heroProducts[0] ? (
              <Link className="window-main" href={"/products/" + heroProducts[0].id}>
                <Image
                  src={heroProducts[0].imageUrl}
                  alt={heroProducts[0].name}
                  fill
                  priority
                  sizes="(max-width: 900px) 92vw, 36vw"
                />
                <span className="window-shade" />
                <span className="window-copy">
                  <small>{formatTaxonomyLabel(heroProducts[0].category)}</small>
                  <strong>{heroProducts[0].name}</strong>
                  <span>{formatPrice(getCurrentPrice(heroProducts[0]))}</span>
                </span>
              </Link>
            ) : null}
            <div className="window-side">
              {heroProducts.slice(1, 4).map((product, index) => (
                <Link className={"window-tile window-tile-" + (index + 1)} href={"/products/" + product.id} key={product.id}>
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 600px) 44vw, 15vw"
                  />
                  <span>{formatTaxonomyLabel(product.category)}</span>
                </Link>
              ))}
            </div>
            <div className="window-delivery-card">
              <span className="window-delivery-icon"><ShieldCheck size={20} /></span>
              <span>
                <strong>Shop with confidence</strong>
                <small>Secure account checkout</small>
              </span>
            </div>
            <span className="window-orbit window-orbit-one" aria-hidden="true" />
            <span className="window-orbit window-orbit-two" aria-hidden="true" />
          </div>
        </section>

        <section className="commerce-assurance section-frame" aria-label="Why shop with us">
          {[
            { icon: BadgeCheck, title: "Easy ordering", copy: "Clear prices, saved favorites, and a simple checkout." },
            { icon: MapPin, title: "Flexible fulfillment", copy: "Choose delivery or send your preferred rider at checkout." },
            { icon: ShieldCheck, title: "Secure account", copy: "Save addresses, wishlists, and order history safely." },
            { icon: Headphones, title: "Real store support", copy: "Call or WhatsApp us when you need help ordering." }
          ].map((item) => (
            <article className="assurance-item reveal" key={item.title}>
              <span><item.icon size={21} /></span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="category-market section-frame" id="categories">
          <div className="market-section-heading">
            <div>
              <span className="eyebrow reveal">Find your department</span>
              <h2 className="reveal">Shop by category</h2>
              <p className="reveal">Start with who you are shopping for, then narrow it down in seconds.</p>
            </div>
            <Link className="inline-link reveal" href="/shop">
              View everything <ArrowRight size={17} />
            </Link>
          </div>
          <div className="department-grid">
            {categoryStories.map((category, index) => {
              const audienceId = "audienceId" in category ? category.audienceId : undefined;
              const product = products.find((item) => matchesProductFacets(item, { familyId: category.familyId, audienceId })) || heroProducts[index % Math.max(1, heroProducts.length)];
              const label = category.shortLabel;
              return (
                <Link
                  className={"department-card department-" + category.tone + " reveal"}
                  href={category.href}
                  key={category.value}
                >
                  <span className="department-copy">
                    <small>{label}</small>
                    <strong>{category.shortLabel}</strong>
                    <span>{category.copy}</span>
                    <b>Shop now <ArrowRight size={15} /></b>
                  </span>
                  {product ? (
                    <span className="department-image">
                      <Image src={product.imageUrl} alt="" fill sizes="(max-width: 700px) 50vw, 18vw" />
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>

        {catalog.ok ? (
          <ProductRail
            products={cardsFor(featuredProducts.length ? featuredProducts : products.slice(0, 10))}
            title="This week’s standout styles"
            eyebrow="Featured edit"
            autoScroll
            sectionId="featured"
            ctaHref="/shop?filter=featured"
            ctaLabel="See all featured"
          />
        ) : null}

        {catalog.ok && discountedProducts.length > 0 ? (
          <ProductRail
            products={cardsFor(discountedProducts)}
            title="Price drops worth seeing"
            eyebrow="The deal drop"
            description="A rotating edit of in-stock pieces with real markdowns, refreshed as the catalog changes."
            autoScroll
            carouselLabel="discounted products"
            sectionId="sale"
            variant="sale"
            ctaHref="/shop?filter=discounted"
            ctaLabel="Shop all sale items"
          />
        ) : null}

        {spotlight ? (
          <section className="price-spotlight section-frame reveal">
            <div className="price-spotlight-copy">
              <span className="eyebrow">Smart style, sensible spend</span>
              <h2>Good finds under NGN 20k</h2>
              <p>Easy additions for everyday outfits, gifting, and the finishing touches your wardrobe needs.</p>
              <Link className="btn-primary" href="/shop?price=under-20000">
                Shop under NGN 20k <ArrowRight size={17} />
              </Link>
            </div>
            <Link className="spotlight-product" href={"/products/" + spotlight.id}>
              <span className="spotlight-image">
                <Image src={spotlight.imageUrl} alt={spotlight.name} fill sizes="(max-width: 760px) 80vw, 30vw" />
              </span>
              <span className="spotlight-card-copy">
                <small>{formatTaxonomyLabel(spotlight.category)}</small>
                <strong>{spotlight.name}</strong>
                <b>{formatPrice(getCurrentPrice(spotlight))}</b>
              </span>
            </Link>
          </section>
        ) : null}

        {catalog.ok ? (
          <>
            <ProductRail
              products={cardsFor(newArrivals)}
              title="Just landed"
              eyebrow="New to the store"
              compact
              sectionId="new-arrivals"
              ctaHref="/shop?filter=new"
              ctaLabel="Shop new arrivals"
            />
            <ProductRail
              products={cardsFor(bestSellers)}
              title="Popular right now"
              eyebrow="Customer favorites"
              compact
              sectionId="best-sellers"
              ctaHref="/shop?filter=best-seller"
              ctaLabel="Shop popular picks"
            />
          </>
        ) : null}

        <section className="service-story section-frame" id="about">
          <div className="service-story-copy reveal">
            <span className="eyebrow">The Ebika’s Place difference</span>
            <h2>Online convenience with a real store behind it.</h2>
            <p>
              We make fashion shopping feel straightforward: clear product details, local fulfillment options,
              helpful account tools, and a real person to call when you need one.
            </p>
            <a className="inline-link" href={businessInfo.whatsappHref}>
              Chat with us on WhatsApp <ArrowRight size={17} />
            </a>
          </div>
          <div className="service-steps">
            {[
              ["01", "Discover", "Browse a curated multi-category catalog and save your favorites."],
              ["02", "Choose", "Pick your size, add it to your bag, and choose how to receive it."],
              ["03", "Stay updated", "Track order progress and buy previous items again from your account."]
            ].map(([number, title, copy]) => (
              <article className="service-step reveal" key={number}>
                <span>{number}</span>
                <div><strong>{title}</strong><p>{copy}</p></div>
              </article>
            ))}
          </div>
        </section>

        <MemberCta />
        <Footer />
    </main>
  );
}
