# Ebika's Place — consolidated frontend, backend, and live-site review

Date: 2026-07-17  
Live site: https://ebikas-place-4-0.vercel.app/  
Status: Read-only review. No product code was changed.

## Executive assessment

The storefront already has a recognizable navy/gold identity, strong search prominence, clear fulfillment messaging, useful product breadcrumbs, and generally good semantic labeling. It is not yet safe to treat as a production commerce system, however. Three backend issues can create incorrect orders, while the live site currently exposes synthetic products as real inventory.

## Coverage

Live browser coverage:

- `/` on desktop and 390×844 mobile.
- `/shop`, filters, sorting controls, search/no-results, and reset behavior.
- A real product route and a synthetic `sample-*` product route.
- Required-size validation and successful local cart addition.
- Cart drawer, fulfillment choices, and signed-out checkout boundary.
- `/addresses` signed-out state.
- Unknown product 404 state.
- `/robots.txt`, `/sitemap.xml`, and the `/admin` signed-out redirect.
- Mobile menu focus trap, Escape dismissal, focus restoration, landmarks, labels, alternative text, overflow, and target sizes.

Source coverage:

- All public and protected page routes.
- All API routes, Mongo adapters, catalog/order/address logic, authentication, Cloudinary lifecycle, validation, metadata, caching, cart state, and admin UI.
- TypeScript, lint/build readiness, test/CI coverage, and generated route payloads.

Not visually covered without credentials: authenticated addresses, order history, post-sign-in checkout, and `/admin`, `/admin/products`, `/admin/products/[id]/edit`, `/admin/orders`, and `/admin/catalog`. Their source and authorization paths were reviewed.

## P0 — fix before taking real orders

### 1. Make checkout authoritative and atomic

The order route accepts browser-provided product identity, name, image, price, quantity, and arbitrary size. The order module calculates the subtotal from those values, never reloads authoritative products, never validates current stock/variants, never decrements stock, and has no idempotency guard.

Evidence:

- `app/api/orders/route.ts:9`
- `app/api/orders/route.ts:48`
- `lib/server/orders.ts:72`
- `lib/server/orders.ts:84`
- `components/cart-provider.tsx:104` reconstructs “Buy again” products using an old price and `stock: 99`.
- `components/product-browser.tsx:371` allows sold-out catalog items into the cart.

Recommended module: `Checkout.place({ userId, lines: [{ productId, variantId, quantity }], fulfillment, address, idempotencyKey })`. Its implementation should load current products, reject the entire invalid cart, validate variants and limits, calculate authoritative totals, atomically decrement stock with `stock >= quantity`, snapshot validated details into the order, and enforce a unique user/idempotency key.

### 2. Remove production sample inventory and stop masking catalog outages

The live catalog mixes two real database products with 18 synthetic `sample-*` products, labels the samples as in stock, and lets customers add them to cart. Database failures silently return the same samples, making an outage look like a healthy store.

Evidence:

- `lib/server/products.ts:60`
- `lib/server/products.ts:73`
- `lib/server/products.ts:82`
- `lib/sample-products.ts:150`
- Live evidence: `root/screenshots/product-sample-desktop.png`

Recommended module: `Catalog` should return either real catalog data or a typed `CatalogUnavailable` result. Samples should require an explicit development-only flag or deliberate seed operation; they should never be appended automatically in production.

### 3. Enforce order transitions on the server with optimistic concurrency

Customer cancellation reads then updates without constraining the expected current status. Admin actions accept any destination status and update only by order ID. UI guards do not protect the endpoint from direct or concurrent calls.

Evidence:

- `lib/server/orders.ts:118`
- `lib/server/orders.ts:154`
- `lib/server/orders.ts:188`
- `components/admin-orders-manager.tsx:20`

Recommended module: `OrderLifecycle.transition({ orderId, actor, action, expectedVersion })`, with the allowed state graph inside the module and a conditional Mongo update on status/version.

## P1 — deployment and operational correctness

### 4. Replace Clerk development keys in Vercel Production

Both desktop and mobile consoles repeatedly report that Clerk development keys are loaded on the production deployment. Configure a production Clerk instance and production publishable/secret keys, redeploy, and confirm the warning disappears.

Evidence: `mobile/console-findings.txt`.

### 5. Set and validate the real production origin

The deployed robots and sitemap files advertise `https://ebikas-place.example.com`, so crawlers are sent away from the actual site. Set `NEXT_PUBLIC_SITE_URL=https://ebikas-place-4-0.vercel.app` or the final custom domain in Vercel Production.

Evidence:

