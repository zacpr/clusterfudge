"use strict";

let effective = ClusterfudgePreferences.empty();
let registration = null;
let queue = Promise.resolve();
const platform = globalThis.ClusterfudgePlatform || {
  theme: browser.theme,
  registerScripts: (matches, files) => browser.contentScripts.register({ matches, js: files.map(file => ({ file })), runAt: "document_idle" }),
  unregisterScripts: scriptRegistration => scriptRegistration.unregister(),
  injectScripts: async (tabId, files) => {
    for (const file of files) await browser.tabs.executeScript(tabId, { file, frameId: 0, runAt: "document_idle" });
  }
};
const themes = platform.theme ? new ClusterfudgeTheme.ThemeManager(platform.theme) : {
  set: async () => {},
  changed: () => false,
  remove: () => {}
};
const clusterMenu = new ClusterfudgeNavigation.ClusterMenu(browser);
const scripts = ["core.js", "preferences.js", "decoration.js", "content.js"];

function enqueue(action) {
  const result = queue.then(action);
  queue = result.catch(error => console.error("Clusterfudge:", error));
  return result;
}

async function syncTab(tab) {
  const cluster = ClusterfudgeCore.findCluster(effective, tab.url || "");
  try {
    await browser.tabs.sendMessage(tab.id, { type: "preferences", config: effective }, { frameId: 0 });
  } catch {
    if (cluster && !tab.discarded) {
      try {
        await platform.injectScripts(tab.id, scripts);
        await browser.tabs.sendMessage(tab.id, { type: "preferences", config: effective }, { frameId: 0 });
      } catch (error) {
        console.warn("Clusterfudge cannot decorate this page:", error.message);
      }
    }
  }
  if (tab.active) await themes.set(tab.windowId, effective.activeTabColoring ? cluster : null);
}

async function syncAll() {
  const preferences = await ClusterfudgePreferences.load(browser.storage.local);
  const clusters = [];
  for (const cluster of preferences.clusters) {
    const pattern = ClusterfudgeCore.parsePattern(cluster.pattern).matchPattern;
    if (await browser.permissions.contains({ origins: [pattern] })) clusters.push(cluster);
  }
  effective = { ...preferences, clusters };
  await clusterMenu.setConfig(preferences);
  if (registration) {
    await platform.unregisterScripts(registration);
    registration = null;
  }
  const matches = [...new Set(clusters.map(cluster => ClusterfudgeCore.parsePattern(cluster.pattern).matchPattern))];
  if (matches.length) {
    registration = await platform.registerScripts(matches, scripts);
  }
  for (const tab of await browser.tabs.query({})) await syncTab(tab);
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id) return undefined;
  if (message.type === "get-preferences") {
    queue.then(() => sendResponse(effective), error => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === "save-preferences" && sender.url === browser.runtime.getURL("options.html")) {
    enqueue(async () => {
      const validated = ClusterfudgeCore.validateConfig(message.config);
      const origins = [...new Set(validated.clusters.map(cluster => ClusterfudgeCore.parsePattern(cluster.pattern).matchPattern))];
      for (const origin of origins) {
        if (!await browser.permissions.contains({ origins: [origin] })) throw new Error("Grant access to the configured hosts before saving.");
      }
      await ClusterfudgePreferences.save(browser.storage.local, validated);
      await syncAll();
      const granted = await browser.permissions.getAll();
      const obsolete = (granted.origins || []).filter(origin => !origins.includes(origin));
      if (obsolete.length) await browser.permissions.remove({ origins: obsolete });
      return { saved: true };
    }).then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
  }
  return undefined;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.preferences) enqueue(syncAll);
});
browser.permissions.onAdded.addListener(() => enqueue(syncAll));
browser.permissions.onRemoved.addListener(() => enqueue(syncAll));
browser.tabs.onUpdated.addListener((tabId, changes, tab) => {
  if (changes.url || changes.status === "complete") enqueue(() => syncTab(tab));
});
browser.tabs.onActivated.addListener(info => enqueue(async () => syncTab(await browser.tabs.get(info.tabId))));
browser.tabs.onAttached.addListener(tabId => enqueue(async () => syncTab(await browser.tabs.get(tabId))));
browser.windows.onRemoved.addListener(windowId => themes.remove(windowId));
if (platform.theme) browser.theme.onUpdated.addListener(event => {
  if (themes.changed(event)) enqueue(async () => {
    for (const tab of await browser.tabs.query({ active: true })) {
      await themes.set(tab.windowId, effective.activeTabColoring ? ClusterfudgeCore.findCluster(effective, tab.url || "") : null);
    }
  });
});
(browser.browserAction || browser.action).onClicked.addListener(() => browser.runtime.openOptionsPage());
const menus = browser.menus || browser.contextMenus;
menus.onShown.addListener((info, tab) => {
  clusterMenu.show(info, tab).catch(error => console.warn("Clusterfudge menu:", error.message));
});
menus.onClicked.addListener((info, tab) => {
  clusterMenu.open(info, tab).catch(error => console.warn("Clusterfudge navigation:", error.message));
});
enqueue(syncAll);