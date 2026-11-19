(async function () {
  const ext = globalThis.browser || globalThis.chrome;
  const owned = await globalThis.SRGOStore.load();
  const n = new Set(Object.values(owned).map((v) => v.t)).size;
  document.getElementById("count").textContent = n;
  document.getElementById("noun").textContent = n === 1 ? "game" : "games";
  document.getElementById("manage").addEventListener("click", () => {
    ext.runtime.openOptionsPage();
    window.close();
  });
})();
