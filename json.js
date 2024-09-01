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
const isCollapsable = (arg) => arg instanceof Object && Object.keys(arg).length > 0;

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

// Add common <a> elements
const appendA = (parent, classname = `byJSONstring`, text = "", href = "javascript:;", hasTarget = false, isAfter = false) => {
	const a = document.createElement("a");
	a.className = classname;
	a.textContent = text;
	a.href = href;
	if (hasTarget) a.target = "_blank";
	if (isAfter) return parent.after(a);
	return parent.appendChild(a);
};

// Add common <span> elements
const appendSPAN = (parent, text = "", classname = `byJSONliteral`) => {
	const span = document.createElement("span");
	span.className = classname;
	span.textContent = text;
	return parent.appendChild(span);
};

// Add common <li> elements
const appendLI = (parent, item, options, isLast = false, isObj = false, key = "") => {
	const li = document.createElement("li");
	if (isCollapsable(item)) appendA(li, `byJSONtoggle`);
	if (isObj) {
		li.appendChild(document.createTextNode(key));
		li.appendChild(document.createTextNode(": "));
	}
	li.appendChild(json2html(li, item, options));
	if (!isLast) li.appendChild(document.createTextNode(","));
	parent.appendChild(li);
};

// Placeholder event
const placeholderHandler = (event) => {
	event.preventDefault();
	const toggle = getSiblingByIdOrClass(event.target, `byJSONtoggle`);
	if (toggle) toggle.click();
};

// Toggle event
const toggleHandler = (event) => {
	event.preventDefault();
	event.target.classList.toggle(`collapsed`);
	const nest = getSiblingByIdOrClass(event.target, `byJSONnest`);
	if (!nest) return console.log(`byJSONnest sibling not found.`);
	nest.classList.toggle(`collapsed`);
	if (nest.classList.contains(`collapsed`)) {
		const count = nest.children.length;
		appendA(nest, `byJSONplaceholder`, `${count} item${count > 1 ? "s" : ""}`, "javascript:;", false, true);
	} else {
		const placeholder = getSiblingByIdOrClass(event.target, `byJSONplaceholder`);
		if (placeholder) placeholder.remove();
	}
	// Handle clicks on placeholders to expand the node
	document.querySelectorAll(`.byJSONplaceholder`).forEach((toggle) => {
		toggle.addEventListener("click", placeholderHandler);
	});
};

// Add common event listeners
const createClickListeners = () => {
	document.querySelectorAll(`.byJSONtoggle`).forEach((toggle) => {
		toggle.addEventListener("click", toggleHandler);
	});
};

/**
 * Converts a JSON object into an HTML representation.
 * @param {HTMLElement} element - The DOM element where the JSON will be rendered.
 * @param {Object|Array|string|number|boolean|null} json - The JSON data to convert.
 * @param {Object} options - The configuration options.
 * @return {string} The HTML representation of the JSON data.
 */
const json2html = (element, json, options) => {
	createClickListeners();
	if (json === null) return appendSPAN(element, "null");
	if (["number", "bigint", "boolean"].includes(typeof json)) return appendSPAN(element, json);
	if (typeof json === "string") {
		const escapedJSON = htmlEscape(json);
		if (options.withLinks && isUrl(escapedJSON)) return appendA(element, `byJSONstring`, `"${escapedJSON}"`, escapedJSON, true);
		return appendSPAN(element, `"${escapedJSON}"`, `byJSONstring`);
	}
	if (Array.isArray(json)) {
		const chunks = chunkArr(json, options.chunkSize);
		if (!chunks.length) return element.appendChild(document.createTextNode("[]"));
		element.appendChild(document.createTextNode("["));
		const ol = document.createElement("ol");
		ol.className = `byJSONnest`;
		element.appendChild(ol);
		chunks.forEach((chunk, i) => {
			if (Array.isArray(chunk))
				chunk.forEach((item, j) => {
					setTimeout(() => {
						appendLI(ol, item, options, j >= chunk.length);
					}, options.chunkLatency * (i + j));
				});
			else
				setTimeout(() => {
					appendLI(ol, chunk, options, i >= chunks.length);
				}, options.chunkLatency * i);
		});
		return element.appendChild(document.createTextNode("]"));
	}
	if (typeof json === "object") {
		if (options.bigNumbers && (typeof json.toExponential === "function" || json.isLosslessNumber)) return appendSPAN(element, json.toString());
		const chunks = chunkArr(Object.entries(json), options.chunkSize);
		if (!chunks.length) return element.appendChild(document.createTextNode("{}"));
		element.appendChild(document.createTextNode("{"));
		const ul = document.createElement("ul");
		ul.className = `byJSONnest`;
		element.appendChild(ul);
		chunks.forEach((chunk) => {
			chunk.forEach(([key, value], i) => {
				setTimeout(() => {
					appendLI(ul, value, options, i >= chunk.length, true, options.withQuotes ? `"${htmlEscape(key)}"` : htmlEscape(key));
				}, options.chunkLatency * i);
			});
		});
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
	element.textContent = "";
	options = { collapsed: false, rootCollapsable: true, withQuotes: true, withLinks: true, bigNumbers: false, chunkSize: 999, chunkLatency: 33, ...options };
	// If the root object is collapsible, add a toggle button
	if (options.rootCollapsable && isCollapsable(json)) appendA(element, `byJSONtoggle`);
	// Convert the JSON object to an HTML string and insert the HTML into the target element and set its class
	json2html(element, json, options);
	element.classList.add(`byJSONdocument`);
	// Collapse all nodes if the collapsed option is set to true
	if (options.collapsed) element.querySelectorAll(`a.byJSONtoggle`).forEach((toggle) => toggle.click());
}
