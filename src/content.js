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

  function toggleButton(title, st) {
    const isOwned = st.total > 0 && st.owned === st.total;
    const b = el("button", "srgo-toggle", isOwned ? "Remove from owned" : "I own this");
    b.type = "button";
    b.title = isOwned ? "Remove from your owned games" : "Add to your owned games";
    b.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        S.setOwned(title, !isOwned);
      },
      true
    );
    return b;
  }

  // ---------- product cards ----------

  const CARD_STOP = "body, main, header, footer, nav, section, [role='dialog'], dialog, form[action*='/cart/add']";
  const currentHandle = handleFrom(location.href);
  const onProductPage = /\/products\//.test(location.pathname);

  // Climb from the link to the largest element that's still only about this one product.
  function cardFor(link, handle) {
    let card = link;
    for (let depth = 0; depth < 7; depth++) {
      if (card.tagName === "LI" || card.tagName === "ARTICLE") break; // grid item: that's the card
      const p = card.parentElement;
      if (!p || p.matches(CARD_STOP) || p.querySelector("h1")) break;
      const others = [...p.querySelectorAll("a[href*='/products/']")].some((a) => handleFrom(a.href) !== handle);
      if (others) break;
      card = p;
    }
    return card;
  }

  function decorateCard(card, title) {
    const st = K.status(title, owned);
    const text = label(st);
    const state = !text ? "none" : st.owned === st.total ? "owned" : "partial";
    if (card.dataset.srgoState === state && card.querySelector(":scope > .srgo-toggle")) return;
    card.dataset.srgoState = state;
    card.classList.add("srgo-card");
    if (getComputedStyle(card).position === "static") card.classList.add("srgo-relative");
    card.querySelectorAll(":scope > .srgo-badge, :scope > .srgo-toggle").forEach((n) => n.remove());
    if (text) card.appendChild(el("span", "srgo-badge srgo-" + state, (state === "owned" ? "✓ " : "") + text));
    card.appendChild(toggleButton(title, st));
  }

  async function scanCards() {
    const links = document.querySelectorAll("a[href*='/products/']");
    const seen = new Set();
    for (const a of links) {
      if (a.closest("nav, .srgo-ui")) continue;
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

  // ---------- product page ----------

  async function decorateProductPage() {
    if (!onProductPage || !currentHandle) return;
    const title = await titleFor(currentHandle);
    if (!title) return;
    const st = K.status(title, owned);
    const text = label(st);

    const h1 = document.querySelector("main h1, h1");
    let bar = document.querySelector(".srgo-pdp");
    if (!bar) {
      bar = el("div", "srgo-pdp srgo-ui");
      if (h1) h1.insertAdjacentElement("afterend", bar);
      else document.body.prepend(bar);
    }
    bar.replaceChildren();
    if (text) bar.appendChild(el("span", "srgo-badge srgo-inline srgo-" + (st.owned === st.total ? "owned" : "partial"), text));
    bar.appendChild(toggleButton(title, st));

    const form = document.querySelector("main form[action*='/cart/add'], form[action*='/cart/add']");
    let warn = document.querySelector(".srgo-pdp-warning");
    if (text && form) {
      if (!warn) {
        warn = el("div", "srgo-pdp-warning srgo-ui");
        warn.setAttribute("role", "alert");
        form.insertAdjacentElement("beforebegin", warn);
      }
      warn.textContent =
        st.owned === st.total ? "You already own this." : `You already own ${st.owned} of the ${st.total} games in this.`;
    } else if (warn) warn.remove();
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
    scanCards();
    decorateProductPage();
    checkCartSoon(0);
  }

  let scanTimer = null;
  function scanSoon() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanCards();
      decorateProductPage();
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
    owned = await S.load();
    await seedCollection();
    rerender();
  })();
})();
