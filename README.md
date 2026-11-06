# byuwur/easy-json-viewer

![easy-json-viewer preview](prev.jpg)

**JSON, structure at a glance.**

Turn JavaScript values into a collapsible tree.

Use it for API responses, configuration, debugging panels, and large nested payloads.

One JavaScript file. One scoped stylesheet. No build step. Plain JavaScript, with no runtime dependencies.

[Open the playground](https://byuwur.github.io/easy-json-viewer/) · [CodePen](https://codepen.io/byuwur/pen/ExBeOPR)

Open `index.html` for the local playground; its page assets require internet access.

## Installation

**Recommended: CDN.** No downloads or package manager.

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@latest/json.min.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@latest/json.min.js" defer></script>
```

The CDN example uses `@latest` and requires internet access. Use a published tag or commit to pin a version.

**Local files:** For offline use, save `json.js` and `json.css` beside your HTML:

```html
<link href="json.css" rel="stylesheet" />
<script src="json.js" defer></script>
```

## Usage

```html
<pre id="byJSONrenderer" data-theme="light"></pre>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    const data = { name: "John Dough", projects: ["easy-json-viewer"], active: true };
    byJSONviewer(document.getElementById("byJSONrenderer"), data, { collapsed: true });
  });
</script>
```

Pass a JavaScript value: object, array, string, number, boolean, `null`, `bigint`, or a compatible big-number object. Parse JSON text with `JSON.parse()` first.

`byJSONviewer(element, value, options?)` replaces the target's contents and returns `undefined`. An invalid target throws `TypeError`. It has no `ready` promise or `destroy()` controller; rendering another value on the same target cancels its pending chunks.

Use acyclic, JSON-shaped data. Only own enumerable object properties are shown; functions, symbols, and `undefined` display as `null`. Non-finite numbers also display as `null`. Dates, Maps, Sets, and custom class instances have no special rendering support. Keep the supplied value stable while its chunks render; the viewer does not clone it.

Exported HTML starters use default settings, independently of playground changes.

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
| `appearAnimation`  | `false`     | Fade and gently move the viewer in when `animations` is enabled. Initial rendering remains immediate by default.                    |
| `toolbar`          | `true`      | Show the viewer header; secondary tools are configured separately.                                                                  |
| `displayContainer` | `true`      | Show the content panel frame and inner horizontal padding. `false` also hides status information.                                   |
| `statusBar`        | `true`      | Show the root type and number of items or properties. Requires `displayContainer: true`.                                            |
| `credits`          | `true`      | Show attribution in the header.                                                                                                     |
| `theme`            | Container   | Initial `"light"` or `"dark"` mode class.                                                                                           |
| `palette`          | Container   | Initial `data-theme` palette, including custom CSS names.                                                                           |
| `fontSize`         | Container   | Number in rem or a CSS size such as `"1.25em"` or `"20px"`; bounded to `0.5rem`–`3rem`.                                             |
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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@latest/json.themes.min.css" />
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

Theme tests cover both modes, container isolation, legacy links, custom CSS, and High Contrast.

Playground tests fetch the pinned Bootstrap stylesheet and Pickr assets. `BOOTSTRAP_CSS_PATH` can point to a cached Bootstrap copy; Pickr requires internet access.

Install Playwright outside the repository and set `NODE_PATH` to its `node_modules` directory:

```sh
node --check json.js
node --test tests/rendering.cjs   # Library
node --test tests/playground.cjs  # Playground
```

`CHROMIUM_EXECUTABLE_PATH` selects a Chromium executable for every test. Otherwise, install Playwright Chromium; `BROWSER_CHANNEL=chrome` applies only to the suites that support it.

[GitHub Actions](.github/workflows/rendering.yml) reports Library and Playground as independent jobs; a failed suite does not cancel the other. Library checks load the renderer directly; playground checks cover the landing page, configuration, and exports.

## The easy viewers

Need another format, maybe an editor? Explore the family:

[Markdown](https://github.com/byuwur/easy-md-viewer) · [JSON](https://github.com/byuwur/easy-json-viewer) · [CSV & TSV](https://github.com/byuwur/easy-csv-viewer) · [Logs](https://github.com/byuwur/easy-log-viewer) · [Diff](https://github.com/byuwur/easy-diff-viewer) · [XML](https://github.com/byuwur/easy-xml-viewer) · [YAML](https://github.com/byuwur/easy-yaml-viewer) · [Source code](https://github.com/byuwur/easy-code-viewer)

[Write Markdown with easy-md-editor](https://github.com/byuwur/easy-md-editor).

## License

MIT (c) Andres Trujillo [Mateus] byUwUr

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/byuwur/easy-json-viewer)
