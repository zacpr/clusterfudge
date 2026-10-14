const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ClusterMenu } = require("../extension/navigation.js");
const core = require("../extension/core.js");
const fs = require("node:fs");
const vm = require("node:vm");
const preferences = require("../extension/preferences.js");

async function setup(chromium = false) {
  const rows = new Map();
  const opened = [];
  const updated = [];
  const tab = { id: 4, url: "https://kibana.emea-test-1.sand.wtg.zone/s/sre/app/home#/", windowId: 3, index: 2 };
  const config = core.validateConfig({
    clusters: ["emea-test-1", "amer-test-1", "apac-test-1", "emea-prod-1", "amer-prod-1", "apac-prod-1"].map(name => ({
      id: name, name, pattern: `*.${name}.${name.includes("test") ? "sand.wtg.zone" : "wtg.zone"}`, color: null
    })), activeTabColoring: false
  });
  const api = {
    menus: {
      onShown: { addListener() {} },
      removeAll: async () => rows.clear(),
      create: row => { rows.set(row.id, { ...row }); return row.id; },
      update: async (id, values) => Object.assign(rows.get(id), values),
      refresh: async () => {}
    },
    tabs: {
      get: async id => { assert.equal(id, tab.id); return { ...tab }; },
      create: async details => opened.push(details),
      update: async (id, details) => updated.push({ id, ...details })
    }
  };
  if (chromium) {
    api.contextMenus = api.menus;
    delete api.menus;
    delete api.contextMenus.onShown;
    delete api.contextMenus.refresh;
    api.contextMenus.create = row => {
      assert.deepEqual(row.contexts, ["page"]);
      rows.set(row.id, { ...row });
      return row.id;
    };
  }
  const menu = new ClusterMenu(api);
  await menu.setConfig(config);
  if (!chromium) await menu.show({ pageUrl: tab.url }, tab);
  return { menu, rows, opened, updated, tab, config, api };
}

test("Chromium background starts without onShown and waits for config before a wake-up click", async () => {
  const { api, rows, opened, tab, config } = await setup(true);
  const event = () => ({ addListener(listener) { this.listener = listener; } });
  api.contextMenus.onClicked = event();
  api.runtime = { onMessage: event() };
  api.storage = { local: {}, onChanged: event() };
  api.permissions = { contains: async () => false, onAdded: event(), onRemoved: event() };
  Object.assign(api.tabs, {
    query: async () => [],
    onUpdated: event(),
    onActivated: event(),
    onAttached: event()
  });
  api.windows = { onRemoved: event() };
  api.action = { onClicked: event() };
  const errors = [];
  const context = vm.createContext({
    browser: api,
    ClusterfudgePlatform: { theme: null },
    ClusterfudgeCore: core,
    ClusterfudgePreferences: { ...preferences, load: async () => config },
    ClusterfudgeNavigation: { ClusterMenu },
    console: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) }
  });
  vm.runInContext(fs.readFileSync(require.resolve("../extension/background.js"), "utf8"), context);
  api.contextMenus.onClicked.listener({ menuItemId: "clusterfudge-new:apac-prod-1", pageUrl: tab.url }, tab);
  await vm.runInContext("queue", context);
  assert.deepEqual(errors, []);
  assert.ok(rows.has("clusterfudge-open"));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, "https://kibana.apac-prod-1.wtg.zone/s/sre/app/home#/");
});

test("Chromium page menus navigate without Firefox onShown or refresh APIs", async () => {
  const { menu, rows, opened, updated, tab } = await setup(true);
  assert.notEqual(rows.get("clusterfudge-new:apac-prod-1").visible, false);
  assert.ok(rows.get("clusterfudge-open").documentUrlPatterns.includes("*://*.emea-test-1.sand.wtg.zone/*"));
  await menu.open({ menuItemId: "clusterfudge-new:apac-prod-1", pageUrl: tab.url }, tab);
  assert.equal(opened[0].url, "https://kibana.apac-prod-1.wtg.zone/s/sre/app/home#/");
  await menu.open({ menuItemId: "clusterfudge-current:amer-test-1", pageUrl: tab.url }, tab);
  assert.equal(updated[0].url, "https://kibana.amer-test-1.sand.wtg.zone/s/sre/app/home#/");
  await menu.open({ menuItemId: "clusterfudge-open-all", pageUrl: tab.url }, tab);
  assert.equal(opened.length, 6);
});

