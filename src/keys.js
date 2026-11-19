// Turns Super Rare Games product titles into keys, so the club early-access
// copy of a product ("[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)")
// matches the public one ("SRG#149: Grapple Dogs Cosmic Canines (Switch)").
//
// A title becomes one or more "units":
//   - numbered releases: series code + number, e.g. SRG149, DE2, PS517 ... plus platform
//     ("SRG# 107/108 ... Double Pack" gives two units, SRG107 and SRG108)
//   - anything without a number: the cleaned-up name, e.g. name:superraremixtapehorroredition
// Each unit is stored as "<id>|<platform>". The platform can be empty when the title
// doesn't name one; an empty platform matches any platform.

(function (root) {
  const CLUB = /\[\s*CLUB\s*\]\s*[-–—:]?\s*/gi;
  const REPRINT = /\[\s*RE-?PRINT\s*\]/gi;
  const BRACKETED = /\[[^\]]*\]/g; // [Deluxe Edition], [Collector's Edition] ...
  const TRAILING_PARENS = /\(([^()]+)\)\s*$/;
  // Series codes are written in capitals: SRG#149, DE#2, CE#12, PS5 #17, PS4#5.
  // Case-sensitive on purpose, so "Volume #3" isn't read as a series.
  // An optional leading code joins the series: "SW2 TC#04" (Switch 2 trading
  // cards) is SW2TC#4, not the same as "TC#04".
  const NUMBERED = /(?<![A-Za-z0-9])(?:([A-Z][A-Z0-9]{1,4})\s+)?([A-Z][A-Z0-9]{1,4})\s*#\s*(\d+(?:\s*[-–]\s*\d+(?!\s*[A-Za-z]))?(?:\s*[\/&+,]\s*\d+(?:\s*[-–]\s*\d+)?)*)/;
  const NUMBERED_ALL = new RegExp(NUMBERED.source, "g");
  const KNOWN_PLATFORM = /^(switch2?|ps[345]|psvita|vita|xbox[a-z0-9]*|pc|3ds|wiiu)$/;

  function normPlatform(text) {
    const p = text
      .toLowerCase()
      .replace(/nintendo/g, "")
      .replace(/playstation/g, "ps")
      .replace(/[^a-z0-9]/g, "");
    return KNOWN_PLATFORM.test(p) ? p : null;
  }

  function cleanTitle(title) {
    return String(title || "")
      .replace(CLUB, "")
      .replace(REPRINT, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // For text typed in the options page: let "srg#149" work as well as "SRG#149".
  function upcaseCodes(text) {
    return String(text).replace(/\b(srg|de|ce|ps[345])\s*#/gi, (m) => m.toUpperCase());
  }

  // Bracketed tags that don't change what the product is. Any other tag, such
  // as [Steelbook], makes it a different product from the same number:
  // "[Steelbook] SRG#88" is a case, not the game SRG#88.
  const NEUTRAL_TAG = /^(club|re-?print|pre-?order|sale|deluxe edition|collector'?s edition|limited edition)$/i;

  function kindOf(t) {
    const tags = (t.match(BRACKETED) || [])
      .map((b) => b.slice(1, -1).trim())
      .filter((b) => b && !NEUTRAL_TAG.test(b.replace(/[’‘]/g, "'")));
    return tags.map((b) => b.toUpperCase().replace(/[^A-Z0-9]+/g, "")).join("+");
  }

  // "Coming Soon!" placeholder listings can't be bought on their own. One with a
  // release number still matches by that number, so a game you already have
  // through a bundle shows as owned. One without a number gets no keys at all:
  // several share the same title, and none can be owned.
  const COMING_SOON = /coming\s*soon/i;

  function parse(title) {
    let t = cleanTitle(title);
    const comingSoon = COMING_SOON.test(t);
    const kind = kindOf(t);
    const prefix = kind ? kind + ":" : "";
    let platform = "";
    const pm = t.match(TRAILING_PARENS);
    if (pm) {
      const p = normPlatform(pm[1]);
      if (p) {
        platform = p;
        t = t.slice(0, pm.index).trim();
      }
    }

    // Every "<series>#<numbers>" in the title counts, so a bundle renamed after a
    // reveal ("SRG#158: Foo + SRG#159: Bar + SRG#160: Coming Soon!") still covers
    // each game, as does "SRG#158-160" or "SRG# 107/108".
    const ids = [];
    const seriesSeen = [];
    for (const nm of t.matchAll(NUMBERED_ALL)) {
      const series = ((nm[1] || "") + nm[2]).toUpperCase();
      if (!seriesSeen.includes(series)) seriesSeen.push(series);
      for (const part of nm[3].split(/\s*[\/&+,]\s*/)) {
        const r = part.match(/^(\d+)\s*[-–]\s*(\d+)$/); // bundle ranges: SRG#158-160
        const a = parseInt(r ? r[1] : part, 10), b = r ? parseInt(r[2], 10) : a;
        for (let n = a; n <= b && n - a < 30; n++) {
          const id = prefix + series + "#" + n;
          if (!ids.includes(id)) ids.push(id);
        }
      }
    }
    if (ids.length) {
      return {
        title: cleanTitle(title),
        platform,
        comingSoon,
        numbered: true,
        kind,
        series: seriesSeen,
        units: ids.map((id) => ({ id, platform })),
      };
    }

    if (comingSoon) return { title: cleanTitle(title), platform, comingSoon, numbered: false, units: [] };
    const name = t.replace(BRACKETED, " ").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name) return { title: cleanTitle(title), platform, numbered: false, units: [] };
    return { title: cleanTitle(title), platform, numbered: false, units: [{ id: "name:" + prefix + name, platform }] };
  }

  // Numbered series that aren't games: TC# is a release's trading card booster
  // pack ("TC#164: KILL KNIGHT - Trading Card Booster Pack").
  // (and "SW2 TC#04" for Switch 2), so any series ending in TC.
  const NOT_GAME_SERIES = /TC$/;

  // A game release, as opposed to merch or other extras with or without a number.
  function isGame(parsed) {
    return !!parsed.numbered && !parsed.series.every((x) => NOT_GAME_SERIES.test(x));
  }

  function unitKey(u) {
    return u.id + "|" + u.platform;
  }

  // owned: { "<id>|<platform>": { t: title, at: timestamp } }
  // Returns the stored keys that make this unit owned (empty array if not owned).
  function ownedKeysFor(unit, owned) {
    const exact = unitKey(unit);
    if (owned[exact]) return [exact];
    if (unit.platform) {
      const loose = unit.id + "|";
      return owned[loose] ? [loose] : [];
    }
    const prefix = unit.id + "|";
    return Object.keys(owned).filter((k) => k.startsWith(prefix));
  }

  // { total, owned, parsed } — owned counts units of this title that are owned.
  function status(title, owned) {
    const parsed = parse(title);
    let n = 0;
    for (const u of parsed.units) if (ownedKeysFor(u, owned).length) n++;
    return { total: parsed.units.length, owned: n, parsed };
  }

  // Returns a new owned object with every unit of the title marked as owned.
  function withOwned(title, owned, isOwned) {
    const next = { ...owned };
    const parsed = parse(title);
    for (const u of parsed.units) {
      if (isOwned) {
        if (!ownedKeysFor(u, next).length) next[unitKey(u)] = { t: parsed.title, at: Date.now() };
      } else {
        for (const k of ownedKeysFor(u, next)) delete next[k];
      }
    }
    return next;
  }

  const api = { parse, cleanTitle, upcaseCodes, unitKey, ownedKeysFor, status, withOwned, isGame };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRGOKeys = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
