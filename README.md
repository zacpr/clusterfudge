# Clusterfudge

Know which cluster you're in. Keep your bearings across Elastic Stack clusters.

Clusterfudge is a Firefox-first extension for people working across multiple Elastic Stack clusters in Kibana and related browser-based tools. When every environment looks alike, it should still be easy to tell which cluster a tab belongs to.

Cluster matching is the foundation, not the whole product: the first milestone adds clear visual identification and cluster-aware navigation. Firefox remains the primary and verified browser. Separate Chromium Manifest V3 and Edge builds are now available, with runtime verification still blocked in this managed Flatpak environment.

## Configure Once, Recognize Every Tab

Define your clusters in the extension preferences. Each cluster starts with:

- A name, such as `apac-test-1`.
- A URL pattern, such as `*.apac-test-1.sand.wtg.zone`.
- A stable color generated from its name, with an optional user override.

That pattern identifies pages such as `https://kibana.apac-test-1.sand.wtg.zone`. Matching tabs receive:

- **The original site favicon**, retained without replacement so Kibana and other tools remain recognizable.
- **A cluster-and-section title**, such as `apac-test-1 - Index Management` from `Index Management - Elastic`. Only a trailing ` - Elastic` label is omitted; section names and other page-title text remain intact. An existing exact cluster prefix is not duplicated.

Identification follows title changes and navigation within single-page applications. Unmatched pages stay untouched; when a tab stops matching or its configuration changes, Clusterfudge restores the complete original page title, including the Elastic suffix. Favicons and site-driven favicon updates are always left untouched. Long tab labels may still be truncated by Firefox, but cluster and section come first.

## Optional Active-Tab Coloring

An opt-in Firefox theme integration gives the selected tab the active cluster's background color, with contrasting text. It's an extra cue for the environment you're currently using, without changing login sessions or rearranging tabs.

Each cluster has a palette of six color families (blue, green, teal, amber, red, purple), each with light, medium, and dark shades. Use one family per region and different shades for production/test in either direction. Swatches, the native color picker, and an exact hex field all set a custom override; **Automatic** returns to the stable name-derived color. The preview uses the selected background and contrasting text.

Firefox's theme API works at the window level. It can style the selected tab, but cannot give every inactive tab its own independent text or background color. Title prefixes identify every matching tab; original favicons identify the site. Clusterfudge snapshots the existing theme for each window and restores it on unmatched tabs or when coloring is disabled, while allowing subsequent user theme changes to take precedence. With coloring disabled, the cluster cue is the title, not a replacement favicon.

## Import and Export

**Export JSON** downloads `clusterfudge-config.json` containing the current valid form values, including unsaved edits. It preserves cluster IDs, list order, names, host patterns, automatic/custom colors, and active-tab coloring. Files stay local and may contain internal cluster hostnames; share them accordingly.

**Import JSON** validates a selected file and replaces the editable list for review. It does not modify saved preferences or request host access. Click **Save preferences** to apply the import and approve any newly required hosts. Invalid files leave the current form and saved preferences intact. Files are limited to 1 MB; unsupported format versions are rejected. Browser permission grants are not included in exports.

The readable, versioned format is:

```json
{
	"format": "clusterfudge",
	"version": 1,
	"preferences": {
		"clusters": [
			{ "id": "apac", "name": "apac-test-1", "pattern": "*.apac-test-1.sand.wtg.zone", "color": null }
		],
		"activeTabColoring": false
	}
}
```

`color: null` selects the stable automatic color. Import/export uses standard local file controls and adds no browser permissions.

## Try the Test Version

**Firefox add-on testing only. No add-on has been uploaded or submitted to AMO. Review and test the local build before submitting it manually through the AMO developer dashboard.**

The Firefox package declares **Firefox desktop 140+**, using Manifest V2. The minimum accommodates Firefox's current no-data-collection declaration. Actual Firefox checks have run on **Firefox 157.0.1 on Linux**, not every supported release. The separate Chromium package uses Manifest V3 and shares matching, decoration, preferences, and navigation with Chrome and Edge; active-tab coloring remains Firefox-only.

Chromium 154 and Edge Stable 154 Flatpak browsers are installed in this environment, but their managed extension settings prevent Selenium from loading even a minimal unpacked MV3 control extension. The packages build successfully, but Chromium/Edge runtime behavior is **not verified here**. Run the documented smoke tests in a browser profile where unpacked extensions are permitted before relying on those builds. Firefox for Android is not tested or claimed compatible.

For a ready-to-use demo, with Node.js 22+ and Firefox installed:

```sh
npm ci
npm run demo
```

