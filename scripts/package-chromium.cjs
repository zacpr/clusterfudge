const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "extension");
const chromium = path.join(root, "chromium");
const output = path.join(root, "web-ext-artifacts", "chromium-source");
const omitted = new Set(["manifest.json", "background.js", "theme.js"]);

async function main() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  for (const name of await fs.readdir(source)) {
    if (!omitted.has(name)) await fs.cp(path.join(source, name), path.join(output, name), { recursive: true });
  }
  for (const name of ["manifest.json", "platform.js", "background-chromium.js"]) {
    await fs.copyFile(path.join(chromium, name), path.join(output, name));
  }
  if (process.env.CHROMIUM_TEST === "1") {
    const manifestPath = path.join(output, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.host_permissions = ["http://127.0.0.1/*", "http://localhost/*"];
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  await fs.copyFile(
    require.resolve("webextension-polyfill/dist/browser-polyfill.min.js"),
    path.join(output, "browser-polyfill.min.js")
  );
  const optionsPath = path.join(output, "options.html");
  const options = await fs.readFile(optionsPath, "utf8");
  await fs.writeFile(optionsPath, options.replace(
    '<script src="core.js" defer></script>',
    '<script src="browser-polyfill.min.js" defer></script>\n  <script src="core.js" defer></script>'
  ));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});