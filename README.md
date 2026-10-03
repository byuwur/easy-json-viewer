# byuwur/easy-json-viewer

Render JSON in an HTML page. Collapse nodes, read large objects in chunks, and switch between light and dark themes. No dependencies or build step.

Try it on [byuwur.github.io/easy-json-viewer](https://byuwur.github.io/easy-json-viewer/) or [codepen.io/byuwur/pen/ExBeOPR](https://codepen.io/byuwur/pen/ExBeOPR).

## Features

- Collapsible objects and arrays with syntax highlighting.
- Chunked rendering for large documents.
- Light/dark theme toggle and A-/A+ text size controls.
- Clickable URLs and optional big-number support.
- Plain JavaScript, with no dependencies or build step.

## Installation

Use the CDN:

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.7.final/json.min.css" rel="stylesheet" />
<link id="byVIEWtheme" href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.7.final/json.light.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.7.final/json.min.js" defer></script>
```

Or use the local files:

```html
<link href="json.css" rel="stylesheet" />
<link id="byVIEWtheme" href="json.light.css" rel="stylesheet" />
<script src="json.js" defer></script>
```

For development, omit `@v2.7.final` from the CDN URLs to load the latest changes.

## Usage

Save this as an HTML file beside `json.js`, `json.css`, and `json.light.css`, then open it in a browser. It shows nested objects, an array, a clickable URL, and different value types:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>JSON viewer example</title>
    <link href="json.css" rel="stylesheet" />
    <link id="byVIEWtheme" href="json.light.css" rel="stylesheet" />
  </head>
  <body>
    <pre id="byJSONrenderer"></pre>

    <script src="json.js"></script>
    <script>
      const data = {
        name: "John Dough",
        age: 69,
        isBased: true,
        website: "https://github.com/byuwur",
        address: {
          address1: "123 Main St",
          city: "Anywhere, SA. PÄ"
        },
        projects: ["easy-json-viewer", "easy-md-viewer", "easy-http-error"],
        lastLogin: null
      };

      const target = document.getElementById("byJSONrenderer");
      byJSONviewer(target, data);
    </script>
  </body>
</html>
```

The target and library are loaded before the viewer call. Use the CDN URLs from Installation instead of the local paths if preferred. If you load the script with `defer` in the head, run the viewer call after `DOMContentLoaded` or from a later deferred script.

Pass a JavaScript value, not raw JSON text. For a JSON string, parse it first:

```javascript
const jsonText = '{"name":"John Dough","projects":["easy-json-viewer"]}';
byJSONviewer(document.getElementById("byJSONrenderer"), JSON.parse(jsonText));
```

Input can be an object, array, string, number, boolean, or `null`. JavaScript `bigint` values and compatible big-number objects are supported too.

## Options

Pass options as the third argument:

```javascript
byJSONviewer(document.getElementById("byJSONrenderer"), data, {
  collapsed: true,
  chunkSize: 100,
  chunkLatency: 16
});
```

| Option             | Default | Meaning                                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| `collapsed`        | `false` | Collapse nodes initially.                                                |
| `rootCollapsible`  | `true`  | Allow the root object or array to collapse.                              |
| `withQuotes`       | `true`  | Show object keys with double quotes.                                     |
| `withLinks`        | `true`  | Make `http`, `https`, `ftp`, and `ftps` URLs clickable.                  |
| `bigNumbers`       | `false` | Use compatible big-number objects' own string representation.            |
| `chunkSize`        | `1000`  | Elements per chunk; invalid, zero, or negative values use the default.   |
| `chunkLatency`     | `25`    | Milliseconds between chunks; invalid or negative values use the default. |
| `themeToggle`      | `true`  | Add a theme toggle at the target's top-right.                            |
| `fontSizeControls` | `true`  | Add A-/A+ buttons to resize this viewer's text.                          |

Smaller chunks give the browser more chances to respond. Lower latency renders subsequent chunks sooner. Chunks stay in order; rendering the same target again cancels its pending chunks.

## Themes

A- and A+ change the viewer's font size by `0.125rem`, between `0.5rem` and `3rem`. They work without a theme stylesheet, preserve the size when the target is rendered again, and do not change the rest of the page. Set `fontSizeControls: false` to hide them.

Switch the theme stylesheet:

```javascript
document.querySelector("#byVIEWtheme").href = "json.dark.css";
// Use json.light.css for the light theme.
```

## Checks

GitHub Actions runs `tests/rendering.cjs` on pushes and pull requests. It tests local `json.js` in Chromium: values, escaping, links, collapse controls, chunk ordering and cancellation, and the `test.json` benchmark.

## License

MIT (c) Andres Trujillo [Mateus] byUwUr
