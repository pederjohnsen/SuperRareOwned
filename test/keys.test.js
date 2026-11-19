const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/keys.js");

const ids = (title) => K.parse(title).units.map(K.unitKey);

test("club and public titles give the same key", () => {
  const pairs = [
    ["[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)", "SRG#149: Grapple Dogs Cosmic Canines (Switch)"],
    ["[CLUB] - PS4 #5: A Short Hike (PS4)", "PS4 #5: A Short Hike (PS4)"],
    ["[CLUB] PS5#28: Bloodshed (PS5)", "PS5 #28: Bloodshed (PS5)"],
    ["[CLUB] - [Collector's Edition] CE#12: Lil Gator Game (Switch)", "[Collector's Edition] CE#12: Lil Gator Game (Switch)"],
    ["[CLUB] [Deluxe Edition] DE#1: Planet of Lana (PS5)", "[Deluxe Edition] DE#1: Planet of Lana (PS5)"],
    ["[CLUB] PS5 #17: Laika: Aged Through Blood (PS5) [REPRINT]", "PS5 #17: Laika: Aged Through Blood (PS5)"],
    ["[CLUB] - Super Rare Mixtape: Horror Edition", "Super Rare Mixtape: Horror Edition"],
    ["[CLUB] - SRG Mixtape Volume #3", "SRG Mixtape Volume #3"],
  ];
  for (const [club, pub] of pairs) assert.deepEqual(ids(club), ids(pub), club);
});

test("keys", () => {
  assert.deepEqual(ids("SRG#149: Grapple Dogs Cosmic Canines (Switch)"), ["SRG#149|switch"]);
  assert.deepEqual(ids("[CLUB] PS5#28: Bloodshed (PS5)"), ["PS5#28|ps5"]);
  assert.deepEqual(ids("[Deluxe Edition] DE#2: Cassette Beasts (Switch)"), ["DE#2|switch"]);
  assert.deepEqual(ids("[CLUB] SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack"), ["SRG#107|", "SRG#108|"]);
  assert.deepEqual(ids("SRG Mixtape Volume #3"), ["name:srgmixtapevolume3|"]);
  assert.deepEqual(ids("Game (PlayStation 5)"), ["name:game|ps5"]);
  assert.deepEqual(ids("Premium Packaging"), ["name:premiumpackaging|"]);
});

test("a steelbook isn't the game with the same number", () => {
  assert.deepEqual(ids("[CLUB] - [Steelbook] SRG#88: Lost in Play (Switch)"), ["STEELBOOK:SRG#88|switch"]);
  assert.deepEqual(ids("[Steelbook] SRG#88: Lost in Play (Switch)"), ids("[CLUB] - [Steelbook] SRG#88: Lost in Play (Switch)"));
  const owned = K.withOwned("[CLUB] - [Steelbook] SRG#88: Lost in Play (Switch)", {}, true);
  assert.equal(K.status("SRG#88: Lost in Play (Switch)", owned).owned, 0);
  // neutral tags still don't matter
  assert.deepEqual(ids("[Collector’s Edition] CE#12: Lil Gator Game (Switch)"), ["CE#12|switch"]);
  assert.equal(K.parse("[CLUB] SRG x Moonstone Island T-Shirt").numbered, false);
  assert.equal(K.parse("[CLUB] PS5#23: Tiny Terry's Turbo Trip (PS5)").numbered, true);
});

test("same number on different platforms doesn't match", () => {
  let owned = K.withOwned("[Deluxe Edition] DE#2: Cassette Beasts (Switch)", {}, true);
  assert.equal(K.status("[CLUB] - [Deluxe Edition] DE#2: Laika: Aged Through Blood (PS5)", owned).owned, 0);
  owned = K.withOwned("PS4 #1: Source of Madness (PS4)", {}, true);
  assert.equal(K.status("PS5 #1: Source of Madness (PS5)", owned).owned, 0);
});

test("missing platform matches any platform, both ways", () => {
  let owned = K.withOwned("SRG#107: Monster Camp (Switch)", {}, true);
  const s = K.status("[CLUB] SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack", owned);
  assert.deepEqual([s.owned, s.total], [1, 2]);
  owned = K.withOwned("SRG#108: Monster Roadtrip (Switch)", owned, true);
  assert.equal(K.status("[CLUB] SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack", owned).owned, 2);

  // typed by hand in the options page
  owned = K.withOwned(K.upcaseCodes("srg#149"), {}, true);
  assert.equal(K.status("[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)", owned).owned, 1);
});

test("unmarking removes whatever made it owned", () => {
  let owned = K.withOwned("srg#149".toUpperCase(), {}, true);
  owned = K.withOwned("[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)", owned, false);
  assert.deepEqual(owned, {});
  owned = K.withOwned("SRG#107: Monster Camp (Switch)", {}, true);
  owned = K.withOwned("SRG# 107/108: Double Pack", owned, false);
  assert.deepEqual(owned, {});
});

