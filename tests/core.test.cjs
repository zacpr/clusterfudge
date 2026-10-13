const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/core.js");

const cluster = { id: "apac", name: "apac-test-1", pattern: "*.apac-test-1.sand.wtg.zone", color: null };
const config = { clusters: [cluster], activeTabColoring: false };

test("wildcard hosts match root and subdomains, not lookalikes or paths", () => {
  for (const host of ["apac-test-1.sand.wtg.zone", "kibana.apac-test-1.sand.wtg.zone"]) {
    assert.equal(core.matches(cluster.pattern, `https://${host}:5601/s/test`), true);
  }
  for (const address of ["https://notapac-test-1.sand.wtg.zone", "https://kibana.apac-test-1.sand.wtg.zone.evil.test", "https://other.test/apac-test-1.sand.wtg.zone", "https://apac-test-1.sand.wtg.zone@evil.test", "file:///apac-test-1.sand.wtg.zone"]) {
    assert.equal(core.matches(cluster.pattern, address), false);
  }
});

test("scheme restrictions, exact hosts, and browser pattern translation", () => {
  assert.equal(core.parsePattern(cluster.pattern).matchPattern, "*://*.apac-test-1.sand.wtg.zone/*");
  assert.equal(core.matches("https://kibana.example.test", "http://kibana.example.test"), false);
  assert.equal(core.matches("kibana.example.test", "https://sub.kibana.example.test"), false);
  assert.equal(core.matches("localhost", "http://localhost:5601"), true);
});

test("invalid preferences and patterns are rejected", () => {
  for (const pattern of ["*", "*.localhost", "*.127.0.0.1", "example.test:5601", "example.test/path", "https://example.test/", "a..test", "-a.test", "javascript:alert(1)"]) {
    assert.throws(() => core.parsePattern(pattern));
  }
  for (const update of [{ name: " " }, { name: "bad\nname" }, { color: "red" }, { color: 0 }, { color: false }, { color: "" }, { pattern: "*" }]) {
    assert.throws(() => core.validateConfig({ ...config, clusters: [{ ...cluster, ...update }] }));
  }
  assert.throws(() => core.validateConfig({ ...config, clusters: [cluster, cluster] }));
  assert.throws(() => core.validateConfig({ ...config, activeTabColoring: "yes" }));
  assert.deepEqual(core.validateConfig(config), config);
});

test("the first configured matching cluster wins", () => {
  const overlap = { ...cluster, id: "specific", name: "Specific", pattern: "kibana.apac-test-1.sand.wtg.zone" };
  const address = "https://kibana.apac-test-1.sand.wtg.zone";
  assert.equal(core.findCluster({ ...config, clusters: [cluster, overlap] }, address).id, "apac");
  assert.equal(core.findCluster({ ...config, clusters: [overlap, cluster] }, address).id, "specific");
  assert.equal(core.findCluster(config, "https://unmatched.test"), null);
});

