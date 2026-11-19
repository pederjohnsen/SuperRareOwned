const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("../src/manifest.json");

// Chrome refuses "background.scripts" in Manifest V3 and Firefox doesn't run
// service workers, so a background entry can't work in both: keep it out.
test("manifest works unchanged in Chrome and Firefox", () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.background, undefined);
});

test("fits store limits", () => {
  assert.ok(m.name.length <= 45, "Firefox: name ≤ 45 characters (Chrome allows 75)");
  assert.ok(m.short_name.length <= 12, "Chrome: short_name ≤ 12 characters");
  assert.ok(m.description.length <= 132, "Chrome: description ≤ 132 characters");
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.browser_specific_settings.gecko_android, "marked compatible with Firefox for Android");
  // only the store's own sites
  for (const h of m.host_permissions) assert.match(h, /^https:\/\/(\*\.)?superraregames\.com\/\*$/);
  assert.deepEqual(m.permissions, ["storage"]);
});
