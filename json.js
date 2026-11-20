"use strict";
/*
 * File: json.js
 * Desc: Contains the heart of JSON.view.
 * Deps: none
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/json.view
 */
(function (global) {
  // ===== INITIALIZATION =====
  if (global.byJSONviewer?.initialized) return;

  // ===== METADATA =====
  byJSONviewer.VERSION = "4.2"; // 2026-11-20
  // Mirrored helpers are checked by code.view/.github/scripts/check-family.mjs.
  const componentName = "JSON.view";
  const themeFile = "json";
  const documentClass = "byJSONdocument";
  const contentSelector = ":scope > .byVIEWcontent > .byVIEWpanel > .byJSONcontent";

  // Keep render state tied to each target element
  // ===== STATE =====
  const renderTokens = new WeakMap();

  // ===== HELPERS =====

  /**
   * Applies defaults and validates renderer options.
   * @param {Object} options - User options.
   * @return {Object} Normalized options.
   */
  const normalizeOptions = (options) => {
    const source = options && typeof options === "object" ? options : {};
    const {
      collapsible = true,
      collapsed = false,
      rootCollapsible = true,
      withQuotes = true,
      withLinks = true,
      bigNumbers = false,
      forceMonospace = false,
      toolbar = true,
      credits = true,
      displayContainer = true,
      statusBar = true,
      themeToggle = true,
      fontSizeControls = true,
      copyButton = true,
      controlsCompact = true,
      animations = true,
      appearAnimation = false,
      ...otherOptions
    } = source;
    const normalized = {
      chunkSize: 1000,
      chunkLatency: 25,
      controlsSize: "regular",
      controlsPosition: "top",
      ...otherOptions,
      collapsible,
      collapsed,
      rootCollapsible,
      withQuotes,
      withLinks,
      bigNumbers,
      forceMonospace,
      toolbar,
      credits,
      displayContainer,
      statusBar,
      themeToggle,
      fontSizeControls,
      copyButton,
      controlsCompact,
      animations,
      appearAnimation
    };
    if (!normalized.collapsible) normalized.collapsed = false;
    // Keep chunk values valid before scheduling renders
    normalized.chunkSize = Number.isFinite(normalized.chunkSize) && normalized.chunkSize >= 1 ? Math.floor(normalized.chunkSize) : 1000;
    normalized.chunkLatency = Number.isFinite(normalized.chunkLatency) && normalized.chunkLatency >= 0 ? normalized.chunkLatency : 25;
    return normalized;
  };

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
  const isBigNumber = (value, options) => {
    if (!options.bigNumbers || !value || typeof value !== "object" || (typeof value.toExponential !== "function" && value.isLosslessNumber !== true)) return false;
    if (typeof value.toString !== "function" || value.toString === Object.prototype.toString) return false;
    try {
      const text = value.toString();
      return typeof text === "string" && /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|Infinity|NaN)$/i.test(text);
    } catch {
      return false;
    }
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

  const node = (tag, className = "", text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };

  // ===== APPEARANCE =====
  const extraPalettes = new Set([
    "dracula",
    "darcula",
    "nord",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "rose-pine",
    "rose-pine-moon",
    "gruvbox",
    "gruvbox-material",
    "tokyo-night",
    "tokyo-storm",
    "tokyo-moon",
    "one",
    "material",
    "material-ocean",
    "night-owl",
    "synthwave",
    "ayu",
    "everforest",
    "kanagawa",
    "selenized",
    "vscode",
    "monokai-dimmed",
    "discord",
    "slack",
    "bonyur",
    "sakura",
    "bubblegum",
    "candy",
    "rose-gold",
    "lavender",
    "cyberpunk",
    "sunset",
    "volcano",
    "amber",
    "terminal",
    "paper",
    "ink",
    "ocean",
    "forest",
    "mint",
    "ice",
    "sepia"
  ]);
  const warnedPalettes = new Set();
  const warnMissingThemes = (element, palette = element.dataset.theme) => {
    if (!extraPalettes.has(palette) || warnedPalettes.has(palette)) return;
    const document = element.ownerDocument;
    if (document.defaultView.getComputedStyle(document.documentElement).getPropertyValue(`--by-${themeFile}-themes-loaded`).trim() === "1") return;
    warnedPalettes.add(palette);
    console.warn(`${componentName}: Palette "${palette}" requires ${themeFile}.themes.css. Import it after ${themeFile}.css. https://${themeFile}.byuwur.co/`);
  };

  const getLocalTheme = (target) => {
    if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
    if (target.classList.contains("dark")) return "dark";
    if (target.classList.contains("light")) return "light";
    return target.dataset.theme ? "light" : null;
  };

  const setLocalTheme = (element, mode, palette) => {
    element.classList.toggle("light", mode === "light");
    element.classList.toggle("dark", mode === "dark");
    if (palette != null) element.dataset.theme = palette;
    else if (["light", "dark"].includes(element.dataset.theme)) element.dataset.theme = mode;
  };

  // Explicit appearance options override markup; omitted values preserve the container's state.
  const applyAppearance = (element, options) => {
    const { theme, palette, fontSize } = options;
    if (theme != null && !["light", "dark"].includes(theme)) throw new RangeError("Theme must be light or dark.");
    if (palette != null && (typeof palette !== "string" || !/^[a-z][\w-]*$/i.test(palette) || ["light", "dark"].includes(palette))) throw new RangeError("Palette must be a CSS theme name; use theme for light or dark.");
    warnMissingThemes(element, palette ?? element.dataset.theme);
    const size = typeof fontSize === "number" ? `${Math.max(0.5, Math.min(3, fontSize))}rem` : typeof fontSize === "string" ? `clamp(0.5rem, ${fontSize}, 3rem)` : "";
    if (fontSize != null && (typeof fontSize === "number" ? !Number.isFinite(fontSize) : typeof fontSize !== "string" || !CSS.supports("font-size", size))) throw new RangeError("Font size must be a finite multiplier or a CSS size.");
    // Keep palette identity in data-theme while light/dark classes select its mode.
    if (theme != null || palette != null) setLocalTheme(element, theme ?? getLocalTheme(element) ?? "light", palette);
    return size;
  };

  const applyContentAppearance = (element, options, content) => {
    const size = applyAppearance(element, options);
    const previous = element.querySelector(contentSelector);
    content.style.fontSize = size || previous?.style.fontSize || "";
    content.dataset.byViewDefaultFontSize = size || previous?.dataset.byViewDefaultFontSize || "";
  };

  const syncMotion = (element, options) => {
    const enabled = options.animations !== false;
    const appear = enabled && Boolean(options.appearAnimation);
    element.classList.toggle("byVIEWmotion", enabled);
    element.classList.toggle("byVIEWappear", appear);
    return appear;
  };

  // ===== CONTROLS =====
  // Mirrored across the family so each viewer can run without a shared runtime.
  const createThemeButton = () => {
    const button = node("button", "byVIEWthemeToggle");
    button.type = "button";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    return button;
  };

  /**
   * Adds container light/dark controls, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @param {HTMLElement} controls Toolbar control group.
   * @returns {{button: HTMLButtonElement, sync: Function}} Mounted theme control.
   */
  const appendThemeToggle = (element, controls) => {
    const themePattern = new RegExp(`^([^?#]*/)?${themeFile}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => getLocalTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = createThemeButton();
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles = !getLocalTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(`.${documentClass} > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle`)] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && getLocalTheme(toggle.closest(`.${documentClass}`))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!getLocalTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${themeFile}.${next}.css${suffix}`)
        );
      } else {
        // Preserve attribute-only themes and keep existing mode classes in sync.
        const palette = element.dataset.theme;
        if (!element.matches(".light, .dark") && (!palette || ["light", "dark"].includes(palette))) element.dataset.theme = next;
        else setLocalTheme(element, next, palette === "" ? next : undefined);
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    controls.appendChild(button);
    return { button, sync };
  };

  /**
   * Adds text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @param {HTMLElement} controls - Toolbar that receives the controls.
   * @return {{group: HTMLElement, sync: Function}} Mounted text size controls.
   */
  const appendFontSizeControls = (element, controls) => {
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
    return { group: sizes, sync };
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
    return button;
  };

  // Keep the toolbar mounted while the current renderer applies option changes.
  const mountControls = (element, content, initialOptions, getText, version, copyLabel = "Copy source") => {
    const toolbar = node("div", "byVIEWtoolbar");
    const controls = node("div", "byVIEWcontrols");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = node("small", "byVIEWinfo");
    for (const [text, href] of [
      [componentName, `https://github.com/byuwur/${themeFile}.view`],
      ["@byUwUr", "https://byuwur.co"]
    ]) {
      const link = node("a", "", text);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (info.childNodes.length) info.append(` · v${version} · `);
      info.appendChild(link);
    }
    const theme = appendThemeToggle(element, controls);
    const sizes = appendFontSizeControls(content, controls);
    const copy = appendCopyButton(controls, getText, copyLabel);
    const update = (options, changes = {}) => {
      if ("fontSize" in changes || "theme" in changes || "palette" in changes) {
        applyContentAppearance(element, changes, content);
        theme.sync();
        sizes.sync();
      }
      Object.assign(options, changes);
      if ("animations" in changes || "appearAnimation" in changes) syncMotion(element, options);
      element.classList.toggle("byVIEWcompact", options.controlsCompact !== false);
      const bottom = options.controlsPosition === "bottom";
      toolbar.dataset.size = ["xs", "small", "regular", "large", "xl"].includes(options.controlsSize) ? options.controlsSize : "regular";
      if (!toolbar.childElementCount || ["credits", "themeToggle", "fontSizeControls", "copyButton"].some((key) => key in changes)) {
        controls.replaceChildren();
        if (options.themeToggle !== false) controls.appendChild(theme.button);
        if (options.fontSizeControls !== false) controls.appendChild(sizes.group);
        if (options.copyButton !== false) controls.appendChild(copy);
        toolbar.replaceChildren();
        if (options.credits !== false) toolbar.appendChild(info);
        if (controls.childElementCount) toolbar.appendChild(controls);
      }
      const visible = options.toolbar !== false && toolbar.childElementCount > 0;
      element.classList.toggle("byVIEWbottom", visible && bottom);
      if (!visible) toolbar.remove();
      else if (bottom && toolbar !== element.lastElementChild) element.appendChild(toolbar);
      else if (!bottom && toolbar !== element.firstElementChild) element.prepend(toolbar);
    };
    update(initialOptions);
    return update;
  };

  // ===== RENDERING =====
  /**
   * Sets the collapsed state of a toggle and its related elements.
   * @param {HTMLElement} toggle - Toggle element.
   * @param {boolean} collapsed - Desired state.
   * @returns {void}
   */
  const setToggleState = (toggle, collapsed) => {
    toggle.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${toggle.dataset.label}`);
    const parent = toggle.parentElement;
    const nest = parent?.querySelector(":scope > .byJSONnest");
    // Move focus before inert removes the active descendant from keyboard navigation.
    if (collapsed && nest?.contains(document.activeElement)) toggle.focus();
    nest?.classList.toggle("collapsed", collapsed);
    if (nest) nest.inert = collapsed;
    const placeholder = parent?.querySelector(":scope > .byJSONplaceholder");
    placeholder?.classList.toggle("collapsed", collapsed);
    placeholder?.setAttribute("aria-expanded", String(!collapsed));
  };

  /**
   * Appends an item count that expands its sibling disclosure.
   * @param {HTMLElement} parent - Collection container.
   * @param {number} count - Collection size.
   * @returns {void}
   */
  const appendPlaceholder = (parent, count) => {
    const toggle = parent.querySelector(":scope > .byJSONtoggle");
    // Keep noninteractive item counts for custom styles when this collection has no disclosure.
    const element = document.createElement(toggle ? "button" : "span");
    element.className = "byJSONplaceholder";
    element.textContent = `${count} item${count === 1 ? "" : "s"}`;
    parent.appendChild(element);
    if (!toggle) return;
    element.type = "button";
    element.setAttribute("aria-label", `Expand ${toggle.dataset.label}: ${element.textContent}`);
    element.setAttribute("aria-expanded", toggle.getAttribute("aria-expanded"));
    element.addEventListener("click", (event) => {
      event.preventDefault();
      toggle.click();
      // The count disappears when expanded; keep keyboard focus on its disclosure.
      toggle.focus();
    });
  };

  /**
   * Adds collapse/expand behavior to a toggle.
   * @param {HTMLElement} element - Toggle element.
   * @returns {void}
   */
  const addToggleListener = (element) => {
    setToggleState(element, false);
    // Native buttons translate Enter and Space into one click without a separate key handler.
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const toggle = event.currentTarget;
      toggle.parentElement.classList.add("byVIEWreveal");
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
    if (options.collapsible && isCollapsible(item) && !isBigNumber(item, options)) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "byJSONtoggle";
      // Name nested controls from the visible key or a one-based array position.
      toggle.dataset.label = isObj ? key : `item ${parent.children.length + 1}`;
      li.appendChild(toggle);
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
   * Appends a value and schedules its descendants in chunks using the same cancellation token.
   * Collapsed branches still render; disclosure changes visibility, not data ownership.
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
      // Only the supported URL schemes become anchors; all other strings remain inert text.
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
              // Use the original array position for commas even though each chunk is rendered later.
              const index = offset + itemIndex;
              appendLI(ol, item, options, token, index === json.length - 1);
            });
          },
          options.chunkLatency * (chunkIndex + 1)
        );
      });
      // Show item count while collapsed
      appendPlaceholder(element, json.length);
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
      appendPlaceholder(element, entries.length);
      return element.appendChild(document.createTextNode("}"));
    }
    // Parsed JSON shouldn't reach this, but fail safely if it does
    return appendSPAN(element, "null");
  };

  // ===== LIFECYCLE =====
  /**
   * Cancels an unfinished render on the given element.
   * @param {HTMLElement} element - Renderer element.
   * @returns {void}
   */
  const cancelExistingRender = (element) => {
    const token = renderTokens.get(element);
    if (!token) return;
    token.cancel = true;
    token.finish?.(false);
    cancelAnimationFrame(token.motionFrame);
    token.timers.forEach((timer) => clearTimeout(timer));
    token.timers.clear();
  };

  /**
   * Schedule a chunk owned by this render. Cancellation clears every nested timer.
   * @param {Object} token - Render token.
   * @param {Function} callback - Work to execute.
   * @param {number} delay - Delay in milliseconds.
   * @returns {void}
   */
  const schedule = (token, callback, delay) => {
    if (token.cancel) return;
    const timer = setTimeout(() => {
      // Remove fired timers so cancellation tracks only work that is still pending.
      token.timers.delete(timer);
      if (!token.cancel) callback();
      if (!token.timers.size) token.finish?.(true);
    }, delay);
    // Track timers so stale renders can be cleared
    token.timers.add(timer);
  };

  // ===== PUBLIC API =====
  /**
   * Replace a target with a chunked JSON tree. Returns immediately; descendants finish on timers.
   * The caller retains the value; Copy serializes that value rather than the displayed DOM.
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
   * @param {boolean} [options.displayContainer=true] - Show the content frame and allow status information.
   * @param {boolean} [options.statusBar=true] - Show the root value type and entry count when displayContainer is true.
   * @param {"light"|"dark"} [options.theme] - Initial mode; overrides the container.
   * @param {string} [options.palette] - Named CSS palette for data-theme.
   * @param {number|string} [options.fontSize] - Number in rem or CSS size, bounded to 0.5rem through 3rem.
   * @param {boolean} [options.themeToggle=true] - Adds the theme toggle.
   * @param {boolean} [options.fontSizeControls=true] - Adds viewer-local text size controls.
   * @param {boolean} [options.copyButton=true] - Adds a clipboard copy button.
   * @param {"xs"|"small"|"regular"|"large"|"xl"} [options.controlsSize="regular"] - Sets the control size; invalid values use regular.
   * @param {boolean} [options.animations=true] - Enable brief interaction motion, overriding the system preference.
   * @param {boolean} [options.controlsCompact=true] - Places attribution beside the controls, wrapping as needed.
   * @param {"top"|"bottom"} [options.controlsPosition="top"] - Keeps the toolbar at the scroll area's top or bottom while the viewer is visible; invalid values use top.
   * @returns {{ready: Promise<boolean>, setOptions: Function}} Mounted viewer.
   * @throws {TypeError|RangeError}
   */
  function byJSONviewer(element, json, options = {}) {
    if (!element || typeof element.appendChild !== "function") throw new TypeError("byJSONviewer(): element must be a DOM element.");
    // Validate options before canceling the current tree so rejected input cannot interrupt its pending chunks.
    const normalizedOptions = normalizeOptions(options);
    const body = document.createElement("div");
    body.className = "byVIEWcontent";
    const content = document.createElement("div");
    content.className = "byJSONcontent";
    applyContentAppearance(element, normalizedOptions, content);
    // Cancel unfinished work before rendering again on the same element
    cancelExistingRender(element);
    // Every nested chunk shares this token, so replacement cancels the entire pending tree.
    const token = { cancel: false, timers: new Set() };
    renderTokens.set(element, token);
    element.textContent = "";
    element.classList.add(documentClass);
    const appear = syncMotion(element, normalizedOptions);
    // Paint opacity 0 before starting each requested fade.
    if (appear) element.classList.remove("byVIEWready");
    if (!element.classList.contains("byVIEWready")) {
      token.motionFrame = requestAnimationFrame(() => {
        token.motionFrame = requestAnimationFrame(() => {
          if (!token.cancel) element.classList.add("byVIEWready");
        });
      });
    }
    element.classList.toggle("byVIEWplain", !normalizedOptions.displayContainer);
    element.classList.toggle("byJSONmonospace", Boolean(normalizedOptions.forceMonospace));
    const panel = document.createElement("div");
    panel.className = "byVIEWpanel";
    const status = document.createElement("p");
    status.className = "byVIEWstatus";
    status.setAttribute("role", "status");
    panel.append(status, content);
    body.appendChild(panel);
    element.appendChild(body);
    let ready;
    const renderTree = () => {
      if (!token.finish) {
        ready = new Promise((resolve) => {
          token.finish = (rendered) => {
            token.finish = null;
            resolve(rendered);
          };
        });
      }
      content.replaceChildren();
      const array = Array.isArray(json);
      const collection = json !== null && typeof json === "object" && !isBigNumber(json, normalizedOptions);
      const count = array ? json.length : collection ? Object.keys(json).length : 0;
      // Summarize the root without walking descendants ahead of their scheduled chunks.
      let type = "Null";
      if (collection) type = array ? "Array" : "Object";
      else if (typeof json === "string") type = "String";
      else if (typeof json === "boolean") type = "Boolean";
      else if ((typeof json === "number" && Number.isFinite(json)) || typeof json === "bigint" || isBigNumber(json, normalizedOptions)) type = "Number";
      status.textContent = collection ? `${type} · ${count} ${array ? (count === 1 ? "item" : "items") : count === 1 ? "property" : "properties"}` : type;
      status.hidden = !normalizedOptions.statusBar;
      // Add the root toggle when applicable
      let rootToggle = null;
      if (normalizedOptions.collapsible && normalizedOptions.rootCollapsible && isCollapsible(json) && !isBigNumber(json, normalizedOptions)) {
        rootToggle = document.createElement("button");
        rootToggle.type = "button";
        rootToggle.className = "byJSONtoggle";
        rootToggle.dataset.label = "root";
        content.appendChild(rootToggle);
        addToggleListener(rootToggle);
      }
      // Render JSON and apply the initial root state
      json2html(content, json, normalizedOptions, token);
      if (rootToggle && normalizedOptions.collapsed) setToggleState(rootToggle, true);
      if (!token.timers.size) token.finish(true);
    };
    renderTree();
    const getText = () => JSON.stringify(json, (_, value) => (typeof value === "bigint" || isBigNumber(value, normalizedOptions) ? value.toString() : value), 2) ?? "null";
    const updateControls = mountControls(element, content, normalizedOptions, getText, byJSONviewer.VERSION, "Copy JSON");
    return {
      get ready() {
        return ready;
      },
      setOptions(changes) {
        if (token.cancel) return;
        const next = normalizeOptions({ ...normalizedOptions, ...changes });
        const redraw =
          ["withLinks", "collapsible", "rootCollapsible", "withQuotes", "bigNumbers"].some((key) => next[key] !== normalizedOptions[key]) ||
          (token.timers.size > 0 && (next.chunkSize !== normalizedOptions.chunkSize || next.chunkLatency !== normalizedOptions.chunkLatency));
        updateControls(normalizedOptions, changes);
        Object.assign(normalizedOptions, next);
        element.classList.toggle("byVIEWplain", !next.displayContainer);
        element.classList.toggle("byJSONmonospace", Boolean(next.forceMonospace));
        status.hidden = !next.statusBar;
        if (redraw) {
          token.timers.forEach(clearTimeout);
          token.timers.clear();
          renderTree();
          return ready;
        } else if ("collapsed" in changes) {
          for (const toggle of content.querySelectorAll(".byJSONtoggle")) setToggleState(toggle, next.collapsed);
        }
      }
    };
  }
  // ===== EXPORT =====
  global.byJSONviewer = byJSONviewer;
  byJSONviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
