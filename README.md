# JSON.view

![JSON.view preview](prev.jpg)

**JSON, structure at a glance.**

Turn JavaScript values into a collapsible tree.

Use it for API responses, configuration, debugging panels, and large nested payloads.

One JavaScript file. One scoped stylesheet. No build step. Plain JavaScript, with no runtime dependencies.

<!-- [Open the playground](https://byuwur.github.io/json.view/) · [CodePen](https://codepen.io/byuwur/pen/ExBeOPR) -->

[Open the playground](https://json.byuwur.co/) · [CodePen](https://codepen.io/byuwur/pen/ExBeOPR)

Open `index.html` for the local playground; its page assets require internet access.

## Installation

**Recommended: CDN.** No downloads or package manager.

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/json.view@latest/json.min.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/json.view@latest/json.min.js" defer></script>
```

The CDN example uses `@latest` and requires internet access. Use a published tag or commit to pin a version.

**Local files:** For offline use, save `json.js` and `json.css` beside your HTML:

```html
<link href="json.css" rel="stylesheet" />
<script src="json.js" defer></script>
```

## Offline use and Content Security Policy

The renderer loads no remote scripts, fonts, or styles. Local library files work without a CDN, including in a `file://` host. Host optional `json.themes.css` locally for extra palettes. The online playground and exported CDN starter still require internet access; a local starter requires all referenced files beside it. Playground fetches and clipboard permissions remain subject to browser restrictions.

For CSP, allow library origins in `script-src` and `style-src`. Move example inline initialization into an allowed external script, or authorize it with a nonce/hash; no `unsafe-eval` is needed. Appearance controls write individual style properties; host-authored inline style attributes and custom theme `<style>` blocks need their own policy authorization. A script nonce does not authorize those styles. Control templates use `innerHTML` for static markup and do not currently support enforced Trusted Types (`require-trusted-types-for 'script'`). The playground uses additional CDN assets, inline scripts/styles, and generated previews, so its policy requirements exceed those of the standalone library.

## Usage

```html
<pre id="byJSONrenderer" data-theme="light"></pre>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    const data = { name: "John Dough", projects: ["JSON.view"], active: true };
    byJSONviewer(document.getElementById("byJSONrenderer"), data, { collapsed: true });
  });
</script>
```

Pass a JavaScript value: object, array, string, number, boolean, `null`, `bigint`, or a compatible big-number object. Parse JSON text with `JSON.parse()` first.

`byJSONviewer(element, value, options?)` replaces the target's contents and returns `undefined`. An invalid target throws `TypeError`. It has no `ready` promise or `destroy()` controller; rendering another value on the same target cancels its pending chunks.

Use acyclic, JSON-shaped data. Only own enumerable object properties are shown; functions, symbols, and `undefined` display as `null`. Non-finite numbers also display as `null`. Dates, Maps, Sets, and custom class instances have no special rendering support. Keep the supplied value stable while its chunks render; the viewer does not clone it.

Exported HTML starters use default settings, independently of playground changes.

Non-empty collections use named native buttons with `aria-expanded`. Tab moves between visible controls; Enter and Space toggle a collection. The collapsed item count also expands it and returns focus to the disclosure button. `collapsible: false` keeps collections expanded without disclosure controls.

## Options

Pass options as the third argument:

| Option             | Default     | Meaning                                                                                                                             |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `collapsible`      | `true`      | Show disclosure controls; false keeps every node expanded.                                                                          |
| `collapsed`        | `false`     | Collapse nodes initially.                                                                                                           |
| `rootCollapsible`  | `true`      | Allow the root object/array to collapse.                                                                                            |
| `withQuotes`       | `true`      | Quote object keys.                                                                                                                  |
| `withLinks`        | `true`      | Link `http`, `https`, `ftp`, and `ftps` URLs.                                                                                       |
| `bigNumbers`       | `false`     | Use compatible big-number objects' string representation.                                                                           |
| `forceMonospace`   | `false`     | Force a system monospace font when the target is not a `<pre>`.                                                                     |
| `chunkSize`        | `1000`      | Elements per chunk; invalid/nonpositive values use the default.                                                                     |
| `chunkLatency`     | `25`        | Milliseconds between chunks; invalid/negative values use the default.                                                               |
| `animations`       | `true`      | Brief control/disclosure motion and background fades; overrides the system motion preference.                                       |
| `appearAnimation`  | `false`     | Fade the viewer in on each render when `animations` is enabled. Initial rendering remains immediate by default.                     |
| `toolbar`          | `true`      | Show the viewer header; secondary tools are configured separately.                                                                  |
| `displayContainer` | `true`      | Show the content panel frame and inner horizontal padding. `false` also hides status information.                                   |
| `statusBar`        | `true`      | Show the root type and number of items or properties. Requires `displayContainer: true`.                                            |
| `credits`          | `true`      | Show attribution in the header.                                                                                                     |
| `theme`            | Container   | Initial `"light"` or `"dark"` mode class.                                                                                           |
| `palette`          | Container   | Initial `data-theme` palette, including custom CSS names.                                                                           |
| `fontSize`         | Container   | Number in rem or a CSS size such as `"1.25em"` or `"20px"`; bounded to `0.5rem`-`3rem`.                                             |
| `themeToggle`      | `true`      | Show the theme toggle.                                                                                                              |
| `fontSizeControls` | `true`      | Show text-size controls.                                                                                                            |
| `copyButton`       | `true`      | Show a button to copy the complete JSON, including collapsed/pending nodes.                                                         |
| `controlsSize`     | `"regular"` | `"xs"` (0.5rem), `"small"` (0.7rem), `"regular"` (0.875rem), `"large"` (1rem), or `"xl"` (1.25rem); invalid values use `"regular"`. |
| `controlsCompact`  | `true`      | Keep credits beside controls; `false` stacks them. Wraps as needed.                                                                 |
| `controlsPosition` | `"top"`     | Sticky `"top"` or `"bottom"` toolbar; invalid values use `"top"`.                                                                   |

Smaller chunks improve responsiveness; lower latency starts the next chunk sooner. Re-rendering a target cancels its pending chunks.

Chunking spreads DOM creation across timers; it does not virtualize or limit the input. Collapsed descendants still render. Bound payload size and depth in the calling application.

Copy serializes the supplied value as two-space-indented JSON, independently of which chunks are visible. Unsupported values follow `JSON.stringify()` semantics and can differ from the displayed `null` fallback. BigInt and compatible big-number values become decimal strings to preserve precision. Copy requires clipboard permission in a secure context.

Read the library version with `byJSONviewer.VERSION`.

Controls stick to the selected edge of the page or nearest scrolling container.

The playground disables header-only settings while Viewer header is off, preserving their values. Appearing animation is disabled while Animations is off.

Use `toolbar: false` to hide the header, or disable `credits`, `themeToggle`, `fontSizeControls`, and `copyButton` individually.

Controls use monospace by default; override `--by-view-controls-font` to change it.

## Themes

Configure appearance in the options object or on the container:

```javascript
byJSONviewer(target, value, {
  theme: "dark",
  palette: "github",
  fontSize: 1.125
});
```

`theme` sets the mode class; `palette` sets `data-theme`. `fontSize` numbers use rem (`1` = the root text size); CSS sizes such as `"1.25em"`, `"1.25rem"`, and `"20px"` are also accepted. All sizes stay between `0.5rem` and `3rem`. Explicit options override markup; omitted or `null` values retain the container's settings. A named palette preserves its existing mode, including the `data-theme="light"` / `"dark"` aliases. Invalid appearance values throw `RangeError` before replacing the current document. Text-size Reset returns to the configured size, including after re-rendering.

Initial content appears immediately unless `appearAnimation: true` is requested with animations enabled. Theme backgrounds fade briefly on shared surfaces; font size, rows, and syntax tokens change immediately. High Contrast and forced-color backgrounds switch immediately. Animations also affect controls and deliberate show/hide actions. Disclosure size/exit transitions progressively enhance browsers that support them.

The outer document and inner surfaces have independent CSS backgrounds. Both follow the selected theme unless overridden. Set `--by-view-document-bg: #0000` to reveal the host page while keeping content panels and individual controls readable. `--by-view-container-bg` sets the shared background of those panels and controls; it also accepts alpha colors or `transparent`. The toolbar and credits have no background. These overrides survive theme changes.

```css
.byJSONdocument {
  --by-view-document-bg: #0000;
}
```

The playground uses SPA.js's Pickr assets for color and opacity, with text inputs when Pickr is unavailable. **Copy CSS** exports the appearance overrides; clear a field to restore its theme default. The renderer needs no color-picker dependency.

**48 palettes, each with Light and Dark modes.** Monokai, GitHub, Solarized, and High Contrast are included in `json.css`. Load the optional `json.themes.css` after it for the other 44 skins:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/byuwur/json.view@latest/json.themes.min.css" />
```

For local use, save `json.themes.css` beside `json.css`. The playground loads both stylesheets; default HTML starters use the core stylesheet. Known extra presets without the pack fall back to the current mode and emit a one-time `console.warn` naming the required file. Custom CSS names do not need the pack.

The picker groups palettes into Essentials, Editor classics, App inspired, Colorful, and Reading & nature. Palette definitions remain at the end of each stylesheet.

| Palette              | `data-theme`           | What it looks like                             |
| -------------------- | ---------------------- | ---------------------------------------------- |
| Monokai (default)    | `monokai`              | Warm light and dark colors; the default.       |
| GitHub               | `github`               | Neutral GitHub surfaces and syntax.            |
| Solarized            | `solarized`            | Warm paper and deep blue-green surfaces.       |
| High Contrast        | `high-contrast`        | Strong text, borders, and focus indicators.    |
| Dracula              | `dracula`              | Purple with vivid pink, green, and cyan.       |
| Darcula              | `darcula`              | Charcoal surfaces and warm IDE accents.        |
| Nord                 | `nord`                 | Arctic blues and snowy neutral surfaces.       |
| Catppuccin           | `catppuccin`           | Latte and Mocha with soft mauve accents.       |
| Catppuccin Frappé    | `catppuccin-frappe`    | Cooler Catppuccin with a blue accent.          |
| Catppuccin Macchiato | `catppuccin-macchiato` | Catppuccin with a warm pink accent.            |
| Rosé Pine            | `rose-pine`            | Dawn and Pine with dusty rose accents.         |
| Rosé Pine Moon       | `rose-pine-moon`       | A duskier violet take on Rosé Pine.            |
| Gruvbox              | `gruvbox`              | Warm retro browns, olive, and orange.          |
| Gruvbox Material     | `gruvbox-material`     | Softer earthy surfaces and muted greens.       |
| Tokyo Night          | `tokyo-night`          | Tokyo Day and Night with electric blues.       |
| Tokyo Storm          | `tokyo-storm`          | A brighter blue-gray Tokyo evening.            |
| Tokyo Moon           | `tokyo-moon`           | Indigo nights and luminous lavender.           |
| One                  | `one`                  | Clean One Light and One Dark colors.           |
| Material             | `material`             | Blue-gray material surfaces and cyan.          |
| Material Ocean       | `material-ocean`       | Deep navy with soft fluorescent accents.       |
| Night Owl            | `night-owl`            | Little Light and deep-blue night colors.       |
| Synthwave            | `synthwave`            | Neon magenta and cyan with no glow effects.    |
| Ayu                  | `ayu`                  | Warm amber over light paper or dark navy.      |
| Everforest           | `everforest`           | Soft forest greens and cream.                  |
| Kanagawa             | `kanagawa`             | Ink, old paper, and Japanese wave colors.      |
| Selenized            | `selenized`            | Balanced teal surfaces and restrained color.   |
| VS Code              | `vscode`               | Familiar neutral editor surfaces and blue.     |
| Monokai Dimmed       | `monokai-dimmed`       | Quieter charcoal and desaturated Monokai.      |
| Discord              | `discord`              | Blurple accents and familiar chat surfaces.    |
| Slack                | `slack`                | Aubergine, warm pink, and friendly teal.       |
| BONYUR               | `bonyur`               | Signature teal and pink over warm neutral ink. |
| Sakura               | `sakura`               | Cherry-blossom pink from surface to syntax.    |
| Bubblegum            | `bubblegum`            | Saturated hot-pink surfaces and cyan accents.  |
| Candy                | `candy`                | Pink and mint with playful lavender syntax.    |
| Rose Gold            | `rose-gold`            | Dusty pink and warm copper.                    |
| Lavender             | `lavender`             | Lilac surfaces with deep violet accents.       |
| Cyberpunk            | `cyberpunk`            | Acid yellow, electric cyan, and magenta.       |
| Sunset               | `sunset`               | Burnt orange, coral, and evening purple.       |
| Volcano              | `volcano`              | Lava reds over warm ash.                       |
| Amber                | `amber`                | Golden amber inspired by old displays.         |
| Terminal             | `terminal`             | Phosphor greens on near-black.                 |
| Paper                | `paper`                | Warm cream, brown ink, and quiet margins.      |
| Ink                  | `ink`                  | Grayscale surfaces and restrained syntax.      |
| Ocean                | `ocean`                | Deep ocean blue and clear turquoise.           |
| Forest               | `forest`               | Rich green surfaces and mossy accents.         |
| Mint                 | `mint`                 | Fresh mint surfaces and cool teal.             |
| Ice                  | `ice`                  | Glacial blue, crisp whites, and silver.        |
| Sepia                | `sepia`                | Aged parchment and warm brown ink.             |

Editor and app skins are inspired adaptations, including light counterparts where needed; colors are adjusted for readable text and controls rather than exact replicas. All palettes use the same layout and need no assets beyond the core stylesheet and optional theme pack.

Use a mode class and a palette name together:

```html
<div id="viewer" class="dark" data-theme="github"></div>
<!-- High Contrast Light: class="light" data-theme="high-contrast" -->
<!-- High Contrast Dark: class="dark" data-theme="high-contrast" -->
```

Rendering adds `.byJSONdocument`; its variables affect only that container and its children. The theme switch changes mode while keeping the palette; re-rendering preserves both. A named palette without a mode class starts in Light; if both mode classes are present, Dark wins.

`data-theme="light"` and `data-theme="dark"` select Monokai and override mode classes. A mode class alone, or no explicit theme, also uses Monokai.

### High Contrast

High Contrast text colors target at least [7:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), with [3:1 contrast for control boundaries and focus cues](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check contrast again when you override colors.

### Make it yours

The playground's **Custom theme CSS** field edits both modes of the selected palette. Export those rules to your own stylesheet and use `data-theme="custom"` with `class="light"` or `class="dark"`. Custom drafts stay in the playground; the renderer does not store them.

Define a named palette after the viewer stylesheet. Unspecified colors inherit Monokai:

```css
.byJSONdocument.light[data-theme="my-ocean"] {
  --by-view-bg: #f3f8fc;
  --by-json-text: #102a43;
  --by-json-border: #486581;
  --by-json-string: #005a9c;
}

.byJSONdocument.dark[data-theme="my-ocean"] {
  --by-view-bg: #102a43;
  --by-json-text: #f0f6fc;
  --by-json-border: #9fb3c8;
  --by-json-string: #8cd3ff;
}
```

```html
<div id="viewer" class="dark" data-theme="my-ocean"></div>
```

Named palettes need no JavaScript registration or extra theme files.

In the playground configuration, `theme` is the mode, `palette` is its name, and `customThemeCSS` holds custom rules. Null appearance values inherit defaults. Pass only documented API options to the renderer.

**Copy CSS** exports typography and individual color overrides. Inline colors override palette variables; clear them or Reset to restore palette defaults.

Text-size controls change only this viewer, in `0.125rem` steps from `0.5rem` to `3rem`, independently of button size. **A** restores its initial size; re-rendering preserves the selected size.

### Legacy theme links

Legacy integrations can use `#byVIEWtheme` or a detected `json.light.css` / `json.dark.css` link. The toggle keeps its path, query, and hash and updates viewers sharing the link. Explicit container themes stay independent. Separate theme files are no longer shipped; retain your hosted legacy files to use this alternative.

## Checks

Routine CI runs the small library suite in each supported browser: parsing/rendering, safe input, and replacement/cleanup. It exercises the standalone library without playground imports or live CDN requests. New options and styling do not need individual CI tests unless they protect a core contract or a real regression.

Install Playwright outside the repository and set `NODE_PATH` to its `node_modules` directory:

```sh
node --check json.js
node --test __tests__/rendering.cjs
```

`BROWSER_CHANNEL=chrome` uses installed Chrome; `CHROMIUM_EXECUTABLE_PATH` selects a Chromium executable.

The library suite is the main automated contract: parsing/rendering, untrusted input, and replacement/cleanup. `node --test __tests__/playground.cjs` runs one smaller smoke check for page startup, preview editing, and a copied starter. It uses the real local SPA.js and CODE companions instead of live CDN requests; check out `spa.js` at `v20.13` and `code.view` at `v1.8` beside this repository. The [Actions workflow](.github/workflows/rendering.yml) runs separate jobs in this exact order: library Chromium, Firefox, WebKit; then playground Chromium, Firefox, WebKit. Later jobs still report their result if an earlier job fails; cancellation stops the chain. One reusable browser job keeps setup identical. Each suite has a 30-second execution limit, the test step is capped at two minutes, and each job at three minutes. Browsers are preinstalled in the matching CI image. `BROWSER_ENGINE=firefox` / `webkit` selects a local engine; `BROWSER_CHANNEL=chrome` applies only to Chromium.

## Viewer/Editor family

Need another format, maybe an editor? Explore the family:

<!-- <a href="https://byuwur.github.io/md.view/"><img src="https://raw.githubusercontent.com/byuwur/md.view/main/assets/favicon.png" height="24" align="top" alt="" /> MD.view</a> · <a href="https://byuwur.github.io/md.edit/"><img src="https://raw.githubusercontent.com/byuwur/md.edit/main/assets/favicon.png" height="24" align="top" alt="" /> MD.edit</a> · <a href="https://byuwur.github.io/code.view/"><img src="https://raw.githubusercontent.com/byuwur/code.view/main/assets/favicon.png" height="24" align="top" alt="" /> CODE.view</a> · <a href="https://byuwur.github.io/json.view/"><img src="https://raw.githubusercontent.com/byuwur/json.view/main/assets/favicon.png" height="24" align="top" alt="" /> JSON.view</a> · <a href="https://byuwur.github.io/csv.view/"><img src="https://raw.githubusercontent.com/byuwur/csv.view/main/assets/favicon.png" height="24" align="top" alt="" /> CSV.view</a> · <a href="https://byuwur.github.io/diff.view/"><img src="https://raw.githubusercontent.com/byuwur/diff.view/main/assets/favicon.png" height="24" align="top" alt="" /> DIFF.view</a> · <a href="https://byuwur.github.io/log.view/"><img src="https://raw.githubusercontent.com/byuwur/log.view/main/assets/favicon.png" height="24" align="top" alt="" /> LOG.view</a> · <a href="https://byuwur.github.io/xml.view/"><img src="https://raw.githubusercontent.com/byuwur/xml.view/main/assets/favicon.png" height="24" align="top" alt="" /> XML.view</a> · <a href="https://byuwur.github.io/yaml.view/"><img src="https://raw.githubusercontent.com/byuwur/yaml.view/main/assets/favicon.png" height="24" align="top" alt="" /> YAML.view</a> -->

<a href="https://md.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/md.view/main/assets/favicon.png" height="24" align="top" alt="" /> MD.view</a> · <a href="https://mdedit.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/md.edit/main/assets/favicon.png" height="24" align="top" alt="" /> MD.edit</a> · <a href="https://code.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/code.view/main/assets/favicon.png" height="24" align="top" alt="" /> CODE.view</a> · <a href="https://json.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/json.view/main/assets/favicon.png" height="24" align="top" alt="" /> JSON.view</a> · <a href="https://csv.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/csv.view/main/assets/favicon.png" height="24" align="top" alt="" /> CSV.view</a> · <a href="https://diff.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/diff.view/main/assets/favicon.png" height="24" align="top" alt="" /> DIFF.view</a> · <a href="https://log.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/log.view/main/assets/favicon.png" height="24" align="top" alt="" /> LOG.view</a> · <a href="https://xml.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/xml.view/main/assets/favicon.png" height="24" align="top" alt="" /> XML.view</a> · <a href="https://yaml.byuwur.co/"><img src="https://raw.githubusercontent.com/byuwur/yaml.view/main/assets/favicon.png" height="24" align="top" alt="" /> YAML.view</a>

## License

MIT (c) Andres Trujillo [Mateus] byUwUr

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/byuwur/json.view)

## Releases

[Release workflow](.github/workflows/release.yml) builds a reviewable preview on pushes to `main`, pull requests, and manual runs. Only a pushed version tag publishes a GitHub release. Source/browser checks and the complete distribution build must succeed on both main and tag runs before publication. Failed builds remove their own temporary stage and retain the last completed output. Two-part tags such as `v1.8` and three-part tags such as `v1.8.1` are supported. Keep release tags consistent with the project's source version.

**Regular ZIP:** original library JavaScript/CSS and optional theme CSS. **Minified ZIP:** the same runtime as `.min.js`/`.min.css`. Both include README and license.

Load local library files in your own HTML. The playground is hosted separately; no Node runtime is needed to use either ZIP.

Minification prefers jsDelivr-generated files pinned to the exact source commit when the working file matches that commit. Unavailable CDN files and local edits use pinned esbuild instead. `--offline` selects local minification explicitly. `manifest.json` records the provider and hashes. Vendored assets are copied unchanged.

### Local preview

Requires Node.js 22 or newer; packaging/test dependencies are private to `.github`. Run from the repository root. In PowerShell, use `npm.cmd` if execution policy blocks `npm`.

```sh
npm --prefix .github ci --ignore-scripts --no-audit --no-fund
node .github/scripts/build.mjs --tag v0.0.0-local
node .github/node_modules/playwright/cli.js install chromium
npm --prefix .github run release:test
```

Open `dist/RELEASE_NOTES.md` for the generated notes and `dist/assets/` for the complete tested output. Download `tested-release` from the workflow run to review CI results. Local commands and manual runs do not publish.

### Script responsibilities

- [release.json](.github/release.json) owns the repository identity, package inventory, and download explanations.
- [build.mjs](.github/scripts/build.mjs) builds runtime ZIPs in a temporary output directory, then writes notes, provenance, and checksums.
- [release.mjs](.github/scripts/release.mjs) reads the real Git history. `--check` validates the exact pushed tag on `main`; `--publish` verifies the tested output and creates or resumes its matching draft before publishing.
- [release tests](.github/tests/release.mjs) verify checksums, ZIP inventories, and the distributed runtime by running the existing checks against both extracted ZIPs. [Publication tests](.github/tests/publish-release.mjs) use a mock GitHub API to verify interrupted uploads, draft ownership, corruption rejection, and reruns.

The workflow uses read-only access while building/testing, passes the exact tested output to a separate publication job, and grants write access only there. Published releases are never overwritten. A failed upload leaves a draft that the same tested build can resume. Tag pushes and live release publication are separate from local validation.
