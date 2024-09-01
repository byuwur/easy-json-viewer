# byuwur/easy-json-viewer

Easy JSON Viewer is a lightweight JavaScript library that allows you to easily render JSON data into an HTML structure with collapsible nodes. It's perfect for displaying JSON data in a readable and interactive format on your web pages.

## Features

-   **Chunk Rendering**: Handles JSON of almost any size by dividing the load in configurable chunks.
-   **Collapsible Nodes**: Easily expand or collapse JSON objects and arrays to focus on the data you need.
-   **Syntax Highlighting**: Visual differentiation between strings, numbers, booleans, and other data types.
-   **Clickable URLs**: Automatically converts URLs in JSON strings into clickable links.
-   **Dark and Light Themes**: Supports both dark and light themes to match your website's design.
-   **Easy Integration**: Simple to use with minimal configuration required.

## Getting Started

### Installation

To include Easy JSON Viewer in your project, download the necessary files and include them in your HTML:

```html
<link rel="stylesheet" href="json.css" />
<link id="theme" rel="stylesheet" href="json.dark.css" />
<script src="json.js" defer></script>
```

### Usage

To use Easy JSON Viewer, create an HTML element where the JSON data will be rendered, and then call the `byJSONviewer` function with the element and JSON data:

```html
<div id="json-render"></div>

<script>
	document.addEventListener("DOMContentLoaded", () => {
		const data = {
			name: "John Doe",
			age: 69,
			isEmployee: true,
			address: {
				street: "123 Main St",
				city: "Anytown"
			},
			projects: ["Hello, world", "Test", "easy"],
			sidebar: "https://github.com/byuwur/easy-sidebar-bootstrap",
			spa: "https://github.com/byuwur/easy-spa-php"
		};
		byJSONviewer(document.getElementById("json-render"), data);
	});
</script>
```

### Themes

Easy JSON Viewer supports both dark and light themes. You can switch between them dynamically:

```html
<a href="javascript:document.querySelector('#theme').setAttribute('href','json.light.css');">Light Theme</a> <a href="javascript:document.querySelector('#theme').setAttribute('href','json.dark.css');">Dark Theme</a>
```

### Options

You can customize the behavior of Easy JSON Viewer with the following options:

-   `collapsed` (default: `false`): If `true`, all collapsible nodes will be collapsed by default.
-   `rootCollapsable` (default: `true`): If `true`, the root JSON object will be collapsible.
-   `withQuotes` (default: `false`): If `true`, object keys will be wrapped in double quotes.
-   `withLinks` (default: `true`): If `true`, strings that look like URLs will be rendered as clickable links.
-   `bigNumbers` (default: `false`): If `true`, large numbers will be handled with special care.
-   `chunkSize` (default: `999`) numbers of elements to render per chunk to avoid freezing
-   `chunkLatency` (default; `33`) number of miliseconds to wait between renders

Example usage with options:

```javascript
byJSONviewer(document.getElementById("json-container"), data, {
	collapsed: true,
	withQuotes: true,
	withLinks: false
});
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
