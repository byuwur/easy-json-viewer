"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2026 Andrés Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-json-viewer
 */
(function (global) {
  // Keep render state tied to each target element
  const renderTokens = new WeakMap();

  /**
   * Checks if a value is a non-empty collapsible object or array.
   * @param {*} arg - The value to check.
   * @return {boolean} True if the value is collapsible, otherwise false.
   */
  const isCollapsible = (arg) => arg !== null && typeof arg === "object" && Object.keys(arg).length > 0;

  /**
   * Checks if a string starts with a supported URL protocol.
   * @param {string} string - The string to check.
   * @return {boolean} True if the string looks like a URL, otherwise false.
   */
  const isUrl = (string) => /^(https?|ftps?):\/\//i.test(string);

  /**
   * Checks if a value should render as a big-number scalar.
   * @param {*} value - The value to check.
   * @param {Object} options - Renderer options.
   * @return {boolean} True if the value is a supported big number, otherwise false.
   */
  const isBigNumber = (value, options) => Boolean(options.bigNumbers && value && typeof value === "object" && (typeof value.toExponential === "function" || value.isLosslessNumber));

  /**
   * Finds a sibling by id or class.
   * @param {HTMLElement} element - The element whose siblings are checked.
   * @param {string} match - The id or class to search for.
   * @return {Element|null} The matched sibling, if any.
   */
  const getSiblingByIdOrClass = (element, match) => {
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.id === match || sibling.classList.contains(match)) return sibling;
      sibling = sibling.previousElementSibling;
    }
    sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.id === match || sibling.classList.contains(match)) return sibling;
      sibling = sibling.nextElementSibling;
    }

    return null;
  };

  /**
   * Divides an array into smaller chunks.
   * @param {Array} arr - Array to divide.
   * @param {number} size - Size of each chunk.
   * @return {Array<Array>} The divided array.
   */
  const chunkArr = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  };

  /**
   * Applies defaults and validates renderer options.
   * @param {Object} options - User options.
   * @return {Object} Normalized options.
   */
  const normalizeOptions = (options) => {
    const source = options && typeof options === "object" ? options : {};
    const normalized = {
      collapsed: false,
      rootCollapsible: true,
      withQuotes: true,
      withLinks: true,
      bigNumbers: false,
      chunkSize: 1000,
      chunkLatency: 25,
      themeToggle: true,
      ...source
    };
    // Keep chunk values valid before scheduling renders
    normalized.chunkSize = Number.isFinite(normalized.chunkSize) && normalized.chunkSize >= 1 ? Math.floor(normalized.chunkSize) : 1000;
    normalized.chunkLatency = Number.isFinite(normalized.chunkLatency) && normalized.chunkLatency >= 0 ? normalized.chunkLatency : 25;

    return normalized;
  };

  /**
   * Cancels an unfinished render on the given element.
   * @param {HTMLElement} element - Renderer element.
   */
  const cancelExistingRender = (element) => {
    const token = renderTokens.get(element);
    if (!token) return;

    token.cancel = true;
    token.timers.forEach((timer) => clearTimeout(timer));
    token.timers.clear();
  };

  /**
   * Schedules work for the current render.
   * @param {Object} token - Render token.
   * @param {Function} callback - Work to execute.
   * @param {number} delay - Delay in milliseconds.
   */
  const schedule = (token, callback, delay) => {
    if (token.cancel) return;

    const timer = setTimeout(() => {
      token.timers.delete(timer);
      if (!token.cancel) callback();
    }, delay);
    // Track timers so stale renders can be cleared
    token.timers.add(timer);
  };

  /**
   * Sets the collapsed state of a toggle and its related elements.
   * @param {HTMLElement} toggle - Toggle element.
   * @param {boolean} collapsed - Desired state.
   */
  const setToggleState = (toggle, collapsed) => {
    toggle.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    // Keep the nest and its placeholder in sync
    const nest = getSiblingByIdOrClass(toggle, "byJSONnest");
    if (nest) nest.classList.toggle("collapsed", collapsed);
    const placeholder = getSiblingByIdOrClass(toggle, "byJSONplaceholder");
    if (placeholder) placeholder.classList.toggle("collapsed", collapsed);
  };

  /**
   * Makes a placeholder trigger its sibling toggle.
   * @param {HTMLElement} element - Placeholder element.
   */
  const addPlaceholderListener = (element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      // Find the sibling toggle and trigger it
      const toggle = getSiblingByIdOrClass(event.currentTarget, "byJSONtoggle");
      if (toggle) toggle.click();
    });
  };

  /**
   * Adds collapse/expand behavior to a toggle.
   * @param {HTMLElement} element - Toggle element.
   */
  const addToggleListener = (element) => {
    element.setAttribute("aria-expanded", "true");
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const toggle = event.currentTarget;
      setToggleState(toggle, !toggle.classList.contains("collapsed"));
    });
  };

  /**
   * Creates and appends an <a> element.
   * @param {HTMLElement} parent - Parent element.
   * @param {string} [classname='byJSONstring'] - Class name.
   * @param {string} [text=''] - Text content.
   * @param {string} [href='#'] - Link destination.
   * @param {boolean} [hasTarget=false] - Whether the link opens in a new tab.
   * @param {boolean} [isAfter=false] - Whether to insert after the parent.
   * @return {HTMLElement} The created anchor.
   */
  const appendA = (parent, classname = "byJSONstring", text = "", href = "#", hasTarget = false, isAfter = false) => {
    const a = document.createElement("a");
    a.className = classname;
    a.textContent = text;
    a.href = href;

    if (hasTarget) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }

    if (isAfter) {
      parent.after(a);
      return a;
    }

    return parent.appendChild(a);
  };

  /**
   * Creates and appends a <span> element.
   * @param {HTMLElement} parent - Parent element.
   * @param {*} [text=''] - Text content.
   * @param {string} [classname='byJSONliteral'] - Class name.
   * @return {HTMLElement} The created span.
   */
  const appendSPAN = (parent, text = "", classname = "byJSONliteral") => {
    const span = document.createElement("span");
    span.className = classname;
    span.textContent = String(text);
    return parent.appendChild(span);
  };

  /**
   * Creates and appends a JSON list item.
   * @param {HTMLElement} parent - Parent list.
   * @param {*} item - JSON value.
   * @param {Object} options - Renderer options.
   * @param {Object} token - Render token.
   * @param {boolean} [isLast=false] - Whether this is the final item.
   * @param {boolean} [isObj=false] - Whether this is an object entry.
   * @param {string} [key=''] - Object key text.
   */
  const appendLI = (parent, item, options, token, isLast = false, isObj = false, key = "") => {
    if (token.cancel) return;
    const li = document.createElement("li");
    let toggle = null;
    // Only non-empty structures need a toggle
    if (isCollapsible(item) && !isBigNumber(item, options)) {
      toggle = appendA(li, "byJSONtoggle");
      addToggleListener(toggle);
    }
    if (isObj) li.appendChild(document.createTextNode(`${key}: `));
    json2html(li, item, options, token);
    // Don't leave a trailing comma on the whole collection
    if (!isLast) li.appendChild(document.createTextNode(","));
    parent.appendChild(li);

    if (toggle && options.collapsed) setToggleState(toggle, true);
  };

  /**
   * Converts JSON-compatible data into its DOM representation.
   * @param {HTMLElement} element - Parent element.
   * @param {*} json - JSON-compatible value.
   * @param {Object} options - Renderer options.
   * @param {Object} token - Render token.
   * @return {Node|undefined} The last created node when applicable.
   */
  const json2html = (element, json, options, token) => {
    if (token.cancel) return;
    // Render primitive values
    if (json === null) return appendSPAN(element, "null");
    if (typeof json === "number") return appendSPAN(element, Number.isFinite(json) ? json : "null");
    if (typeof json === "bigint" || typeof json === "boolean") return appendSPAN(element, json);
    if (typeof json === "string") {
      // JSON.stringify handles JSON escaping; textContent handles HTML safely
      const serialized = JSON.stringify(json);
      if (options.withLinks && isUrl(json)) return appendA(element, "byJSONstring", serialized, json, true);
      return appendSPAN(element, serialized, "byJSONstring");
    }
    // Render arrays
    if (Array.isArray(json)) {
      if (!json.length) return element.appendChild(document.createTextNode("[]"));
      element.appendChild(document.createTextNode("["));
      const ol = document.createElement("ol");
      ol.className = "byJSONnest";
      element.appendChild(ol);
      // Render in chunks so large arrays don't block the DOM
      const chunks = chunkArr(json, options.chunkSize);
      chunks.forEach((chunk, chunkIndex) => {
        schedule(
          token,
          () => {
            const offset = chunkIndex * options.chunkSize;
            chunk.forEach((item, itemIndex) => {
              const index = offset + itemIndex;
              appendLI(ol, item, options, token, index === json.length - 1);
            });
          },
          options.chunkLatency * (chunkIndex + 1)
        );
      });
      // Show item count while collapsed
      const placeholder = appendA(element, "byJSONplaceholder", `${json.length} item${json.length === 1 ? "" : "s"}`);
      addPlaceholderListener(placeholder);

      return element.appendChild(document.createTextNode("]"));
    }
    // Render objects
    if (typeof json === "object") {
      // Treat supported big-number objects as scalar values
      if (isBigNumber(json, options)) return appendSPAN(element, json.toString());
      const entries = Object.entries(json);
      if (!entries.length) return element.appendChild(document.createTextNode("{}"));
      element.appendChild(document.createTextNode("{"));
      const ul = document.createElement("ul");
      ul.className = "byJSONnest";
      element.appendChild(ul);
      // Render entries in chunks while keeping their original order
      const chunks = chunkArr(entries, options.chunkSize);
      chunks.forEach((chunk, chunkIndex) => {
        schedule(
          token,
          () => {
            const offset = chunkIndex * options.chunkSize;
            chunk.forEach(([key, value], itemIndex) => {
              const index = offset + itemIndex;
              const renderedKey = options.withQuotes ? JSON.stringify(key) : key;
              appendLI(ul, value, options, token, index === entries.length - 1, true, renderedKey);
            });
          },
          options.chunkLatency * (chunkIndex + 1)
        );
      });
      // Show item count while collapsed
      const placeholder = appendA(element, "byJSONplaceholder", `${entries.length} item${entries.length === 1 ? "" : "s"}`);
      addPlaceholderListener(placeholder);

      return element.appendChild(document.createTextNode("}"));
    }
    // Parsed JSON shouldn't reach this, but fail safely if it does
    return appendSPAN(element, "null");
  };

  /**
   * Adds a light/dark theme toggle to a renderer.
   * Expected theme filenames:
   * - {filename}.light.css
   * - {filename}.dark.css
   * @param {HTMLElement} element - Renderer that receives the toggle.
   * @param {string} filename - Theme stylesheet base filename.
   * @return {HTMLButtonElement|null} The toggle button, or null when no valid theme stylesheet is loaded.
   */
  const appendThemeToggle = (element, filename) => {
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const themePattern = new RegExp(`${escapedFilename}\\.(light|dark)\\.css(?:[?#].*)?$`, "i");
    const themeReplacePattern = new RegExp(`${escapedFilename}\\.(light|dark)\\.css`, "i");

    // Prefer the documented #byVIEWtheme link, but also support automatic detection.
    const stylesheet = document.getElementById("byVIEWtheme") || [...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => themePattern.test(link.getAttribute("href") || ""));
    if (!stylesheet) return null;

    // Read the active theme from the stylesheet filename.
    const getTheme = () => {
      const match = (stylesheet.getAttribute("href") || "").match(themeReplacePattern);
      return match ? match[1].toLowerCase() : null;
    };
    if (!getTheme()) return null;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.textContent = "\u263E\uFE0E \u2600\uFE0E"; // ☾︎ ☀︎

    // Keep accessibility text consistent with the theme actually loaded.
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      button.title = `Switch to ${next} theme`;
      button.setAttribute("aria-label", button.title);
    };

    button.addEventListener("click", () => {
      const current = getTheme();
      const next = current === "dark" ? "light" : "dark";
      const href = stylesheet.getAttribute("href") || "";

      // Replace only the theme filename while preserving paths and query strings.
      stylesheet.setAttribute("href", href.replace(themeReplacePattern, `${filename}.${next}.css`));
      sync();
    });

    sync();

    return element.appendChild(button);
  };

  /**
   * Renders JSON-compatible data into an HTML element with collapsible nodes.
   * @param {HTMLElement} element - DOM element where the JSON will be rendered.
   * @param {*} json - JSON-compatible data to render.
   * @param {Object} [options] - Configuration options.
   * @param {boolean} [options.collapsed=false] - Collapse nested arrays/objects by default.
   * @param {boolean} [options.rootCollapsible=true] - Make the root array/object collapsible.
   * @param {boolean} [options.withQuotes=true] - Wrap object keys in double quotes.
   * @param {boolean} [options.withLinks=true] - Render URL strings as clickable links.
   * @param {boolean} [options.bigNumbers=false] - Support compatible big-number objects.
   * @param {number} [options.chunkSize=1000] - Number of elements rendered per chunk.
   * @param {number} [options.chunkLatency=25] - Milliseconds before and between chunks.
   * @param {boolean} [options.themeToggle=true] - Appends a theme toggle at the top-right of the element.
   */
  function byJSONviewer(element, json, options = {}) {
    if (!element || typeof element.appendChild !== "function") throw new TypeError("byJSONviewer(): element must be a DOM element.");
    // Cancel unfinished work before rendering again on the same element
    cancelExistingRender(element);
    const token = { cancel: false, timers: new Set() };
    renderTokens.set(element, token);
    const normalizedOptions = normalizeOptions(options);
    element.textContent = "";
    element.classList.add("byJSONdocument");
    if (normalizedOptions.themeToggle) appendThemeToggle(element, "json");
    // Add the root toggle when applicable
    let rootToggle = null;
    if (normalizedOptions.rootCollapsible && isCollapsible(json) && !isBigNumber(json, normalizedOptions)) {
      rootToggle = appendA(element, "byJSONtoggle");
      addToggleListener(rootToggle);
    }
    // Render JSON and apply the initial root state
    json2html(element, json, normalizedOptions, token);
    if (rootToggle && normalizedOptions.collapsed) setToggleState(rootToggle, true);
  }

  global.byJSONviewer = byJSONviewer;
})(typeof window !== "undefined" ? window : this);
