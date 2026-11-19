# SRG Owned

Browser extension (Chrome and Firefox) that marks Super Rare Games releases you already own, including the `[CLUB]` early-access copies, which are separate products with their own URLs.

## Install

**Chrome / Edge / Brave:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `src` folder. Keep the folder: Chrome loads it from there.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `src/manifest.json`. Temporary add-ons are removed when Firefox restarts. To keep it installed, sign it as an unlisted add-on (free, not published) at addons.mozilla.org → Developer Hub → Submit → "On your own", then install the signed .xpi. If badges don't appear, open the Extensions menu (puzzle icon) and allow it on superraregames.com.

## Use

- **Import from your orders:** open [your orders](https://account.superraregames.com/orders) and click **Import from all orders** in the SRG Owned panel. It loads every order, skips cancelled and refunded ones, and opens a review list: numbered games are ticked, merch is unticked, and nothing is saved until you click **Add**. Unshipped pre-orders count as owned. On a single order's page, **Add this order's games** does the same for that order.
- Hover a product card and click **I own this**, or use the button under the title on a product page.
- Or click the toolbar icon → **Manage owned games** and paste titles or numbers (`SRG#149`, `PS5#17`, `DE#2 (Switch)`), one per line.
- Owned games are greyed out with a green **✓ Owned** badge. Bundles you partly own show "1 of 2 owned".
- Product pages you own show **You already own this.** above Add to cart.
- If your cart holds something you own, a red panel lists it on every page of the store (cart and checkout included). Dismiss hides it until the cart changes.
- The list syncs through your browser account (Chrome or Firefox sync). Export/Import on the manage page for backups or moving between browsers.

## How matching works

Titles become keys: `[CLUB]`, ` - ` and `[REPRINT]` are removed, then the series and number (SRG#, PS4#, PS5#, DE#, CE#, …) plus the platform in brackets at the end. `[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)` and `SRG#149: Grapple Dogs Cosmic Canines (Switch)` are both `SRG#149|switch`. DE#2 (Switch) and DE#2 (PS5) are different games. A missing platform matches any platform. Titles without a number (Mixtapes) match on the cleaned-up name. Other bracketed tags such as `[Steelbook]` make a separate item: `[Steelbook] SRG#88` is the case, not the game SRG#88. URLs aren't used for matching, because club handles are inconsistent (`copy-of-…`, `…-switch-1`).

The orders page doesn't show item titles, only the product variant IDs in each order's "Buy again" link. The manage page looks those up on the store: first in `/products.json`, then via `/variants/<id>` for anything not listed there. Items it can't identify are listed by order so you can import that order from its own page, where titles are shown.

Titles come from Shopify's `/products/<handle>.js` (and `/collections/<c>/products.json` on collection pages) and `/cart.js`, so the extension doesn't depend on the theme's layout.

## Tests

```
node --test test/keys.test.js test/manifest.test.js   # title matching, manifest
python3 test/browser_test.py        # extension in Chrome for Testing against mock store pages
python3 test/import_test.py         # order import against mock account pages (test/fixtures)
REAL_ORDERS=orders.html REAL_ORDER=order.html python3 test/import_test.py   # your own saved account pages
```
