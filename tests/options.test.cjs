const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const core = require("../extension/core.js");
const preferences = require("../extension/preferences.js");
const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(config, granted = true) {
  const dom = new JSDOM(fs.readFileSync("extension/options.html", "utf8"), { runScripts: "outside-only", url: "https://extension.test/options.html" });
  const requests = [];
  const messages = [];
  dom.window.ClusterfudgeCore = core;
  dom.window.ClusterfudgePreferences = preferences;
  dom.window.browser = {
    storage: { local: { get: async () => ({ preferences: config }) } },
    permissions: { request: async value => { requests.push(value); return granted; } },
    runtime: { sendMessage: async value => { messages.push(value); return { saved: true }; } }
  };
  dom.window.eval(fs.readFileSync("extension/options.js", "utf8"));
  await settle();
  return { dom, document: dom.window.document, requests, messages };
}

const cluster = { id: "one", name: "APAC", pattern: "*.example.test", color: null };

test("preferences add, reorder, override colors, remove, and save", async () => {
  const { dom, document, requests, messages } = await setup({ clusters: [cluster], activeTabColoring: false });
  assert.equal(document.querySelector(".name").value, "APAC");
  assert.equal(document.querySelector(".color").disabled, true);
  document.getElementById("add").click();
  const row = document.querySelectorAll(".cluster")[1];
  row.querySelector(".name").value = "EMEA";
  row.querySelector(".pattern").value = "emea.example.test";
  row.querySelector(".auto").checked = false;
  row.querySelector(".color").value = "#abcdef";
  row.querySelector(".color").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  row.querySelector(".up").click();
  document.getElementById("active-tab").checked = true;
  document.getElementById("preferences").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.deepEqual(Array.from(requests[0].origins), ["*://emea.example.test/*", "*://*.example.test/*"]);
  assert.equal(messages[0].config.clusters[0].name, "EMEA");
  assert.equal(messages[0].config.clusters[0].color, "#abcdef");
  assert.equal(messages[0].config.activeTabColoring, true);
  assert.equal(document.getElementById("status").textContent, "Preferences saved");
  document.querySelector(".remove").click();
  assert.equal(document.querySelectorAll(".cluster").length, 1);
  dom.window.close();
});

test("denied host access does not save preferences", async () => {
  const { dom, document, messages } = await setup({ clusters: [cluster], activeTabColoring: false }, false);
  document.getElementById("preferences").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.equal(messages.length, 0);
  assert.match(document.getElementById("error").textContent, /not granted/);
  assert.equal(document.getElementById("save").disabled, false);
  dom.window.close();
});

test("invalid patterns fail before requesting host access", async () => {
  const { dom, document, requests } = await setup({ clusters: [cluster], activeTabColoring: false });
  document.querySelector(".pattern").value = "*.example.test/path";
  document.getElementById("preferences").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.equal(requests.length, 0);
  assert.equal(document.getElementById("status").textContent, "Not saved");
  dom.window.close();
});

async function importFile(dom, document, file) {
  const input = document.getElementById("config-file");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new dom.window.Event("change"));
  await settle();
}

test("imports are staged for review and request no access until saved", async () => {
  const { dom, document, requests, messages } = await setup({ clusters: [cluster], activeTabColoring: false });
  const imported = { clusters: [{ ...cluster, name: "EMEA", pattern: "emea.example.test", color: "#abcdef" }], activeTabColoring: true };
  await importFile(dom, document, new File([preferences.exportJSON(imported)], "config.json"));
  assert.equal(document.querySelector(".name").value, "EMEA");
  assert.equal(document.querySelector(".preview-title").textContent, "EMEA - Index Management");
  assert.equal(document.querySelector(".color").value, "#abcdef");
  assert.equal(document.getElementById("active-tab").checked, true);
  assert.equal(requests.length, 0);
  assert.equal(messages.length, 0);
  assert.match(document.getElementById("status").textContent, /review and save/);
  document.getElementById("preferences").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.equal(messages[0].config.clusters[0].name, "EMEA");
  assert.deepEqual(Array.from(requests[0].origins), ["*://emea.example.test/*"]);
  dom.window.close();
});

test("bad, oversized, and invalid imports leave the current form intact", async () => {
  const { dom, document, requests, messages } = await setup({ clusters: [cluster], activeTabColoring: false });
  for (const file of [
    new File(["broken JSON"], "broken.json"),
    new File([" ".repeat(1024 * 1024 + 1)], "large.json"),
    new File([JSON.stringify({ format: "clusterfudge", version: 1, preferences: { clusters: [cluster, cluster], activeTabColoring: false } })], "invalid.json")
  ]) {
    await importFile(dom, document, file);
    assert.equal(document.querySelector(".name").value, "APAC");
    assert.equal(document.querySelectorAll(".cluster").length, 1);
    assert.equal(document.getElementById("status").textContent, "Not imported");
    assert.equal(document.getElementById("save").disabled, false);
  }
  assert.equal(requests.length, 0);
  assert.equal(messages.length, 0);
  dom.window.close();
});

test("export downloads valid current form values without saving or permissions", async () => {
  const { dom, document, requests, messages } = await setup({ clusters: [cluster], activeTabColoring: false });
  let blob;
  let download;
  dom.window.Blob = Blob;
  dom.window.URL.createObjectURL = value => { blob = value; return "blob:https://extension.test/config"; };
  dom.window.HTMLAnchorElement.prototype.click = function () { download = this.download; };
  document.querySelector(".name").value = "Draft";
  document.querySelector(".name").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  document.getElementById("export").click();
  assert.equal(download, "clusterfudge-config.json");
  assert.equal(preferences.importJSON(await blob.text()).clusters[0].name, "Draft");
  assert.match(document.getElementById("status").textContent, /unsaved changes/);
  assert.equal(requests.length, 0);
  assert.equal(messages.length, 0);
  dom.window.close();
});

test("palette shades and exact hex colors override automatic colors and survive save", async () => {
  const { dom, document, messages } = await setup({ clusters: [cluster], activeTabColoring: true });
  const row = document.querySelector(".cluster");
  assert.equal(row.querySelectorAll(".palette-swatch").length, 18);
  row.querySelector('[data-color="#bfdbfe"]').click();
  assert.equal(row.querySelector(".auto").checked, false);
  assert.equal(row.querySelector(".hex").value, "#bfdbfe");
  assert.equal(row.querySelector(".preview").style.color, "rgb(0, 0, 0)");
  row.querySelector('[data-color="#1e3a8a"]').click();
  assert.equal(row.querySelector(".preview").style.color, "rgb(255, 255, 255)");
  assert.equal(row.querySelector('[data-color="#1e3a8a"]').getAttribute("aria-pressed"), "true");
  const hex = row.querySelector(".hex");
  hex.value = "#ab12cd";
  hex.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(row.querySelector(".color").value, "#ab12cd");
  document.getElementById("preferences").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.equal(messages[0].config.clusters[0].color, "#ab12cd");
  document.querySelector(".auto").click();
  assert.equal(document.querySelector(".hex").disabled, true);
  assert.equal(document.querySelector(".hex").value, core.defaultColor("APAC"));
  dom.window.close();
});