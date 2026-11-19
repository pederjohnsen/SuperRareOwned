// Runs on account.superraregames.com. Collects what you've bought so the
// manage page can offer it for import. Nothing is saved as owned here: the
// manage page shows a review list first.
//
// - Orders list (/orders): each order has "View order #N, <status>, <total>" and a
//   "Buy again" link whose URL lists the order's product variant IDs. Titles aren't
//   on this page, so the manage page looks the IDs up on the store.
// - One order (/orders/<id>): item links carry the full product title.

(function () {
  const ext = globalThis.browser || globalThis.chrome;
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
  function readItems(root) {
    const items = new Map();
    for (const a of root.querySelectorAll("main a[href*='/products/'][aria-label]")) {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        if (!/superraregames\.com$/.test(u.hostname)) continue;
        const handle = u.pathname.split("/products/")[1].split("/")[0];
        items.set(handle, { title: a.getAttribute("aria-label"), handle, variantId: u.searchParams.get("variant") });
      } catch {}
    }
    return [...items.values()];
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
      const items = readItems(doc);
      return items.length ? items : null;
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

  async function itemsByNavigation(o, timeout = 8000) {
    goTo(o.url);
    let last = -1, steady = 0;
    for (let t = 0; t < timeout; t += 200) {
      await sleep(200);
      if (orderHeading(document) !== o.number) continue;
      const n = readItems(document).length;
      if (n && n === last) {
        if (++steady >= 2) return readItems(document);
      } else steady = 0;
      last = n;
    }
    return null;
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
      let items = null;
      if (mode !== "nav" && mode !== "off") {
        items = await itemsByFetch(o);
        if (mode === null) mode = items ? "fetch" : "nav";
      }
      if (!items && mode !== "off") {
        items = await itemsByNavigation(o);
        if (mode === "nav") {
          navFails = items ? 0 : navFails + 1;
          if (navFails >= 3) mode = "off"; // the app isn't responding to this; stop trying
        }
      }
      if (items) o.items = items;
    }
    if (mode === "nav" || location.pathname.replace(/\/$/, "") !== "/orders") goTo("/orders");
    return { read: orders.filter((o) => o.items && o.items.length).length, stopped: stopRequested };
  }

  async function handOver(payload) {
    await ext.storage.local.set({ srgoImport: { at: Date.now(), ...payload } });
  }

  // A link the user clicks, rather than opening a tab ourselves: browsers block
  // tabs opened long after the click, and loading every order takes a while.
  function reviewLink() {
    const a = el("a", "srgo-primary srgo-link", "Open the review");
    a.href = ext.runtime.getURL("options.html");
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
          let order = readOrderPage();
          for (let t = 0; t < 25 && !order.items.length; t++) {
            msg.textContent = "Waiting for the order to load…";
            await sleep(200);
            order = readOrderPage();
          }
          if (!order.items.length) {
            msg.textContent = "Couldn't find any items on this page. Wait for it to finish loading, then try again.";
            go.disabled = false;
            return;
          }
          msg.textContent = `Found ${order.items.length} items.`;
          await handOver({ source: "order", complete: true, orders: [order] });
        }
        go.replaceWith(reviewLink());
        return;
      } catch (e) {
        msg.textContent = "Something went wrong: " + e.message;
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
