"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2023 Andrés Trujillo [Mateus] byUwUr
 */

/**
 * Checks if the given argument is a collapsible structure (i.e., an object or array with at least one key or item).
 * @param {Object|Array} arg - The object or array to check.
 * @return {boolean} True if the argument is collapsible, otherwise false.
 */
const isCollapsible = (arg) => arg instanceof Object && Object.keys(arg).length > 0;

/**
 * Checks if the given string is a URL by checking its protocol.
 * @param {string} string - The string to check.
 * @return {boolean} True if the string looks like a URL, otherwise false.
 */
const isUrl = (string) => ["http", "https", "ftp", "ftps"].some((protocol) => string.startsWith(`${protocol}://`));

/**
 * Escapes special characters in a string for use in HTML.
 * @param {string} s - The string to escape.
 * @return {string} The escaped string.
 */
const htmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");

/**
 * Sees if any of the siblings contains the desired id or class
 * @param {HTMLElement} element - The element whose siblings are checked.
 * @param {string} match - The id or class to search for.
 * @return {Element} The matched sibling.
 */
const getSiblingByIdOrClass = (element, match) => {
	let sibling,
		found = null;
	sibling = element.previousElementSibling;
	while (sibling) {
		if (sibling.id === match || sibling.classList.contains(match)) {
			found = sibling;
			break;
		}
		sibling = sibling.previousElementSibling;
	}
	if (found) return found;
	sibling = element.nextElementSibling;
	while (sibling) {
		if (sibling.id === match || sibling.classList.contains(match)) {
			found = sibling;
			break;
		}
		sibling = sibling.nextElementSibling;
	}
	return found;
};

/**
 * Divides the array into smaller chunks for easier handling
 * @param {Array} arr Array to divide
 * @param {number} size Size of each chunk
 * @return {Array} Result Array divides by chunks
 */
const chunkArr = (arr, size) => {
	const chunks = [];
	for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
	return chunks;
};

/**
 * Adds an event listener to a placeholder element that triggers a toggle action when clicked.
 * @param {HTMLElement} element - The placeholder element that will receive the event listener.
 */
const addPlaceholderListener = (element) => {
	element.addEventListener("click", (event) => {
		event.preventDefault();
		// Find the sibling and trigger its click
		const toggle = getSiblingByIdOrClass(event.target, `byJSONtoggle`);
		if (toggle) toggle.click();
	});
};

/**
 * Adds a click event listener to an element to toggle the collapse/expand state of a JSON node.
 * Optionally collapses the node initially if the `collapsed` parameter is true.
 * @param {HTMLElement} element - The element that will receive the toggle event listener.
 * @param {boolean} collapsed - Whether the node should be collapsed initially.
 */
const addToggleListener = (element, collapsed) => {
	element.addEventListener("click", (event) => {
		event.preventDefault();
		event.target.classList.toggle(`collapsed`);
		// Find the sibling nest and placeholder and toggle them
		const nest = getSiblingByIdOrClass(event.target, `byJSONnest`);
		if (!nest) return console.log(`byJSONnest sibling not found.`);
		nest.classList.toggle(`collapsed`);
		const placeholder = getSiblingByIdOrClass(event.target, `byJSONplaceholder`);
		if (placeholder) placeholder.classList.toggle(`collapsed`);
	});
	// Collapse nodes if the collapsed option is set to true; use timeout to wait for the DOM to process
	if (collapsed) setTimeout(() => element.click(), 0);
};

/**
 * Creates and appends a common <a> (anchor) element to a parent element.
 * @param {HTMLElement} parent - The parent element to which the <a> element will be appended.
 * @param {string} [classname='byJSONstring'] - The class name to assign to the <a> element.
 * @param {string} [text=""] - The text content of the <a> element.
 * @param {string} [href="javascript:;"] - The href attribute for the <a> element.
 * @param {boolean} [hasTarget=false] - Whether the link should open in a new tab (target="_blank").
 * @param {boolean} [isAfter=false] - Whether to insert the <a> element after the parent element (instead of appending as a child).
 * @return {HTMLElement} The created <a> element.
 */
const appendA = (parent, classname = `byJSONstring`, text = "", href = "javascript:;", hasTarget = false, isAfter = false) => {
	const a = document.createElement("a");
	a.className = classname;
	a.textContent = text;
	a.href = href;
	if (hasTarget) a.target = "_blank";
	if (isAfter) return parent.after(a);
	return parent.appendChild(a);
};

/**
 * Creates and appends a common <span> element to a parent element.
 * @param {HTMLElement} parent - The parent element to which the <span> element will be appended.
 * @param {string} [text=""] - The text content of the <span> element.
 * @param {string} [classname='byJSONliteral'] - The class name to assign to the <span> element.
 * @return {HTMLElement} The created <span> element.
 */
const appendSPAN = (parent, text = "", classname = `byJSONliteral`) => {
	const span = document.createElement("span");
	span.className = classname;
	span.textContent = text;
	return parent.appendChild(span);
};

/**
 * Creates and appends a common <li> (list item) element to a parent element, with optional JSON key handling.
 * @param {HTMLElement} parent - The parent element to which the <li> element will be appended.
 * @param {Object|Array|string|number|boolean|null} item - The JSON data to be rendered within the <li> element.
 * @param {Object} options - The configuration options for rendering.
 * @param {boolean} [isLast=false] - Whether this is the last item in the list (no trailing comma).
 * @param {boolean} [isObj=false] - Whether the item represents a key-value pair in an object.
 * @param {string} [key=""] - The key associated with the value if `isObj` is true.
 */
