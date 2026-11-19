# SRG Owned

*Unofficial: not made by or affiliated with Super Rare Games.* [Privacy policy](PRIVACY.md)

Browser extension (Chrome and Firefox) that marks Super Rare Games releases you already own, including the `[CLUB]` early-access copies, which are separate products with their own URLs.

## Install

**Chrome / Edge / Brave:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `src` folder. Keep the folder: Chrome loads it from there.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `src/manifest.json`. Temporary add-ons are removed when Firefox restarts. To keep it installed, sign it as an unlisted add-on (free, not published) at addons.mozilla.org → Developer Hub → Submit → "On your own", then install the signed .xpi. If badges don't appear, open the Extensions menu (puzzle icon) and allow it on superraregames.com.

## Use

After installing or reloading a new version, reload any superraregames.com tabs you already had open: tabs left open keep the old copy, which can no longer reach the extension's storage (the panel says so if you try).


- **Import from your orders:** open [your orders](https://account.superraregames.com/orders) and click **Import from all orders** in the SRG Owned panel. It loads every order, skips cancelled and refunded ones, reads each order's items (titles as bought, so [CLUB] products still count after they've left the store), then gives you an **Open the review** link to a review list: numbered games are ticked, merch is unticked, and nothing is saved until you click **Add**. Unshipped pre-orders count as owned. On a single order's page, **Add this order's games** does the same for that order.
- To mark a single release as owned (or remove it), hover its card on a store listing page and click **I own this**, or use the button under the title on its own product page. That's the only place the button appears: not in the cart, recommendations or elsewhere, and not on bundles or "Coming Soon!" listings. Badges still show everywhere.
- Or click the toolbar icon → **Manage owned games** and paste titles or numbers (`SRG#149`, `PS5#17`, `DE#2 (Switch)`), one per line.
- Owned games are greyed out with a green **✓ Owned** badge. Bundles you partly own show "1 of 2 owned".
- Product pages you own show **You already own this.** above Add to cart.
- If your cart holds something you own, a red panel lists it on every page of the store (cart and checkout included). Dismiss hides it until the cart changes.
- The list syncs through your browser account (Chrome or Firefox sync). Export/Import on the manage page for backups or moving between browsers.

## How matching works

Titles become keys: `[CLUB]`, ` - ` and `[REPRINT]` are removed, then the series and number (SRG#, PS4#, PS5#, DE#, CE#, …) plus the platform in brackets at the end. `[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)` and `SRG#149: Grapple Dogs Cosmic Canines (Switch)` are both `SRG#149|switch`. DE#2 (Switch) and DE#2 (PS5) are different games. A missing platform matches any platform. Titles without a number (Mixtapes) match on the cleaned-up name. Other bracketed tags such as `[Steelbook]` make a separate item: `[Steelbook] SRG#88` is the case, not the game SRG#88. URLs aren't used for matching, because club handles are inconsistent (`copy-of-…`, `…-switch-1`).

The orders list doesn't show item titles, so the import reads each order's page, where every item link carries its title as bought. [CLUB] products are taken off the store when early access ends, so their titles only survive there. It first fetches the order page's HTML quietly; if the items aren't in it (the account site is a single-page app), it shows each order inside the app instead, with a Stop button. Only orders it can't read fall back to looking up the variant IDs from the "Buy again" link on the store (`/products.json`, then `/variants/<id>`), and anything still unknown is listed by order.

"Coming Soon!" listings can't be bought on their own, so they never get an **I own this** button. Without a release number they never show as owned; with one (`SRG#160: Coming Soon!`) they match that number, so a game you already have through a bundle shows as owned. Every release number in a title counts: bundle ranges like `SRG#158-160`, and bundles renamed after a reveal like `SRG#158: Foo + SRG#159: Bar + SRG#160: Coming Soon!`.

Titles come from Shopify's `/products/<handle>.js` (and `/collections/<c>/products.json` on collection pages) and `/cart.js`, so the extension doesn't depend on the theme's layout.

## Tests

```
node --test test/keys.test.js test/manifest.test.js   # title matching, manifest
python3 test/browser_test.py        # extension in Chrome for Testing against mock store pages
SERVER=1 python3 test/import_test.py   # order import, order pages sent with their items
SERVER=0 python3 test/import_test.py   # order import, items only shown by the app
REAL_ORDERS=orders.html REAL_ORDER=order.html python3 test/import_test.py   # your own saved account pages
```

## Releasing and store listings

- Every push runs the tests and the Firefox add-on lint on GitHub Actions (`.github/workflows/ci.yml`).
- To release: bump `version` in `src/manifest.json`, commit, then `git tag v1.0.0 && git push --tags`. The workflow checks the tag matches the manifest, builds `srg-owned-1.0.0.zip` and attaches it to a GitHub release. Upload that zip to the stores.
- Store texts, permission justifications, data disclosures, screenshots and the promo tile: [`docs/store/`](docs/store/listing.md). Regenerate the screenshots with `python3 tools/screenshots.py`.
