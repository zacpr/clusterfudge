(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("./core.js") : root.ClusterfudgeCore;
  const empty = () => ({ clusters: [], activeTabColoring: false });

  async function load(storage) {
    const stored = await storage.get("preferences");
    return stored.preferences === undefined ? empty() : core.validateConfig(stored.preferences);
  }

  async function save(storage, config) {
    const validated = core.validateConfig(config);
    await storage.set({ preferences: validated });
    return validated;
  }

  function exportJSON(config) {
    return `${JSON.stringify({ format: "clusterfudge", version: 1, preferences: core.validateConfig(config) }, null, 2)}\n`;
  }

  function importJSON(text) {
    if (typeof text !== "string" || text.length > 1024 * 1024) throw new Error("Configuration files must be JSON text no larger than 1 MB.");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The selected file does not contain valid JSON.");
    }
    if (!data || data.format !== "clusterfudge" || data.version !== 1) throw new Error("Unsupported Clusterfudge configuration format or version.");
    return core.validateConfig(data.preferences);
  }

  const api = { empty, load, save, exportJSON, importJSON };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ClusterfudgePreferences = api;
})(globalThis);