(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("./core.js") : root.ClusterfudgeCore;
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort()
      .filter(name => value[name] !== null && value[name] !== undefined)
      .map(name => [name, normalize(value[name])]));
  };
  const equal = (first, second) => {
    return JSON.stringify(normalize(first)) === JSON.stringify(normalize(second));
  };

  class ThemeManager {
    constructor(api) {
      this.api = api;
      this.windows = new Map();
      this.expected = new Map();
    }

    async set(windowId, cluster) {
      let saved = this.windows.get(windowId);
      if (!cluster) {
        if (!saved) return;
        const current = await this.api.getCurrent(windowId);
        if (equal(current, saved.applied)) {
          this.expected.set(windowId, saved.original);
          if (Object.keys(saved.original).length) await this.api.update(windowId, saved.original);
          else await this.api.reset(windowId);
        }
        this.windows.delete(windowId);
        return;
      }
      const current = await this.api.getCurrent(windowId);
      if (!saved) saved = { original: current, applied: null };
      else if (!equal(current, saved.applied)) saved.original = current;
      const theme = {
        ...saved.original,
        colors: { ...saved.original.colors, tab_selected: cluster.color, tab_text: core.contrastText(cluster.color) }
      };
      saved.applied = theme;
      this.windows.set(windowId, saved);
      this.expected.set(windowId, theme);
      if (!equal(current, theme)) await this.api.update(windowId, theme);
    }

    changed(event) {
      if (this.expected.has(event.windowId) && equal(this.expected.get(event.windowId), event.theme)) {
        this.expected.delete(event.windowId);
        return false;
      }
      const targets = event.windowId === undefined ? [...this.windows.keys()] : [event.windowId];
      for (const windowId of targets) {
        const saved = this.windows.get(windowId);
        if (saved) saved.original = event.theme;
      }
      return true;
    }

    remove(windowId) {
      this.windows.delete(windowId);
      this.expected.delete(windowId);
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { ThemeManager };
  else root.ClusterfudgeTheme = { ThemeManager };
})(globalThis);