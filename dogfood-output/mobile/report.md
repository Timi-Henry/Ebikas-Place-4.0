# Dogfood Report: Ebika's Place - Mobile, Responsive, Accessibility

| Field | Value |
|-------|-------|
| **Date** | 2026-07-17 |
| **App URL** | https://ebikas-place-4-0.vercel.app/ |
| **Session** | ebikas-live-mobile |
| **Viewport** | 390 x 844 |
| **Scope** | Read-only public mobile review; no order submission or production-data mutation |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 2 |
| **Total** | **6** |

## Route coverage

- `/`: initial viewport, full-page capture, navigation dialog, keyboard focus, landmarks, labels, image alternatives, overflow, target sizes, and console.
- `/shop`: initial viewport, catalog grid, filter dialog, rendered labels, image alternatives, overflow, target sizes, and console.
- Header navigation: menu focus trap, Escape dismissal, and focus restoration passed.
- Not completed before the requested wrap-up: product detail, `/addresses` auth boundary, search, wishlist, orders, cart, category query variants, tablet, desktop, and Web Vitals.

## Issues

### ISSUE-001: Production deploy is using Clerk development keys

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | console / configuration |
| **URL** | `/`, `/shop` |
| **Evidence** | `console-findings.txt` |

The production site repeatedly logs Clerk's warning that development keys are loaded and that development instances have strict usage limits. Replace the deployment's Clerk variables with production-instance keys and redeploy; otherwise account flows can be limited or disrupted under real traffic.

### ISSUE-002: Mobile filter drawer close control is hidden behind the sticky header

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | responsive / functional / accessibility |
| **URL** | `/shop` |
| **Evidence** | `screenshots/shop-mobile-filter-drawer-top.png`, `screenshots/shop-mobile-filter-drawer-clean.png`, `screenshots/issue-002-result.png` |

Opening Filters creates a proper modal and moves focus to `Close filters`, but that focused 34 x 34 control is positioned at y=20 under the approximately 141px sticky header. The drawer title and first controls are also obscured. Put the drawer above the site header, offset its panel below the header, or hide the site header while it is open.

### ISSUE-003: Skip link does not transfer keyboard focus to main content

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | accessibility / keyboard |
| **URL** | `/` |
| **Evidence** | `screenshots/home-mobile-skip-focus.png`, `screenshots/issue-001-step-1.png`, `screenshots/issue-001-step-2.png`, `screenshots/issue-001-step-3.png` |

Activating `Skip to main content` changes the hash to `#main-content`, but `document.activeElement` becomes BODY. The next Tab focuses `Ebika's Place home` in the header, so keyboard users have not skipped the repeated navigation. Make the main target programmatically focusable (for example `tabIndex=-1`) and focus it on activation.

### ISSUE-004: Several live product images do not match their product names

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content / commerce trust |
| **URL** | `/`, `/shop` |
| **Evidence** | `screenshots/home-mobile-initial.png`, `screenshots/shop-mobile-controls-and-cards.png` |

Examples include `Little celebration dress` using a baby portrait and `Polished gold hoop earrings` using blue jeweled earrings. Replace placeholder/sample imagery with the exact sellable item and remove sample inventory from production-facing results.

### ISSUE-005: Common controls fall below the 44 x 44 mobile target heuristic

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | accessibility / mobile usability |
| **URL** | `/`, `/shop` |
| **Evidence** | `screenshots/home-mobile-initial.png`, `screenshots/shop-mobile-controls-and-cards.png` |

Measured examples: header actions 38 x 42, product favorite buttons 32 x 32, and size/add controls around 34 x 38. The shop page contained 97 visible interactive elements below 44px on at least one axis. Enlarge the clickable area to about 44 x 44 while preserving the visual icon size.

### ISSUE-006: Fashion filters expose unrelated electronics taxonomy

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | UX / content |
| **URL** | `/shop` |
| **Evidence** | `screenshots/shop-mobile-filter-drawer-clean.png` |

The fashion storefront exposes `Electronics` and `Cameras & Photography` alongside clothing, shoes, bags, and accessories. Hide empty or irrelevant taxonomy branches from the customer filter experience.

## Passed checks and strengths

- No document-level horizontal overflow at 390px on `/` or `/shop` (`scrollWidth === clientWidth === 390`).
- One `main`, one `header`, one `footer`, and named navigation landmarks were present.
- No unlabeled rendered form controls were detected on either covered route.
- No missing `alt` attributes or broken loaded images were detected on `/shop`.
- Mobile menu uses modal semantics, traps Tab focus, closes with Escape, and restores focus to `Open menu`.
- Shop search, sort, department, and audience controls have accessible names.
- The product grid remains readable as a two-column mobile layout with no viewport overflow.

## Limitations

Web Vitals and remaining routes/interactions were not run because the shared browser/network stream became unstable and the parent requested an immediate evidence-based wrap-up. Static screenshots alone cannot validate color contrast precisely, real-device screen-reader output, touch ergonomics, or production performance under representative network/CPU throttling.
