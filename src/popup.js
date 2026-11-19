(async function () {
  const ext = (function (g) {
    // A real extension API has runtime.id. Checking for it skips a page element
    // that happens to be named "browser", and it's missing in a tab whose copy of
    // the extension was cut off by an update or reload.
    const ok = (o) => o && o.runtime && o.runtime.id && o.storage;
    return ok(g.browser) ? g.browser : ok(g.chrome) ? g.chrome : null;
  })(globalThis);
  document.getElementById("version").textContent = "Version " + ext.runtime.getManifest().version;
  const owned = await globalThis.SRGOStore.load();
  const n = new Set(Object.values(owned).map((v) => v.t)).size;
  document.getElementById("count").textContent = n;
  document.getElementById("noun").textContent = n === 1 ? "game" : "games";
  const { srgoImport } = await ext.storage.local.get("srgoImport");
  const review = document.getElementById("review");
  review.hidden = !srgoImport;
  review.addEventListener("click", () => {
    ext.runtime.openOptionsPage();
    window.close();
  });
  document.getElementById("manage").addEventListener("click", () => {
    ext.runtime.openOptionsPage();
    window.close();
  });
})();
