"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2023 Andrés Trujillo [Mateus] byUwUr
 */

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
		const placeholder = document.createElement("a");
		placeholder.href = "javascript:;";
		placeholder.className = `byJSONplaceholder`;
		placeholder.innerText = `${count} item${count > 1 ? "s" : ""}`;
		nest.after(placeholder);
	} else {
		const placeholder = getSiblingByIdOrClass(event.target, `byJSONplaceholder`);
		if (placeholder) placeholder.remove();
	}
	// Handle clicks on placeholders to expand the node
	document.querySelectorAll(`.byJSONplaceholder`).forEach((toggle) => {
		toggle.addEventListener("click", placeholderHandler);
	});
};

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
 * @param {Element} element - The element whose siblings are checked.
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
 * Converts a JSON object into an HTML representation.
 * @param {Object|Array|string|number|boolean|null} json - The JSON data to convert.
 * @param {Object} options - The configuration options.
 * @return {string} The HTML representation of the JSON data.
 */
const json2html = (json, options) => {
	if (json === null) return `<span class="byJSONliteral">null</span>`;
	if (["number", "bigint", "boolean"].includes(typeof json)) return `<span class="byJSONliteral">${json}</span>`;
	if (Array.isArray(json)) return json.length ? `[<ol class="byJSONnest">${json.map((item, i) => `<li>${isCollapsable(item) ? `<a href="javascript:;" class="byJSONtoggle"></a>` : ""}${json2html(item, options)}${i < json.length - 1 ? "," : ""}</li>`).join("")}</ol>]` : "[]";
	if (typeof json === "string") {
		json = htmlEscape(json);
		return options.withLinks && isUrl(json) ? `<a href="${json}" class="byJSONstring" target="_blank">${json}</a>` : `<span class="byJSONstring">"${json.replace(/&quot;/g, "\\&quot;")}"</span>`;
	}
	if (typeof json === "object") {
		if (options.bigNumbers && (typeof json.toExponential === "function" || json.isLosslessNumber)) return `<span class="byJSONliteral">${json.toString()}</span>`;
		const keys = Object.keys(json);
		return keys.length
			? `{<ul class="byJSONnest">${keys
					.map((key, i) => {
						let jsonElement = json[key];
						key = htmlEscape(key);
						const keyRepr = options.withQuotes ? `<span class="byJSONstring">"${key}"</span>` : key;
						return `<li>${isCollapsable(jsonElement) ? `<a href="javascript:;" class="byJSONtoggle">${keyRepr}</a>` : keyRepr}: ${json2html(jsonElement, options)}${i < keys.length - 1 ? "," : ""}</li>`;
					})
					.join("")}</ul>}`
			: "{}";
	}
	return "";
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
 */
function byJSONviewer(element, json, options = {}) {
	// Merge user options with default options
	options = { collapsed: false, rootCollapsable: true, withQuotes: false, withLinks: true, bigNumbers: false, ...options };
	// Convert the JSON object to an HTML string
	let html = json2html(json, options);
	// If the root object is collapsible, add a toggle button
	if (options.rootCollapsable && isCollapsable(json)) html = `<a href="javascript:;" class="byJSONtoggle"></a>${html}`;
	// Insert the HTML into the target element and set its class
	element.innerHTML = html;
	element.classList.add(`byJSONdocument`);

	// Add event listener to handle collapsible nodes
	document.querySelectorAll(`.byJSONtoggle`).forEach((toggle) => {
		toggle.addEventListener("click", toggleHandler);
	});
	// Collapse all nodes if the collapsed option is set to true
	if (options.collapsed) element.querySelectorAll(`a.byJSONtoggle`).forEach((toggle) => toggle.click());
}
