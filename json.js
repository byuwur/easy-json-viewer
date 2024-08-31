"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2023 Andrés Trujillo [Mateus] byUwUr
 */

function byJSONviewer(element, json, options = {}) {
	const isCollapsable = (arg) => arg instanceof Object && Object.keys(arg).length > 0;
	const isUrl = (string) => ["http", "https", "ftp", "ftps"].some((protocol) => string.startsWith(`${protocol}://`));
	const htmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
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
	options = { collapsed: false, rootCollapsable: true, withQuotes: false, withLinks: true, bigNumbers: false, ...options };
	let html = json2html(json, options);
	if (options.rootCollapsable && isCollapsable(json)) html = `<a href="#" class="byJSONtoggle"></a>${html}`;
	element.innerHTML = html;
	element.classList.add("byJSONdocument");
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
		if (event.target.classList.contains("byJSONplaceholder")) {
			event.preventDefault();
			const toggle = event.target.previousElementSibling;
			if (toggle && toggle.classList.contains("byJSONtoggle")) toggle.click();
		}
	});
	if (options.collapsed) element.querySelectorAll("a.byJSONtoggle").forEach((toggle) => toggle.click());
}
