"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2023 Andrés Trujillo [Mateus] byUwUr
 */

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
	 * Converts a JSON object into an HTML representation.
	 * @param {Object|Array|string|number|boolean|null} json - The JSON data to convert.
	 * @param {Object} options - The configuration options.
	 * @return {string} The HTML representation of the JSON data.
	 */
	const json2html = (json, options) => {
		if (json === null) return '<span class="byJSONliteral">null</span>';
		if (["number", "bigint", "boolean"].includes(typeof json)) return `<span class="byJSONliteral">${json}</span>`;
		if (Array.isArray(json)) return json.length ? `[<ol class="byJSONarray">${json.map((item, i) => `<li>${isCollapsable(item) ? '<a href="#" class="byJSONtoggle"></a>' : ""}${json2html(item, options)}${i < json.length - 1 ? "," : ""}</li>`).join("")}</ol>]` : "[]";
		if (typeof json === "string") {
			json = htmlEscape(json);
			return options.withLinks && isUrl(json) ? `<a href="${json}" class="byJSONstring" target="_blank">${json}</a>` : `<span class="byJSONstring">"${json.replace(/&quot;/g, "\\&quot;")}"</span>`;
		}
		if (typeof json === "object") {
			if (options.bigNumbers && (typeof json.toExponential === "function" || json.isLosslessNumber)) return `<span class="byJSONliteral">${json.toString()}</span>`;
			const keys = Object.keys(json);
			return keys.length
				? `{<ul class="byJSONdict">${keys
						.map((key, i) => {
							let jsonElement = json[key];
							key = htmlEscape(key);
							const keyRepr = options.withQuotes ? `<span class="byJSONstring">"${key}"</span>` : key;
							return `<li>${isCollapsable(jsonElement) ? `<a href="#" class="byJSONtoggle">${keyRepr}</a>` : keyRepr}: ${json2html(jsonElement, options)}${i < keys.length - 1 ? "," : ""}</li>`;
						})
						.join("")}</ul>}`
				: "{}";
		}
		return "";
	};
	// Merge user options with default options
	options = { collapsed: false, rootCollapsable: true, withQuotes: false, withLinks: true, bigNumbers: false, ...options };
	// Convert the JSON object to an HTML string
	let html = json2html(json, options);
	// If the root object is collapsible, add a toggle button
	if (options.rootCollapsable && isCollapsable(json)) html = `<a href="#" class="byJSONtoggle"></a>${html}`;
	// Insert the HTML into the target element and set its class
	element.innerHTML = html;
	element.classList.add("byJSONdocument");
	// Add event listener to handle collapsible nodes
	element.addEventListener("click", (event) => {
		if (event.target.classList.contains("byJSONtoggle")) {
			event.preventDefault();
			const target = event.target.nextElementSibling;
			if (target) {
				target.classList.toggle("collapsed");
				target.style.display = target.style.display === "none" ? "" : "none";
				if (target.style.display === "none") {
					const count = target.children.length;
					const placeholder = document.createElement("a");
					placeholder.href = "#";
					placeholder.className = "byJSONplaceholder";
					placeholder.innerText = `${count} item${count > 1 ? "s" : ""}`;
					target.after(placeholder);
				} else {
					const placeholder = target.nextElementSibling;
					if (placeholder && placeholder.classList.contains("byJSONplaceholder")) placeholder.remove();
				}
			}
		}
		// Handle clicks on placeholders to expand the node
		if (event.target.classList.contains("byJSONplaceholder")) {
			event.preventDefault();
			const toggle = event.target.previousElementSibling;
			if (toggle && toggle.classList.contains("byJSONtoggle")) toggle.click();
		}
	});
	// Collapse all nodes if the collapsed option is set to true
	if (options.collapsed) element.querySelectorAll("a.byJSONtoggle").forEach((toggle) => toggle.click());
}
