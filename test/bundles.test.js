// Bundles resolve to the separate releases they contain. The catalog fixture is
// real superraregames.com product titles (checked on the live store, Nov 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/keys.js");
globalThis.SRGOKeys = K;
const B = require("../src/bundles.js");

B.setCatalog(require("./fixtures/catalog-sample.json"));
K.setBundleResolver(B.resolve);

const contents = (title) => (B.resolve(title) || []).map(K.cleanTitle);
const keys = (title) => K.parse(title).units.map(K.unitKey).sort();

const CASES = {
  "Wax Heads: Switch Game & Vinyl (Bundle)": ["SRG#163: Wax Heads (Switch)", "Wax Heads (Deluxe Double Vinyl)"],
  "PS5 Bundle #8: Haste & KILL KNIGHT (PS5)": ["PS5#32: Haste (PS5)", "PS5#33: KILL KNIGHT (PS5)"],
  "SW2 MTC#02: Haste, Little Rocket Lab - Trading Card Bundle": [
    "SW2 TC#03: Haste - Trading Card Pack",
    "SW2 TC#04: Little Rocket Lab - Trading Card Pack",
  ],
  "SW2 PB#02: Haste (Switch 2), Little Rocket Lab (Switch 2 Edition)": ["SW2#03: Haste", "SW2#04: Little Rocket Lab - Nintendo Switch 2 Edition"],
  "[Special Edition] SW2 PB#01: Minishoot' Adventures (Switch 2 Edition) & The Midnight Walk (Switch 2)": [
    "[Special Edition] SE#01: Minishoot' Adventures - Nintendo Switch 2 Edition",
    "[Special Edition] SE#02: The Midnight Walk",
  ],
  "SW2 PB#01: Minishoot' Adventures (Switch 2 Edition) & The Midnight Walk (Switch 2)": [
    "SW2#01: Minishoot' Adventures - Nintendo Switch 2 Edition",
    "Sw2#02: The Midnight Walk",
  ],
  "MTC#49: The Golden Idol Saga, Escape from Ever After, Wax Heads - Trading Card Bundle": [
    "TC#161: The Golden Idol Saga - Trading Card Booster Pack",
    "TC#162: Escape from Ever After - Trading Card Booster Pack",
    "TC#163: Wax Heads - Trading Card Booster Pack",
  ],
  "PB#49: The Golden Idol Saga, Escape from Ever After, Wax Heads (Switch)": [
    "SRG#161: The Golden Idol Saga (Switch)",
    "SRG#162: Escape from Ever After (Switch)",
    "SRG#163: Wax Heads (Switch)",
  ],
  "PS5 Bundle #7: Home Safety Hotline, Bloodshed, Platypus Reclayed (PS5)": [
    "PS5#27: Home Safety Hotline (PS5)",
    "PS5#28: Bloodshed (PS5)",
    "PS5#29: Platypus Reclayed (PS5)",
  ],
  "PB#46: Out of Sight, Savant - Ascent REMIX, Game #154 (Switch)": [
    "SRG#152: Out of Sight (Switch)",
    "SRG#153: Savant - Ascent REMIX (Switch)",
    "SRG#154: Game #154 (Switch)",
  ],
  "PB#33: Nightmare Reaper, Crowns and Pawns, Wargroove 1+2 (Switch)": [
    "SRG#110: Nightmare Reaper (Switch)",
    "SRG#111: Crowns and Pawns (Switch)",
    "SRG#112: Wargroove 1 + 2 (Switch)",
  ],
  "PB#45: Shovel Knight Dig, Dark Deity 1 & 2, Bad End Theater (Switch)": [
    "SRG#146: Shovel Knight Dig (Switch)",
    "SRG#147: Dark Deity 1 & 2 (Switch)",
    "SRG#148: Bad End Theater (Switch)",
  ],
  "MTC#31: Ship of Fools, Fran Bow, Game 106 - Trading Card Bundle": [
    "TC#104: Ship of Fools - Trading Card Booster Pack",
    "TC#105: Fran Bow - Trading Card Booster Pack",
    "TC#106: Game #106 - Trading Card Booster Pack",
  ],
  "PB#19: Sally Face, Flynn, Game 67 (Switch)": [
    "SRG#65: Sally Face (Switch)",
    "SRG#66: Flynn: Son of Crimson (Switch)",
    "SRG#67: Game #67 (Switch)",
  ],
  "[Steelbook] PB#19: Sally Face, Game 66 and Game 67 (Switch)": [
    "[Steelbook] SRG#65: Sally Face (Switch)",
    "[Steelbook] SRG#66: Game #66 (Switch)",
    "[Steelbook] SRG#67: Game #67 (Switch)",
  ],
  "PB#17: Heaven's Machine, Mundaun and Caveblazers (Switch)": [
    "Heaven's Machine (Switch)", // not in the store's list: kept by name
    "SRG#60: Mundaun (Switch)",
    "SRG#61: Caveblazers (Switch)",
  ],
};