test("marking twice doesn't duplicate", () => {
  let owned = K.withOwned("SRG#149: Grapple Dogs Cosmic Canines (Switch)", {}, true);
  owned = K.withOwned("[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)", owned, true);
  assert.equal(Object.keys(owned).length, 1);
});

test("Coming Soon! placeholders", () => {
  // no number: nothing to own, and they don't all match each other
  for (const t of ["Coming Soon!", "[CLUB] Coming Soon! (Switch)", "COMING SOON"]) {
    assert.equal(K.parse(t).units.length, 0, t);
    assert.equal(K.parse(t).comingSoon, true, t);
  }
  assert.deepEqual(K.withOwned("Coming Soon!", {}, true), {});
  // with a number: matches that number, e.g. a game you have through a bundle
  assert.deepEqual(ids("SRG#160: Coming Soon! (Switch)"), ["SRG#160|switch"]);
  const owned = K.withOwned("[CLUB] SRG#158-160: Spring Bundle (Switch)", {}, true);
  assert.equal(K.status("SRG#160: Coming Soon! (Switch)", owned).owned, 1);
  assert.equal(K.status("SRG#161: Coming Soon! (Switch)", owned).owned, 0);
});

test("bundle number ranges", () => {
  assert.deepEqual(ids("SRG#158-160: Spring Bundle (Switch)"), ["SRG#158|switch", "SRG#159|switch", "SRG#160|switch"]);
  assert.deepEqual(ids("SRG# 107/108: Double Pack"), ["SRG#107|", "SRG#108|"]);
  assert.deepEqual(ids("SRG#100-102 & 105 (Switch)"), ["SRG#100|switch", "SRG#101|switch", "SRG#102|switch", "SRG#105|switch"]);
  // renamed after a reveal: every number in the title counts
  assert.deepEqual(ids("[CLUB] SRG#158: Foo + SRG#159: Bar + SRG#160: Coming Soon! Bundle (Switch)"), ["SRG#158|switch", "SRG#159|switch", "SRG#160|switch"]);
  assert.deepEqual(ids("PS5 #20: A & PS5 #21: B Double Pack (PS5)"), ["PS5#20|ps5", "PS5#21|ps5"]);
  const owned = K.withOwned("[CLUB] SRG#158: Foo + SRG#159: Bar + SRG#160: Coming Soon! Bundle (Switch)", {}, true);
  assert.equal(K.status("SRG#160: Coming Soon! (Switch)", owned).owned, 1);
  // a dash before words is a subtitle, not a range
  assert.deepEqual(ids("SRG#149 - Grapple Dogs (Switch)"), ["SRG#149|switch"]);
});

test("trading card packs aren't games", () => {
  const tc = K.parse("[CLUB] TC#164: KILL KNIGHT - Trading Card Booster Pack");
  assert.deepEqual(tc.units.map(K.unitKey), ["TC#164|"]);
  assert.equal(K.isGame(tc), false);
  assert.equal(K.isGame(K.parse("[CLUB] SRG#164: KILL KNIGHT (Switch)")), true);
  assert.equal(K.isGame(K.parse("[CLUB] PS5#33: KILL KNIGHT (PS5)")), true);
  assert.equal(K.isGame(K.parse("SRG x Moonstone Island T-Shirt")), false);
  // owning the cards doesn't mean owning the game, or the other way round
  const owned = K.withOwned("[CLUB] SRG#164: KILL KNIGHT (Switch)", {}, true);
  assert.equal(K.status("[CLUB] TC#164: KILL KNIGHT - Trading Card Booster Pack", owned).owned, 0);
});

test("a leading code joins the series", () => {
  assert.deepEqual(ids("SW2 TC#04: Little Rocket Lab - Trading Card Booster Pack"), ["SW2TC#4|"]);
  assert.notDeepEqual(ids("SW2 TC#04: Little Rocket Lab - Trading Card Booster Pack"), ids("TC#04: Some Game - Trading Card Booster Pack"));
  assert.equal(K.isGame(K.parse("SW2 TC#04: Little Rocket Lab - Trading Card Booster Pack")), false);
  assert.deepEqual(ids("SW2#01: Minishoot' Adventures (Switch 2)"), ["SW2#1|switch2"]);
  assert.equal(K.isGame(K.parse("SW2#01: Minishoot' Adventures (Switch 2)")), true);
  // a code on its own before "#" still works
  assert.deepEqual(ids("PS5 #21: Shovel Knight Dig (PS5)"), ["PS5#21|ps5"]);
  assert.deepEqual(ids("PS5 Bundle #8: Haste & KILL KNIGHT (PS5)"), ["name:ps5bundle8hastekillknight|ps5"]);
});
