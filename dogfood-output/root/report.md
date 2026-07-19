# Live Website Review: Ebika's Place

| Field | Value |
|---|---|
| Date | 2026-07-17 |
| URL | https://ebikas-place-4-0.vercel.app/ |
| Scope | Signed-out production experience; desktop and mobile review in progress |

## Verified issues

### LIVE-001 — Sitemap and robots advertise the wrong production host

- Severity: High
- Category: SEO / deployment configuration
- URLs: `/robots.txt`, `/sitemap.xml`
- Evidence: `screenshots/sitemap-wrong-origin.png`

Both files return successfully, but their sitemap and `<loc>` values use `https://ebikas-place.example.com` instead of the deployed Vercel origin. Crawlers are therefore directed away from the real site and every published sitemap entry has the wrong canonical host.

Reproduction: open either deployed file and inspect the `Sitemap` or `<loc>` values.

### LIVE-002 — Signed-out address guidance is nearly invisible in light theme

- Severity: Medium
- Category: Accessibility / visual
- URL: `/addresses`
- Evidence: `screenshots/addresses-signed-out.png`

The explanatory sentence beneath “Sign in required” is rendered white on an almost-white card. It is essential context but fails basic readability and likely contrast requirements.

### LIVE-003 — Footer service-strip headings have very low contrast

- Severity: Medium
- Category: Accessibility / visual
- URLs: Cross-site footer
- Evidence: `screenshots/addresses-signed-out.png`

Labels such as “Delivery & pickup,” “Rider pickup,” “Order tracking,” and “Secure shopping” render in a dark navy tone on the dark navy footer strip, making the headings difficult to perceive.

### LIVE-004 — Product-not-found routes are an unbranded dead end

- Severity: Medium
- Category: UX / navigation
- URL: `/products/not-a-real-product`
- Evidence: `screenshots/product-not-found.png`

An unknown or outdated product link displays the default Next.js black 404 page with no store navigation, product search, or link back to the shop.

### LIVE-005 — Synthetic sample products are published as orderable production inventory

- Severity: High
- Category: Functional / content / inventory integrity
- URLs: `/shop`, `/products/sample-mens-oxford-shirt` and other `sample-*` routes
- Evidence: `screenshots/product-sample-desktop.png`

The production catalog mixes genuine database products with synthetic sample items, presents them as in stock, and enables “Add to cart.” The URLs and local product source identify these as samples, but the customer-facing UI does not. Customers can therefore attempt to order inventory that may not exist.

### CODE-001 — Checkout trusts client-provided product identity and price

- Severity: Critical
- Category: Backend / commerce integrity
- Evidence: `app/api/orders/route.ts:9`, `lib/server/orders.ts:72`

The order endpoint accepts `productId`, name, image, price, quantity, and selected size from the browser, then calculates the subtotal from those client values and inserts them directly. It does not reload authoritative products, validate current price/stock/size, reserve stock, or make placement idempotent. A signed-in client can therefore submit altered prices or nonexistent/sample products. This was verified from source only; no exploit was attempted against production.
