// Runs on account.superraregames.com. Collects what you've bought so the
// manage page can offer it for import. Nothing is saved as owned here: the
// manage page shows a review list first.
//
// - Orders list (/orders): each order has "View order #N, <status>, <total>" and a
//   "Buy again" link whose URL lists the order's product variant IDs. Titles aren't
//   on this page, so the manage page looks the IDs up on the store.
// - One order (/orders/<id>): item links carry the full product title.

(function () {
  const ext = (function (g) {
    // A real extension API has runtime.id. Checking for it skips a page element
    // that happens to be named "browser", and it's missing in a tab whose copy of
    // the extension was cut off by an update or reload.
    const ok = (o) => o && o.runtime && o.runtime.id && o.storage;
    return ok(g.browser) ? g.browser : ok(g.chrome) ? g.chrome : null;
  })(globalThis);
  const SKIP_STATUS = /cancel|refund/i; // "Canceled", "Cancelled", "Refunded"

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- reading the pages ----------

  function readOrdersList() {
    const orders = new Map();
    for (const a of document.querySelectorAll("a[aria-label^='View order #']")) {
      const m = a.getAttribute("aria-label").match(/^View order #([^,]+),\s*(.*?),\s*[^,]*$/);
      if (!m || orders.has(m[1])) continue;
      orders.set(m[1], { number: m[1], status: m[2], url: new URL(a.getAttribute("href"), location.href).pathname, variantIds: [] });
    }
    for (const a of document.querySelectorAll("a[aria-label^='Buy again for order #']")) {
      const n = a.getAttribute("aria-label").replace("Buy again for order #", "").trim();
      const o = orders.get(n);
      if (!o || o.variantIds.length) continue;
      const m = (a.getAttribute("href") || "").match(/\/cart\/([^?#]+)/);
      if (m) o.variantIds = m[1].split(",").map((p) => p.split(":")[0]).filter((id) => /^\d+$/.test(id));
    }
    return [...orders.values()];
  }

  // Item links carry the title as bought, even for [CLUB] products that have
  // since been taken off the store.
  // Items still on the store are links to their product page. Items that have
  // left the store (every [CLUB] product once early access ends) are plain rows:
  // the title is only in the thumbnail's alt text and the row's text.
  function readItems(root) {
    const items = new Map(); // title -> item
    for (const a of root.querySelectorAll("main a[href*='/products/'][aria-label]")) {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        if (!/superraregames\.com$/.test(u.hostname)) continue;
        const title = a.getAttribute("aria-label").trim();
        const handle = u.pathname.split("/products/")[1].split("/")[0];
        if (title) items.set(title, { title, handle, variantId: u.searchParams.get("variant") });
      } catch {}
    }
    for (const row of root.querySelectorAll("main [role='table'] [role='row']")) {
      // order totals rows (Subtotal, Shipping, Total) have row headers; item rows don't
      if (row.querySelector("[role='rowheader'], [role='columnheader']")) continue;
      if (row.querySelector("a[href*='/products/'][aria-label]")) continue; // read above
      const img = row.querySelector("img[alt]");
      let title = img ? img.getAttribute("alt").trim() : "";
      if (!title) {
        const cells = row.querySelectorAll("[role='cell']");
        const span = cells[1] && cells[1].querySelector("span");
        title = span ? span.textContent.trim() : "";
      }
      if (title && !items.has(title)) items.set(title, { title, handle: null, variantId: null });
    }
    return [...items.values()];
  }

  // How complete is the order on screen? Each item row shows a quantity badge
  // ("Quantity 2"), and the totals say "Subtotal · 11 items" (the sum of
  // quantities). The app can show an order with only some of its items first,
  // so an order is only read once the rows add up to the subtotal.
  function itemRows(root) {
    return [...root.querySelectorAll("main [role='table'] [role='row']")].filter(
      (row) => !row.querySelector("[role='rowheader'], [role='columnheader']") && row.querySelector("[role='cell']")
    );
  }

  function rowQuantity(row) {
    const label = [...row.querySelectorAll("span")].find((x) => x.textContent.trim() === "Quantity");
    const n = label && parseInt(label.parentElement.textContent.replace("Quantity", ""), 10);
    return n > 0 ? n : 1;
  }

  function orderState(root) {
    const items = readItems(root);
    const rows = itemRows(root);
    const qty = rows.length ? rows.reduce((a, r) => a + rowQuantity(r), 0) : items.length;
    let expected = null;
    for (const h of root.querySelectorAll("main [role='rowheader']")) {
      const m = h.textContent.match(/Subtotal\s*·\s*(\d+)\s*items?/i);
      if (m) expected = parseInt(m[1], 10);
    }
    return { items, qty, expected, complete: expected === null ? null : qty >= expected };
  }

  function orderHeading(root) {
    const h1 = [...root.querySelectorAll("main h1")].map((h) => h.textContent.trim()).find((t) => /^Order #/.test(t));
    return h1 ? h1.replace(/^Order #/, "") : null;
  }

  function readOrderPage() {
    const statusEl = document.querySelector("main h1 ~ span");
    return {
      number: orderHeading(document) || location.pathname.split("/").pop(),
      status: statusEl ? statusEl.textContent.trim() : "",
      url: location.pathname,
      items: readItems(document),
    };
  }

  // Way 1: fetch the order page's HTML. Works only if the server sends the items in it.
  async function itemsByFetch(o) {
    try {
      const r = await fetch(o.url, { credentials: "include" });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const st = orderState(doc);
      // incomplete (or no items): let the app show it instead
      return st.items.length && st.complete !== false ? { items: st.items, partial: false } : null;
    } catch {
      return null;
    }
  }

  // Way 2: show the order inside the account site's own app (it's a single-page
  // app, so changing the URL and announcing it makes it render that order), then
  // read the items once they've appeared and stopped changing.
  function goTo(url) {
    const idx = (history.state && history.state.idx) || 0;
    history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx: idx + 1 }, "", url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }

  // Wait until the order on screen is complete: the rows add up to the subtotal
  // (seen twice in a row), or, if there's no subtotal, nothing has changed for
  // a second. Gives up after `timeout`, returning what it has as partial.
  async function waitForOrder(number, timeout = 15000) {
    let last = null, steady = 0, best = null;
    for (let t = 0; t < timeout; t += 250) {
      await sleep(250);
      if (number && orderHeading(document) !== number) continue;
      const st = orderState(document);
      if (st.expected === 0) return { items: [], partial: false };
      if (!st.items.length) continue;
      best = st;
      const sig = st.items.length + ":" + st.qty;
      steady = sig === last ? steady + 1 : 0;
      last = sig;
      if (st.complete === true && steady >= 1) return { items: st.items, partial: false };
      if (st.complete === null && steady >= 4) return { items: st.items, partial: false };
    }
    return best ? { items: best.items, partial: true } : null;
  }

  async function itemsByNavigation(o, timeout = 15000) {
    goTo(o.url);
    return waitForOrder(o.number, timeout);
  }

  // Click "Show more orders" until it's gone or stops loading more.
  async function loadAllOrders(onProgress) {
    for (let round = 0; round < 200; round++) {
      const count = readOrdersList().length;
      onProgress(count);
      const btn = document.querySelector("button[aria-label='Show more orders']");
      if (!btn) return { complete: true };
      btn.click();
      let grew = false;
      for (let t = 0; t < 60; t++) {
        await sleep(250);
        if (readOrdersList().length > count) {
          grew = true;
          break;
        }
        if (!document.querySelector("button[aria-label='Show more orders']")) break;
      }
      if (!grew && document.querySelector("button[aria-label='Show more orders']")) return { complete: false };
    }
    return { complete: false };
  }

  let stopRequested = false;

  // Fill in each order's items: way 1 if the first order shows it works, else way 2.
  // Orders where neither works keep their variant IDs for the manage page to look up.
  async function readAllOrders(orders, onProgress) {
    let mode = null; // "fetch" | "nav" | "off"
    let navFails = 0;
    for (let i = 0; i < orders.length; i++) {
      if (stopRequested) break;
      const o = orders[i];
      onProgress(i + 1, orders.length);
      let res = null;
      if (mode !== "nav" && mode !== "off") {
        res = await itemsByFetch(o);
        if (mode === null) mode = res ? "fetch" : "nav";
      }
      if (!res && mode !== "off") {
        res = await itemsByNavigation(o);
        if (mode === "nav") {
          navFails = res && res.items.length ? 0 : navFails + 1;
          if (navFails >= 3) mode = "off"; // the app isn't responding to this; stop trying
        }
      }
      if (res && res.items.length) {
        o.items = res.items;
        if (res.partial) o.partial = true;
      }
    }
    if (mode === "nav" || location.pathname.replace(/\/$/, "") !== "/orders") goTo("/orders");
    return { read: orders.filter((o) => o.items && o.items.length).length, stopped: stopRequested };
  }

  const STALE = "SRG Owned was updated or reloaded. Reload this page and try again.";
  function alive() {
    try {
      return !!(ext && ext.runtime && ext.runtime.id);
    } catch {
      return false;
    }
  }

  async function handOver(payload) {
    if (!alive()) throw new Error(STALE);
    await ext.storage.local.set({ srgoImport: { at: Date.now(), ...payload } });
  }

  // A link the user clicks, rather than opening a tab ourselves: browsers block
  // tabs opened long after the click, and loading every order takes a while.
  function reviewLink() {
    const a = el("a", "srgo-primary srgo-link", "Open the review");
    a.href = alive() ? ext.runtime.getURL("options.html") : "#";
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // ---------- panel ----------

  let panel = null;
  function showPanel(mode) {
    if (panel && panel.dataset.mode === mode) return;
    if (panel) panel.remove();
    panel = el("div", "srgo-account srgo-ui");
    panel.dataset.mode = mode;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "SRG Owned");
    panel.appendChild(el("strong", null, "SRG Owned"));
    const msg = el("p", "srgo-account-msg", mode === "list" ? "Add the games from your orders to your owned list. You'll see the list before anything is saved." : "Add this order's games to your owned list. You'll see the list before anything is saved.");
    msg.setAttribute("aria-live", "polite");
    panel.appendChild(msg);
    const row = el("div", "srgo-account-actions");
    const go = el("button", "srgo-primary", mode === "list" ? "Import from all orders" : "Add this order's games");
    go.type = "button";
    const close = el("button", null, "Hide");
    close.type = "button";
    close.addEventListener("click", () => {
      panel.remove();
      panel = null;
      hiddenFor = location.pathname;
    });
    row.append(go, close);
    panel.appendChild(row);
    document.body.appendChild(panel);

    go.addEventListener("click", async () => {
      // check before spending minutes reading orders that couldn't be handed over
      if (!alive()) {
        msg.textContent = STALE;
        return;
      }
      go.disabled = true;
      try {
        if (mode === "list") {
          busy = true;
          stopRequested = false;
          const res = await loadAllOrders((n) => (msg.textContent = `Loading your orders… ${n} so far.`));
          const orders = readOrdersList();
          const kept = orders.filter((o) => !SKIP_STATUS.test(o.status));
          const stop = el("button", null, "Stop");
          stop.type = "button";
          stop.addEventListener("click", () => {
            stopRequested = true;
            stop.disabled = true;
            stop.textContent = "Stopping…";
          });
          close.replaceWith(stop);
          const walk = await readAllOrders(kept, (i, n) => (msg.textContent = `Reading order ${i} of ${n}…`));
          stop.replaceWith(close);
          const skipped = orders.length - kept.length;
          msg.textContent =
            `Read ${walk.read} of ${kept.length} orders${walk.stopped ? " (stopped early)" : ""}` +
            (skipped ? `; ${skipped} cancelled or refunded skipped` : "") +
            ".";
          await handOver({ source: "orders", complete: res.complete, orders });
        } else {
          msg.textContent = "Waiting for the order to finish loading…";
          const res = await waitForOrder(orderHeading(document), 15000);
          const order = readOrderPage();
          if (!res || !res.items.length) {
            msg.textContent = "Couldn't find any items on this page. Wait for it to finish loading, then try again.";
            go.disabled = false;
            return;
          }
          order.items = res.items;
          if (res.partial) order.partial = true;
          msg.textContent = res.partial
            ? `Found ${res.items.length} items, but the order hadn't finished loading. Some may be missing.`
            : `Found ${res.items.length} items.`;
          await handOver({ source: "order", complete: true, orders: [order] });
        }
        go.replaceWith(reviewLink());
        return;
      } catch (e) {
        msg.textContent = e.message === STALE ? STALE : "Something went wrong: " + e.message;
      } finally {
        busy = false;
        last = location.pathname.replace(/\/$/, "");
      }
      go.disabled = false;
    });
  }

  // The account site is a single-page app, so watch for page changes.
  let hiddenFor = null;
  let last = "";
  let busy = false;
  function check() {
    if (busy) return; // we're moving between orders ourselves
    const path = location.pathname.replace(/\/$/, "");
    if (path === last) return;
    last = path;
    if (hiddenFor === location.pathname) return;
    if (/\/orders$/.test(path)) showPanel("list");
    else if (/\/orders\/\d+$/.test(path)) showPanel("order");
    else if (panel) {
      panel.remove();
      panel = null;
    }
  }
  setInterval(check, 800);
  check();
})();
