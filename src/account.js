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

  function readOrderPage() {
    const h1 = [...document.querySelectorAll("main h1")].map((h) => h.textContent.trim()).find((t) => /^Order #/.test(t));
    const number = h1 ? h1.replace(/^Order #/, "") : location.pathname.split("/").pop();
    const items = new Map();
    for (const a of document.querySelectorAll("main a[href*='/products/'][aria-label]")) {
      try {
        const u = new URL(a.href);
        if (!/superraregames\.com$/.test(u.hostname)) continue;
        const handle = u.pathname.split("/products/")[1].split("/")[0];
        items.set(handle, { title: a.getAttribute("aria-label"), handle, variantId: u.searchParams.get("variant") });
      } catch {}
    }
    const statusEl = document.querySelector("main h1 ~ span");
    return { number, status: statusEl ? statusEl.textContent.trim() : "", url: location.pathname, items: [...items.values()] };
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
          const res = await loadAllOrders((n) => (msg.textContent = `Loading your orders… ${n} so far.`));
          const orders = readOrdersList();
          const skipped = orders.filter((o) => SKIP_STATUS.test(o.status)).length;
          msg.textContent = `Found ${orders.length} orders${skipped ? ` (${skipped} cancelled or refunded, skipped)` : ""}.`;
          await handOver({ source: "orders", complete: res.complete, orders });
        } else {
          const order = readOrderPage();
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
      }
      go.disabled = false;
    });
  }

  // The account site is a single-page app, so watch for page changes.
  let hiddenFor = null;
  let last = "";
  function check() {
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
