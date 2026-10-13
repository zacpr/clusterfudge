(function () {
  "use strict";
  if (globalThis.clusterfudgeContent) return;
  globalThis.clusterfudgeContent = true;
  let config = ClusterfudgePreferences.empty();
  let notified = false;
  const decoration = new ClusterfudgeDecoration.PageDecoration(document);
  const refresh = () => decoration.setCluster(ClusterfudgeCore.findCluster(config, location.href));
  const apply = value => {
    config = ClusterfudgeCore.validateConfig(value);
    refresh();
  };
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "preferences") return undefined;
    notified = true;
    apply(message.config);
    sendResponse({ applied: true });
    return false;
  });
  window.addEventListener("popstate", refresh);
  window.addEventListener("hashchange", refresh);
  window.addEventListener("pagehide", () => decoration.stop());
  window.addEventListener("pageshow", refresh);
  browser.runtime.sendMessage({ type: "get-preferences" }).then(value => {
    if (!notified) apply(value);
  }).catch(() => decoration.stop());
})();