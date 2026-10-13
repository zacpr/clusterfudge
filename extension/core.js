(function (root) {
  "use strict";

  function parsePattern(input) {
    if (typeof input !== "string") throw new Error("Enter a host pattern.");
    const value = input.trim().toLowerCase();
    const parts = /^(?:(https?):\/\/)?(\*\.)?([a-z0-9.-]+)$/.exec(value);
    if (!parts) throw new Error("Use a hostname, optionally with *. or http(s)://; omit paths and ports.");
    const host = parts[3];
    if (host.length > 253 || host.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      throw new Error("Enter a valid ASCII hostname.");
    }
    const parsed = new URL(`https://${host}`);
    if (parsed.hostname !== host) throw new Error("Use the hostname's canonical form.");
    if (parts[2] && (!host.includes(".") || /^\d+(?:\.\d+){3}$/.test(host))) {
      throw new Error("Wildcards require a domain, not localhost or an IP address.");
    }
    return {
      host,
      scheme: parts[1] || null,
      wildcard: Boolean(parts[2]),
      value,
      matchPattern: `${parts[1] || "*"}://${parts[2] || ""}${host}/*`
    };
  }

  function matches(pattern, address) {
    try {
      const parsed = typeof pattern === "string" ? parsePattern(pattern) : pattern;
      const url = new URL(address);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      if (parsed.scheme && url.protocol !== `${parsed.scheme}:`) return false;
      return url.hostname === parsed.host || (parsed.wildcard && url.hostname.endsWith(`.${parsed.host}`));
    } catch {
      return false;
    }
  }

  function defaultColor(name) {
    let hash = 2166136261;
    for (const character of name) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
    const hue = hash % 360;
    const saturation = 0.65;
    const lightness = 0.43;
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    const channel = offset => {
      const position = (offset + hue / 30) % 12;
      const value = lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
      return Math.round(255 * value).toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  }

  function contrastText(color) {
    const channels = [1, 3, 5].map(offset => {
      const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
  }

  function validateConfig(input) {
    if (!input || !Array.isArray(input.clusters)) throw new Error("Preferences must contain a cluster list.");
    if (input.clusters.length > 100) throw new Error("Configure at most 100 clusters.");
    if (typeof input.activeTabColoring !== "boolean") throw new Error("Active-tab coloring must be on or off.");
    const ids = new Set();
    const clusters = input.clusters.map(cluster => {
      if (!cluster || typeof cluster.id !== "string" || !cluster.id || ids.has(cluster.id)) {
        throw new Error("Each cluster needs a unique ID.");
      }
      ids.add(cluster.id);
      if (typeof cluster.name !== "string" || !cluster.name.trim() || cluster.name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(cluster.name)) {
        throw new Error("Cluster names must contain 1 to 80 characters without control characters.");
      }
      const pattern = parsePattern(cluster.pattern).value;
      const color = cluster.color === undefined ? null : cluster.color;
      if (color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) {
        throw new Error("Colors must use six-digit hex notation, such as #2a8f65.");
      }
      return { id: cluster.id, name: cluster.name.trim(), pattern, color: color ? color.toLowerCase() : null };
    });
    return { clusters, activeTabColoring: input.activeTabColoring };
  }

  function findCluster(config, address) {
    const cluster = config.clusters.find(entry => matches(entry.pattern, address));
    return cluster ? { ...cluster, color: cluster.color || defaultColor(cluster.name) } : null;
  }

  function alternativeURLs(config, address) {
    const source = findCluster(config, address);
    if (!source) return [];
    const url = new URL(address);
    if (url.username || url.password) return [];
    const sourcePattern = parsePattern(source.pattern);
    const prefix = sourcePattern.wildcard ? url.hostname.slice(0, -sourcePattern.host.length) : null;
    const seen = new Set([url.href]);
    const alternatives = [];
    for (const cluster of config.clusters) {
      if (cluster.id === source.id) continue;
      const pattern = parsePattern(cluster.pattern);
      if (pattern.wildcard && prefix === null) continue;
      const destination = new URL(url.href);
      destination.hostname = pattern.wildcard ? `${prefix}${pattern.host}` : pattern.host;
      if (pattern.scheme) destination.protocol = `${pattern.scheme}:`;
      if (seen.has(destination.href) || findCluster(config, destination.href)?.id !== cluster.id) continue;
      seen.add(destination.href);
      alternatives.push({ id: cluster.id, name: cluster.name, url: destination.href });
    }
    return alternatives;
  }

  class TitleState {
    constructor() {
      this.original = null;
      this.rendered = null;
    }

    apply(current, name) {
      const base = current === this.rendered && this.original !== null ? this.original : current;
      this.original = null;
      this.rendered = null;
      if (!name || base.startsWith(`${name} - `) || base.startsWith(`${name}:`)) return base;
      this.original = base;
      this.rendered = `${name} - ${base.replace(/\s+-\s+Elastic$/, "")}`;
      return this.rendered;
    }
  }

  const api = { parsePattern, matches, defaultColor, contrastText, validateConfig, findCluster, alternativeURLs, TitleState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ClusterfudgeCore = api;
})(globalThis);