test("each bundle resolves to the releases it contains", () => {
  for (const [bundle, expected] of Object.entries(CASES)) assert.deepEqual(contents(bundle), expected, bundle);
});

test("editions stay editions", () => {
  // deluxe bundle: the deluxe releases, not the standard ones
  assert.deepEqual(contents("[Deluxe Edition] PB#46: Out of Sight, Savant - Ascent REMIX, Game #154 (Switch)"), [
    "[Deluxe Edition] DE#8: Out of Sight (Switch)",
    "[Deluxe] Savant - Ascent REMIX (Switch)",
  ]);
  // steelbook bundle: the steelbook, not the separate steelbook case or the game
  assert.deepEqual(contents("[Steelbook] PB#23: Grapple Dog, Will You Snail?, Transiruby (Switch)"), [
    "[Steelbook] SRG#79: Grapple Dog (Switch)",
    "[Steelbook] Will You Snail? (Switch)",
    "[Steelbook] Transiruby (Switch)",
  ]);
  assert.deepEqual(contents("[Collectors Edition] PB#23: Grapple Dog, Will You Snail?, Transiruby (Switch)")[0], "[Collector's Edition] CE#10: Grapple Dog (Switch)");
  assert.deepEqual(contents("[Special Edition] SW2 PB#02: Haste (Switch 2) & Little Rocket Lab (Switch 2 Edition)")[0], "[Special Edition] SE#03: Haste");
  // and a deluxe bundle shares nothing with the standard one
  const std = new Set(keys("PB#46: Out of Sight, Savant - Ascent REMIX, Game #154 (Switch)"));
  for (const k of keys("[Deluxe Edition] PB#46: Out of Sight, Savant - Ascent REMIX, Game #154 (Switch)")) assert.ok(!std.has(k), k);
});

test("bundles that don't name their contents stay single items", () => {
  for (const t of ["Niko's Treasure Bundle!", "SRG Mixtape Bundle Vol. 3 + 4 + Horror!", "GB#74: A Short Hike Guidebook Bundle"]) {
    assert.equal(B.resolve(t), null, t);
    assert.equal(K.parse(t).bundle, undefined, t);
  }
  // a double pack already names its numbers
  assert.deepEqual(keys("SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack"), ["SRG#107|", "SRG#108|"]);
});

test("owning a bundle owns its contents, and the other way round", () => {
  const bundle = "Wax Heads: Switch Game & Vinyl (Bundle)";
  // bought the bundle: the game and the vinyl both show as owned
  let owned = K.withOwned("[CLUB] " + bundle, {}, true);
  assert.equal(K.status("SRG#163: Wax Heads (Switch)", owned).owned, 1);
  assert.equal(K.status("Wax Heads (Deluxe Double Vinyl)", owned).owned, 1);
  assert.equal(K.status("TC#163: Wax Heads - Trading Card Booster Pack", owned).owned, 0); // not in this bundle
  // stored under the releases' own names
  assert.deepEqual(Object.values(owned).map((v) => v.t).sort(), ["SRG#163: Wax Heads (Switch)", "Wax Heads (Deluxe Double Vinyl)"]);

  // bought the game only: half the bundle
  owned = K.withOwned("SRG#163: Wax Heads (Switch)", {}, true);
  let st = K.status(bundle, owned);
  assert.deepEqual([st.owned, st.total], [1, 2]);
  // and the vinyl separately: the whole bundle
  owned = K.withOwned("Wax Heads (Deluxe Double Vinyl)", owned, true);
  st = K.status(bundle, owned);
  assert.deepEqual([st.owned, st.total], [2, 2]);

  // a game bundle: owning the PB means owning each game
  owned = K.withOwned("PB#49: The Golden Idol Saga, Escape from Ever After, Wax Heads (Switch)", {}, true);
  assert.equal(K.status("SRG#162: Escape from Ever After (Switch)", owned).owned, 1);
  assert.equal(K.status("PS5#30: Escape from Ever After (PS5)", owned).owned, 0); // other platform
  assert.equal(K.status("[Deluxe Edition] DE#10: The Golden Idol Saga (Switch)", owned).owned, 0); // other edition
});

test("game or extras", () => {
  assert.equal(K.isGame(K.parse("Wax Heads: Switch Game & Vinyl (Bundle)")), true);
  assert.equal(K.isGame(K.parse("MTC#49: The Golden Idol Saga, Escape from Ever After, Wax Heads - Trading Card Bundle")), false);
  assert.equal(K.isGame(K.parse("PS5 Bundle #8: Haste & KILL KNIGHT (PS5)")), true);
});

test("without the store's list, a bundle is one item as before", () => {
  B.setCatalog([]);
  assert.equal(B.resolve("PS5 Bundle #8: Haste & KILL KNIGHT (PS5)"), null);
  B.setCatalog(require("./fixtures/catalog-sample.json"));
});
