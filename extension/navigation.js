(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("./core.js") : root.ClusterfudgeCore;

  class ClusterMenu {
    constructor(api) {
      this.api = api;
      this.menus = api.menus || api.contextMenus;
      this.dynamic = Boolean(this.menus.onShown && this.menus.refresh);
      this.config = { clusters: [], activeTabColoring: false };
      this.items = new Map();
      this.displayed = new Map();
    }

    async setConfig(config) {
      this.config = config;
      this.items.clear();
      this.displayed.clear();
      await this.menus.removeAll();
      if (!this.dynamic && !config.clusters.length) return;
      const contexts = this.dynamic ? ["page", "tab"] : ["page"];
      const scope = this.dynamic ? {} : {
        documentUrlPatterns: [...new Set(config.clusters.map(cluster => core.parsePattern(cluster.pattern).matchPattern))]
      };
      this.menus.create({ id: "clusterfudge-open", title: "Open in another cluster", contexts, ...scope });
      for (const cluster of config.clusters) {
        const id = `clusterfudge-new:${cluster.id}`;
        this.menus.create({ id, parentId: "clusterfudge-open", title: cluster.name, visible: !this.dynamic, contexts });
        this.items.set(id, { target: cluster.id, mode: "new" });
      }
      this.menus.create({ id: "clusterfudge-separator", parentId: "clusterfudge-open", type: "separator", contexts });
      this.menus.create({ id: "clusterfudge-open-all", parentId: "clusterfudge-open", title: "Open all alternatives in new tabs", contexts });
      this.menus.create({ id: "clusterfudge-current", parentId: "clusterfudge-open", title: "Open in current tab", contexts });
      for (const cluster of config.clusters) {
        const id = `clusterfudge-current:${cluster.id}`;
        this.menus.create({ id, parentId: "clusterfudge-current", title: cluster.name, visible: !this.dynamic, contexts });
        this.items.set(id, { target: cluster.id, mode: "current" });
      }
    }

    show(info, tab) {
      const address = tab?.url || info.pageUrl || "";
      const alternatives = new Map(core.alternativeURLs(this.config, address).map(entry => [entry.id, entry]));
      this.displayed.clear();
      this.menus.update("clusterfudge-open", { visible: alternatives.size > 0 });
      this.menus.update("clusterfudge-open-all", { visible: alternatives.size > 0 });
      for (const [id, item] of this.items) {
        const destination = alternatives.get(item.target);
        this.menus.update(id, {
          visible: Boolean(destination),
          ...(destination ? { title: `${destination.name}: ${destination.url}`.replaceAll("&", "&&") } : {})
        });
        if (destination && tab) this.displayed.set(id, { ...item, url: destination.url, address, tabId: tab.id });
      }
      if (tab && alternatives.size) {
        this.displayed.set("clusterfudge-open-all", {
          mode: "all",
          alternatives: [...alternatives.values()],
          address,
          tabId: tab.id
        });
      }
      return this.menus.refresh();
    }

    async open(info, tab) {
      let selected = this.displayed.get(info.menuItemId);
      if (!this.dynamic && tab) {
        const address = info.pageUrl || tab.url || "";
        const alternatives = core.alternativeURLs(this.config, address);
        const item = this.items.get(info.menuItemId);
        const destination = item && alternatives.find(entry => entry.id === item.target);
        if (info.menuItemId === "clusterfudge-open-all") {
          selected = { mode: "all", alternatives, address, tabId: tab.id };
        } else if (destination) {
          selected = { ...item, url: destination.url, address, tabId: tab.id };
        }
      }
      if (!selected || !tab || selected.tabId !== tab.id) return;
      const current = await this.api.tabs.get(tab.id);
      if (current.url !== selected.address) return;
      if (selected.mode === "all") {
        const alternatives = core.alternativeURLs(this.config, current.url);
        if (alternatives.length !== selected.alternatives.length || alternatives.some((entry, index) =>
          entry.id !== selected.alternatives[index].id || entry.url !== selected.alternatives[index].url
        )) return;
        for (const [index, destination] of alternatives.entries()) {
          await this.api.tabs.create({
            url: destination.url,
            windowId: current.windowId,
            openerTabId: tab.id,
            index: current.index + index + 1
          });
        }
        return;
      }
      const destination = core.alternativeURLs(this.config, current.url).find(entry => entry.id === selected.target);
      if (!destination || destination.url !== selected.url) return;
      if (selected.mode === "current") return this.api.tabs.update(tab.id, { url: destination.url });
      return this.api.tabs.create({ url: destination.url, windowId: current.windowId, openerTabId: tab.id, index: current.index + 1 });
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { ClusterMenu };
  else root.ClusterfudgeNavigation = { ClusterMenu };
})(globalThis);