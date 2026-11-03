"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of easy JSON viewer.
 * Deps: none
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-json-viewer
 */
(function (global) {
  /* --- SETUP --- */
  if (global.byJSONviewer?.initialized) return;
  // Keep render state tied to each target element
  const renderTokens = new WeakMap();

  /**
   * Checks if a value is a non-empty collapsible object or array.
   * @param {*} arg - The value to check.
   * @return {boolean} True if the value is collapsible, otherwise false.
   */
  /* --- CONTENT --- */
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
      collapsible: true,
      collapsed: false,
      rootCollapsible: true,
      withQuotes: true,
      withLinks: true,
      bigNumbers: false,
      forceMonospace: false,
      chunkSize: 1000,
      chunkLatency: 25,
      toolbar: true,
      credits: true,
      themeToggle: true,
      fontSizeControls: true,
      copyButton: true,
      controlsSize: "regular",
      controlsCompact: true,
      controlsPosition: "top",
      ...source
    };
    if (normalized.collapsible === false) normalized.collapsed = false;
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
    const parent = toggle.parentElement;
    parent?.querySelector(":scope > .byJSONnest")?.classList.toggle("collapsed", collapsed);
    parent?.querySelector(":scope > .byJSONplaceholder")?.classList.toggle("collapsed", collapsed);
  };

  /**
   * Makes a placeholder trigger its sibling toggle.
   * @param {HTMLElement} element - Placeholder element.
   * @returns {void}
   */
  const addPlaceholderListener = (element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.currentTarget.parentElement?.querySelector(":scope > .byJSONtoggle")?.click();
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
    if (options.collapsible !== false && isCollapsible(item) && !isBigNumber(item, options)) {
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

  /* --- CONTROLS --- */
  /**
   * Adds container light/dark controls, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @param {HTMLElement} controls Toolbar control group.
   * @param {string} filename Legacy theme stylesheet basename.
   * @returns {HTMLButtonElement} Theme toggle button.
   */
  const appendThemeToggle = (element, controls, filename) => {
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const themePattern = new RegExp(`^([^?#]*/)?${escapedFilename}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    // Explicit container state takes precedence over a shared legacy stylesheet.
    const localTheme = (target) => {
      if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
      if (target.classList.contains("dark")) return "dark";
      if (target.classList.contains("light")) return "light";
      return target.dataset.theme ? "light" : null;
    };
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => localTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles = !localTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(".byJSONdocument > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle")] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && localTheme(toggle.closest(".byJSONdocument"))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!localTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${filename}.${next}.css${suffix}`)
        );
      } else if (element.dataset.theme && !["light", "dark"].includes(element.dataset.theme)) {
        // Named palettes stay selected while only the mode changes.
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      } else if (element.hasAttribute("data-theme") || (!element.classList.contains("light") && !element.classList.contains("dark"))) {
        element.dataset.theme = next;
      } else {
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    return controls.appendChild(button);
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
    const getSize = () => (parseFloat(getComputedStyle(element).fontSize) || 16) / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
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
      const size = getSize();
      decrease.disabled = size <= 0.5;
      increase.disabled = size >= 3;
    };
    for (const [button, step] of [
      [decrease, -0.125],
      [increase, 0.125]
    ]) {
      button.addEventListener("click", () => {
        const size = Math.max(0.5, Math.min(3, getSize() + step));
        element.style.fontSize = `${size}rem`;
        sync();
      });
    }
    reset.addEventListener("click", () => {
      element.style.fontSize = element.dataset.byViewDefaultFontSize;
      sync();
    });
    sync();
    return sizes;
  };

  /**
   * Add a copy action for the complete source, including content outside the visible rendered chunk.
   * @param {HTMLElement} controls Toolbar control group.
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
    caption.setAttribute("aria-live", "polite");
    button.appendChild(caption);
    const reset = () => {
      if (button.dataset.state === "error") return;
      delete button.dataset.state;
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
        button.dataset.state = "success";
      } catch {
        caption.textContent = "Failed";
        button.dataset.state = "error";
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
    const toolbar = document.createElement("div");
    toolbar.className = "byVIEWtoolbar";
    toolbar.dataset.size = ["small", "regular", "large"].includes(options.controlsSize) ? options.controlsSize : "regular";
    element.classList.toggle("byVIEWcompact", options.controlsCompact !== false);
    element.classList.toggle("byVIEWbottom", options.controlsPosition === "bottom");
    const controls = document.createElement("div");
    controls.className = "byVIEWcontrols";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = document.createElement("small");
    info.className = "byVIEWinfo";
    info.innerHTML = /* HTML */ `<a href="https://github.com/byuwur/easy-json-viewer" target="_blank" rel="noopener noreferrer">easy-json-viewer</a> · v${byJSONviewer.VERSION} ·
      <a href="https://byuwur.co" target="_blank" rel="noopener noreferrer">@byUwUr</a>`;
    if (options.credits !== false) toolbar.appendChild(info);
    if (options.themeToggle) appendThemeToggle(element, controls, filename);
    if (options.fontSizeControls) appendFontSizeControls(element, controls);
    if (options.copyButton) appendCopyButton(controls, () => JSON.stringify(source, (_, value) => (typeof value === "bigint" || isBigNumber(value, options) ? value.toString() : value), 2) ?? "null", "Copy JSON");
    if (controls.childNodes.length) toolbar.appendChild(controls);
    if (options.toolbar === false || !toolbar.childNodes.length) {
      element.classList.remove("byVIEWbottom");
      return;
    }
    if (options.controlsPosition === "bottom") element.appendChild(toolbar);
    else element.prepend(toolbar);
  };

  /* --- PUBLIC API --- */
  /**
   * Renders JSON-compatible data into an HTML element with collapsible nodes.
   * @param {HTMLElement} element - DOM element where the JSON will be rendered.
   * @param {*} json - JSON-compatible data to render.
   * @param {Object} [options] - Configuration options.
   * @param {boolean} [options.collapsible=true] - Show disclosure controls; false keeps all nodes expanded.
   * @param {boolean} [options.collapsed=false] - Collapse nested arrays/objects by default.
   * @param {boolean} [options.rootCollapsible=true] - Make the root array/object collapsible.
   * @param {boolean} [options.withQuotes=true] - Wrap object keys in double quotes.
   * @param {boolean} [options.withLinks=true] - Render URL strings as clickable links.
   * @param {boolean} [options.bigNumbers=false] - Support compatible big-number objects.
   * @param {boolean} [options.forceMonospace=false] - Force a system monospace font when using a target other than <pre>.
   * @param {number} [options.chunkSize=1000] - Number of elements rendered per chunk.
   * @param {number} [options.chunkLatency=25] - Milliseconds before and between chunks.
   * @param {boolean} [options.toolbar=true] - Show the viewer header.
   * @param {boolean} [options.credits=true] - Show attribution in the header.
   * @param {boolean} [options.themeToggle=true] - Adds the theme toggle.
   * @param {boolean} [options.fontSizeControls=true] - Adds viewer-local text size controls.
   * @param {boolean} [options.copyButton=true] - Adds a clipboard copy button.
   * @param {"small"|"regular"|"large"} [options.controlsSize="regular"] - Sets the control size; invalid values use regular.
   * @param {boolean} [options.controlsCompact=true] - Places attribution beside the controls, wrapping as needed.
   * @param {"top"|"bottom"} [options.controlsPosition="top"] - Keeps the toolbar at the scroll area's top or bottom while the viewer is visible; invalid values use top.
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
    const content = document.createElement("div");
    content.className = "byJSONcontent";
    element.appendChild(content);
    // Add the root toggle when applicable
    let rootToggle = null;
    if (normalizedOptions.collapsible !== false && normalizedOptions.rootCollapsible && isCollapsible(json) && !isBigNumber(json, normalizedOptions)) {
      rootToggle = appendA(content, "byJSONtoggle");
      addToggleListener(rootToggle);
    }
    // Render JSON and apply the initial root state
    json2html(content, json, normalizedOptions, token);
    if (rootToggle && normalizedOptions.collapsed) setToggleState(rootToggle, true);
    appendViewerControls(element, normalizedOptions, "json", json);
  }
  global.byJSONviewer = byJSONviewer;
  byJSONviewer.VERSION = "3"; // 2026-11-01
  global.byJSONviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
