(function () {
  const K = globalThis.SRGOKeys;
  const S = globalThis.SRGOStore;
  const $ = (id) => document.getElementById(id);
  let owned = {};

  function keyLabel(key) {
    const [id, platform] = key.split("|");
    const name = id.startsWith("name:") ? "" : id;
    return [name, platform || "any platform"].filter(Boolean).join(" · ");
  }

  function render() {
    const q = $("filter").value.trim().toLowerCase();
    const rows = Object.entries(owned)
      .map(([key, v]) => ({ key, title: v.t || key }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    const shown = rows.filter((r) => !q || r.title.toLowerCase().includes(q) || r.key.toLowerCase().includes(q));
    $("count").textContent = rows.length ? `(${rows.length})` : "";
    $("empty").hidden = rows.length > 0;
    const list = $("list");
    list.replaceChildren(
      ...shown.map((r) => {
        const li = document.createElement("li");
        const t = document.createElement("span");
        t.className = "t";
        t.textContent = r.title;
        const k = document.createElement("span");
        k.className = "k";
        k.textContent = keyLabel(r.key);
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Remove";
        b.setAttribute("aria-label", "Remove " + r.title);
        b.addEventListener("click", async () => {
          const next = { ...owned };
          delete next[r.key];
          await S.save(next);
        });
        li.append(t, k, b);
        return li;
      })
    );
  }

  async function reload() {
    owned = await S.load();
    render();
  }

  $("add-btn").addEventListener("click", async () => {
    const lines = $("add").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let next = owned, added = 0, already = 0;
    const unreadable = [];
    for (const raw of lines) {
      const line = K.upcaseCodes(raw);
      const st = K.status(line, next);
      if (!st.total) { unreadable.push(raw); continue; }
      if (st.owned === st.total) { already++; continue; }
      next = K.withOwned(line, next, true);
      added++;
    }
    try {
      await S.save(next);
    } catch (e) {
      $("add-result").textContent = "Couldn't save: " + e.message;
      return;
    }
    $("add").value = unreadable.join("\n");
    const parts = [`Added ${added}`];
    if (already) parts.push(`${already} already owned`);
    if (unreadable.length) parts.push(`${unreadable.length} couldn't be read (left in the box)`);
    $("add-result").textContent = parts.join(", ") + ".";
  });

  $("filter").addEventListener("input", render);

  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "srg-owned", version: 1, owned }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `srg-owned-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  $("backup-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = data && data.owned && typeof data.owned === "object" ? data.owned : null;
      if (!incoming) throw new Error("not an SRG Owned export");
      const next = { ...owned };
      let n = 0;
      for (const [k, v] of Object.entries(incoming)) {
        if (typeof k === "string" && k.includes("|") && !next[k]) {
          next[k] = { t: String((v && v.t) || k), at: Number(v && v.at) || Date.now() };
          n++;
        }
      }
      await S.save(next);
      $("backup-result").textContent = `Imported ${n} new.`;
    } catch (err) {
      $("backup-result").textContent = "Couldn't import: " + err.message;
    }
    e.target.value = "";
  });

  try {
    const api = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id ? globalThis.chrome : globalThis.browser;
    $("version").textContent = api.runtime.getManifest().version;
  } catch {}

  S.onChange(reload);
  reload();
})();
