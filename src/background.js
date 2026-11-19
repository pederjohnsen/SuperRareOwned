// Opens the manage page when the account page has an import ready for review
// (content scripts can't open extension pages themselves).
const ext = globalThis.browser || globalThis.chrome;
ext.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "srgo-open-import") ext.runtime.openOptionsPage();
});
