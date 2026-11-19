const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("../src/manifest.json");

// Chrome refuses "background.scripts" in Manifest V3 and Firefox doesn't run
// service workers, so a background entry can't work in both: keep it out.
test("manifest works unchanged in Chrome and Firefox", () => {
  assert.equal(m.manifest_version, 3);
  assert.equal(m.background, undefined);
});