test("Chromium clicks reject stale pages, source targets, and removed configuration", async () => {
  const { menu, opened, tab, config } = await setup(true);
  await menu.open({ menuItemId: "clusterfudge-new:emea-test-1", pageUrl: tab.url }, tab);
  await menu.open({ menuItemId: "clusterfudge-open-all", pageUrl: "https://unmatched.test/" }, tab);
  await menu.setConfig({ ...config, clusters: [] });
  await menu.open({ menuItemId: "clusterfudge-new:apac-prod-1", pageUrl: tab.url }, tab);
  assert.equal(opened.length, 0);
});

test("context menu shows the five requested URL alternatives and hides the source", async () => {
  const { rows, tab } = await setup();
  assert.equal(rows.get("clusterfudge-open").visible, true);
  const destinations = [...rows.values()].filter(row => row.id.startsWith("clusterfudge-new:") && row.visible);
  assert.equal(destinations.length, 5);
  assert.equal(rows.get("clusterfudge-new:emea-test-1").visible, false);
  assert.equal(destinations[0].title, "amer-test-1: https://kibana.amer-test-1.sand.wtg.zone/s/sre/app/home#/");
  assert.equal(destinations.at(-1).title, "apac-prod-1: https://kibana.apac-prod-1.wtg.zone/s/sre/app/home#/");
  assert.ok(destinations.every(row => !row.title.includes(tab.url)));
});

test("new-tab and current-tab commands use the right-clicked tab, not another active tab", async () => {
  const { menu, opened, updated, tab } = await setup();
  await menu.open({ menuItemId: "clusterfudge-new:apac-prod-1" }, tab);
  assert.deepEqual(opened, [{ url: "https://kibana.apac-prod-1.wtg.zone/s/sre/app/home#/", windowId: 3, openerTabId: 4, index: 3 }]);
  assert.equal(updated.length, 0);
  await menu.open({ menuItemId: "clusterfudge-current:amer-test-1" }, tab);
  assert.deepEqual(updated, [{ id: 4, url: "https://kibana.amer-test-1.sand.wtg.zone/s/sre/app/home#/" }]);
});

test("open all creates every alternative beside the right-clicked tab in preference order", async () => {
  const { menu, opened, updated, tab, rows } = await setup();
  assert.equal(rows.get("clusterfudge-open-all").visible, true);
  await menu.open({ menuItemId: "clusterfudge-open-all" }, tab);
  assert.deepEqual(opened.map(entry => new URL(entry.url).hostname), [
    "kibana.amer-test-1.sand.wtg.zone",
    "kibana.apac-test-1.sand.wtg.zone",
    "kibana.emea-prod-1.wtg.zone",
    "kibana.amer-prod-1.wtg.zone",
    "kibana.apac-prod-1.wtg.zone"
  ]);
  assert.deepEqual(opened.map(entry => entry.index), [3, 4, 5, 6, 7]);
  assert.ok(opened.every(entry => entry.windowId === tab.windowId && entry.openerTabId === tab.id));
  assert.equal(updated.length, 0);
});

test("open all rejects stale or changed destination lists without partial navigation", async () => {
  const { menu, opened, tab, config, rows } = await setup();
  await menu.open({ menuItemId: "clusterfudge-open-all" }, { ...tab, id: 99 });
  tab.url += "changed";
  await menu.open({ menuItemId: "clusterfudge-open-all" }, tab);
  tab.url = "https://kibana.emea-test-1.sand.wtg.zone/s/sre/app/home#/";
  await menu.show({ pageUrl: tab.url }, tab);
  config.clusters.pop();
  await menu.open({ menuItemId: "clusterfudge-open-all" }, tab);
  assert.equal(opened.length, 0);
  assert.equal(rows.get("clusterfudge-open-all").visible, true);
});

test("menus are hidden for unmatched pages and stale clicks cannot navigate", async () => {
  const { menu, rows, opened, updated, tab, config } = await setup();
  const selected = { menuItemId: "clusterfudge-new:apac-prod-1" };
  await menu.open(selected, { ...tab, id: 99 });
  tab.url += "changed";
  await menu.open(selected, tab);
  assert.equal(opened.length, 0);
  await menu.show({ pageUrl: "https://unmatched.test/" }, { ...tab, url: "https://unmatched.test/" });
  assert.equal(rows.get("clusterfudge-open").visible, false);
  await menu.setConfig({ ...config, clusters: [] });
  await menu.open(selected, tab);
  assert.equal(updated.length, 0);
});