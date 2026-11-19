// The store's product list (title, type and tags of every product), which
// bundles.js needs to work out what each bundle contains. Fetched from the
// store's public /products.json and kept for 12 hours in extension storage.

(function (root) {
  const ext = (function (g) {
    const ok = (o) => o && o.runtime && o.runtime.id && o.storage;
    return ok(g.browser) ? g.browser : ok(g.chrome) ? g.chrome : null;
  })(root);
  const KEY = "srgoCatalog";
  const MAX_AGE = 12 * 60 * 60 * 1000;
  let loading = null;

  async function fetchAll(fetchJson, base) {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const j = await fetchJson(`${base}/products.json?limit=250&page=${page}`);
      const products = (j && j.products) || [];
      if (!products.length) break;
      for (const p of products)
        items.push({
          title: p.title,
          type: p.product_type || "",
          tags: Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(/,\s*/).filter(Boolean),
        });
    }
    return items;
  }

  function use(items) {
    root.SRGOBundles.setCatalog(items);
    root.SRGOKeys.setBundleResolver(root.SRGOBundles.resolve);
  }

  // fetchJson(url) -> parsed JSON; base = "https://superraregames.com" or the page's origin
  function load(fetchJson, base) {
    if (loading) return loading;
    loading = (async () => {
      let cached = null;
      try {
        cached = ext && (await ext.storage.local.get(KEY))[KEY];
      } catch {}
      if (cached && cached.items && cached.items.length && Date.now() - cached.at < MAX_AGE) {
        use(cached.items);
        return cached.items;
      }
      try {
        const items = await fetchAll(fetchJson, base);
        if (items.length) {
          use(items);
          try {
            await ext.storage.local.set({ [KEY]: { at: Date.now(), items } });
          } catch {}
          return items;
        }
      } catch {}
      // offline or blocked: an old list is better than none
      if (cached && cached.items) use(cached.items);
      return (cached && cached.items) || [];
    })();
    return loading;
  }

  // Owned bundles saved before bundles were understood are stored under the
  // bundle's own number (PB#49). Replace them with what's inside.
  function migrateBundles(owned) {
    const K = root.SRGOKeys;
    let next = owned, changed = false;
    for (const [key, v] of Object.entries(owned)) {
      const parsed = v && v.t ? K.parse(v.t) : null;
      if (!parsed || !parsed.bundle) continue;
      if (parsed.units.some((u) => K.unitKey(u) === key)) continue; // already its contents
      next = K.withOwned(v.t, next, true);
      delete next[key];
      changed = true;
    }
    return changed ? next : null;
  }

  root.SRGOCatalog = { load, migrateBundles };
})(globalThis);
