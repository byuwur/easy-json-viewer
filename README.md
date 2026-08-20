# byuwur/easy-json-viewer

**easy JSON Viewer** is a lightweight and easy-to-use JavaScript library for rendering JSON-compatible data in an HTML document. It provides chunk rendering, collapsible nodes, syntax highlighting, customizable themes, and optional clickable links to make JSON data more readable and interactive.

Test it out at: [codepen.io/byuwur/pen/ExBeOPR](https://codepen.io/byuwur/pen/ExBeOPR)

## Features

- **Chunk Rendering**: Divides large arrays and objects into configurable chunks so the browser can render them progressively.
- **Collapsible Nodes**: Collapse or expand JSON objects and arrays to focus on specific parts of the data.
- **Syntax Highlighting**: Distinct colors for strings, literals, and other data types for easy reading.
- **Customizable Themes**: Switch between light and dark themes with a single stylesheet change.
- **Link Handling**: Automatically converts supported URL strings (`http`, `https`, `ftp`, and `ftps`) to clickable links.
- **Dependency-Free**: Uses plain JavaScript and DOM APIs.

## Getting Started

### Installation

Use the CDN:

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.4.final/json.min.css" rel="stylesheet" />
<link id="byVIEWtheme" href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.4.final/json.light.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@v2.4.final/json.min.js" defer></script>
```

Or use the local files:

```html
<link href="json.css" rel="stylesheet" />
<link id="byVIEWtheme" href="json.light.css" rel="stylesheet" />
<script src="json.js" defer></script>
```

For testing or development, the version can be omitted to get the latest changes:

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer/json.min.css" rel="stylesheet" />
<link id="byVIEWtheme" href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer/json.light.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer/json.min.js" defer></script>
```

### Basic Usage

Call `byJSONviewer` with the target element, the JSON-compatible data, and optional configuration options:

```javascript
const jsonData = {
  name: "John Dough",
  age: 69,
  isBased: true,
  address: {
    address1: "123 Main St",
    city: "Anywhere, SA. PÄ"
  },
  projects: ["easy-spa-php", "easy-sidebar-bootstrap", "easy-http-error-page"]
};

byJSONviewer(document.getElementById("byJSONrenderer"), jsonData);
```

The intended input is data that can exist in JSON: objects, arrays, strings, numbers, booleans, and `null`. JavaScript `bigint` values and compatible big-number objects are also supported as extensions.

### Options

The `byJSONviewer` function accepts an optional `options` object:

- `collapsed` (default: `false`): If `true`, collapsible nodes are collapsed by default.
- `rootCollapsible`: (default: `true`): If `true`, the root object or array is collapsible.
- `withQuotes` (default: `true`): If `true`, object keys are rendered as JSON strings with double quotes.
- `withLinks` (default: `true`): If `true`, supported URL strings are rendered as clickable links.
- `bigNumbers` (default: `false`): If `true`, compatible big-number objects are rendered using their own string representation.
- `chunkSize` (default: `1000`): Number of elements rendered per chunk. Invalid, zero, or negative values fall back to the default.
- `chunkLatency` (default: `25`): Number of milliseconds between chunks. Invalid or negative values fall back to the default.
- `themeToggle` (default: `true`): Appends a theme toggle at the top-right of the element.

### Themes

Switch themes by updating the `href` of the theme stylesheet:

```javascript
document.querySelector("#byVIEWtheme").setAttribute("href", "json.light.css");
```

```javascript
document.querySelector("#byVIEWtheme").setAttribute("href", "json.dark.css");
```

### Handling Large JSON

For large arrays or objects, reduce `chunkSize` to yield to the browser more frequently or reduce `chunkLatency` to render subsequent chunks sooner:

```javascript
byJSONviewer(document.getElementById("byJSONrenderer"), jsonData, {
  chunkSize: 100,
  chunkLatency: 16
});
```

Each chunk is appended in order. Rendering the same element again cancels pending chunks from its previous render.

### Collapsed Rendering

```javascript
byJSONviewer(document.getElementById("byJSONrenderer"), jsonData, {
  collapsed: true
});
```

### Example Markup

```html
<pre id="byJSONrenderer"></pre>
<script>
  const jsonData = {
    name: "John Dough",
    age: 69,
    isBased: true,
    projects: ["easy-spa-php", "easy-sidebar-bootstrap", "easy-http-error-page"]
  };

  byJSONviewer(document.getElementById("byJSONrenderer"), jsonData);
</script>
```

## License

MIT (c) Andrés Trujillo [Mateus] byUwUr
