const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { Builder, By } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const edge = require("selenium-webdriver/edge");

async function main() {
  const profileRoot = process.env.EXTENSION_PROFILE_ROOT || os.tmpdir();
  await fs.mkdir(profileRoot, { recursive: true });
  const profile = await fs.mkdtemp(path.join(profileRoot, "clusterfudge-chromium-"));
  const extension = path.join(profile, "clusterfudge-extension");
  await fs.cp(path.resolve("web-ext-artifacts/chromium-source"), extension, { recursive: true });
  const probeExtension = path.join(profile, "probe-extension");
  await fs.mkdir(probeExtension);
  await fs.writeFile(path.join(probeExtension, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "MV3 probe",
    version: "1.0",
    background: { service_worker: "worker.js" },
    options_page: "probe.html"
  }));
  await fs.writeFile(path.join(probeExtension, "worker.js"), "chrome.runtime.onMessage.addListener((message, sender, sendResponse) => sendResponse('pong'));");
  await fs.writeFile(path.join(probeExtension, "probe.html"), "<!doctype html><body><output id='result'>pending</output><script>chrome.runtime.sendMessage({ping:true}, response => document.getElementById('result').textContent = response || chrome.runtime.lastError?.message || 'no response')</script>");
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Index Management - Elastic</title><button id='change' onclick=\"document.title='Dashboard - Elastic'\">Change</button>");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const pageUrl = `http://127.0.0.1:${server.address().port}/s/sre/app/home#/`;
  const alternateUrl = pageUrl.replace("127.0.0.1", "localhost");
  const browserName = process.env.EXTENSION_BROWSER || "chrome";
  const isEdge = browserName === "edge";
  const options = isEdge ? new edge.Options() : new chrome.Options();
  if (isEdge) options.setBinaryPath(process.env.EDGE_BINARY || "/usr/bin/microsoft-edge-stable");
  else options.setChromeBinaryPath(process.env.CHROMIUM_BINARY || "/usr/bin/chromium-browser");
  options.addArguments("--no-sandbox", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, `--load-extension=${extension},${probeExtension}`, `--disable-extensions-except=${extension},${probeExtension}`);
  if (process.env.CHROMIUM_HEADLESS !== "0") options.addArguments("--headless=new");
  let driver;
  try {
    const builder = new Builder().forBrowser(isEdge ? "MicrosoftEdge" : "chrome");
    driver = await (isEdge ? builder.setEdgeOptions(options) : builder.setChromeOptions(options)).build();
    await driver.manage().setTimeouts({ script: 15000, pageLoad: 15000 });
    await driver.get("chrome://extensions/");
    let probeId;
    try {
      probeId = await driver.wait(async () => driver.executeScript(`
      const visit = root => {
        for (const item of root.querySelectorAll('*')) {
          if (item.localName === 'extensions-item' && item.shadowRoot?.textContent?.includes('MV3 probe')) return item.id;
          if (item.shadowRoot) {
            const result = visit(item.shadowRoot);
            if (result) return result;
          }
        }
        return null;
      };
      return visit(document);
      `), 10000, "MV3 control extension not found");
    } catch {
      await driver.get("chrome://version/");
      const versionDetails = await driver.findElement(By.css("body")).getText();
      throw new Error(`${isEdge ? "Edge" : "Chrome"} Flatpak did not load the MV3 control extension. ${versionDetails.slice(0, 2500)}`);
    }
    await driver.get(`chrome-extension://${probeId}/probe.html`);
    try {
      await driver.wait(async () => (await driver.findElement(By.id("result")).getText()) === "pong", 5000, "Control worker did not respond");
    } catch {
      const result = await driver.findElement(By.id("result")).getText();
      throw new Error(`Chromium cannot verify MV3 service workers in this environment; control extension response: ${result}`);
    }
    console.log("Chromium minimal MV3 worker control passed.");
    await driver.get("chrome://extensions/");
    const extensionId = await driver.wait(async () => driver.executeScript(`
      const visit = root => {
        for (const item of root.querySelectorAll('*')) {
          if (item.localName === 'extensions-item' && item.shadowRoot?.textContent?.includes('Clusterfudge')) return item.id;
          if (item.shadowRoot) {
            const result = visit(item.shadowRoot);
            if (result) return result;
          }
        }
        return null;
      };
      return visit(document);
    `), 10000, "Chromium did not load the MV3 extension");
    assert.match(extensionId, /^[a-p]{32}$/);
    await driver.get(`chrome-extension://${extensionId}/options.html`);
    await driver.wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences loaded", 10000, "Chromium options page did not initialize");
    assert.equal(await driver.findElement(By.id("active-tab")).isEnabled(), false);
    assert.equal(await driver.findElement(By.id("theme-note")).isDisplayed(), true);
    assert.equal(await driver.findElement(By.id("save")).isEnabled(), true);
    for (const [name, pattern] of [["Loopback", "http://127.0.0.1"], ["Alternate", "http://localhost"]]) {
      await driver.findElement(By.id("add")).click();
      const rows = await driver.findElements(By.css(".cluster"));
      const row = rows.at(-1);
      await row.findElement(By.css(".name")).sendKeys(name);
      await row.findElement(By.css(".pattern")).sendKeys(pattern);
    }
    await driver.findElement(By.id("save")).click();
    await driver.wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", 15000, "Chromium optional host permission or background save failed");
    await driver.get(pageUrl);
    await driver.wait(async () => (await driver.getTitle()) === "Loopback - Index Management", 10000, "MV3 registered script did not decorate the configured loopback host");
    await driver.findElement(By.id("change")).click();
    await driver.wait(async () => (await driver.getTitle()) === "Loopback - Dashboard", 10000, "Dynamic page title change was not decorated");
    await driver.get(alternateUrl);
    await driver.wait(async () => (await driver.getTitle()) === "Alternate - Index Management", 10000, "Second optional host did not receive cluster decoration");
    console.log(`${isEdge ? "Edge" : "Chromium"} ${await driver.executeScript("return navigator.userAgent.match(/(?:Chrom(e|ium)|Edg)\\/([0-9.]+)/)?.[2] || 'unknown'")} smoke check passed: MV3 service worker, options, optional host grants, registered content scripts, dynamic titles, and Firefox-only theme disclosure.`);
  } finally {
    if (driver) await driver.quit();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});