- Live: `root/screenshots/sitemap-wrong-origin.png`
- `app/layout.tsx:7`
- `app/robots.ts:4`
- `app/sitemap.ts:6`

Add one typed, secret-safe `serverEnv` module that validates site URL, Mongo, Clerk, Cloudinary, and admin configuration at startup. Do not silently fall back to placeholder production values.

### 6. Add release gates and observability

TypeScript passes, but lint opens an interactive setup prompt, there are no tests or CI workflows, and there are no route error/loading boundaries or observability hooks. Add noninteractive ESLint, typecheck, unit/integration tests, agent-browser/Playwright smoke tests, build checks, structured error logging, correlation IDs, and health/readiness reporting.

First tests should cover checkout price/stock/idempotency, every order transition and race, cart hydration/migration, admin authorization, validation limits, Cloudinary cleanup, and storefront smoke flows.

## P1 — live frontend and accessibility

### 7. Fix contrast failures

- `/addresses`: the signed-out guidance is effectively white on a near-white card. `app/globals.css:3206` forces white text on the reused `.admin-denied` pattern.
- Cross-site footer: service headings inherit dark `var(--text)` from `app/globals.css:4207` on a navy footer because `app/storefront.css:2164` does not override the color.
- Product rating secondary text is also too faint.

Evidence: `root/screenshots/addresses-signed-out.png`, `desktop/screenshots/product-real-full.png`.

### 8. Put the mobile filter drawer above the sticky header

The filter title and focused close button render behind the roughly 141px sticky header. Give the modal a higher stacking layer, offset it correctly, or hide the site header while it is open.

Evidence: `mobile/screenshots/shop-mobile-filter-drawer-top.png`.

### 9. Repair the skip link focus transfer

Activating “Skip to main content” changes the hash but leaves focus on `BODY`; the next Tab returns to the header. Make the main target focusable with `tabIndex={-1}` and move focus to it on activation.

Evidence: `mobile/screenshots/home-mobile-skip-focus.png`.

### 10. Add useful validation and empty-state feedback

- Required-size product: clicking “Add to cart” with no size silently does nothing. Add an inline error, focus the size group, and/or keep the button disabled with a visible explanation.
- Catalog search: zero results produces a mostly blank product area. Add a clear “No products found” panel with clear filters, suggested categories, and search guidance.

Evidence: `desktop/screenshots/product-add-without-size.png`, `desktop/screenshots/shop-empty-search.png`.

### 11. Make reveal effects progressive enhancement

Below-fold content starts hidden and becomes visible only after IntersectionObserver activity. Full-page captures show large blank areas; the same design is fragile if JavaScript fails, printing occurs, or an observer event is missed. Content should be visible by default; add reveal classes only after the animation system initializes.

Evidence: `desktop/screenshots/home-full.png` versus `desktop/screenshots/home-after-scroll-1.png`.

### 12. Add branded loading, error, and not-found experiences

Unknown product links display the generic black Next.js 404 with no navigation or recovery action. Add `app/not-found.tsx`, `app/error.tsx`, and relevant `loading.tsx` files with shop search, popular categories, and retry/back actions.

Evidence: `root/screenshots/product-not-found.png`.

### 13. Improve mobile target sizes

Measured examples include header actions around 38×42, favorite buttons 32×32, and several size/add controls around 34×38. Preserve their visual size but enlarge the interactive area to approximately 44×44.

### 14. Strengthen the visual merchandising system

The navy/gold system is distinctive and worth keeping, but category and product imagery is inconsistent and sometimes inaccurate. Examples include a baby portrait for “Little celebration dress,” blue jeweled earrings for “Polished gold hoop earrings,” and unrelated/brand-heavy category photography. Use exact sellable-product imagery, one consistent crop/lighting direction, and a small art-direction guide.

Also simplify the dense multi-tier header, remove empty Electronics/Cameras taxonomy from the fashion storefront, and reduce repetitive homepage product rails so the hero and best real inventory carry more weight.

## P1 — frontend architecture and performance

### 15. Reduce the client/RSC payload

Measured build artifacts included approximately 261 KB uncompressed homepage HTML, 51 KB RSC data, 154 KB global CSS, and about 589 KB raw route JavaScript before compression. The build exceeded both 120- and 300-second audit limits during static generation.

Main causes:

- `components/product-browser.tsx:1` is a 782-line client module containing cards, filters, sorting, rails, and cart actions.
- `app/shop/page.tsx:64` sends the full catalog across the client boundary.
- `app/page.tsx:199` sends overlapping product arrays into multiple client modules.
- `app/products/[id]/page.tsx:124` sends the full catalog to recently viewed.
- `components/nav.tsx:19` eagerly imports all drawers.
- `app/layout.tsx:4` loads both large CSS files globally.

