// Review screen for imports collected on account.superraregames.com.
// Turns product variant IDs into titles using the store's public product list
// (/products.json), then /variants/<id> for anything not found there.

(function () {
  const ext = (function (g) {
    // A real extension API has runtime.id. Checking for it skips a page element
    // that happens to be named "browser", and it's missing in a tab whose copy of
    // the extension was cut off by an update or reload.
    const ok = (o) => o && o.runtime && o.runtime.id && o.storage;
    return ok(g.browser) ? g.browser : ok(g.chrome) ? g.chrome : null;
  })(globalThis);
  const K = globalThis.SRGOKeys;
  const S = globalThis.SRGOStore;
  const STORE = "https://superraregames.com";
  const SKIP_STATUS = /cancel|refund/i;
  const $ = (id) => document.getElementById(id);
  let running = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  async function getJson(url) {
    const r = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(r.status + " " + url);
    return r.json();
  }

  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) await fn(items[i++]);
      })
    );
  }

  async function resolveVariants(ids, progress) {
    const found = new Map(); // variantId -> { title, handle }
    const want = new Set(ids);
    for (let page = 1; page <= 80 && found.size < want.size; page++) {
      progress(`Looking up your items on the store… (product list page ${page})`);
      let products;
      try {
        products = (await getJson(`${STORE}/products.json?limit=250&page=${page}`)).products || [];
      } catch {
        break;
      }
      if (!products.length) break;
      for (const p of products)
        for (const v of p.variants || []) if (want.has(String(v.id))) found.set(String(v.id), { title: p.title, handle: p.handle });
    }
    const rest = ids.filter((id) => !found.has(id));
    let done = 0;
    await pool(rest, 4, async (id) => {
      progress(`Looking up items that aren't in the store's product list… ${++done} of ${rest.length}`);
      try {
        const r = await fetch(`${STORE}/variants/${id}`, { credentials: "omit", redirect: "follow" });
        const m = r.ok && new URL(r.url).pathname.match(/\/products\/([^/?#]+)/);
        if (!m) return;
        const p = await getJson(`${STORE}/products/${m[1]}.js`);
        if (p && p.title) found.set(id, { title: p.title, handle: p.handle || m[1] });
      } catch {}
    });
    return found;
  }

  function orderLink(o) {
    const a = el("a", null, "#" + o.number);
    a.href = "https://account.superraregames.com" + (o.url || "/orders");
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function note(parent, ...parts) {
    const p = el("p", "note");
    for (const x of parts) p.append(x);
    parent.appendChild(p);
  }

  async function show(data) {
    const run = ++running;
    const owned = await S.load();
    $("import").hidden = false;
    $("import-notes").replaceChildren();
    $("import-groups").replaceChildren();
    $("import-actions").hidden = true;
    const status = (t) => run === running && ($("import-status").textContent = t);

    const orders = data.orders || [];
    const kept = orders.filter((o) => !SKIP_STATUS.test(o.status || ""));
    const skipped = orders.filter((o) => SKIP_STATUS.test(o.status || ""));

    // gather items: { title, orders: Set }
    const items = new Map(); // title -> Set(order numbers)
    const add = (title, num) => {
      if (!items.has(title)) items.set(title, new Set());
      items.get(title).add(num);
    };
    const variantOrders = new Map(); // variantId -> [orders]
    for (const o of kept) {
      for (const it of o.items || []) add(it.title, o.number);
      // titles read from the order page beat a lookup (and cover [CLUB] items
      // that are no longer on the store), so only look up orders without them
      for (const id of (o.items || []).length ? [] : o.variantIds || []) {
        if (!variantOrders.has(id)) variantOrders.set(id, []);
        variantOrders.get(id).push(o);
      }
    }
    const missing = [];
    if (variantOrders.size) {
      const found = await resolveVariants([...variantOrders.keys()], status);
      if (run !== running) return;
      for (const [id, os] of variantOrders) {
        const f = found.get(id);
        if (f) os.forEach((o) => add(f.title, o.number));
        else missing.push(...os);
      }
    }
    const noItems = kept.filter((o) => !(o.items || []).length && !(o.variantIds || []).length);

    // group by key so the [CLUB] and public copies of a game show once
    const rows = new Map();
    for (const [title, nums] of items) {
      const parsed = K.parse(title);
      if (!parsed.units.length) continue;
      const key = parsed.units.map(K.unitKey).sort().join(",");
      const row = rows.get(key) || { title, parsed, orders: new Set(), st: K.status(title, owned) };
      nums.forEach((n) => row.orders.add(n));
      rows.set(key, row);
    }
    const all = [...rows.values()].sort((a, b) => a.parsed.title.localeCompare(b.parsed.title, undefined, { numeric: true }));
    const isOwned = (r) => r.st.total > 0 && r.st.owned === r.st.total;
    const games = all.filter((r) => K.isGame(r.parsed) && !isOwned(r));
    const other = all.filter((r) => !K.isGame(r.parsed) && !isOwned(r));
    const already = all.filter(isOwned);

    status(
      `From ${kept.length} order${kept.length === 1 ? "" : "s"}: ${games.length} game${games.length === 1 ? "" : "s"} to add` +
        (other.length ? `, ${other.length} other item${other.length === 1 ? "" : "s"}` : "") +
        (already.length ? `, ${already.length} already owned` : "") +
        "."
    );

    const notes = $("import-notes");
    if (!data.complete) note(notes, "Not every order loaded on the orders page, so some may be missing. Run the import again from the orders page to pick them up.");
    if (skipped.length) note(notes, `Skipped ${skipped.length} cancelled or refunded order${skipped.length === 1 ? "" : "s"}: `, ...skipped.flatMap((o, i) => [i ? ", " : "", orderLink(o)]));
    const partial = kept.filter((o) => o.partial);
    if (partial.length)
      note(
        notes,
        `These orders didn't finish loading, so some of their items may be missing. Open each one and click “Add this order's games” there: `,
        ...partial.flatMap((o, i) => [i ? ", " : "", orderLink(o)])
      );
    const unknown = [...new Map([...missing, ...noItems].map((o) => [o.number, o])).values()];
    if (unknown.length)
      note(
        notes,
        `Couldn't read the items in these orders. Open each one and click “Add this order's games” there: `,
        ...unknown.flatMap((o, i) => [i ? ", " : "", orderLink(o)])
      );

    const groups = $("import-groups");
    const boxes = [];
    function group(title, list, checked, hint) {
      if (!list.length) return;
      const h = el("h3", null, title);
      groups.appendChild(h);
      if (hint) groups.appendChild(el("p", "hint", hint));
      const tools = el("div", "row");
      const allBtn = el("button", "linkish", "Select all");
      const noneBtn = el("button", "linkish", "Select none");
      allBtn.type = noneBtn.type = "button";
      tools.append(allBtn, noneBtn);
      groups.appendChild(tools);
      const ul = el("ul", "pick");
      const mine = [];
      for (const r of list) {
        const li = el("li");
        const lab = el("label");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = checked;
        cb.addEventListener("change", updateCount);
        cb._row = r;
        mine.push(cb);
        boxes.push(cb);
        const nums = [...r.orders];
        lab.append(cb, el("span", "t", r.parsed.title), el("span", "o", nums.length > 1 ? `${nums.length} orders` : "Order #" + nums[0]));
        if (r.st.owned > 0) lab.append(el("span", "o", `(${r.st.owned} of ${r.st.total} owned)`));
        li.appendChild(lab);
        ul.appendChild(li);
      }
      allBtn.addEventListener("click", () => (mine.forEach((c) => (c.checked = true)), updateCount()));
      noneBtn.addEventListener("click", () => (mine.forEach((c) => (c.checked = false)), updateCount()));
      groups.appendChild(ul);
    }
    group("Games", games, true, "Untick anything you bought as a gift or no longer have.");
    group("Other items", other, false, "Merch, trading cards and other extras. Tick any you want marked as owned.");
    if (already.length) {
      const d = el("details");
      d.appendChild(el("summary", null, `${already.length} already in your owned list`));
      const ul = el("ul", "pick");
      for (const r of already) {
        const li = el("li");
        li.append(el("span", "t", r.parsed.title));
        li.style.padding = "6px 0";
        ul.appendChild(li);
      }
      d.appendChild(ul);
      groups.appendChild(d);
    }

    function updateCount() {
      const n = boxes.filter((b) => b.checked).length;
      $("import-save").textContent = n ? `Add ${n} selected` : "Add selected";
      $("import-save").disabled = !n;
    }
    updateCount();
    $("import-actions").hidden = false;

    $("import-save").onclick = async () => {
      let next = await S.load();
      let n = 0;
      for (const b of boxes)
        if (b.checked) {
          next = K.withOwned(b._row.title, next, true);
          n++;
        }
      await S.save(next);
      await ext.storage.local.remove("srgoImport");
      finish(`Added ${n} to your owned games.`);
    };
    $("import-cancel").onclick = async () => {
      await ext.storage.local.remove("srgoImport");
      finish("Import cancelled. Nothing was added.");
    };
  }

  // Done (added or cancelled): close the import section and leave a short
  // confirmation at the top of the page that fades after a few seconds.
  let doneTimer = null;
  function finish(text) {
    running++;
    $("import-groups").replaceChildren();
    $("import-notes").replaceChildren();
    $("import-actions").hidden = true;
    $("import-status").textContent = "";
    $("import").hidden = true;
    const done = $("import-done");
    done.textContent = text;
    done.hidden = false;
    done.classList.remove("fading");
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => {
      done.classList.add("fading");
      doneTimer = setTimeout(() => (done.hidden = true), 600);
    }, 6000);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function check() {
    const { srgoImport } = await ext.storage.local.get("srgoImport");
    if (srgoImport && srgoImport.at !== check.lastAt) {
      check.lastAt = srgoImport.at;
      show(srgoImport);
      $("import").scrollIntoView({ block: "start" });
    }
  }
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.srgoImport && changes.srgoImport.newValue) check();
  });
  check();
})();
