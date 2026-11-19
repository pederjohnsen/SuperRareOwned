// Marks games you own wherever Super Rare Games products appear, and warns
// when the cart holds something you own.

(function () {
  const K = globalThis.SRGOKeys;
  const S = globalThis.SRGOStore;
  // Firefox content scripts fetch with the extension's identity; content.fetch
  // makes the request as the page does (same cookies, same cart).
  const pageFetch =
    typeof content !== "undefined" && content && content.fetch
      ? content.fetch.bind(content)
      : window.fetch.bind(window);

  let owned = {};
  const titles = new Map(); // handle -> Promise<string|null>

  // ---------- titles ----------

  function handleFrom(href) {
    try {
      const u = new URL(href, location.href);
      if (u.hostname !== location.hostname) return null;
      const m = u.pathname.match(/\/products\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]).toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function cacheTitle(handle, title) {
    titles.set(handle, Promise.resolve(title));
    try {
      sessionStorage.setItem("srgo:t:" + handle, title);
    } catch {}
  }

  let active = 0;
  const queue = [];
  function limited(fn) {
    return new Promise((resolve) => {
      const run = async () => {
        active++;
        try {
          resolve(await fn());
        } finally {
          active--;
          if (queue.length) queue.shift()();
        }
      };
      active < 4 ? run() : queue.push(run);
    });
  }

  function titleFor(handle) {
    if (titles.has(handle)) return titles.get(handle);
    let cached = null;
    try {
      cached = sessionStorage.getItem("srgo:t:" + handle);
    } catch {}
    if (cached) {
      titles.set(handle, Promise.resolve(cached));
      return titles.get(handle);
    }
    const p = limited(async () => {
      try {
        const r = await pageFetch(location.origin + "/products/" + encodeURIComponent(handle) + ".js", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!r.ok) return null;
        const j = await r.json();
        if (j && j.title) {
          cacheTitle(handle, j.title);
          return j.title;
        }
      } catch {}
      titles.delete(handle); // try again on the next scan
      return null;
    });
    titles.set(handle, p);
    return p;
  }

  // On a collection page, one request gets every title on it.
  async function seedCollection() {
    const m = location.pathname.match(/\/collections\/([^/?#]+)/);
    if (!m || /\/products\//.test(location.pathname)) return;
    try {
      const r = await pageFetch(`${location.origin}/collections/${m[1]}/products.json?limit=250`, {
        credentials: "same-origin",
      });
      if (!r.ok) return;
      const j = await r.json();
      for (const p of j.products || []) if (p.handle && p.title) cacheTitle(p.handle.toLowerCase(), p.title);
    } catch {}
  }

  // ---------- small DOM helpers ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function label(st) {
    if (!st.total) return null;
    if (st.owned === st.total) return "Owned";
    if (st.owned > 0) return `${st.owned} of ${st.total} owned`;
    return null;
  }

  function toggleButton(title, st, short) {
    const isOwned = st.total > 0 && st.owned === st.total;
    const b = el("button", "srgo-toggle", isOwned ? (short ? "Remove" : "Remove from owned") : "I own this");
    b.type = "button";
    b.title = isOwned ? "Remove from your owned games" : "Add to your owned games";
    b.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        S.setOwned(title, !isOwned).catch((err) => {
          b.textContent = "Reload the page";
          b.title = err.message;
        });
      },
      true
    );
    return b;
  }

  const currentHandle = handleFrom(location.href);
  const onProductPage = /\/products\//.test(location.pathname);
  // Marking as owned is only offered where you're looking at releases on purpose:
  // product cards on store listing pages, and a release's own page or quick view.
  // Not in the cart, recommendations or anywhere else, where a stray click is too easy.
  const onListingPage = /^\/collections\/[^/]+\/?$/.test(location.pathname);
  const IN_CART = "[role='dialog'], dialog, [id*='cart' i], [class*='cart' i], [id*='drawer' i], [class*='drawer' i]";

  // Only a single release that can be bought on its own: not bundles, not "Coming Soon!".
  function editable(st) {
    return st.total === 1 && !st.parsed.comingSoon;
  }

  // ---------- product panels: a release's own page, and its quick view ----------
  //
  // A product title (h1) with an add-to-cart form beside it. Pages hold other
  // add-to-cart forms too (a hidden Shop Pay instalments form, a sticky bar, one
  // in every product card), so it has to be the form next to the title, not the
  // first in the page. The store's quick view uses the same layout in a popup.

  function addForms(root) {
    return [...root.querySelectorAll("form[action*='/cart/add']")].filter(
      (f) =>
        f.querySelector("button[name='add'], button[type='submit'], input[type='submit']") &&
        // the sticky Add to cart bar ("sticky-cart-button__form"), not the product
        // info column, which the store also calls "...-sticky"
        !/sticky/i.test(f.className) &&
        !f.closest("[class*='sticky-cart' i], [class*='sticky-add' i], [class*='sticky-bar' i], [class*='product-card'], .srgo-card")
    );
  }

  function findPanels() {
    const panels = [];
    for (const h1 of document.querySelectorAll("h1")) {
      if (h1.closest(".srgo-ui")) continue;
      let p = h1.parentElement;
      for (let d = 0; p && p !== document.body && d < 5; d++, p = p.parentElement) {
        const forms = addForms(p);
        if (forms.length > 2) break; // a whole grid of products, not one release
        if (forms.length) {
          panels.push({ h1, root: p, form: forms[0] });
          break;
        }
      }
    }
    return panels;
  }

  function decoratePanel({ h1, root, form }) {
    root.dataset.srgoPanel = "1";
    const title = h1.textContent.replace(/\s+/g, " ").trim();
    if (!title) return;
    const st = K.status(title, owned);
    const text = label(st);
    const full = text && st.owned === st.total;
    const sig = [title, text, editable(st)].join("|");

    let bar = h1.nextElementSibling && h1.nextElementSibling.classList.contains("srgo-pdp") ? h1.nextElementSibling : null;
    if (!bar) {
      bar = el("div", "srgo-pdp srgo-ui");
      h1.insertAdjacentElement("afterend", bar);
    }
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      bar.replaceChildren();
      if (text) bar.appendChild(el("span", "srgo-badge srgo-inline srgo-" + (full ? "owned" : "partial"), (full ? "✓ " : "") + text));
      if (editable(st)) bar.appendChild(toggleButton(title, st));
    }

    let warn = form.previousElementSibling && form.previousElementSibling.classList.contains("srgo-pdp-warning") ? form.previousElementSibling : null;
    if (text) {
      if (!warn) {
        warn = el("div", "srgo-pdp-warning srgo-ui");
        warn.setAttribute("role", "alert");
        form.insertAdjacentElement("beforebegin", warn);
      }
      const msg = full ? "You already own this." : `You already own ${st.owned} of the ${st.total} games in this.`;
      if (warn.textContent !== msg) warn.textContent = msg;
    } else if (warn) warn.remove();
  }

  function decoratePanels() {
    for (const p of findPanels()) decoratePanel(p);
  }

  // ---------- product cards ----------

  const CARD_STOP = "body, main, header, footer, nav, section, [role='dialog'], dialog, form[action*='/cart/add'], [data-srgo-panel]";

  // Climb from the link to the largest element that's still only about this one product.
  function cardFor(link, handle) {
    let card = link;
    for (let depth = 0; depth < 7; depth++) {
      // grid item or cart row: that's the card
      if (card.tagName === "LI" || card.tagName === "ARTICLE" || card.tagName === "TR") break;
      const p = card.parentElement;
      if (!p || p.matches(CARD_STOP) || p.querySelector("h1")) break;
      const others = [...p.querySelectorAll("a[href*='/products/']")].some((a) => handleFrom(a.href) !== handle);
      if (others) break;
      card = p;
    }
    return card;
  }

  // The badge and button sit on the cover's bottom edge: the store keeps its own
  // badges in the top corners ("New", "Low Stock"), the quick-view button in the
  // middle, and Add to cart below the price.
  function coverOf(card) {
    const img = [...card.querySelectorAll("img")].find((i) => !i.closest(".srgo-ui"));
    if (!img) return card;
    const link = img.closest("a");
    // a link holding just the image is exactly the cover; otherwise the image's box
    const cover = link && link !== card && card.contains(link) && !link.textContent.trim() ? link : img.parentElement;
    return cover && card.contains(cover) ? cover : card;
  }

  function decorateCard(card, title) {
    const st = K.status(title, owned);
    const text = label(st);
    const state = !text ? "none" : st.owned === st.total ? "owned" : "partial";
    if (card.dataset.srgoState === state) return;
    card.dataset.srgoState = state;
    card.classList.add("srgo-card");
    card.querySelectorAll(".srgo-badge, .srgo-toggle").forEach((n) => !n.closest(".srgo-pdp") && n.remove());
    const cover = coverOf(card);
    const cs = getComputedStyle(cover);
    if (cs.position === "static") cover.classList.add("srgo-relative");
    if (cs.display === "inline") cover.classList.add("srgo-inline-block");
    // small thumbnails (the cart) get just a tick, which fits inside the image
    const w = cover.getBoundingClientRect().width;
    const compact = w > 0 && w < 130;
    if (text) {
      const b = el("span", "srgo-badge srgo-" + state + (compact ? " srgo-compact" : ""), compact ? (state === "owned" ? "✓" : `${st.owned}/${st.total}`) : (state === "owned" ? "✓ " : "") + text);
      if (compact) b.title = text;
      cover.appendChild(b);
    }
    if (onListingPage && editable(st) && !card.closest(IN_CART)) cover.appendChild(toggleButton(title, st, true));
  }

  async function scanCards() {
    const links = document.querySelectorAll("a[href*='/products/']");
    const seen = new Set();
    for (const a of links) {
      // "View full details" in a quick view, the product page's own links: not cards
      if (a.closest("nav, .srgo-ui, [data-srgo-panel]")) continue;
      const handle = handleFrom(a.href);
      if (!handle) continue;
      // links to the product you're on (breadcrumbs, share links) aren't cards,
      // but the same product inside the cart drawer is
      if (onProductPage && handle === currentHandle && !a.closest("[role='dialog'], dialog, [id*='cart' i], [class*='cart' i]"))
        continue;
      const card = cardFor(a, handle);
      if (seen.has(card)) continue;
      seen.add(card);
      card.dataset.srgoHandle = handle;
      titleFor(handle).then((title) => {
        if (title && card.isConnected && card.dataset.srgoHandle === handle) decorateCard(card, title);
      });
    }
  }

  // ---------- cart warning ----------

  let lastCartCheck = 0;
  let cartTimer = null;
  function checkCartSoon(delay = 600) {
    clearTimeout(cartTimer);
    const wait = Math.max(delay, 2000 - (Date.now() - lastCartCheck));
    cartTimer = setTimeout(checkCart, wait);
  }

  async function checkCart() {
    lastCartCheck = Date.now();
    let cart;
    try {
      const r = await pageFetch(location.origin + "/cart.js", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      cart = await r.json();
    } catch {
      return;
    }
    const hits = [];
    for (const item of cart.items || []) {
      if (item.handle && item.product_title) cacheTitle(item.handle.toLowerCase(), item.product_title);
      const st = K.status(item.product_title, owned);
      if (st.owned > 0) hits.push({ title: K.cleanTitle(item.product_title), st });
    }

    const sig = hits.map((h) => h.title).sort().join("\n");
    let dismissed = null;
    try {
      dismissed = sessionStorage.getItem("srgo:dismissed");
    } catch {}
    let panel = document.querySelector(".srgo-cart");
    if (!hits.length || sig === dismissed) {
      if (panel) panel.remove();
      return;
    }
    if (panel && panel.dataset.sig === sig) return;
    if (!panel) {
      panel = el("div", "srgo-cart srgo-ui");
      panel.setAttribute("role", "alert");
      document.body.appendChild(panel);
    }
    panel.dataset.sig = sig;
    panel.replaceChildren();
    panel.appendChild(
      el("strong", null, hits.length === 1 ? "Your cart has a game you already own" : `Your cart has ${hits.length} games you already own`)
    );
    const ul = el("ul");
    for (const h of hits)
      ul.appendChild(el("li", null, h.title + (h.st.owned < h.st.total ? ` (${h.st.owned} of ${h.st.total} owned)` : "")));
    panel.appendChild(ul);
    const row = el("div", "srgo-cart-actions");
    if (!/^\/cart\/?$/.test(location.pathname)) {
      const a = el("a", null, "View cart");
      a.href = "/cart";
      row.appendChild(a);
    }
    const close = el("button", null, "Dismiss");
    close.type = "button";
    close.addEventListener("click", () => {
      try {
        sessionStorage.setItem("srgo:dismissed", sig);
      } catch {}
      panel.remove();
    });
    row.appendChild(close);
    panel.appendChild(row);
  }

  // ---------- wiring ----------

  function rerender() {
    document.querySelectorAll(".srgo-card").forEach((c) => delete c.dataset.srgoState);
    decoratePanels();
    scanCards();
    checkCartSoon(0);
  }

  let scanTimer = null;
  function scanSoon() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      decoratePanels();
      scanCards();
    }, 250);
  }

  const ours = (n) => n.nodeType === 1 && (n.classList.contains("srgo-ui") || n.classList.contains("srgo-badge") || n.classList.contains("srgo-toggle"));
  new MutationObserver((muts) => {
    const relevant = muts.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => !ours(n) && !(n.nodeType === 3)));
    if (!relevant) return;
    scanSoon();
    checkCartSoon();
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener(
    "submit",
    (e) => {
      if (e.target.matches && e.target.matches("form[action*='/cart']")) checkCartSoon(1200);
    },
    true
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkCartSoon(0);
  });

  S.onChange(async () => {
    owned = await S.load();
    rerender();
  });

  (async () => {
    if (!S.alive()) return;
    owned = await S.load();
    await seedCollection();
    rerender();
    // the store's product list tells which releases each bundle contains
    const C = globalThis.SRGOCatalog;
    await C.load(async (url) => (await pageFetch(url, { credentials: "same-origin" })).json(), location.origin);
    const migrated = C.migrateBundles(owned);
    if (migrated) await S.save(migrated); // the change listener rerenders
    else rerender();
  })();
})();
