"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-json-viewer
 */
(function (global) {
  if (global.byJSONviewer?.initialized) return;
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
      forceMonospace: false,
      chunkSize: 1000,
      chunkLatency: 25,
      themeToggle: true,
      fontSizeControls: true,
      copyButton: true,
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
   * @returns {void}
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
   * @returns {void}
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
   * @returns {void}
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
   * @returns {void}
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
   * @returns {void}
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
   * @returns {void}
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
    const themePattern = new RegExp(`^([^?#]*/)?${escapedFilename}\\.(light|dark)\\.css([?#].*)?$`, "i");
    // Prefer the documented #byVIEWtheme link, but also support automatic detection.
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    if (!stylesheet) return null;
    // Read the active theme from the stylesheet filename.
    const getTheme = () => {
      const match = (stylesheet.getAttribute("href") || "").match(themePattern);
      return match ? match[2].toLowerCase() : null;
    };
    if (!getTheme()) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.textContent = "\u263E\uFE0E \u2600\uFE0E"; // ☾︎ ☀︎
    // Keep accessibility text consistent with the theme actually loaded.
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      for (const toggle of [button, ...document.querySelectorAll(".byJSONdocument > .byVIEWcontrols > .byVIEWthemeToggle")]) {
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const current = getTheme();
      const next = current === "dark" ? "light" : "dark";
      const href = stylesheet.getAttribute("href") || "";
      // Replace only the theme filename while preserving paths and query strings.
      stylesheet.setAttribute(
        "href",
        href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${filename}.${next}.css${suffix}`)
      );
      sync();
    });
    sync();
    return element.appendChild(button);
  };

  /**
   * Adds text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @param {HTMLElement} controls - Toolbar that receives the controls.
   * @return {HTMLElement} The text size button group.
   */
  const appendFontSizeControls = (element, controls) => {
    element.dataset.byViewDefaultFontSize ??= element.style.fontSize;
    const sizes = document.createElement("div");
    sizes.className = "byVIEWfontSizes";
    controls.appendChild(sizes);
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let size = (parseFloat(getComputedStyle(element).fontSize) || rootSize) / rootSize;
    const decrease = document.createElement("button");
    const increase = document.createElement("button");
    const reset = document.createElement("button");
    reset.textContent = "A";
    decrease.textContent = "A-";
    increase.textContent = "A+";
    for (const [button, title] of [
      [decrease, "Decrease text size"],
      [reset, "Reset text size"],
      [increase, "Increase text size"]
    ]) {
      button.type = "button";
      button.className = "byVIEWfontSize";
      button.title = title;
      button.setAttribute("aria-label", title);
      sizes.appendChild(button);
    }
    const sync = () => {
      decrease.disabled = size <= 0.5;
      increase.disabled = size >= 3;
    };
    for (const [button, step] of [
      [decrease, -0.125],
      [increase, 0.125]
    ]) {
      button.addEventListener("click", () => {
        size = Math.max(0.5, Math.min(3, size + step));
        element.style.fontSize = `${size}rem`;
        sync();
      });
    }
    reset.addEventListener("click", () => {
      element.style.fontSize = element.dataset.byViewDefaultFontSize;
      size = (parseFloat(getComputedStyle(element).fontSize) || rootSize) / rootSize;
      sync();
    });
    sync();
    return sizes;
  };

  /**
   * Add a copy action for the complete source, including content outside the visible rendered chunk.
   * @param {unknown} controls Controls.
   * @param {Function} getText Callback that returns the text to copy.
   * @param {string} label Human-readable label.
   * @returns {void}
   */
  const appendCopyButton = (controls, getText, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWcopy";
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false"><!--!Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z"/></svg>`;
    const caption = document.createElement("span");
    button.appendChild(caption);
    const reset = () => {
      caption.textContent = "Copy";
      button.title = label;
      button.setAttribute("aria-label", label);
    };
    reset();
    button.addEventListener("mouseleave", reset);
    button.addEventListener("focusout", reset);
    controls.appendChild(button);
    button.addEventListener("click", async (event) => {
      button.disabled = true;
      let message = "Copied!";
      try {
        await navigator.clipboard.writeText(getText(event));
        caption.textContent = message;
      } catch {
        caption.textContent = "Failed";
        message = "Copy failed. Check clipboard access.";
      } finally {
        button.disabled = false;
        button.title = `${message} ${label}`;
        button.setAttribute("aria-label", button.title);
      }
    });
  };

  /**
   * Attach the enabled theme, size, and copy controls to this renderer instance.
   * @param {HTMLElement} element DOM element owned by this operation.
   * @param {Object} options Options that configure this operation.
   * @param {string} filename File name or relative asset path.
   * @param {unknown} source Source data consumed without taking ownership of its storage.
   * @returns {void}
   */
  const appendViewerControls = (element, options, filename, source) => {
    const controls = document.createElement("div");
    controls.className = "byVIEWcontrols";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = document.createElement("small");
    info.className = "byVIEWinfo";
    info.innerHTML = /* HTML */ `<a href="https://github.com/byuwur/easy-json-viewer" target="_blank" rel="noopener noreferrer">easy-json-viewer</a> · v${byJSONviewer.VERSION} ·
      <a href="https://byuwur.co" target="_blank" rel="noopener noreferrer">@byUwUr</a>`;
    element.appendChild(info);
    if (options.themeToggle) appendThemeToggle(controls, filename);
    if (options.fontSizeControls) appendFontSizeControls(element, controls);
    if (options.copyButton) appendCopyButton(controls, () => JSON.stringify(source, (_, value) => (typeof value === "bigint" || isBigNumber(value, options) ? value.toString() : value), 2) ?? "null", "Copy JSON");
    if (controls.childNodes.length) element.appendChild(controls);
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
   * @param {boolean} [options.forceMonospace=false] - Force a system monospace font when using a target other than <pre>.
   * @param {number} [options.chunkSize=1000] - Number of elements rendered per chunk.
   * @param {number} [options.chunkLatency=25] - Milliseconds before and between chunks.
   * @param {boolean} [options.themeToggle=true] - Adds the theme toggle.
   * @param {boolean} [options.fontSizeControls=true] - Adds viewer-local text size controls.
   * @param {boolean} [options.copyButton=true] - Adds a clipboard copy button.
   * @returns {void}
   * @throws {TypeError}
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
    element.classList.toggle("byJSONmonospace", Boolean(normalizedOptions.forceMonospace));
    appendViewerControls(element, normalizedOptions, "json", json);
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
  byJSONviewer.VERSION = "2.10"; // 2026-10-17
  global.byJSONviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
