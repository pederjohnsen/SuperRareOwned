// The owned list lives in storage.sync so it follows you between computers
// signed in to the same browser account. sync allows ~8 KB per item, so the
// list is split across items owned_0, owned_1, ... with owned_n holding the count.

(function (root) {
  const ext = (function (g) {
    // A real extension API has runtime.id. Checking for it skips a page element
    // that happens to be named "browser", and it's missing in a tab whose copy of
    // the extension was cut off by an update or reload.
    const ok = (o) => o && o.runtime && o.runtime.id && o.storage;
    return ok(g.browser) ? g.browser : ok(g.chrome) ? g.chrome : null;
  })(root);
  const CHUNK_BYTES = 7000;
  const enc = new TextEncoder();

  // In a tab left open while the extension was updated or reloaded, the
  // extension's storage is gone until the page is reloaded.
  function alive() {
    try {
      return !!(ext && ext.runtime && ext.runtime.id);
    } catch {
      return false;
    }
  }
  function requireAlive() {
    if (!alive()) throw new Error("SRG Owned was updated or reloaded. Reload this page and try again.");
  }

  async function load() {
    requireAlive();
    const all = await ext.storage.sync.get(null);
    const n = all.owned_n || 0;
    const owned = {};
    for (let i = 0; i < n; i++) Object.assign(owned, all["owned_" + i] || {});
    return owned;
  }

  async function save(owned) {
    requireAlive();
    const chunks = [];
    let cur = {};
    let size = 2;
    for (const [k, v] of Object.entries(owned)) {
      const entry = enc.encode(JSON.stringify(k) + ":" + JSON.stringify(v) + ",").length;
      if (size + entry > CHUNK_BYTES && Object.keys(cur).length) {
        chunks.push(cur);
        cur = {};
        size = 2;
      }
      cur[k] = v;
      size += entry;
    }
    if (Object.keys(cur).length) chunks.push(cur);

    const before = (await ext.storage.sync.get("owned_n")).owned_n || 0;
    const items = { owned_n: chunks.length };
    chunks.forEach((c, i) => (items["owned_" + i] = c));
    await ext.storage.sync.set(items);
    const stale = [];
    for (let i = chunks.length; i < before; i++) stale.push("owned_" + i);
    if (stale.length) await ext.storage.sync.remove(stale);
  }

  async function setOwned(title, isOwned) {
    const owned = await load();
    await save(root.SRGOKeys.withOwned(title, owned, isOwned));
  }

  function onChange(fn) {
    if (!alive()) return;
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && Object.keys(changes).some((k) => k.startsWith("owned_"))) fn();
    });
  }

  root.SRGOStore = { load, save, setOwned, onChange, alive };
})(globalThis);
