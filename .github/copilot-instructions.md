# Clusterfudge Development Instructions

## Project Scope

- Treat [README.md](../README.md) as the source of product intent: a Firefox extension that makes Elastic Stack clusters distinguishable while browsing Kibana and related tools.
- Deliver the initial cluster-identification workflow before adding integrations or unrelated features.
- Firefox is the primary target. Chrome compatibility is aspirational; do not weaken Firefox behavior or claim compatibility without testing it.
- Keep the minimal plain-JavaScript WebExtension in `extension/`, Node tests in `tests/`, and actual development commands documented in README. Use the existing toolchain rather than introducing a framework or bundler without need.

## Required Behavior

- Provide extension preferences for one or more clusters, each with a name and URL pattern, plus an optional user-selected color.
- Derive a stable default color from the cluster name. The same name must produce the same color across tabs and browser restarts; a user override takes precedence.
- Match configured cluster patterns to visited URLs. For example, `*.apac-test-1.sand.wtg.zone` should identify `https://kibana.apac-test-1.sand.wtg.zone`.
- Keep the page's original favicon and site-driven favicon updates untouched. The user explicitly prefers the recognizable site icon over a cluster-colored replacement.
- Format matched page titles as `<cluster-name> - <section>`. Remove only a trailing ` - Elastic` label, preserving useful section text and the complete original title for restoration. Never duplicate an existing exact cluster prefix, including the legacy `<cluster-name>:` form.
- Keep identification correct when Kibana or another single-page application changes its title or navigates without a full page reload.
- Leave unmatched pages unchanged. Remove extension-owned title decoration when a page stops matching or its configuration changes, without removing page-owned text.
- Define and test a deterministic rule for overlapping cluster patterns; do not silently apply multiple cluster prefixes.
- Provide optional, opt-in active-tab background coloring with contrasting text using Firefox's theme API. Track the active cluster separately for each window, respect the user's existing theme, and restore it when coloring is disabled or no longer applies.
- Support local versioned JSON import/export of configuration. Validate imports before changing the editable form; preserve saved preferences and host permissions until the user reviews and saves. Export validated form values without including permission grants or adding network access.

## Browser Feasibility

- Verify the current Firefox APIs and minimum supported version before choosing a manifest version, script-registration API, or permission set.
- Choose supported content-script registration or injection APIs for page decoration; do not require user-provided scripts.
- The approved visual approach is original site favicons plus section-first cluster titles, with optional active-tab theme coloring. Independently colored native text or backgrounds for all tabs are not supported by standard WebExtensions; page CSS does not style browser chrome.
- Theme updates are window-scoped, not per-tab styling. Verify original favicon preservation and theme restoration in Firefox rather than assuming they work from DOM or unit tests alone.
- Do not add automatic tab grouping, containers, or a custom sidebar to the initial implementation. Do not change cookie isolation, login sessions, or tab arrangement for visual identification.
- Do not claim an unsupported browser feature works, and do not require privileged browser modifications without explicit approval.

## Implementation Boundaries

- Separate preference storage and validation, URL matching, deterministic color generation, script lifecycle, and page-title handling so the behavior can be tested independently.
- Use extension storage for preferences. Handle initial setup, edits, removals, and browser restarts without stale script registrations or duplicate observers.
- Translate user-facing host patterns into valid browser match patterns deliberately. Validate inputs and document scheme, wildcard, subdomain, and port semantics instead of treating user input as arbitrary regular expressions.
- Match parsed URL components to prevent lookalike hosts or URL paths from being mistaken for cluster domains.
- Request only necessary permissions and prefer configured host access over unrestricted access where supported. Explain any broad permission requirement.
- Treat names, patterns, colors, and page titles as untrusted input. Use safe DOM APIs, validate colors, and avoid executing user-provided code.
- Keep configuration local by default. Do not collect credentials, inspect Elasticsearch data, add telemetry, or send cluster URLs to external services unless explicitly requested.
- Avoid title-observer feedback loops and unnecessary DOM polling. Clean up observers and other resources when they are no longer needed.

## Verification and Delivery

- Add focused tests using the chosen toolchain for wildcard matching and false positives, invalid configuration, overlapping patterns, stable colors and overrides, and title-prefix idempotence.
- Cover dynamic title changes, navigation between matched and unmatched URLs, configuration changes, and multiple tabs without cross-tab state leakage.
- Test original favicon preservation, site-driven favicon changes, section-first title formatting/restoration, and opt-in theme behavior across tab switches and multiple windows, including restoration and contrast. Cover JSON round trips, invalid imports leaving the form intact, and review-before-save host access.
- Manually verify the extension in Firefox with at least two cluster configurations and an unmatched page, including preferences persistence and the actual supported color indicator.
- Document temporary installation, required Firefox version and permissions, development commands, and known browser limitations when implementation is added.
- Keep changes scoped to the requested feature. Report what was verified and clearly distinguish automated tests, manual checks, and unverified behavior.
- Do not upload, publish, submit to an add-on store, or release packages until the user has tried the local test version and explicitly approved the upload. Building local unsigned artifacts is allowed.