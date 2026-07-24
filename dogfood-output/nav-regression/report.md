# Navigation regression report

- Target: `http://127.0.0.1:3000`
- Scope: consecutive shop-category navigation, navbar shortcuts, and the mobile menu
- Viewports: desktop and 390 × 844 mobile
- Result: passed
- Console errors: none

## Checks

1. Opened the shop with the Men filters active.
2. Selected Shoes from the navbar without returning home.
3. Confirmed the URL changed to `?family=footwear`, the audience reset to All audiences, the Footwear filter became active, and the footwear product appeared.
4. Selected Women from the same shop page.
5. Confirmed the URL changed to `?family=clothing&audience=women`, the Women audience and Clothing filters became active, and the women’s product appeared.
6. Confirmed Wishlist and Orders are visible in the desktop navbar.
7. Confirmed Wishlist and Orders are visible in the 390px mobile navbar and mobile menu.
8. Confirmed the branded loading component and Clerk account-menu actions pass the optimized production build.
9. Confirmed Search, Theme, Wishlist, Orders, Cart, Sign in, and Menu remain on one row at 320px with no horizontal overflow.
10. Confirmed opening search replaces the mobile brand/actions/category row with one full-width focused search field.
11. Confirmed both Escape and the close button restore every navbar action and return focus to the search trigger.

## Evidence

- `screenshots/category-women-after-shoes.png`
- `screenshots/mobile-menu-wishlist-orders.png`
- `screenshots/mobile-navbar-all-actions-320-final.png`
- `screenshots/mobile-search-expanded-390.png`

No regression issues were found in this focused pass.
