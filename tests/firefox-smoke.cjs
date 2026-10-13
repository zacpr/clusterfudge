const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { Builder, By } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");

const extensionId = "clusterfudge@extensions.ashurtech.net";
const uuid = "bd32b3e1-78da-4f30-9a66-32a5f2257df4";
const optionsUrl = `moz-extension://${uuid}/options.html`;
const fixture = '<!doctype html><html><head><title>Index Management - Elastic</title><link rel="icon" href="/original.svg" type="image/svg+xml"></head><body><h1>Cluster fixture</h1><button id="change" onclick="document.title=\'Dashboard - Elastic\';document.querySelector(\'link\').href=\'/updated.svg\'">Change view</button></body></html>';
const fixtureIcon = color => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="${color}"/></svg>`;
const encodedIcon = color => `data:image/svg+xml;base64,${Buffer.from(fixtureIcon(color)).toString("base64")}`;
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", request.url.endsWith(".svg") ? "image/svg+xml" : "text/html");
  response.end(request.url.endsWith(".svg") ? fixtureIcon(request.url === "/updated.svg" ? "blue" : "red") : fixture);
});

async function main() {
  await fs.mkdir("test-results", { recursive: true });
  const downloadDirectory = await fs.mkdtemp(path.resolve("test-results/firefox-files-"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const apacUrl = `http://localhost:${port}/`;
  const emeaUrl = `http://127.0.0.1:${port}/`;
  const options = new firefox.Options()
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [extensionId]: uuid }))
    .setPreference("browser.download.folderList", 2)
    .setPreference("browser.download.dir", downloadDirectory)
    .setPreference("browser.download.useDownloadDir", true)
    .setPreference("browser.helperApps.neverAsk.saveToDisk", "application/json");
  if (process.env.HEADLESS === "1") options.addArguments("-headless");
  let driver;
  try {
    const service = new firefox.ServiceBuilder().addArguments("--allow-system-access");
    driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).setFirefoxService(service).build();
    await driver.manage().setTimeouts({ script: 15000, pageLoad: 15000 });
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    const wait = (condition, message) => driver.wait(condition, 10000, message);
    const artifacts = await fs.readdir("web-ext-artifacts");
    const archive = artifacts.find(name => name.endsWith(".zip"));
    assert.ok(archive, "Run npm run package before this check");
    await driver.installWebExtension(path.resolve("web-ext-artifacts", archive), { permanent: false });
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript("document.getElementById('unified-extensions-button').click()");
    const toolbar = await driver.executeScript("return [...document.querySelectorAll('toolbarbutton')].map(item=>({id:item.id,label:item.getAttribute('label'),tooltip:item.getAttribute('tooltiptext')}))");
    const actionId = await driver.executeScript("return [...document.querySelectorAll('toolbarbutton')].find(item=>(item.getAttribute('label')||'').includes('Clusterfudge')||(item.getAttribute('tooltiptext')||'').includes('Clusterfudge'))?.id || null");
    await driver.setContext(firefox.Context.CONTENT);
    assert.ok(actionId, `Clusterfudge toolbar action was not found: ${JSON.stringify(toolbar)}`);
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript("document.getElementById(arguments[0]).click()", actionId);
    await driver.setContext(firefox.Context.CONTENT);
    await wait(async () => (await driver.getCurrentUrl()).endsWith("/options.html"), "Toolbar action did not open preferences");
    await driver.get(optionsUrl);
    const optionsHandle = await driver.getWindowHandle();
    await wait(async () => (await driver.findElement(By.id("save")).isEnabled()), "Preferences did not load");
    const initialTheme = await driver.executeScript("return browser.theme.getCurrent()");
    await driver.executeScript("return browser.theme.update(arguments[0])", {
      colors: { frame: "#ced9d2", tab_selected: "#eeeeee", tab_text: "#121212", toolbar: "#ffffff" }
    });
    const priorTheme = await driver.executeScript("return browser.theme.getCurrent()");
    await driver.switchTo().newWindow("tab");
    const apacHandle = await driver.getWindowHandle();
    await driver.get(apacUrl);
    assert.equal(await driver.getTitle(), "Index Management - Elastic");
    await driver.switchTo().newWindow("window");
    const emeaHandle = await driver.getWindowHandle();
    await driver.get(emeaUrl);
    await driver.switchTo().window(optionsHandle);

    async function add(name, pattern, color) {
      await driver.findElement(By.id("add")).click();
      const rows = await driver.findElements(By.css(".cluster"));
      const row = rows.at(-1);
      await row.findElement(By.css(".name")).sendKeys(name);
      await row.findElement(By.css(".pattern")).sendKeys(pattern);
      await row.findElement(By.css(".auto")).click();
      await driver.executeScript("arguments[0].value=arguments[1];arguments[0].dispatchEvent(new Event('input',{bubbles:true}))", await row.findElement(By.css(".color")), color);
    }
    await add("APAC", "http://localhost", "#16694e");
    await add("EMEA", "http://127.0.0.1", "#d86442");
    await driver.findElement(By.id("active-tab")).click();
    await driver.findElement(By.id("save")).click();
    await driver.setContext(firefox.Context.CHROME);
    await wait(() => driver.executeScript("return PopupNotifications.panel.state === 'open' && !!document.getElementById('addon-webext-permissions-notification')?.button"), "Host access prompt did not appear");
    await driver.executeScript("document.getElementById('addon-webext-permissions-notification').button.click()");
    await driver.setContext(firefox.Context.CONTENT);
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", "Preferences were not saved");
    await driver.navigate().refresh();
    await wait(async () => (await driver.findElements(By.css(".cluster"))).length === 2, "Preferences did not persist");
    const storedConfig = await driver.executeScript("return browser.storage.local.get('preferences').then(value=>value.preferences)");
    await driver.findElement(By.id("export")).click();
    const exportedFile = path.join(downloadDirectory, "clusterfudge-config.json");
    const exported = await wait(async () => {
      try { return JSON.parse(await fs.readFile(exportedFile, "utf8")); } catch { return false; }
    }, "JSON export was not downloaded");
    assert.equal(exported.format, "clusterfudge");
    assert.equal(exported.version, 1);
    assert.deepEqual(exported.preferences, storedConfig);
    const nameField = await driver.findElement(By.css(".name"));
    await nameField.clear();
    await nameField.sendKeys("Unsaved draft");
    const permissionsBeforeImport = await driver.executeScript("return browser.permissions.getAll()");
    await driver.findElement(By.id("config-file")).sendKeys(exportedFile);
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "JSON imported; review and save", "JSON file was not imported for review");
    assert.equal(await driver.findElement(By.css(".name")).getAttribute("value"), "APAC");
    assert.deepEqual(await driver.executeScript("return browser.storage.local.get('preferences').then(value=>value.preferences)"), storedConfig);
    assert.deepEqual(await driver.executeScript("return browser.permissions.getAll()"), permissionsBeforeImport);
    await driver.findElement(By.id("save")).click();
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", "Imported JSON could not be saved");
    const firstRow = await driver.findElement(By.css(".cluster"));
    await firstRow.findElement(By.css("summary")).click();
    await firstRow.findElement(By.css('[data-color="#bfdbfe"]')).click();
    assert.equal(await firstRow.findElement(By.css(".hex")).getAttribute("value"), "#bfdbfe");
    assert.equal(await firstRow.findElement(By.css(".preview")).getCssValue("color"), "rgb(0, 0, 0)");
    await firstRow.findElement(By.css('[data-color="#1e3a8a"]')).click();
    assert.equal(await firstRow.findElement(By.css(".preview")).getCssValue("color"), "rgb(255, 255, 255)");
    const hexField = await firstRow.findElement(By.css(".hex"));
    await hexField.clear();
    await hexField.sendKeys("#16694e");
    await driver.findElement(By.id("save")).click();
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", "Hex color could not be saved");
    await driver.findElement(By.css(".color-options summary")).click();
    await fs.writeFile("test-results/options-desktop.png", await driver.takeScreenshot(), "base64");
    for (const width of [480, 1280]) {
      await driver.manage().window().setRect({ width, height: 900 });
      const layout = await driver.executeScript("return { width: innerWidth, content: document.documentElement.scrollWidth, missing: [...document.images].filter(image => !image.complete || !image.naturalWidth).length }");
      assert.ok(layout.content <= layout.width, `Preferences overflow at ${width}px`);
      assert.equal(layout.missing, 0);
      if (width === 480) await fs.writeFile("test-results/options-narrow.png", await driver.takeScreenshot(), "base64");
    }

    async function nativeState() {
      await driver.setContext(firefox.Context.CHROME);
      try {
        const state = await driver.executeScript("const tab=gBrowser.selectedTab;return {title:tab.label,image:tab.getAttribute('image'),color:getComputedStyle(tab.querySelector('.tab-background')).backgroundColor}");
        if (state.image?.startsWith("moz-remote-image:")) state.image = new URL(state.image).searchParams.get("url");
        return state;
      } finally {
        await driver.setContext(firefox.Context.CONTENT);
      }
    }
    await driver.switchTo().window(apacHandle);
    await wait(async () => (await driver.getTitle()) === "APAC - Index Management", "Existing APAC tab lost its section name");
    await wait(async () => (await nativeState()).image === encodedIcon("red"), "Firefox did not preserve the original favicon");
    await wait(async () => (await nativeState()).color === "rgb(22, 105, 78)", "Firefox did not apply APAC's selected-tab color");
    await driver.setContext(firefox.Context.CHROME);
    await fs.writeFile("test-results/firefox-apac.png", await driver.takeScreenshot(), "base64");
    await driver.setContext(firefox.Context.CONTENT);
    await driver.findElement(By.id("change")).click();
    await wait(async () => (await driver.getTitle()) === "APAC - Dashboard", "SPA title lost its section name");
    assert.equal(await driver.executeScript("return document.querySelector('link').getAttribute('href')"), "/updated.svg");
    await wait(async () => (await nativeState()).image === encodedIcon("blue"), "Site favicon update was not preserved");

    const route = "s/sre/app/home?view=1#/";
    await driver.executeScript("history.pushState({}, '', arguments[0])", `/${route}`);
    async function selectDestination(name, mode) {
      await driver.actions().contextClick(await driver.findElement(By.css("body"))).perform();
      await driver.setContext(firefox.Context.CHROME);
      try {
        await wait(() => driver.executeScript("return [...document.getElementById('contentAreaContextMenu').querySelectorAll('menu')].some(item=>item.getAttribute('label')==='Open in another cluster' && !item.hidden)"), "Cluster context menu was not visible");
        const labels = await driver.executeScript("const root=[...document.getElementById('contentAreaContextMenu').querySelectorAll('menu')].find(item=>item.getAttribute('label')==='Open in another cluster');return [...root.querySelectorAll('menuitem')].filter(item=>!item.hidden).map(item=>item.getAttribute('label'))");
        assert.ok(labels.some(label => label.startsWith(`${name}: `) && label.endsWith(route)), "Destination menu must present the equivalent URL");
        await driver.executeScript("const root=[...document.getElementById('contentAreaContextMenu').querySelectorAll('menu')].find(item=>item.getAttribute('label')==='Open in another cluster');const parent=arguments[1]==='current'?[...root.querySelectorAll('menu')].find(item=>item.getAttribute('label')==='Open in current tab'):root;const item=[...parent.querySelectorAll('menuitem')].find(item=>!item.hidden && item.getAttribute('label').startsWith(arguments[0]+': '));item.doCommand();document.getElementById('contentAreaContextMenu').hidePopup()", name, mode);
      } finally {
        await driver.setContext(firefox.Context.CONTENT);
      }
    }
    async function selectOpenAll() {
      await driver.actions().contextClick(await driver.findElement(By.css("body"))).perform();
      await driver.setContext(firefox.Context.CHROME);
      try {
        await wait(() => driver.executeScript("const root=[...document.getElementById('contentAreaContextMenu').querySelectorAll('menu')].find(item=>item.getAttribute('label')==='Open in another cluster');return !!root && [...root.querySelectorAll('menuitem')].some(item=>!item.hidden && item.getAttribute('label')==='Open all alternatives in new tabs')"), "Open-all context menu command was not visible");
        await driver.executeScript("const root=[...document.getElementById('contentAreaContextMenu').querySelectorAll('menu')].find(item=>item.getAttribute('label')==='Open in another cluster');const item=[...root.querySelectorAll('menuitem')].find(item=>!item.hidden && item.getAttribute('label')==='Open all alternatives in new tabs');item.doCommand();document.getElementById('contentAreaContextMenu').hidePopup()");
      } finally {
        await driver.setContext(firefox.Context.CONTENT);
      }
    }
    const beforeNavigation = await driver.getAllWindowHandles();
    await selectDestination("EMEA", "new");
    const navigationHandles = await wait(async () => {
      const handles = await driver.getAllWindowHandles();
      return handles.length === beforeNavigation.length + 1 ? handles : false;
    }, "Context menu did not open a new tab");
    const navigationHandle = navigationHandles.find(handle => !beforeNavigation.includes(handle));
    assert.equal(await driver.getCurrentUrl(), `${apacUrl}${route}`, "New-tab navigation must leave the source intact");
    await driver.switchTo().window(navigationHandle);
    await wait(async () => (await driver.getCurrentUrl()) === `${emeaUrl}${route}`, "Equivalent URL path/query/fragment were not preserved");
    await wait(async () => (await driver.getTitle()) === "EMEA - Index Management", "Destination tab did not identify its cluster");
    await selectDestination("APAC", "current");
    await wait(async () => (await driver.getCurrentUrl()) === `${apacUrl}${route}`, "Current-tab menu did not navigate to APAC");
    assert.equal((await driver.getAllWindowHandles()).length, navigationHandles.length);
    await selectOpenAll();
    const allHandles = await wait(async () => {
      const handles = await driver.getAllWindowHandles();
      return handles.length === navigationHandles.length + 1 ? handles : false;
    }, "Open-all command did not create a tab for the one alternative cluster");
    const allHandle = allHandles.find(handle => !navigationHandles.includes(handle));
    await driver.switchTo().window(allHandle);
    await wait(async () => (await driver.getCurrentUrl()) === `${emeaUrl}${route}`, "Open-all command opened the wrong alternative");
    await driver.close();
    await driver.switchTo().window(navigationHandle);
    await driver.close();
    await driver.switchTo().window(apacHandle);

    await driver.switchTo().window(emeaHandle);
    await wait(async () => (await driver.getTitle()) === "EMEA - Index Management", "EMEA tab was not decorated");
    await wait(async () => (await nativeState()).color === "rgb(216, 100, 66)", "Second window did not receive its own theme");
    await driver.setContext(firefox.Context.CHROME);
    await fs.writeFile("test-results/firefox-emea.png", await driver.takeScreenshot(), "base64");
    await driver.setContext(firefox.Context.CONTENT);
    await driver.navigate().refresh();
    await wait(async () => (await driver.getTitle()) === "EMEA - Index Management", "Registered scripts did not survive navigation");

    await driver.switchTo().window(optionsHandle);
    const themedWindows = await driver.executeScript("return browser.windows.getAll().then(async windows=>Promise.all(windows.map(async win=>({id:win.id,theme:await browser.theme.getCurrent(win.id)}))))");
    assert.ok(themedWindows.some(win => win.theme.colors.tab_selected === "#d86442"));
    const firstWindowTheme = await driver.executeScript("return browser.theme.getCurrent()");
    assert.deepEqual(firstWindowTheme, priorTheme, "Unmatched options tab must restore the original theme");
    if (process.env.DEMO === "1") {
      await driver.switchTo().window(apacHandle);
      await driver.switchTo().newWindow("tab");
      await driver.get(emeaUrl);
      await wait(async () => (await driver.getTitle()) === "EMEA - Index Management", "Demo EMEA tab was not decorated");
      await driver.switchTo().window(apacHandle);
      await wait(async () => (await nativeState()).color === "rgb(22, 105, 78)", "Demo APAC tab was not colored");
      console.log(`DEMO_READY\nAPAC: ${apacUrl}\nEMEA: ${emeaUrl}\nPreferences: ${optionsUrl}\nJSON downloads: ${downloadDirectory}\nIsolated Firefox demo is ready. Switch between the sample tabs and preferences; Change view exercises title/favicon updates. No real clusters are contacted. Press Ctrl+C to close the demo.`);
      await new Promise(resolve => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
      return;
    }
    await driver.findElement(By.css(".cluster .remove")).click();
    await driver.findElement(By.id("active-tab")).click();
    await driver.findElement(By.id("save")).click();
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", "Removal was not saved");
    const restoredWindows = await driver.executeScript("return browser.windows.getAll().then(async windows=>Promise.all(windows.map(win=>browser.theme.getCurrent(win.id))))");
    assert.ok(restoredWindows.every(theme => JSON.stringify(theme) === JSON.stringify(priorTheme)), "Both window themes must restore");
    await driver.switchTo().window(apacHandle);
    await wait(async () => (await driver.getTitle()) === "Dashboard - Elastic", "Removed cluster title was not restored");
    assert.equal(await driver.executeScript("return document.querySelector('link').getAttribute('href')"), "/updated.svg");
    assert.equal(await driver.executeScript("return document.querySelectorAll('link[rel=icon]').length"), 1);
    await driver.switchTo().window(emeaHandle);
    assert.equal(await driver.getTitle(), "EMEA - Index Management");

    await driver.switchTo().window(optionsHandle);
    await driver.findElement(By.css(".cluster .remove")).click();
    await driver.findElement(By.id("save")).click();
    await wait(async () => (await driver.findElement(By.id("status")).getText()) === "Preferences saved", "Empty preferences were not saved");
    const permissions = await driver.executeScript("return browser.permissions.getAll()");
    assert.equal(permissions.origins.length, 0, "Unused host permissions must be released");
    if (Object.keys(initialTheme).length) await driver.executeScript("return browser.theme.update(arguments[0])", initialTheme);
    else await driver.executeScript("return browser.theme.reset()");
    console.log("Firefox smoke checks passed: toolbar action opens preferences, palette/hex colors, native context-menu URL navigation in individual/bulk/current-tab modes, JSON transfer, section titles, original favicons, multi-window theme restoration, cleanup, and desktop/narrow layouts.");
  } finally {
    if (driver) await driver.quit();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });