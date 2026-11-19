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
  const NUMBERED = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,4})\s*#\s*(\d+(?:\s*[\/&+,]\s*\d+)*)/;
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

  function parse(title) {
    let t = cleanTitle(title);
    let platform = "";
    const pm = t.match(TRAILING_PARENS);
    if (pm) {
      const p = normPlatform(pm[1]);
      if (p) {
        platform = p;
        t = t.slice(0, pm.index).trim();
      }
    }

    const nm = t.match(NUMBERED);
    if (nm) {
      const series = nm[1].toUpperCase();
      const numbers = nm[2].split(/\s*[\/&+,]\s*/).map((n) => String(parseInt(n, 10)));
      return {
        title: cleanTitle(title),
        platform,
        units: numbers.map((n) => ({ id: series + "#" + n, platform })),
      };
    }

    const name = t.replace(BRACKETED, " ").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name) return { title: cleanTitle(title), platform, units: [] };
    return { title: cleanTitle(title), platform, units: [{ id: "name:" + name, platform }] };
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

  const api = { parse, cleanTitle, upcaseCodes, unitKey, ownedKeysFor, status, withOwned };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRGOKeys = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
