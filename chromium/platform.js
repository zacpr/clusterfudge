"use strict";

const contentScriptId = "clusterfudge-content";

globalThis.ClusterfudgePlatform = {
  theme: null,
  registerScripts: async (matches, files) => {
    await browser.scripting.unregisterContentScripts({ ids: [contentScriptId] }).catch(() => {});
    await browser.scripting.registerContentScripts([{
      id: contentScriptId,
      matches,
      js: ["browser-polyfill.min.js", ...files],
      runAt: "document_idle"
    }]);
    return contentScriptId;
  },
  unregisterScripts: async id => browser.scripting.unregisterContentScripts({ ids: [id] }),
  injectScripts: (tabId, files) => browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ["browser-polyfill.min.js", ...files]
  })
};