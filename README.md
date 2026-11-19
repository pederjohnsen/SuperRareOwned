# SRG Owned

*Unofficial: not made by or affiliated with Super Rare Games.* [Privacy policy](PRIVACY.md)

Browser extension (Chrome and Firefox) that marks Super Rare Games releases you already own, wherever they appear on the store.

## Install

**Chrome / Edge / Brave:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `src` folder. Keep the folder: Chrome loads it from there.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `src/manifest.json`. Temporary add-ons are removed when Firefox restarts. To keep it installed, sign it as an unlisted add-on (free, not published) at addons.mozilla.org → Developer Hub → Submit → "On your own", then install the signed .xpi. If badges don't appear, open the Extensions menu (puzzle icon) and allow it on superraregames.com.

## Use

The version you're running is shown in the panel on your orders page, the toolbar popup and at the bottom of the manage page.

After installing or reloading a new version, reload any superraregames.com tabs you already had open: tabs left open keep the old copy, which can no longer reach the extension's storage (the panel says so if you try).


- **Import from your orders:** open [your orders](https://account.superraregames.com/orders) and click **Import from all orders** in the SRG Owned panel. It loads every order, skips cancelled and refunded ones, reads each order's items (titles as bought, so products that have since left the store still count), then gives you an **Open the review** link to a review list: numbered games are ticked; merch and trading card packs (`TC#`) are listed under other items, unticked; and nothing is saved until you click **Add**. Unshipped pre-orders count as owned. On a single order's page, **Add this order's games** does the same for that order.
- To mark a single release as owned (or remove it), hover its card on a store listing page and click **I own this** at the bottom of the cover, or use the button under the title on its product page or in its quick view. That's the only place the button appears: not in the cart, recommendations or elsewhere, and not on bundles or "Coming Soon!" listings. Badges still show everywhere.
- Or click the toolbar icon → **Manage owned games** and paste titles or numbers (`SRG#149`, `PS5#17`, `DE#2 (Switch)`), one per line.
- Owned games are greyed out with a green **✓ Owned** badge on the bottom-left of the cover (the store keeps its own badges in the top corners). Bundles you partly own show "1 of 2 owned". Small thumbnails get just a ✓.
- **Bundles count as what's in them.** Owning "Wax Heads: Switch Game & Vinyl (Bundle)" means owning the Switch game and the vinyl, and owning those separately means owning the bundle (owning just the game shows the bundle as "1 of 2 owned"). The same goes for PB#, PS5 Bundle, SW2 PB#, Deluxe/Steelbook/Collector's/Special Edition bundles and MTC# trading card bundles. Bundles aren't marked by hand; mark the releases in them, or import your orders.
- Product pages and quick views of games you own show **You already own this.** above Add to cart.
- If your cart holds something you own, a red panel lists it on every page of the store (cart and checkout included). Dismiss hides it until the cart changes.
- The list syncs through your browser account (Chrome or Firefox sync). Export/Import on the manage page for backups or moving between browsers.

## How matching works

**Bundles.** A bundle names its contents after the colon ("PS5 Bundle #8: Haste & KILL KNIGHT (PS5)"). The extension looks those names up in the store's public product list (`/products.json`, cached for 12 hours) and treats the bundle as the releases it found: the games on the bundle's platform and in its edition, each game's TC pack for an MTC# bundle, or the game plus extras for a "Game & Vinyl" bundle. "Game #154" (not revealed yet) is release #154 on that platform. Names it can't find are kept by name. Bundles that don't name their contents ("Niko's Treasure Bundle!") stay single items. Bundles saved under their own number before this are converted the next time the store or manage page opens.


Titles become keys: `[CLUB]`, ` - ` and `[REPRINT]` are removed, then the series and number (SRG#, PS4#, PS5#, DE#, CE#, …) plus the platform in brackets at the end. `[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)` and `SRG#149: Grapple Dogs Cosmic Canines (Switch)` are both `SRG#149|switch`. DE#2 (Switch) and DE#2 (PS5) are different games. A missing platform matches any platform. Titles without a number (Mixtapes) match on the cleaned-up name. Other bracketed tags such as `[Steelbook]` make a separate item: `[Steelbook] SRG#88` is the case, not the game SRG#88. URLs aren't used for matching, because club handles are inconsistent (`copy-of-…`, `…-switch-1`).

The orders list doesn't show item titles, so the import reads each order's page. Items still on the store are links carrying their title; items that have left the store (every [CLUB] product once early access ends) are plain rows, read from the thumbnail's alt text and the row text. [CLUB] products are taken off the store when early access ends, so their titles only survive there. It first fetches order pages' HTML quietly; if the first three don't contain the items (the account site renders them in the browser), it opens the remaining order pages one after another, exactly like clicking through them by hand, keeping its place in extension storage between page loads. The panel shows progress with a Stop button, returns to the orders list at the end and offers the review. If you go elsewhere mid-import, it pauses with Continue / Cancel. Either way an order is only read once it's complete: the item rows' quantities must add up to the order's "Subtotal · N items" (or, without a subtotal, nothing changes for a second), because the app can show an order with only some of its items first. Orders that don't finish within 15 seconds keep what was found and are listed in the review. Only orders it can't read fall back to looking up the variant IDs from the "Buy again" link on the store (`/products.json`, then `/variants/<id>`), and anything still unknown is listed by order.

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