test("colors are stable across module reloads and honor overrides", () => {
  const expected = core.defaultColor(cluster.name);
  assert.match(expected, /^#[0-9a-f]{6}$/);
  delete require.cache[require.resolve("../extension/core.js")];
  assert.equal(require("../extension/core.js").defaultColor(cluster.name), expected);
  assert.equal(core.findCluster({ ...config, clusters: [{ ...cluster, color: "#123456" }] }, "https://kibana.apac-test-1.sand.wtg.zone").color, "#123456");
  assert.equal(core.contrastText("#ffffff"), "#000000");
  assert.equal(core.contrastText("#000000"), "#ffffff");
});

test("title ownership, dynamic updates, configuration changes, and isolation", () => {
  const state = new core.TitleState();
  assert.equal(state.apply("Discover", "APAC"), "APAC - Discover");
  assert.equal(state.apply("APAC - Discover", "APAC"), "APAC - Discover");
  assert.equal(state.apply("Dashboard", "APAC"), "APAC - Dashboard");
  assert.equal(state.apply("APAC - Dashboard", "EMEA"), "EMEA - Dashboard");
  assert.equal(state.apply("EMEA - Dashboard", null), "Dashboard");
  assert.equal(state.apply("APAC:Page-owned", "APAC"), "APAC:Page-owned");
  assert.equal(state.apply("APAC:Page-owned", null), "APAC:Page-owned");
  assert.equal(state.apply("APAC - Page-owned", "APAC"), "APAC - Page-owned");
  assert.equal(state.apply("APAC - Page-owned", null), "APAC - Page-owned");
  const other = new core.TitleState();
  assert.equal(other.apply("Other", "EMEA"), "EMEA - Other");
  assert.equal(state.apply("New", null), "New");
});

test("Kibana section names take priority over the trailing Elastic brand", () => {
  const state = new core.TitleState();
  assert.equal(state.apply("Index Management - Elastic", "apac-test-1"), "apac-test-1 - Index Management");
  assert.equal(state.apply("apac-test-1 - Index Management", "apac-test-1"), "apac-test-1 - Index Management");
  assert.equal(state.apply("apac-test-1 - Index Management", "emea-test-1"), "emea-test-1 - Index Management");
  assert.equal(state.apply("emea-test-1 - Index Management", null), "Index Management - Elastic");
  assert.equal(state.apply("Stack Management - Index Management - Elastic", "APAC"), "APAC - Stack Management - Index Management");
  assert.equal(state.apply("Dashboard - Elastic", "APAC"), "APAC - Dashboard");
  assert.equal(state.apply("APAC - Dashboard", null), "Dashboard - Elastic");
  assert.equal(state.apply("Elastic", "APAC"), "APAC - Elastic");
  assert.equal(state.apply("Elastic - Settings", "APAC"), "APAC - Elastic - Settings");
  assert.equal(state.apply("Reports - Another Product", "APAC"), "APAC - Reports - Another Product");
});

test("cluster URL alternatives preserve service, path, query and fragment across regions and environments", () => {
  const names = ["emea-test-1", "amer-test-1", "apac-test-1", "emea-prod-1", "amer-prod-1", "apac-prod-1"];
  const preferences = core.validateConfig({
    clusters: names.map(name => ({ id: name, name, pattern: `*.${name}.${name.includes("test") ? "sand.wtg.zone" : "wtg.zone"}`, color: null })),
    activeTabColoring: false
  });
  const address = "https://kibana.emea-test-1.sand.wtg.zone/s/sre/app/home#/";
  assert.deepEqual(core.alternativeURLs(preferences, address).map(entry => entry.url), [
    "https://kibana.amer-test-1.sand.wtg.zone/s/sre/app/home#/",
    "https://kibana.apac-test-1.sand.wtg.zone/s/sre/app/home#/",
    "https://kibana.emea-prod-1.wtg.zone/s/sre/app/home#/",
    "https://kibana.amer-prod-1.wtg.zone/s/sre/app/home#/",
    "https://kibana.apac-prod-1.wtg.zone/s/sre/app/home#/"
  ]);
  const rich = "https://logs.kibana.emea-test-1.sand.wtg.zone:5601/s/sre/app/a%2Fb?q=a%2Bb#/view?tab=1";
  assert.equal(core.alternativeURLs(preferences, rich)[0].url, "https://logs.kibana.amer-test-1.sand.wtg.zone:5601/s/sre/app/a%2Fb?q=a%2Bb#/view?tab=1");
  assert.deepEqual(core.alternativeURLs(preferences, "https://kibana.emea-test-1.sand.wtg.zone.evil.test/"), []);
  assert.deepEqual(core.alternativeURLs(preferences, "https://username:password@kibana.emea-test-1.sand.wtg.zone/"), []);
});

test("URL alternatives use exact targets, skip ambiguous wildcard mappings, and honor overlap precedence", () => {
  const preferences = core.validateConfig({
    clusters: [
      { id: "exact", name: "Exact", pattern: "source.example.test", color: null },
      { id: "wild", name: "Wild", pattern: "*.other.test", color: null },
      { id: "target", name: "Target", pattern: "https://destination.test", color: null },
      { id: "duplicate", name: "Duplicate", pattern: "https://destination.test", color: null }
    ], activeTabColoring: false
  });
  assert.deepEqual(core.alternativeURLs(preferences, "http://source.example.test:8080/a?x=1#top"), [
    { id: "target", name: "Target", url: "https://destination.test:8080/a?x=1#top" }
  ]);
  assert.equal(core.alternativeURLs(preferences, "https://kibana.other.test/a")[0].url, "https://source.example.test/a");
  assert.equal(core.alternativeURLs(preferences, "https://other.test/a")[0].url, "https://source.example.test/a");
  assert.deepEqual(core.alternativeURLs({ ...preferences, clusters: [preferences.clusters[0]] }, "https://source.example.test/"), []);
});