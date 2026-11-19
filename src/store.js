// The owned list lives in storage.sync so it follows you between computers
// signed in to the same browser account. sync allows ~8 KB per item, so the
// list is split across items owned_0, owned_1, ... with owned_n holding the count.

(function (root) {
  const ext = root.browser || root.chrome;
  const CHUNK_BYTES = 7000;
  const enc = new TextEncoder();

  async function load() {
    const all = await ext.storage.sync.get(null);
    const n = all.owned_n || 0;
    const owned = {};
    for (let i = 0; i < n; i++) Object.assign(owned, all["owned_" + i] || {});
    return owned;
  }

  async function save(owned) {
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
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && Object.keys(changes).some((k) => k.startsWith("owned_"))) fn();
    });
  }

  root.SRGOStore = { load, save, setOwned, onChange };
})(globalThis);
