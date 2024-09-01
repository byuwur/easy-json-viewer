# byuwur/easy-json-viewer

**easy JSON Viewer** is a lightweight and easy-to-use JavaScript library for rendering JSON objects in an HTML document. It provides chunk rendering collapsible nodes, syntax highlighting, and customizable themes to make JSON data more readable and interactive.

Test it out at: [codepen.io/byuwur/pen/ExBeOPR](https://codepen.io/byuwur/pen/ExBeOPR)

## Features

-   **Chunk Rendering**: Handles a JSON of almost any size by dividing the load in configurable chunks.
-   **Collapsible Nodes**: Collapse or expand JSON objects and arrays to focus on specific parts of the data.
-   **Syntax Highlighting**: Distinct colors for strings, literals, and other data types for easy reading.
-   **Customizable Themes**: Switch between light and dark themes with a single click.
-   **Efficient Rendering**: Handles large JSON files by chunking the data to prevent freezing.
-   **Link Handling**: Automatically converts URLs in strings to clickable links.

## Getting Started

### Installation

You can include the `easy JSON Viewer` in your project by downloading the required files or linking them directly in your HTML:

```html
<link href="json.css" rel="stylesheet" />
<link id="theme" href="json.dark.css" rel="stylesheet" />
<script src="json.js" defer></script>
```

### Basic Usage

To use `easy JSON Viewer`, simply call the `byJSONviewer` function and pass the target element, the JSON data, and optional configuration options:

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

### Options

The `byJSONviewer` function accepts an optional `options` object to customize its behavior:

-   `collapsed` (default: `false`): If `true`, collapsible nodes will be collapsed by default.
-   `rootCollapsable` (default: `true`): If `true`, the root JSON object will be collapsible.
-   `withQuotes` (default: `true`): If `true`, object keys will be wrapped in double quotes.
-   `withLinks` (default: `true`): If `true`, strings that look like URLs will be rendered as clickable links.
-   `bigNumbers` (default: `false`): If `true`, large numbers will be handled with special care (e.g., for libraries that support big numbers).
-   `chunkSize` (default: `999`): Number of elements to render per chunk to avoid freezing.
-   `chunkLatency` (default: `33`): Number of milliseconds to wait between renders.

### Themes

You can easily switch between light and dark themes by updating the `href` attribute of the theme link:

```html
<a href="javascript:document.querySelector('#theme').setAttribute('href','json.light.css');">Light Theme</a> <a href="javascript:document.querySelector('#theme').setAttribute('href','json.dark.css');">Dark Theme</a>
```

### Handling Large JSON Files

For large JSON files, you can adjust the rendering speed and initial collapsed state:

```javascript
const renderFetched = (options = {}) => {
	fetch(`https://raw.githubusercontent.com/json-iterator/test-data/master/large-file.json`)
		.then((response) => {
			if (!response.ok) console.warn(`Something went wrong`, response.statusText);
			return response.json();
		})
		.then((response) => {
			byJSONviewer(document.getElementById("byJSONrenderer"), response, options);
		})
		.catch((e) => {
			console.warn(`Something went wrong`, e);
		});
};

const youDontWannaDoThis = () => renderFetched();
const youDontWannaDoThisCollapsed = () => renderFetched({ collapsed: true });
const youDontWannaDoThisFast = () => renderFetched({ chunkLatency: 1 });
```

## Demo

You can view a live demo of `easy JSON Viewer` on this [codepen](https://codepen.io/byuwur/pen/ExBeOPR).

### Example Code

```html
<pre id="byJSONrenderer"></pre>
<script>
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
</script>
```

## License

MIT (c) Andrés Trujillo [Mateus] byUwUr