Recommended split: server-rendered `CatalogResults`/`ProductCard`, tiny client `ProductCardActions`, a separate `ProductRail`, server pagination, lazy-loaded drawers, compact recently-viewed IDs/summaries, and route-scoped storefront/admin CSS.

### 16. Stabilize cart persistence at a root seam

Cart/wishlist effects briefly persist the initial empty arrays before restoring storage, write unversioned full product objects, do not catch storage errors, and remount a new provider on each page.

Use one root `CartStore` with explicit hydration state, schema version/migration, storage error handling, and minimal `{ productId, variantId, quantity }` lines. Reload current product data from the catalog.

### 17. Use URL-backed filtering and resilient async actions

Persist filters/search/sort in the URL so links, refresh, and browser Back retain state. Replace full reload navigation with `Link`/router APIs. Wrap checkout, address, and admin mutations in a shared pending/error/finally pattern so network failures cannot leave controls stuck.

## P1 — backend scale and reliability

### 18. Define caching/freshness and repair Mongo connection behavior

- Invalidate tagged catalog data after product/review mutations.
- Deduplicate product metadata/page reads with `React.cache`.
- Reset a rejected cached Mongo connection promise and set bounded connection/server-selection timeouts.
- Choose an explicit ISR/dynamic policy so admin edits cannot leave home inventory stale.

### 19. Add indexes, cursor pagination, and atomic reviews

Add repeatable indexes for products, `{ userId, createdAt }` and `{ status, createdAt }` orders, and `{ userId, updatedAt }` addresses. Paginate products/orders instead of loading everything or silently truncating admin orders. Move reviews to a dedicated collection/module with a unique `{ productId, userId }` key and atomic summary updates.

### 20. Make Cloudinary media lifecycle durable

Align accepted image hosts with Next Image configuration, upload multiple images with bounded concurrency, clean up abandoned staged uploads, and persist deletion/cleanup work in a durable outbox/job. A `ProductMedia` module should expose `stage`, `commit`, and `retire` behind Cloudinary and test adapters.

### 21. Tighten request validation and abuse controls

Use strict Zod schemas with limits for every order, address, contact, taxonomy, and media payload; reject unknown/partial invalid order lines; add per-user/IP mutation rate limits; and cap quantities, array sizes, and text lengths.

## P2 — polish and maintainability

- Add a product thumbnail to the cart drawer and verify checkout form data survives the sign-in round trip.
- Add an explicit pause control for automatic carousels/tickers; reduced-motion support already exists.
- Remove unrelated/empty taxonomy branches from customer filters.
- Align admin-link visibility with the server’s full admin authorization rules.
- Avoid fetching taxonomy before confirming admin access.
- Add product/variant SKUs, per-size inventory if sizes are real variants, `updatedAt`, and optimistic concurrency for admin edits.
- Remove unused admin gate modules and tracked legacy `index.html`, `script.js`, `style.css`, and archive files only after confirming they are no longer needed.

## Passed checks and strengths

- No document-level horizontal overflow at 390px on covered pages.
- One main/header/footer and named navigation landmarks were present.
- No unlabeled rendered form controls were found on covered routes.
- No missing alt attributes or broken loaded images were found on the covered shop grid.
- Mobile menu traps focus, closes with Escape, and restores focus correctly.
- Search, sort, department, and audience controls have accessible names.
- TypeScript passes with `tsc --noEmit --incremental false`.
- Product hierarchy, breadcrumbs, fulfillment/pickup copy, search prominence, successful cart toast, and the core navy/gold identity are strong foundations.

## Recommended implementation order

1. Deployment safety: production Clerk keys, real site URL, samples off, typed environment validation.
2. Commerce safety: `Checkout.place`, atomic stock/idempotency, `OrderLifecycle.transition`, and tests.
3. Live UX blockers: contrast, mobile filter stacking, size validation, empty states, skip link, and branded error states.
4. Catalog reliability: explicit outage state, caching/invalidation, Mongo timeouts, indexes, pagination, reviews.
5. Payload and design pass: server/client split, lazy drawers, root cart store, cohesive photography, simplified header/homepage.
6. Media durability, observability, full CI, and authenticated browser QA.

## Audit artifacts

- Root live findings: `root/report.md`
- Desktop screenshots: `desktop/screenshots/`
- Mobile report: `mobile/report.md`
- Mobile console finding: `mobile/console-findings.txt`
- Mobile screenshots: `mobile/screenshots/`

