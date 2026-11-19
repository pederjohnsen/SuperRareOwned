# SRG Owned privacy policy

Effective 19 November 2026

SRG Owned is an unofficial browser extension that marks Super Rare Games releases you already own. It is not made by or affiliated with Super Rare Games. It has no server: the developer receives no data from it, and it contains no analytics, advertising or tracking.

## What the extension stores

- **Your owned list.** The titles and release numbers of games you mark as owned, either with the "I own this" button or by importing from your orders. It is kept in your browser's extension storage (`storage.sync`). If you have turned on your browser's own sync (a Google account in Chrome, a Mozilla account in Firefox), the browser copies this list between your devices. The developer cannot see it.
- **An import in progress.** When you click "Import from all orders" or "Add this order's games", the order numbers, statuses and item titles it read are kept in your browser's local extension storage (`storage.local`) until you finish or cancel the review, then deleted.
- **A short-lived title cache.** While you browse superraregames.com, product titles the extension has looked up are cached in that tab's session storage, which is cleared when the tab closes.

## What the extension reads

- **Store pages on superraregames.com**, to find product titles and show which ones you own, and your cart (`/cart.js`) to warn when it holds something you own.
- **Your order history on account.superraregames.com**, but only after you click an import button. It reads order numbers, order statuses and the titles of the items in each order. It does not read or store your name, addresses, email, phone number or payment details.

## What leaves your browser

Nothing is sent to the developer or to any third party. To identify items, the extension makes requests only to Super Rare Games' own website (product pages, `/products.json`, `/variants/<id>`, `/cart.js` and your order pages), the same site you are already using.

## Your control

- Remove any game from your list on the extension's manage page, or remove the extension to delete everything it stored.
- **Export** on the manage page saves a copy of your list as a file; **Import** reads it back.
- The extension only runs on superraregames.com and its subdomains.

## Changes and contact

Changes to this policy will be published in this file, with a new effective date. Questions or requests: open an issue at <https://github.com/pederjohnsen/SuperRareOwned/issues>.
