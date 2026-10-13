const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ThemeManager } = require("../extension/theme.js");
const preferences = require("../extension/preferences.js");
const cluster = { name: "APAC", color: "#123456" };

test("theme snapshots are window-specific, contrasted, and restored", async () => {
  const originals = new Map([[1, { colors: { frame: "#abcdef", tab_text: "#222222" } }], [2, {}]]);
  const current = new Map(structuredClone([...originals]));
  const api = {
    getCurrent: async windowId => structuredClone(current.get(windowId)),
    update: async (windowId, value) => current.set(windowId, structuredClone(value)),
    reset: async windowId => current.set(windowId, {})
  };
  const manager = new ThemeManager(api);
  await manager.set(1, cluster);
  await manager.set(2, { ...cluster, color: "#ffffff" });
  assert.equal(current.get(1).colors.tab_selected, "#123456");
  assert.equal(current.get(2).colors.tab_text, "#000000");
  assert.equal(current.get(1).colors.frame, "#abcdef");
  assert.equal(manager.changed({ windowId: 1, theme: current.get(1) }), false);
  await manager.set(1, { ...cluster, color: "#999999" });
  await manager.set(1, null);
  assert.deepEqual(current.get(1), originals.get(1));
  await manager.set(2, null);
  assert.deepEqual(current.get(2), {});
  await manager.set(1, cluster);
  const external = { colors: { frame: "#999999" } };
  current.set(1, external);
  manager.changed({ windowId: 1, theme: external });
  await manager.set(1, cluster);
  await manager.set(1, null);
  assert.deepEqual(current.get(1), external);
});

test("external themes are not overwritten during removal", async () => {
  let current = {};
  let writes = 0;
  const manager = new ThemeManager({
    getCurrent: async () => current,
    update: async (windowId, theme) => { current = theme; writes += 1; },
    reset: async () => { current = {}; writes += 1; }
  });
  await manager.set(1, cluster);
  current = { colors: { frame: "#ffffff" } };
  await manager.set(1, null);
  assert.equal(writes, 1);
  assert.deepEqual(current, { colors: { frame: "#ffffff" } });
});

test("Firefox null metadata and reordered keys do not turn owned themes into user themes", async () => {
  let current = {};
  let resets = 0;
  const manager = new ThemeManager({
    getCurrent: async () => structuredClone(current),
    update: async (windowId, theme) => {
      current = {
        properties: null,
        images: null,
        colors: { toolbar: null, tab_text: theme.colors.tab_text, tab_selected: theme.colors.tab_selected }
      };
    },
    reset: async () => { current = {}; resets += 1; }
  });
  await manager.set(1, cluster);
  assert.equal(manager.changed({ windowId: 1, theme: current }), false);
  await manager.set(1, { ...cluster, color: "#ffffff" });
  assert.equal(manager.changed({ windowId: 1, theme: current }), false);
  await manager.set(1, null);
  assert.equal(resets, 1);
  assert.deepEqual(current, {});
});

test("preferences persist with validation and default to opt-out", async () => {
  let stored = {};
  const storage = { get: async () => stored, set: async value => { stored = structuredClone(value); } };
  assert.deepEqual(await preferences.load(storage), { clusters: [], activeTabColoring: false });
  const config = { clusters: [{ id: "one", name: "APAC", pattern: "*.example.test", color: null }], activeTabColoring: true };
  await preferences.save(storage, config);
  assert.deepEqual(await preferences.load(storage), config);
  await assert.rejects(preferences.save(storage, { ...config, clusters: [{ ...config.clusters[0], color: "bad" }] }));
  assert.deepEqual(await preferences.load(storage), config);
});

test("JSON round trips preserve order, IDs, automatic colors, overrides, and theme opt-in", () => {
  const config = {
    clusters: [
      { id: "first", name: "APAC", pattern: "*.example.test", color: null },
      { id: "second", name: "EMEA", pattern: "emea.example.test", color: "#abcdef" }
    ],
    activeTabColoring: true
  };
  const json = preferences.exportJSON(config);
  assert.deepEqual(preferences.importJSON(json), config);
  assert.equal(JSON.parse(json).version, 1);
  assert.deepEqual(preferences.importJSON(preferences.exportJSON(preferences.empty())), preferences.empty());
  for (const input of ["not JSON", "null", "{}", "[]", JSON.stringify({ format: "clusterfudge", version: 2, preferences: config })]) {
    assert.throws(() => preferences.importJSON(input));
  }
  assert.throws(() => preferences.importJSON(" ".repeat(1024 * 1024 + 1)));
  const invalid = { ...config, clusters: [{ ...config.clusters[0], pattern: "evil.test/path" }] };
  assert.throws(() => preferences.exportJSON(invalid));
  assert.throws(() => preferences.importJSON(JSON.stringify({ format: "clusterfudge", version: 1, preferences: invalid })));
});