const appendLI = (parent, item, options, isLast = false, isObj = false, key = "") => {
	const li = document.createElement("li");
	if (isCollapsible(item)) addToggleListener(appendA(li, `byJSONtoggle`), options.collapsed);
	if (isObj) li.appendChild(document.createTextNode(`${key}: `));
	li.appendChild(json2html(li, item, options));
	if (!isLast) li.appendChild(document.createTextNode(","));
	parent.appendChild(li);
};

/**
 * Converts a JSON object into an HTML representation.
 * @param {HTMLElement} element - The DOM element where the JSON will be rendered.
 * @param {Object|Array|string|number|boolean|null} json - The JSON data to convert.
 * @param {Object} options - The configuration options.
 * @return {string} The HTML representation of the JSON data.
 */
const json2html = (element, json, options) => {
	if (json === null) return appendSPAN(element, "null");
	if (["number", "bigint", "boolean"].includes(typeof json)) return appendSPAN(element, json);
	if (typeof json === "string") {
		// Escape the string for safe HTML display.
		const escapedJSON = htmlEscape(json);
		// Make the string clickable if it's a URL and the option's on
		if (options.withLinks && isUrl(escapedJSON)) return appendA(element, `byJSONstring`, `"${escapedJSON}"`, escapedJSON, true);
		return appendSPAN(element, `"${escapedJSON}"`, `byJSONstring`);
	}
	// Check Array
	if (Array.isArray(json)) {
		// Break the array into smaller chunks based on `chunkSize` option.
		const chunks = chunkArr(json, options.chunkSize);
		// Early return "[]" if it's empty
		if (!chunks.length) return element.appendChild(document.createTextNode("[]"));
		element.appendChild(document.createTextNode("["));
		const ol = document.createElement("ol");
		ol.className = `byJSONnest`;
		element.appendChild(ol);
		// Length counter
		let count = 0;
		chunks.forEach((chunk, i) => {
			// If the chunk itself is an array, loop inside the chunk first
			if (Array.isArray(chunk)) {
				chunk.forEach((item, j) => {
					count += 1;
					setTimeout(() => {
						appendLI(ol, item, options, j >= chunk.length);
					}, options.chunkLatency * (i + j)); // Delay so the DOM can rest and don't freeze.
				});
			} else {
				count += 1;
				setTimeout(() => {
					appendLI(ol, chunk, options, i >= chunks.length);
				}, options.chunkLatency * i);
			}
		});
		// Add a placeholder element with the item count if collapsible.
		if (isCollapsible(chunks)) addPlaceholderListener(appendA(element, `byJSONplaceholder`, `${count} item${count > 1 ? "s" : ""}`));
		return element.appendChild(document.createTextNode("]"));
	}
	// If the JSON is an object (but not an array):
	if (typeof json === "object") {
		// Make the bigNumber if it's a bigNumber and the option's on
		if (options.bigNumbers && (typeof json.toExponential === "function" || json.isLosslessNumber)) return appendSPAN(element, json.toString());
		// Break the object's entries into smaller chunks based on `chunkSize` option.
		const chunks = chunkArr(Object.entries(json), options.chunkSize);
		// Early return "{}" if it's empty
		if (!chunks.length) return element.appendChild(document.createTextNode("{}"));
		element.appendChild(document.createTextNode("{"));
		const ul = document.createElement("ul");
		ul.className = `byJSONnest`;
		element.appendChild(ul);
		// Length counter
		let count = 0;
		chunks.forEach((chunk) => {
			chunk.forEach(([key, value], i) => {
				count += 1;
				setTimeout(() => {
					appendLI(ul, value, options, i >= chunk.length, true, options.withQuotes ? `"${htmlEscape(key)}"` : htmlEscape(key));
				}, options.chunkLatency * i); // Delay so the DOM can rest and don't freeze.
			});
		});
		// Add a placeholder element with the item count if collapsible.
		if (isCollapsible(chunks)) addPlaceholderListener(appendA(element, `byJSONplaceholder`, `${count} item${count > 1 ? "s" : ""}`));
		return element.appendChild(document.createTextNode("}"));
	}
};

/**
 * Renders a JSON object into an HTML element with collapsible nodes.
 * @param {HTMLElement} element - The DOM element where the JSON will be rendered.
 * @param {Object|Array|string|number|boolean|null} json - The JSON data to render.
 * @param {Object} [options] - Configuration options for rendering.
 * @param {boolean} [options.collapsed=false] - If true, collapsible nodes will be collapsed by default.
 * @param {boolean} [options.rootCollapsable=true] - If true, the root JSON object will be collapsible.
 * @param {boolean} [options.withQuotes=false] - If true, object keys will be wrapped in double quotes.
 * @param {boolean} [options.withLinks=true] - If true, strings that look like URLs will be rendered as clickable links.
 * @param {boolean} [options.bigNumbers=false] - If true, large numbers will be handled with special care (e.g., for libraries that support big numbers).
 * @param {number} [options.chunkSize=999] - Numbers of elements to render per chunk to avoid freezing
 * @param {number} [options.chunkLatency=33] - Numbers of miliseconds to wait between renders
 */
function byJSONviewer(element, json, options = {}) {
	options = { collapsed: false, rootCollapsable: true, withQuotes: true, withLinks: true, bigNumbers: false, chunkSize: 999, chunkLatency: 33, ...options };
	element.textContent = "";
	element.classList.add(`byJSONdocument`);
	// If the root object is collapsible, add a toggle button
	if (options.rootCollapsable && isCollapsible(json)) addToggleListener(appendA(element, `byJSONtoggle`), options.collapsed);
	// Convert the JSON object to an HTML string and insert the HTML into the target element and set its class
	json2html(element, json, options);
}