This opens an isolated temporary Firefox profile with APAC and EMEA sample tabs, two windows, and saved sample preferences. The fixture server listens on loopback only. The sample pages are not real Kibana and contact no real clusters. Switch between the tabs and the unmatched preferences page, or click **Change view** on a sample page to exercise title and favicon updates. Stop the demo with Ctrl+C; the isolated profile is disposable. Selenium Manager may download geckodriver on the first run, so initial setup can require internet access. The automation indicator in Firefox's address bar comes from the test harness, not the extension.

To try it in your own Firefox session:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on** and select [extension/manifest.json](extension/manifest.json).
3. Open Clusterfudge's toolbar action. If Firefox has grouped it, open the **Extensions** toolbar button first, then select Clusterfudge. You can also open preferences from Clusterfudge's entry in `about:addons`.
4. Add your cluster names and host patterns, then save and approve the requested host access.
5. Open two cluster pages and an unmatched page. Active-tab coloring is off by default; enable it only when desired.

Temporary installation does not require store submission or privileged browser changes. Firefox removes temporary add-ons when it exits. This is not yet a signed, permanently installable release. Refresh matching pages after reloading, disabling, or removing the development extension: scripts cannot reliably undo previously written DOM decoration after their extension context has been destroyed.

## Patterns and Permissions

Patterns match parsed hostnames, not arbitrary regular expressions or text anywhere in a URL:

| Pattern | Meaning |
| --- | --- |
| `kibana.example.test` | That exact hostname, over HTTP or HTTPS |
| `*.example.test` | The root domain and any subdomain, over HTTP or HTTPS |
| `https://*.example.test` | The root domain and subdomains, HTTPS only |
| `http://localhost` | That exact local hostname, HTTP only |

Hostnames are case-insensitive. Patterns accept ASCII hostnames, including punycode, and an optional leading `*.`. Paths, query strings, fragments, explicit ports, and other wildcard placements are rejected. URLs on any port can match; paths do not affect cluster identity. Exact hostnames do not include subdomains. Lookalike hostnames, credentials, and domain names embedded in paths do not count as matches.

**The first matching cluster in the preferences list wins.** Use the arrow controls to reorder overlapping patterns. Names are limited to 80 characters, the list to 100 clusters, and explicit colors to six-digit hex values. Automatic colors are deterministic from the trimmed, case-sensitive cluster name. A user override takes precedence.

The Firefox package requires `storage` for local preferences, `theme` for the optional selected-tab cue, and `menus` for page/tab context-menu navigation. The Chromium package requires `storage`, `scripting`, and `contextMenus`; its service worker uses the MV3 scripting API. Both declare broad HTTP/HTTPS host patterns as optional capabilities, so access to arbitrary configured hosts is requested at save time, not granted to every site at installation. Saving requests configured host access; cluster removal releases unused grants. Pages without granted access cannot be decorated. Browser-protected pages and restricted sites remain inaccessible to ordinary extensions.

Clusterfudge stores configuration locally. It does not read Elasticsearch data, collect credentials, add telemetry, or send cluster names or URLs to a service.

## Development and Verification

The extension is plain JavaScript with no bundler. Only [extension/](extension/) is packaged; Node dependencies and test fixtures are not shipped.

```sh
npm ci
npm test
npm run lint
npm run test:firefox
npm run package:firefox-store
npm run lint:chromium
npm run test:chromium
npm run test:edge
npm start
npm run package
npm run package:chromium
```

- `npm test`: Node tests for matching, false positives, validation, precedence, stable colors, palette/hex controls, section-first titles, original favicon preservation, document isolation, storage, themes, preference interactions, JSON round trips, safe import failures, URL routing, individual and bulk menu actions, and stale-click protection.
- `npm run lint`: web-ext manifest/API validation, with warnings treated as errors.
- `npm run test:firefox`: package and temporarily install into an isolated Firefox profile, approve the actual host-access prompt, and verify existing/new documents, palette/hex colors, native context-menu navigation in individual, bulk, and current-tab modes, section-first titles, original/site-updated native favicons, preferences reload persistence, actual JSON download/import/review/save, native tab colors, multi-window themes, restoration, configuration removal, and host-permission cleanup. This uses test-only browser-chrome automation access; the extension itself uses standard WebExtension APIs.
- `npm run package:firefox-store`: lint the Firefox source and build the local store-submission ZIP in `web-ext-artifacts/mozilla-store/`. It is unsigned and is not uploaded or submitted to AMO.
- Submit the generated ZIP manually through the AMO developer dashboard after reviewing and testing it. `.github/amo-metadata.json` contains the initial listing summary, Tabs category, and All Rights Reserved license value for reference; AMO may still require review before publication.

