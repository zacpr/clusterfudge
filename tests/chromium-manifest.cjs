const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packaged = path.join(root, "web-ext-artifacts", "chromium-source");
const manifest = JSON.parse(fs.readFileSync(path.join(packaged, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, "background-chromium.js");
assert.ok(manifest.permissions.includes("scripting"));
assert.ok(manifest.permissions.includes("contextMenus"));
assert.ok(manifest.optional_host_permissions.includes("http://*/*"));
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
assert.equal(manifest.permissions.includes("theme"), false);
for (const file of [manifest.background.service_worker, "platform.js", "browser-polyfill.min.js", "options.html"]) {
  assert.ok(fs.existsSync(path.join(packaged, file)), `${file} must be present in the Chromium build`);
}
for (const icon of Object.values(manifest.icons)) assert.ok(fs.existsSync(path.join(packaged, icon)));
assert.match(fs.readFileSync(path.join(packaged, "options.html"), "utf8"), /browser-polyfill\.min\.js/);
console.log("Chromium MV3 package structure is valid.");