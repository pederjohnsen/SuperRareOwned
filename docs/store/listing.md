# Store listing kit

Everything to paste into the Chrome Web Store and Firefox Add-ons (AMO) forms. Screenshots and the promo tile are in this folder. The upload is the zip from the latest GitHub release (or `zip -r ../srg-owned.zip .` inside `src/`).

## Shared

**Name** (from the manifest): SRG Owned (unofficial)

**Short description / summary** (Chrome uses the manifest's description, up to 132 characters; AMO allows 250):

> Marks Super Rare Games releases you already own, warns before you buy one twice, and imports them from your order history. Unofficial.

**Category:** Shopping

**Homepage / support URL:** https://github.com/pederjohnsen/SuperRareOwned (support: https://github.com/pederjohnsen/SuperRareOwned/issues)

**Privacy policy URL:** https://github.com/pederjohnsen/SuperRareOwned/blob/main/PRIVACY.md

**Detailed description:**

```
Never buy the same Super Rare Games release twice in the rush of a launch or a sale.

SRG Owned marks the games you already own wherever they appear on superraregames.com: store pages, search results, recommendations, product pages, quick view and your cart.

• Owned games are greyed out with a green "Owned" badge. Bundles you partly own show "1 of 2 owned".
• Product pages and quick view say "You already own this" above Add to cart for games you own.
• A warning lists anything in your cart that you already own.
• Import your owned games from your Super Rare Games order history in one click. You review the list before anything is saved, cancelled orders are skipped, and merch is left unticked.
• Mark single releases yourself with "I own this" on store pages, product pages and quick view.
• Matches by release number and platform (SRG#, PS4#, PS5#, Deluxe and Collector's Editions), so the Switch and PS5 versions of a game are kept apart, and steelbooks aren't confused with the game.
• Your list syncs through your browser account. Export and import it as a file for backups.

Private by design: no account, no server, no tracking. Your list stays in your browser, and the extension only runs on superraregames.com.

SRG Owned is an unofficial tool. It is not made by or affiliated with Super Rare Games.
```

**Screenshot captions** (files in this folder, 1280×800):

1. `1-collection.png`: Owned games greyed out with a badge on a store page.
2. `2-product.png`: "You already own this" on the product page of a game you own.
3. `3-cart.png`: The cart warning when a game you own is in your cart.
4. `4-import.png`: Importing from your order history: review before anything is saved.
5. `5-manage.png`: Your owned list, with quick add, filter and backup.

## Chrome Web Store: Privacy practices tab

**Single purpose:**

> Shows which Super Rare Games releases the user already owns while they shop on superraregames.com, so they don't buy the same release twice.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's list of owned games (synced through the user's browser account), and holds an order import while the user reviews it. |
| Host permission `https://superraregames.com/*` | The extension's only purpose is marking owned games on this store: it adds badges and the "I own this" button to its pages, reads product titles from the store's product endpoints, and reads the cart to warn about owned games in it. |
| Host permission `https://*.superraregames.com/*` | Covers www.superraregames.com and account.superraregames.com, where the user's order history is. Order pages are read only when the user clicks an import button. |
| Web accessible resource `options.html` (account.superraregames.com only) | Lets the import panel on the user's orders page link to the extension's review page, where the user confirms what to add. |

**Remote code:** No, I am not using remote code. (All code ships in the package; nothing is downloaded or evaluated at runtime.)

**Data usage, what the extension handles:**

- [x] **Website content**: product titles on superraregames.com pages, used to show owned badges.
- [x] **Financial and payment information**: the user's order history on account.superraregames.com (order numbers, statuses and item titles only), read only when the user clicks import, to add their purchases to the owned list. No payment details are read.
- Everything else: unticked. Nothing is sent to the developer or third parties; data stays in the browser's extension storage.

**Certifications** (tick all three): not sold or transferred to third parties outside the approved use cases; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

## Firefox Add-ons (AMO)

- Distribution: **On this site** (listed).
- Compatibility: Firefox and Firefox for Android (the manifest declares `gecko_android`).
- Data collection: the manifest declares `"required": ["none"]`; nothing is transmitted to the developer or third parties.
- License: pick one in the form (MIT is a common choice if you want to allow reuse; add a matching `LICENSE` file to the repo).
- Source code: not needed. The package is the plain, unminified source; there is no build step.

**Notes to reviewer:**

```
No build step: the uploaded files are the source (https://github.com/pederjohnsen/SuperRareOwned, src/).

The extension only runs on superraregames.com and its subdomains. To try it without an account: open https://superraregames.com/collections/all, hover a single-release product card and click "I own this" at the bottom of its cover; the card gets an "Owned" badge, and its product page shows "You already own this". Adding an owned game to the cart shows a warning.

The order import (account.superraregames.com/orders) needs a Super Rare Games customer account; it reads order numbers, statuses and item titles from the user's own order pages after they click "Import from all orders", and the user confirms the list on the extension's manage page before anything is saved.

No data is sent anywhere except requests to superraregames.com itself (product, cart and order pages) to look up product titles.
```

## Before you submit

- [ ] Use **Export** in your current unpacked copy: the store version has a different extension ID and starts with an empty list. Import the file into the store version afterwards.
- [ ] Optional: ask Super Rare Games if they're happy with the name "SRG Owned" (the listing and extension already say it's unofficial).
- [ ] Chrome: register at https://chrome.google.com/webstore/devconsole (one-time US$5), upload the zip, fill in the listing and Privacy practices tab from above, add screenshots and the small promo tile (`promo-440x280.png`).
- [ ] Firefox: sign in at https://addons.mozilla.org/developers/ with a Mozilla account, submit a new add-on, choose "On this site", upload the same zip, fill in the listing from above.
- [ ] Edge (optional, free): https://partner.microsoft.com/dashboard/microsoftedge/ accepts the same zip and the same texts.