The GitHub repository is public, but no open-source reuse license is granted. The initial AMO metadata therefore uses Mozilla's `all-rights-reserved` option. Choose a different license before the first store submission if you intend to permit reuse.
- `npm run lint:chromium`: build the separate MV3 source tree and validate required worker, icon, polyfill, and manifest files.
- `npm run test:chromium`: build the MV3 package and smoke test service-worker startup, host permissions, decoration, and options in Chromium. Set `CHROMIUM_BINARY` and `EXTENSION_PROFILE_ROOT` for non-default/Flatpak installs.
- `npm run test:edge`: run the same smoke suite in Microsoft Edge Stable; set `EDGE_BINARY` and `EXTENSION_PROFILE_ROOT` when the Flatpak launcher/data paths differ.
- `npm start`: web-ext's development Firefox with extension reloads.
- `npm run package`: generate the unsigned ZIP in `web-ext-artifacts/`; this does not upload it.
- `npm run package:chromium`: generate the local MV3 ZIP in `web-ext-artifacts/chromium-package/`; it does not upload it.

Real Firefox checks pass on Linux with two local cluster configurations and an unmatched preferences tab. Screenshots in `test-results/` show the native tab strip and desktop/narrow preferences layouts; those captures have also been visually reviewed. The options page was checked for overflow and missing assets at wide and narrow window widths. Browser restart persistence, Firefox 140 itself, real Kibana deployments, every site favicon policy, and every third-party theme have not yet been manually verified. Your own-cluster review remains the release gate.

Tooling audit note: a patched `shell-quote` override removes the critical advisory in web-ext's runner. `npm audit` still reports an unpatched high-severity `node-forge` advisory, also propagated through `@devicefarmer/adbkit` and `web-ext`. These are development dependencies, not extension payload. Do not use an automatic force fix that downgrades web-ext to an obsolete release; reassess when an upstream patch is available.

## Open in Another Cluster

Right-click a matching page or its tab and choose **Open in another cluster**. The submenu lists the generated destination URLs in preference order, excluding the source cluster. Selecting a destination opens a new tab in the same window; **Open all alternatives in new tabs** opens every listed destination, and the **Open in current tab** branch replaces the right-clicked tab instead. Unmatched pages and pages without usable alternatives have no Clusterfudge submenu.

For example, while viewing:

```text
https://kibana.apac-test-1.sand.wtg.zone/s/someurl
```

Choose `emea-test-1` to open:

```text
https://kibana.emea-test-1.sand.wtg.zone/s/someurl
```

For wildcard patterns, the complete service prefix is preserved: `kibana.emea-test-1.sand.wtg.zone` becomes `kibana.apac-prod-1.wtg.zone` when the target pattern is `*.apac-prod-1.wtg.zone`. The path, query string, fragment, and non-default port are retained. A target's explicit HTTP/HTTPS scheme takes precedence; otherwise the source scheme is retained.

An exact target uses its configured hostname. An exact source cannot infer a service prefix for a wildcard target, so that ambiguous destination is omitted. Duplicate destinations, credential-bearing URLs, and destinations that would identify as another cluster under first-match precedence are also omitted. Navigation is checked again when clicked to prevent stale menus from opening a different destination after a URL or configuration change. Different service layouts would require future explicit mapping rather than guessing.

An equivalent URL is not a guarantee of equivalent content: the destination cluster may require its own login, and a Kibana space, dashboard, or saved object may not exist there. Clusterfudge will navigate to the corresponding address, not copy resources or authentication between clusters.

Further cluster-aware functionality is expected to build on this same matching foundation. Beyond cross-cluster navigation, the roadmap remains open.

## Status and Scope

**Firefox test build:** the initial cluster-identification workflow is implemented and available for temporary local installation. It is not published, signed for distribution, or approved for release. See the [agent development instructions](.github/copilot-instructions.md) for implementation boundaries.

The test build includes cluster preferences, expanded color palettes, JSON import/export, URL matching, original favicons, section-first cluster titles, optional active-tab coloring, and context-menu cross-cluster navigation. A future Chrome implementation should share matching, colors, preferences, and decoration while using its own Manifest V3/service-worker lifecycle; Firefox-style dynamic selected-tab themes are not available in Chrome. No Chrome build is included yet.

Automatic tab grouping, container-based browsing, and a custom sidebar are outside the initial scope. Containers change cookie and login isolation and are not needed merely to identify clusters visually. Configuration is intended to stay local, with no telemetry or external cluster discovery required.
