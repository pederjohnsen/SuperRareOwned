// Works out which separate releases a bundle contains, from the store's own
// product list (title, type and tags of every product, from /products.json).
//
// Owning a bundle means owning each release in it, and owning those releases
// separately means owning the bundle, so a bundle's keys are its contents' keys.
//
// Bundles name their contents after the colon:
//   game bundles      PB#49: The Golden Idol Saga, Escape from Ever After, Wax Heads (Switch)
//                     PS5 Bundle #8: Haste & KILL KNIGHT (PS5)
//                     SW2 PB#02: Haste (Switch 2), Little Rocket Lab (Switch 2 Edition)
//   edition bundles   [Deluxe Edition] PB#46: Out of Sight, Savant - Ascent REMIX, Game #154 (Switch)
//   card bundles      MTC#49: The Golden Idol Saga, ... - Trading Card Bundle  (each game's TC pack)
//   game + extras     Wax Heads: Switch Game & Vinyl (Bundle)
// "Game #154" is a game not yet revealed: release #154 on that platform.
// Bundles that don't name their contents (Niko's Treasure Bundle!) stay single items.

(function (root) {
  const K = root.SRGOKeys || (typeof require !== "undefined" ? require("./keys.js") : null);

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const BUNDLE = /\b(?:PB|MTC)\s*#|\bPS[45]\s+Bundle\b|\(\s*Bundle\s*\)/i;
  const isBundle = (title) => BUNDLE.test(K.cleanTitle(title));

  // "deluxe", "collectors", "steelbook", "steelbookcase", "special", "anniversary" or ""
  function editionOf(title) {
    for (const m of String(title).matchAll(/\[([^\]]+)\]/g)) {
      const t = m[1].toLowerCase();
      if (/deluxe/.test(t)) return "deluxe";
      if (/collector/.test(t)) return "collectors";
      if (/steelbook\s*case/.test(t)) return "steelbookcase"; // a case on its own, not the steelbook edition
      if (/steelbook/.test(t)) return "steelbook";
      if (/special/.test(t)) return "special";
      if (/anniversary/.test(t)) return "anniversary";
    }
    return "";
  }

  const PLATFORM_WORDS = /\s*\((?:switch 2 edition|switch 2|nintendo switch 2|switch|ps5|ps4|playstation 5|playstation 4|patch required)\)/gi;

  // A release's own name: "SRG#163: Wax Heads (Switch)" -> "waxheads"
  function nameOf(title) {
    let s = K.cleanTitle(title).replace(/\[[^\]]*\]/g, " ");
    s = s.replace(/^[^:]*?#\s*[\d\/\s&+,]+\s*(?::|-|–)\s*/, ""); // "SRG#163: ", "PS5#31 - "
    s = s.replace(/\s*-\s*(?:trading card.*|nintendo switch 2 edition)\s*$/i, "");
    s = s.replace(PLATFORM_WORDS, "");
    return norm(s);
  }

  function platformOfSingle(parsed, type, tags) {
    if (parsed.platform) return parsed.platform;
    const series = (parsed.series || [])[0] || "";
    if (/^PS5/.test(series)) return "ps5";
    if (/^PS4/.test(series)) return "ps4";
    if (/^SW2/.test(series)) return "switch2";
    if ((tags || []).some((t) => /^switch 2$/i.test(t)) || /switch 2/i.test(type || "")) return "switch2";
    if (/playstation/i.test(type || "")) return "ps5";
    return "switch";
  }

  let singles = [];
  let byTitle = new Map();

  // products: [{ title, type, tags }]
  function setCatalog(products) {
    singles = [];
    byTitle = new Map();
    for (const p of products || []) {
      if (!p || !p.title || isBundle(p.title)) continue;
      const parsed = K.parseSingle(p.title);
      if (!parsed.units.length) continue;
      const s = { title: p.title, name: nameOf(p.title), parsed, edition: editionOf(p.title), platform: platformOfSingle(parsed, p.type, p.tags) };
      singles.push(s);
      byTitle.set(norm(K.cleanTitle(p.title)), s);
    }
  }

  const hasCatalog = () => singles.length > 0;

  // Best matches for a name among singles that pass `keep`: exact names first, then names starting with it.
  function find(name, keep) {
    const n = norm(name.replace(PLATFORM_WORDS, ""));
    if (n.length < 3) return [];
    const pool = singles.filter(keep);
    const exact = pool.filter((s) => s.name === n);
    if (exact.length) return exact;
    return pool.filter((s) => s.name.startsWith(n) || (n.startsWith(s.name) && s.name.length >= 5));
  }

  const PLATFORM_LABEL = { switch: "Switch", switch2: "Switch 2", ps5: "PS5", ps4: "PS4" };

  function placeholder(n, platform, cards, sw2, edition) {
    if (cards) return `${sw2 ? "SW2 " : ""}TC#${n}: Game #${n} - Trading Card Booster Pack`;
    const pre = edition === "steelbook" ? "[Steelbook] " : "";
    if (platform === "ps5") return `${pre}PS5#${n}: Game #${n} (PS5)`;
    if (platform === "switch2") return `${pre}SW2#${n}: Game #${n} (Switch 2)`;
    if (edition === "deluxe" || edition === "collectors" || edition === "special") return null; // their numbering differs
    return `${pre}SRG#${n}: Game #${n} (Switch)`;
  }

  // -> array of component titles, or null when the title isn't a bundle we can read
  function resolve(title) {
    if (!hasCatalog() || !isBundle(title)) return null;
    const t = K.cleanTitle(title);
    const edition = editionOf(t);
    const plain = t.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    const out = [];
    let found = 0;
    const seen = new Set();
    const push = (title) => {
      const k = norm(K.cleanTitle(title));
      if (!seen.has(k)) seen.add(k), out.push(title);
    };
    const add = (list) => {
      for (const s of list) push(s.title);
      if (list.length) found++;
    };

    // "Wax Heads: Switch Game & Vinyl (Bundle)"
    const extras = plain.match(/^(.+?):\s*(.+?)\s*\(\s*bundle\s*\)\s*$/i);
    if (extras && !/#/.test(extras[1])) {
      const game = extras[1];
      for (const part of extras[2].split(/\s*(?:,|&|\band\b|\+)\s*/i).filter(Boolean)) {
        const g = part.match(/^(switch 2|switch|ps5|ps4)?\s*game$/i);
        if (g) {
          const platform = { "switch 2": "switch2", switch: "switch", ps5: "ps5", ps4: "ps4" }[(g[1] || "switch").toLowerCase()];
          add(find(game, (s) => K.isGame(s.parsed) && s.platform === platform && s.edition === edition));
        } else {
          const word = norm(part);
          add(find(game, (s) => !K.isGame(s.parsed) && norm(s.title).includes(word)));
        }
      }
      return found ? out : null;
    }

    const cards = /\bMTC\s*#/i.test(plain);
    const sw2 = /^\s*SW2\b/i.test(plain);
    const trailing = plain.match(/\((switch 2|switch|ps5|ps4)\)\s*$/i);
    const platform = trailing
      ? { "switch 2": "switch2", switch: "switch", ps5: "ps5", ps4: "ps4" }[trailing[1].toLowerCase()]
      : sw2 ? "switch2" : /^\s*PS5\b/i.test(plain) ? "ps5" : /^\s*PS4\b/i.test(plain) ? "ps4" : "switch";
    const colon = plain.indexOf(":");
    if (colon < 0) return null;
    const list = plain
      .slice(colon + 1)
      .replace(/\s*-\s*trading card bundle\s*$/i, "")
      .replace(/\s*\((?:switch 2|switch|ps5|ps4)\)\s*$/i, "");
    const keep = cards
      ? (s) => (s.parsed.series || []).some((x) => (sw2 ? /^SW2TC$/ : /^TC$/).test(x))
      : (s) => K.isGame(s.parsed) && s.platform === platform && s.edition === edition;
    // Split on ", " "&" "and", then join neighbours back when together they're
    // one release's name: "Crowns and Pawns", "Dark Deity 1 & 2".
    const parts = list.split(/(\s*,\s*|\s+&\s+|\s+and\s+)/i);
    const frags = [], seps = [];
    parts.forEach((x, i) => (i % 2 ? seps : frags).push(x));
    const names = [];
    for (let i = 0; i < frags.length; ) {
      let take = 1;
      for (let n = Math.min(3, frags.length - i); n > 1; n--) {
        let joined = frags[i];
        for (let j = 1; j < n; j++) joined += seps[i + j - 1] + frags[i + j];
        const nn = norm(joined.replace(PLATFORM_WORDS, ""));
        if (singles.some((s) => keep(s) && s.name === nn)) {
          take = n;
          break;
        }
      }
      let name = frags[i];
      for (let j = 1; j < take; j++) name += seps[i + j - 1] + frags[i + j];
      name = name.trim();
      if (name && !/^\d+$/.test(name)) names.push(name);
      i += take;
    }

    const MARK = { deluxe: "[Deluxe] ", collectors: "[Collectors] ", steelbook: "[Steelbook] ", steelbookcase: "[Steelbook Case] ", special: "[Special Edition] ", anniversary: "[Anniversary] " };
    for (const name of names) {
      const ph = name.match(/^game\s*#?\s*(\d+)$/i);
      if (ph) {
        const t2 = placeholder(parseInt(ph[1], 10), platform, cards, sw2, edition);
        if (t2) push(t2), found++;
        continue;
      }
      const matches = find(name, keep);
      if (matches.length) add(matches);
      else if (!cards) {
        // not in the store's list: keep the name (and edition), so owning it on its own still counts
        push(`${MARK[edition] || ""}${name.replace(PLATFORM_WORDS, "")} (${PLATFORM_LABEL[platform]})`);
      }
    }
    return found ? out : null;
  }

  const api = { isBundle, resolve, setCatalog, hasCatalog, nameOf, editionOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRGOBundles = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
