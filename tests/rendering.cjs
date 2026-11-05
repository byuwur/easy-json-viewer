/*
 * File: tests/rendering.cjs
 * Desc: JSON library contracts using local renderer assets; playground checks live in playground.cjs.
 */

/* --- DEPENDENCIES --- */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const test = require("node:test");
const { chromium } = require("playwright");

/* --- THEME FIXTURES --- */
// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../json.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byJSONdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

/* --- STANDALONE RENDERER --- */
test("JSON rendering", async (t) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    const version = await page.evaluate(() => byJSONviewer.VERSION);
    assert.match(version, /^\d+(?:\.\d+)*$/);
    await t.test("duplicate imports preserve the installed renderer", async () => {
      await page.evaluate(() => {
        window.installedRenderer = byJSONviewer;
      });
      await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
      assert.equal(await page.evaluate(() => byJSONviewer === installedRenderer), true);
    });
    const benchmark = JSON.parse(await fs.readFile(path.join(__dirname, "../test.json"), "utf8"));
    const results = await page.evaluate(async (benchmark) => {
      const waitFor = async (verify) => {
        const deadline = Date.now() + 2000;
        while (!verify()) {
          if (Date.now() > deadline) throw new Error("Rendering timed out");
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      };
      const render = async (value, count = 0, options = {}) => {
        const root = document.createElement("div");
        byJSONviewer(root, value, { themeToggle: false, fontSizeControls: false, copyButton: false, chunkLatency: 0, ...options });
        await waitFor(() => root.querySelectorAll("li").length === count);
        root.querySelector(".byVIEWtoolbar").remove();
        root.querySelector(".byVIEWstatus").remove();
        return root;
      };
      const cases = [
        [
          "primitive values render",
          async () => {
            for (const [value, expected] of [
              [null, "null"],
              [true, "true"],
              [false, "false"],
              [0, "0"],
              [-12.5, "-12.5"],
              [42n, "42"],
              [Infinity, "null"],
              [NaN, "null"]
            ]) {
              if ((await render(value)).textContent !== expected) return false;
            }
            return true;
          }
        ],
        [
          "strings preserve JSON escapes and Unicode",
          async () => {
            const value = 'quotes " slash \\ newline\n\t\u00e1\ud83d\ude00';
            return (await render(value)).textContent === JSON.stringify(value);
          }
        ],
        [
          "HTML strings and keys stay inert",
          async () => {
            const root = await render({ [`<img src=x onerror=alert(1)>`]: `<script>alert(1)</script>` }, 1);
            return !root.querySelector("img, script") && root.textContent.includes(`<script>alert(1)</script>`);
          }
        ],
        [
          "empty collections have no toggles",
          async () => {
            const object = await render({});
            const array = await render([]);
            return object.textContent === "{}" && array.textContent === "[]" && !object.querySelector("a") && !array.querySelector("a");
          }
        ],
        [
          "nested objects and arrays render",
          async () => {
            const root = await render({ list: [1, { active: true }] }, 4);
            return root.querySelectorAll("ul").length === 2 && root.querySelectorAll("ol").length === 1 && root.querySelectorAll(".byJSONliteral")[1]?.textContent === "true";
          }
        ],
        [
          "chunked arrays keep order and commas",
          async () => {
            const root = await render([0, 1, 2, 3, 4], 5, { chunkSize: 2, chunkLatency: 5 });
            return [...root.querySelectorAll("ol > li")].map((li) => li.textContent).join("|") === "0,|1,|2,|3,|4";
          }
        ],
        [
          "chunked objects keep key order",
          async () => {
            const root = await render({ first: 1, second: 2, third: 3 }, 3, { chunkSize: 1, chunkLatency: 5 });
            return [...root.querySelectorAll("ul > li")].map((li) => li.textContent).join("|") === '"first": 1,|"second": 2,|"third": 3';
          }
        ],
        [
          "invalid chunk options use defaults",
          async () => {
            const root = await render([1, 2], 2, { chunkSize: 0, chunkLatency: -1 });
            return root.querySelectorAll("li").length === 2;
          }
        ],
        [
          "collapse and placeholder restore the root",
          async () => {
            const root = await render([1, 2], 2, { collapsed: true });
            const toggle = root.querySelector(".byJSONtoggle");
            if (toggle.getAttribute("aria-expanded") !== "false" || !root.querySelector("ol").classList.contains("collapsed")) return false;
            root.querySelector(".byJSONplaceholder").click();
            return toggle.getAttribute("aria-expanded") === "true" && !root.querySelector("ol").classList.contains("collapsed");
          }
        ],
        [
          "nested collapse works without a root toggle",
          async () => {
            const root = await render({ child: [1] }, 2, { rootCollapsible: false, collapsed: true });
            const toggle = root.querySelector(".byJSONtoggle");
            if (root.querySelector(".byJSONcontent").firstElementChild.tagName !== "UL" || toggle.getAttribute("aria-expanded") !== "false") return false;
            toggle.click();
            return toggle.getAttribute("aria-expanded") === "true";
          }
        ],
        [
          "unquoted keys preserve values",
          async () => {
            const root = await render({ name: "John" }, 1, { withQuotes: false });
            return root.querySelector("li").textContent === 'name: "John"';
          }
        ],
        [
          "supported URL protocols get safe links",
          async () => {
            for (const value of ["https://example.com", "http://example.com", "ftp://example.com", "ftps://example.com"]) {
              const link = (await render(value)).querySelector("a");
              if (link?.getAttribute("href") !== value || link.target !== "_blank" || link.rel !== "noopener noreferrer") return false;
            }
            return true;
          }
        ],
        [
          "executable URLs stay text",
          async () => {
            for (const value of ["javascript:alert(1)", `data:text/html,<script>alert(1)</script>`]) {
              if ((await render(value)).querySelector("a")) return false;
            }
            return true;
          }
        ],
        ["links can be disabled", async () => !(await render("https://example.com", 0, { withLinks: false })).querySelector("a")],
        [
          "big-number objects render as scalars",
          async () => {
            const value = { isLosslessNumber: true, toString: () => "900719925474099312345" };
            const root = await render(value, 0, { bigNumbers: true });
            return root.textContent === value.toString() && !root.querySelector(".byJSONtoggle");
          }
        ],
        [
          "rerender cancels pending chunks",
          async () => {
            const root = document.createElement("div");
            const options = { themeToggle: false, fontSizeControls: false, chunkSize: 1, chunkLatency: 10 };
            byJSONviewer(root, ["stale", "stale", "stale"], options);
            byJSONviewer(root, ["current"], options);
            await new Promise((resolve) => setTimeout(resolve, 60));
            return root.querySelectorAll("li").length === 1 && root.querySelector("li").textContent === '"current"';
          }
        ],
        [
          "separate viewers render independently",
          async () => {
            const [first, second] = await Promise.all([render([1, 2], 2), render({ value: 3 }, 1)]);
            return first.querySelectorAll("li").length === 2 && second.querySelector("li").textContent === '"value": 3';
          }
        ],
        [
          "invalid targets throw TypeError",
          async () => {
            try {
              byJSONviewer(null, {});
            } catch (error) {
              return error instanceof TypeError;
            }
            return false;
          }
        ],
        [
          "benchmark document renders completely",
          async () => {
            const countItems = (value) => (value && typeof value === "object" ? Object.values(value).reduce((count, item) => count + 1 + countItems(item), 0) : 0);
            const root = await render(benchmark, countItems(benchmark));
            return root.classList.contains("byJSONdocument") && root.querySelectorAll("li").length === countItems(benchmark);
          }
        ]
      ];
      const results = [];
      for (const [name, verify] of cases) {
        try {
          results.push({ name, passed: Boolean(await verify()) });
        } catch (error) {
          results.push({ name, passed: false, error: error.message });
        }
      }
      return results;
    }, benchmark);
    for (const { name, passed, error } of results) {
      await t.test(name, () => assert.ok(passed, error));
    }
    await t.test("versioned attribution survives rerender with optional controls disabled", async () => {
      await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
      const info = await page.evaluate(() => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const options = { themeToggle: false, fontSizeControls: false, copyButton: false, withLinks: false };
        byJSONviewer(root, null, options);
        byJSONviewer(root, true, options);
        const label = root.querySelector(".byVIEWinfo");
        const style = getComputedStyle(label);
        const info = {
          version: byJSONviewer.VERSION,
          text: label.textContent.replace(/\s+/g, " ").trim(),
          opacity: style.opacity,
          relativeSize: parseFloat(style.fontSize) / parseFloat(getComputedStyle(label.parentElement).fontSize),
          muted: style.color !== getComputedStyle(root).color,
          count: root.querySelectorAll(".byVIEWinfo").length,
          independent: !label.closest(".byVIEWcontrols"),
          controls: root.querySelectorAll(".byVIEWcontrols").length,
          buttons: root.querySelectorAll("button").length,
          links: [...label.querySelectorAll("a")].map((link) => [link.href, link.target, link.rel])
        };
        root.remove();
        return info;
      });
      assert.deepEqual(info, {
        version,
        text: `easy-json-viewer · v${version} · @byUwUr`,
        opacity: "0.25",
        relativeSize: 0.875,
        muted: true,
        count: 1,
        independent: true,
        controls: 0,
        buttons: 0,
        links: [
          ["https://github.com/byuwur/easy-json-viewer", "_blank", "noopener noreferrer"],
          ["https://byuwur.co/", "_blank", "noopener noreferrer"]
        ]
      });
    });
    await t.test("monospace is opt in for non-pre viewers and restores host fonts", async () => {
      const result = await page.evaluate(() => {
        const host = document.createElement("div");
        host.style.fontFamily = "serif";
        const root = document.createElement("div");
        root.style.fontFamily = "Arial, sans-serif";
        const neighbor = document.createElement("div");
        const pre = document.createElement("pre");
        host.append(root, neighbor, pre);
        document.body.appendChild(host);
        const options = { themeToggle: false, fontSizeControls: false, copyButton: false };
        try {
          byJSONviewer(root, "Default font", options);
          byJSONviewer(neighbor, "Host font", options);
          byJSONviewer(pre, "Native monospace", options);
          const defaultFont = getComputedStyle(root).fontFamily;
          const neighborFont = getComputedStyle(neighbor).fontFamily;
          const nativeFont = getComputedStyle(pre).fontFamily;
          byJSONviewer(root, "Opt in", { ...options, forceMonospace: true });
          const enabled = getComputedStyle(root).fontFamily;
          const valueFont = getComputedStyle(root.querySelector(".byJSONstring")).fontFamily;
          byJSONviewer(root, "Opt out", { ...options, forceMonospace: false });
          const restored = getComputedStyle(root).fontFamily;
          byJSONviewer(root, "Opt in again", { ...options, forceMonospace: true });
          byJSONviewer(root, "Defaults again", options);
          return { defaultFont, valueFont, neighborFont, nativeFont, restored, enabled, reset: getComputedStyle(root).fontFamily, inline: root.style.fontFamily };
        } finally {
          host.remove();
        }
      });
      assert.equal(result.defaultFont, "Arial, sans-serif");
      assert.equal(result.valueFont, result.enabled);
      assert.equal(result.neighborFont, "serif");
      assert.ok(result.nativeFont.includes("monospace"));
      assert.equal(result.restored, "Arial, sans-serif");
      assert.ok(result.enabled.includes("monospace"));
      assert.equal(result.reset, result.defaultFont);
      assert.equal(result.inline, "Arial, sans-serif");
    });
    await t.test("long text, keys, and URLs wrap inside narrow viewers", async () => {
      const root = await page.evaluateHandle(() => {
        const root = document.createElement("pre");
        root.style.boxSizing = "border-box";
        document.body.appendChild(root);
        byJSONviewer(
          root,
          {
            description: "A little less noise. A lot more JSON. ".repeat(8),
            nested: [`https://example.com/${"segment".repeat(30)}`, "unbroken".repeat(30)],
            ["longKey".repeat(30)]: true
          },
          { themeToggle: false, fontSizeControls: false, copyButton: false, chunkLatency: 0 }
        );
        return root;
      });
      try {
        await page.waitForFunction((root) => root.querySelectorAll("li").length === 5, root);
        for (const width of [320, 560]) {
          for (const fontSize of [13, 24]) {
            const result = await root.evaluate(
              (root, { width, fontSize }) => {
                root.style.width = `${width}px`;
                root.style.fontSize = `${fontSize}px`;
                const strings = [...root.querySelectorAll(".byJSONstring")];
                return {
                  fits: root.scrollWidth <= root.clientWidth,
                  wrapped: strings.every((string) => string.getClientRects().length > 1),
                  text: strings[0].textContent,
                  href: root.querySelector("a.byJSONstring").getAttribute("href")
                };
              },
              { width, fontSize }
            );
            assert.equal(result.fits, true, `Overflow at ${width}px with ${fontSize}px text`);
            assert.equal(result.wrapped, true, `Unwrapped text at ${width}px with ${fontSize}px text`);
            assert.equal(result.text, JSON.stringify("A little less noise. A lot more JSON. ".repeat(8)));
            assert.equal(result.href, `https://example.com/${"segment".repeat(30)}`);
          }
        }
      } finally {
        await root.evaluate((root) => root.remove());
        await root.dispose();
      }
    });
    await t.test("wrapped lines stay tighter than the gap between JSON entries", async () => {
      for (const tag of ["pre", "div"]) {
        const root = await page.evaluateHandle((tag) => {
          const root = document.createElement(tag);
          root.style.width = "320px";
          document.body.appendChild(root);
          byJSONviewer(root, { message: "A readable wrapped property value. ".repeat(8), next: "Another property" }, { chunkLatency: 0, controlsCompact: true });
          return root;
        }, tag);
        try {
          await page.waitForFunction((root) => root.querySelectorAll("li").length === 2, root);
          for (const fontSize of [13, 24]) {
            const spacing = await root.evaluate((root, fontSize) => {
              root.style.fontSize = `${fontSize}px`;
              const [message, next] = root.querySelectorAll(".byJSONstring");
              const lines = [...message.getClientRects()];
              return { lines: lines.length, wrap: lines[1].top - lines[0].top, entry: next.getBoundingClientRect().top - lines.at(-1).top };
            }, fontSize);
            assert.ok(spacing.lines > 1);
            assert.ok(spacing.wrap <= fontSize * 1.3, `${tag} at ${fontSize}px should keep wrapped lines compact`);
            assert.ok(spacing.entry > spacing.wrap + 2, `${tag} at ${fontSize}px should separate entries more than wrapped lines`);
          }
        } finally {
          await root.evaluate((root) => root.remove());
          await root.dispose();
        }
      }
    });
    await t.test("first nested entries have the same spacing as following entries", async () => {
      for (const tag of ["pre", "div"]) {
        const root = await page.evaluateHandle((tag) => {
          const root = document.createElement(tag);
          document.body.appendChild(root);
          byJSONviewer(root, { features: ["Collapsible nodes", "Light & dark", "Progressive rendering"], author: { name: "BONYUR", philosophy: "Simple is complicated enough." } }, { chunkLatency: 0 });
          return root;
        }, tag);
        try {
          await page.waitForFunction((root) => root.querySelectorAll("li").length === 7, root);
          for (const fontSize of [13, 24]) {
            const spacing = await root.evaluate((root, fontSize) => {
              root.style.fontSize = `${fontSize}px`;
              const textTop = (node) => {
                const range = document.createRange();
                range.selectNodeContents(node);
                return range.getBoundingClientRect().top;
              };
              return [...root.querySelectorAll("li > .byJSONnest")].map((list) => {
                const [first, second] = list.children;
                const top = textTop(first.firstChild);
                return { first: top - textTop(list.previousSibling), following: textTop(second.firstChild) - top };
              });
            }, fontSize);
            for (const gap of spacing) assert.ok(Math.abs(gap.first - gap.following) < 1, `${tag} at ${fontSize}px should space the first nested entry evenly: ${JSON.stringify(gap)}`);
          }
        } finally {
          await root.evaluate((root) => root.remove());
          await root.dispose();
        }
      }
    });
    await t.test("text size controls preserve position and keep the root disclosure inside its inset", async () => {
      const result = await page.evaluate(() => {
        const root = document.createElement("pre");
        document.body.appendChild(root);
        try {
          root.style.width = "320px";
          byJSONviewer(root, { property: "Text size sample" }, { themeToggle: false, fontSizeControls: true, copyButton: false });
          const top = root.getBoundingClientRect().top;
          const buttons = root.querySelectorAll(".byVIEWfontSize");
          while (!buttons[2].disabled) buttons[2].click();
          const maxSize = parseFloat(getComputedStyle(root).fontSize);
          const maxTop = root.getBoundingClientRect().top;
          const toggle = root.querySelector(".byJSONtoggle");
          const arrow = getComputedStyle(toggle, "::before");
          const arrowLeft = toggle.getBoundingClientRect().left + parseFloat(arrow.left);
          const bounds = root.getBoundingClientRect();
          const style = getComputedStyle(root);
          const inset = bounds.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const maxArrowVisible = arrowLeft >= inset && arrowLeft + parseFloat(arrow.width) <= bounds.right;
          const braces = [...root.querySelector(".byJSONcontent").childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
          const textLeft = (node) => {
            const range = document.createRange();
            range.selectNode(node);
            return range.getBoundingClientRect().left;
          };
          const bracesAligned = Math.abs(textLeft(braces[0]) - textLeft(braces.at(-1))) < 0.1;
          while (!buttons[0].disabled) buttons[0].click();
          const minTop = root.getBoundingClientRect().top;
          buttons[1].click();
          return { maxSize, top, maxTop, minTop, maxArrowVisible, bracesAligned, resetTop: root.getBoundingClientRect().top };
        } finally {
          root.remove();
        }
      });
      assert.equal(result.maxSize, 48);
      assert.equal(result.maxArrowVisible, true);
      assert.equal(result.bracesAligned, true);
      assert.equal(result.maxTop, result.top);
      assert.equal(result.minTop, result.top);
      assert.equal(result.resetTop, result.top);
    });
    await t.test("copy includes pending JSON, preserves large numbers, and handles clipboard failures", async () => {
      const result = await page.evaluate(async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const copies = [];
        let native = true;
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              if (!native) throw new Error("Denied");
              copies.push(text);
            }
          }
        });
        const clipboard = navigator.clipboard;
        const copy = async (shiftKey = false) => {
          const button = root.querySelector(".byVIEWcopy");
          button.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey }));
          await new Promise((resolve) => setTimeout(resolve, 0));
          return button.title;
        };
        try {
          byJSONviewer(
            root,
            { text: 'Unicode 👋 and "quotes"', list: [1, true, null], big: 900719925474099312345n, lossless: { isLosslessNumber: true, toString: () => "900719925474099399999" } },
            { bigNumbers: true, collapsed: true, chunkLatency: 1000, controlsSize: "small", controlsCompact: true, controlsPosition: "bottom" }
          );
          const pending = root.querySelectorAll("li").length === 0;
          const last = [...root.querySelectorAll(".byVIEWcontrols button")].at(-1).classList.contains("byVIEWcopy");
          await copy();
          const value = JSON.parse(copies[0]);
          const button = root.querySelector(".byVIEWcopy");
          const copied = button.textContent === "Copied!";
          button.dispatchEvent(new MouseEvent("mouseleave"));
          const reset = button.textContent === "Copy" && button.title === "Copy JSON";
          byJSONviewer(root, "latest", { themeToggle: false, fontSizeControls: false });
          await copy();
          const current = JSON.parse(copies[1]);
          const currentButton = root.querySelector(".byVIEWcopy");
          currentButton.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
          const blur = currentButton.textContent === "Copy" && currentButton.getAttribute("aria-label") === currentButton.title;
          native = false;
          const copyCount = copies.length;
          const failed = (await copy()).startsWith("Copy failed.") && root.querySelector(".byVIEWcopy").textContent === "Failed" && !root.querySelector(".byVIEWcopy").disabled && copies.length === copyCount;
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
          const unavailable = (await copy()).startsWith("Copy failed.") && !root.querySelector(".byVIEWcopy").disabled;
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
          native = true;
          const retried = (await copy()).startsWith("Copied!");
          byJSONviewer(root, null, { themeToggle: false, fontSizeControls: false, copyButton: false });
          const hidden = !root.querySelector(".byVIEWcontrols");
          return { pending, last, value, current, copied, reset, blur, failed, unavailable, retried, hidden };
        } finally {
          root.remove();
        }
      });
      assert.deepEqual(result, {
        pending: true,
        last: true,
        value: { text: 'Unicode 👋 and "quotes"', list: [1, true, null], big: "900719925474099312345", lossless: "900719925474099399999" },
        current: "latest",
        copied: true,
        reset: true,
        blur: true,
        failed: true,
        unavailable: true,
        retried: true,
        hidden: true
      });
    });
    await t.test("themes select their own stylesheet, preserve URLs, and keep other controls independent", async () => {
      const themed = await browser.newPage();
      try {
        await themed.route("https://themes.test/**", async (route) => {
          const file = path.basename(new URL(route.request().url()).pathname);
          if (/^json\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
          const body = file === "other.dark.css" ? "" : await fs.readFile(path.join(__dirname, "..", file));
          await route.fulfill({ body, contentType: "text/css" });
        });
        await themed.setContent(`<!doctype html>
          <link rel="stylesheet" href="https://themes.test/json.css">
          <link id="byVIEWtheme" rel="stylesheet" href="https://themes.test/other.dark.css">
          <link id="viewer-theme" rel="stylesheet" href="https://themes.test/json.light.css/archive/json.light.css?keep=json.light.css#json.light.css">
          <button id="host-control" class="byVIEWthemeToggle">Host control</button>
          <div id="first"></div><div id="second"></div>`);
        await themed.addScriptTag({ path: path.join(__dirname, "../json.js") });
        await themed.evaluate(() => {
          for (const id of ["first", "second"]) byJSONviewer(document.getElementById(id), "Content", { fontSizeControls: false, copyButton: false });
        });
        const palette = () =>
          themed.locator("#first").evaluate((root) => {
            const background = getComputedStyle(root).backgroundColor;
            const toolbar = getComputedStyle(root.querySelector(".byVIEWtoolbar button"));
            const credits = getComputedStyle(root.querySelector(".byVIEWinfo"));
            return { matched: getComputedStyle(root.querySelector(".byVIEWtoolbar")).backgroundColor === "rgba(0, 0, 0, 0)", opaque: !toolbar.backgroundColor.includes("rgba"), color: credits.color, opacity: credits.opacity };
          });
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(138, 136, 117)", opacity: "0.25" });
        const background = await themed.locator("#first").evaluate((root) => getComputedStyle(root).backgroundColor);
        await themed.locator("#first .byVIEWthemeToggle").click();
        await themed.waitForFunction((before) => getComputedStyle(document.getElementById("first")).backgroundColor !== before, background);
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(117, 113, 94)", opacity: "0.25" });
        assert.equal(await themed.locator("#viewer-theme").getAttribute("href"), "https://themes.test/json.light.css/archive/json.dark.css?keep=json.light.css#json.light.css");
        assert.equal(await themed.locator("#byVIEWtheme").getAttribute("href"), "https://themes.test/other.dark.css");
        assert.deepEqual(
          await themed.locator("#first .byVIEWthemeToggle, #second .byVIEWthemeToggle").evaluateAll((buttons) => buttons.map((button) => [button.querySelectorAll("svg").length, button.title, button.getAttribute("aria-label")])),
          [
            [2, "Switch to light theme", "Switch to light theme"],
            [2, "Switch to light theme", "Switch to light theme"]
          ]
        );
        assert.equal(await themed.locator("#host-control").evaluate((button) => getComputedStyle(button, "::after").content), "none");
        await themed.locator("#viewer-theme").evaluate((link) => link.remove());
        await themed.evaluate(() => byJSONviewer(document.getElementById("first"), "Content", { fontSizeControls: false, copyButton: false }));
        assert.equal(await themed.locator("#first .byVIEWthemeToggle").count(), 1);
      } finally {
        await themed.close();
      }
    });
    await t.test("control sizes and toolbar positions stay responsive across fonts and rerenders", async () => {
      const preview = await browser.newPage();
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../json.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../json.js") });
        const results = await preview.evaluate(async () => {
          const root = document.createElement("pre");
          document.body.appendChild(root);
          const sizes = {};
          const failures = [];
          for (const [width, fontFamily] of [
            [200, ""],
            [320, ""],
            [360, ""],
            [360, "monospace"],
            [640, "monospace"],
            [640, ""],
            [768, "monospace"],
            [768, ""]
          ]) {
            root.style.width = `${width}px`;
            for (const controlsSize of ["xs", "small", "regular", "large", "xl"]) {
              for (const controlsCompact of [false, true]) {
                for (const controlsPosition of ["top", "bottom"]) {
                  byJSONviewer(root, "A longer string that wraps and stays clear of the toolbar.", { fontSizeControls: true, controlsSize, controlsCompact, controlsPosition });
                  const toolbar = root.querySelector(".byVIEWtoolbar");
                  toolbar.style.fontFamily = fontFamily;
                  const bounds = toolbar.getBoundingClientRect();
                  const info = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                  const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                  const first = root.querySelector(".byJSONstring").getBoundingClientRect();
                  const last = root.querySelector(".byJSONstring").getBoundingClientRect();
                  const buttons = [...root.querySelectorAll("button")];
                  const heights = buttons.filter((button) => !button.classList.contains("byVIEWthemeToggle")).map((button) => button.getBoundingClientRect().height);
                  const equalHeight = Math.max(...heights) - Math.min(...heights) < 0.1;
                  const toggle = root.querySelector(".byVIEWthemeToggle");
                  const track = toggle.getBoundingClientRect();
                  const themeFits =
                    [...toggle.children].every((icon) => {
                      const rect = icon.getBoundingClientRect();
                      return rect.height >= parseFloat(getComputedStyle(toggle).fontSize) && rect.top >= track.top + 1 && rect.bottom <= track.bottom - 1;
                    }) && parseFloat(getComputedStyle(toggle, "::after").width) > track.height * 0.72;
                  const fits =
                    root.scrollWidth <= root.clientWidth + 1 &&
                    buttons.every((button) => {
                      const rect = button.getBoundingClientRect();
                      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
                    });
                  const separated = controlsPosition === "top" ? bounds.bottom <= first.top + 1 : bounds.top >= last.bottom - 1;
                  const sameRow = info.top < controls.bottom && info.bottom > controls.top;
                  const ordered = controlsPosition === "bottom" ? controls.bottom <= info.top : info.bottom <= controls.top;
                  const aligned = controlsCompact && sameRow ? info.right <= controls.left + 1 : ordered;
                  const compactWhenWide = !controlsCompact || width < (controlsSize === "xl" ? 768 : 640) || sameRow;
                  if (!fits || !separated || !aligned || !compactWhenWide || !equalHeight || !themeFits)
                    failures.push({ width, fontFamily, controlsSize, controlsCompact, controlsPosition, fits, separated, aligned, compactWhenWide, equalHeight, themeFits });
                  sizes[controlsSize] = buttons[1].getBoundingClientRect().width;
                }
              }
            }
          }
          root.style.fontSize = "48px";
          const fixedButtonSize = root.querySelector(".byVIEWfontSize").getBoundingClientRect().width === sizes.xl;
          byJSONviewer(root, "A longer string that wraps and stays clear of the toolbar.", {
            controlsSize: "small",
            controlsCompact: true,
            controlsPosition: "bottom",
            themeToggle: false,
            fontSizeControls: false,
            copyButton: false
          });
          const hidden = !root.querySelector(".byVIEWcontrols") && root.lastElementChild.classList.contains("byVIEWtoolbar") && root.querySelectorAll(".byVIEWinfo").length === 1;
          byJSONviewer(root, "A longer string that wraps and stays clear of the toolbar.", { fontSizeControls: true, controlsSize: "invalid", controlsPosition: "invalid" });
          const fallback = root.firstElementChild.dataset.size === "regular" && !root.classList.contains("byVIEWbottom");
          byJSONviewer(root, "A longer string that wraps and stays clear of the toolbar.", { fontSizeControls: true });
          const reset = root.classList.contains("byVIEWcompact") && !root.classList.contains("byVIEWbottom") && root.querySelectorAll(".byVIEWtoolbar").length === 1;
          root.style.fontSize = "";
          root.style.width = "640px";
          byJSONviewer(root, "A longer string that wraps and stays clear of the toolbar.", { fontSizeControls: true, controlsSize: "large", controlsCompact: true });
          const toolbar = root.querySelector(".byVIEWtoolbar");
          const wideHeight = toolbar.offsetHeight;
          root.style.width = "200px";
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const wrapped = toolbar.offsetHeight > wideHeight && toolbar.getBoundingClientRect().bottom <= root.querySelector(".byJSONstring").getBoundingClientRect().top;
          root.style.width = "640px";
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const restored = toolbar.offsetHeight === wideHeight;
          return { failures, sizes, fixedButtonSize, hidden, fallback, reset, wrapped, restored };
        });
        assert.deepEqual(results.failures, []);
        assert.ok(results.sizes.xs < results.sizes.small && results.sizes.small < results.sizes.regular && results.sizes.regular < results.sizes.large && results.sizes.large < results.sizes.xl);
        assert.equal(results.fixedButtonSize, true);
        assert.equal(results.hidden, true);
        assert.equal(results.fallback, true);
        assert.equal(results.reset, true);
        assert.equal(results.wrapped, true);
        assert.equal(results.restored, true);
      } finally {
        await preview.close();
      }
    });
    await t.test("bottom controls fill spare container space after resizing, collapsing and rerendering", async () => {
      const preview = await browser.newPage();
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../json.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../json.js") });
        const failures = await preview.evaluate(() => {
          const root = document.createElement("pre");
          document.body.appendChild(root);
          const failures = [];
          for (const dimension of ["height", "min-height"]) {
            root.style.cssText = `${dimension}: 320px; overflow: auto;`;
            for (const controlsSize of ["xs", "small", "regular", "large", "xl"]) {
              for (const controlsCompact of [false, true]) {
                const options = { controlsPosition: "bottom", controlsSize, controlsCompact };
                for (const width of [640, 240, 640]) {
                  root.style.width = `${width}px`;
                  byJSONviewer(root, { description: "A longer paragraph. ".repeat(100) }, options);
                  root.querySelector(".byJSONtoggle").click();
                  for (const state of ["collapsed", "short"]) {
                    if (state === "short") byJSONviewer(root, { message: "Short content." }, options);
                    const bounds = root.getBoundingClientRect();
                    const toolbar = root.querySelector(".byVIEWtoolbar").getBoundingClientRect();
                    const border = parseFloat(getComputedStyle(root).borderBottomWidth);
                    const gap = bounds.bottom - border - toolbar.bottom;
                    if (Math.abs(gap) > 1 || root.scrollHeight > root.clientHeight + 1) failures.push({ dimension, controlsSize, controlsCompact, width, state, gap });
                  }
                }
              }
            }
          }
          return failures;
        });
        assert.deepEqual(failures, []);
      } finally {
        await preview.close();
      }
    });
    await t.test("controls stay visible while scrolling and bottom credits follow the buttons", async () => {
      const preview = await browser.newPage({ viewport: { width: 640, height: 400 } });
      try {
        await preview.addStyleTag({ path: path.join(__dirname, "../json.css") });
        await preview.addScriptTag({ path: path.join(__dirname, "../json.js") });
        for (const owner of ["page", "parent", "viewer"]) {
          for (const controlsPosition of ["top", "bottom"]) {
            for (const controlsCompact of [false, true]) {
              await preview.evaluate(
                ({ owner, controlsPosition, controlsCompact }) => {
                  document.body.textContent = "";
                  document.body.style.margin = "0";
                  const host = document.createElement("div");
                  host.id = "scroll-host";
                  host.style.width = "240px";
                  if (owner === "parent") host.style.cssText += "; height: 320px; overflow: auto;";
                  const root = document.createElement("pre");
                  root.id = "viewer";
                  if (owner === "viewer") root.style.cssText = "height: 320px; overflow: auto;";
                  host.appendChild(root);
                  document.body.appendChild(host);
                  byJSONviewer(
                    root,
                    Array.from({ length: 70 }, (_, index) => ({ property: index, description: "A paragraph that makes this viewer scroll." })),
                    { fontSizeControls: true, controlsPosition, controlsCompact, chunkLatency: 0 }
                  );
                  window.scrollOwner = owner === "page" ? document.scrollingElement : owner === "parent" ? host : root;
                },
                { owner, controlsPosition, controlsCompact }
              );
              await preview.waitForFunction(() => document.querySelectorAll("li").length >= 70);
              for (const fraction of [0, 0.5, 1]) {
                await preview.evaluate((fraction) => {
                  scrollOwner.scrollTop = (scrollOwner.scrollHeight - scrollOwner.clientHeight) * fraction;
                }, fraction);
                const result = await preview.evaluate(
                  async ({ owner, controlsPosition }) => {
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    const root = document.getElementById("viewer");
                    const toolbar = root.querySelector(".byVIEWtoolbar").getBoundingClientRect();
                    const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                    const info = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                    const port =
                      owner === "page"
                        ? { top: 0, bottom: innerHeight }
                        : {
                            top: scrollOwner.getBoundingClientRect().top + scrollOwner.clientTop,
                            bottom: scrollOwner.getBoundingClientRect().top + scrollOwner.clientTop + scrollOwner.clientHeight
                          };
                    const sameRow = info.top < controls.bottom && info.bottom > controls.top;
                    const creditsOrdered = controlsPosition !== "bottom" || sameRow || info.top >= controls.bottom - 1;
                    const clickable = [...root.querySelectorAll("button")].every((button) => {
                      const rect = button.getBoundingClientRect();
                      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
                    });
                    return { scrollable: scrollOwner.scrollHeight > scrollOwner.clientHeight, visible: toolbar.top >= port.top - 1 && toolbar.bottom <= port.bottom + 1, creditsOrdered, clickable };
                  },
                  { owner, controlsPosition }
                );
                assert.deepEqual(result, { scrollable: true, visible: true, creditsOrdered: true, clickable: true }, `${owner}, ${controlsPosition}, compact=${controlsCompact}, scroll=${fraction}`);
              }
            }
          }
        }
      } finally {
        await preview.close();
      }
    });
    await t.test("narrow viewers keep controls above content within host widths", async () => {
      const layout = await page.evaluate(() => {
        const root = document.createElement("div");
        root.style.width = "240px";
        document.body.appendChild(root);
        try {
          byJSONviewer(root, "A longer string that wraps without covering the controls", { fontSizeControls: true });
          const bounds = root.getBoundingClientRect();
          const toolbar = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
          const content = root.querySelector(".byJSONstring");
          return {
            width: bounds.width,
            overflow: root.scrollWidth > root.clientWidth + 1,
            contained: toolbar.left >= bounds.left && toolbar.right <= bounds.right,
            aboveContent: toolbar.bottom <= content.getBoundingClientRect().top
          };
        } finally {
          root.remove();
        }
      });
      assert.deepEqual(layout, { width: 240, overflow: false, contained: true, aboveContent: true });
    });
    await t.test("strings use the light palette by default", async () => {
      const color = await page.evaluate(() => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        try {
          byJSONviewer(root, "Content", { themeToggle: false, fontSizeControls: false, copyButton: false });
          return getComputedStyle(root.querySelector(".byJSONstring")).color;
        } finally {
          root.remove();
        }
      });
      assert.equal(color, "rgb(100, 125, 0)");
    });
    await t.test("text controls follow root size changes, preserve host defaults, and enforce limits", async () => {
      const sizes = await page.evaluate(() => {
        const original = document.documentElement.style.fontSize;
        const root = document.createElement("div");
        document.body.appendChild(root);
        try {
          document.documentElement.style.fontSize = "16px";
          root.style.fontSize = "24px";
          const options = { themeToggle: false, fontSizeControls: true, copyButton: false };
          byJSONviewer(root, "Content", options);
          let [decrease, reset, increase] = root.querySelectorAll(".byVIEWfontSize");
          const size = () => parseFloat(getComputedStyle(root).fontSize);
          increase.click();
          const initial = size();
          document.documentElement.style.fontSize = "32px";
          increase.click();
          const resized = size();
          reset.click();
          const restored = size();
          increase.click();
          const next = size();
          byJSONviewer(root, "Content", options);
          [decrease, reset, increase] = root.querySelectorAll(".byVIEWfontSize");
          const rerendered = size();
          for (let index = 0; index < 30; index++) increase.click();
          const maximum = [size(), increase.disabled];
          for (let index = 0; index < 40; index++) decrease.click();
          const minimum = [size(), decrease.disabled];
          reset.click();
          return { initial, resized, restored, next, rerendered, maximum, minimum, reset: size() };
        } finally {
          root.remove();
          document.documentElement.style.fontSize = original;
        }
      });
      assert.deepEqual(sizes, { initial: 26, resized: 56, restored: 24, next: 28, rerendered: 28, maximum: [96, true], minimum: [16, true], reset: 24 });
    });
  } finally {
    await browser.close();
  }
});

/* --- CONTAINER THEMES --- */
test("container themes are scoped, independent, and compatible with legacy links", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent('<div id="outside" class="dark">Host</div><div id="first" data-theme="dark"></div><div id="second" class="light"></div><div id="third"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(
      async (args) => {
        window.renderTheme = async (element) => {
          const controller = window.byJSONviewer(element, ...args.slice(0, 1), { ...args[1], animations: false });
          if (controller?.ready) await controller.ready;
        };
        for (const id of ["first", "second", "third"]) await renderTheme(document.getElementById(id));
      },
      [{ message: "Local theme" }]
    );
    const color = (id) => page.locator("#" + id).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await color("first"), "rgb(39, 40, 34)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
    assert.equal(await page.locator("#first .byVIEWtoolbar").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted").trim()), "#75715e");
    await page.locator("#first .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#first").getAttribute("data-theme"), "light");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(
      await page
        .locator("#second")
        .getAttribute("class")
        .then((classes) => classes.split(/\s+/).includes("dark")),
      true
    );
    assert.equal(await page.locator("#second").getAttribute("data-theme"), null);
    assert.equal(await color("second"), "rgb(39, 40, 34)");
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.dataset.theme = "light";
      await renderTheme(second);
    });
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => {
      const first = document.getElementById("first");
      first.style.setProperty("--by-view-bg", "#123456");
    });
    assert.equal(await color("first"), "rgb(18, 52, 86)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => document.getElementById("first").style.removeProperty("--by-view-bg"));
    assert.equal(requests.length, 0, "Container theme changes must not fetch stylesheets");

    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: legacyThemeCSS(route.request().url().includes(".dark.css") ? "dark" : "light"), contentType: "text/css" }));
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.removeAttribute("data-theme");
      second.classList.remove("light", "dark");
      await new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.id = "byVIEWtheme";
        link.rel = "stylesheet";
        link.href = "https://legacy.test/json.light.css?cache=1#theme";
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
      });
      await renderTheme(second);
      await renderTheme(document.getElementById("third"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById("second")).backgroundColor === "rgb(39, 40, 34)");
    assert.equal(await color("third"), "rgb(39, 40, 34)");
    assert.equal(await color("first"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#first .byVIEWthemeToggle").getAttribute("aria-label"), "Switch to dark theme");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/json.dark.css?cache=1#theme");
    await page.evaluate(async () => {
      document.getElementById("byVIEWtheme").remove();
      await renderTheme(document.getElementById("second"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#second").getAttribute("data-theme"), "dark");
    assert.equal(await color("third"), "rgb(250, 250, 245)");
  } finally {
    await browser.close();
  }
});

/* --- PALETTES AND CONTRAST --- */
test("named palettes retain mode, isolate custom CSS, and meet High Contrast targets", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning" && message.text().includes("json.themes.css")) warnings.push(message.text());
    });
    await page.setContent('<div id="outside">Host</div><div id="viewer"></div><div id="other" data-theme="dark"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(
      async (args) => {
        window.renderPalette = async (id) => {
          const controller = window.byJSONviewer(document.getElementById(id), ...args.slice(0, 1), { ...args[1], animations: false });
          if (controller?.ready) await controller.ready;
        };
        await renderPalette("viewer");
        await renderPalette("other");
      },
      [{ name: "Theme", active: true, count: 1 }]
    );
    const root = page.locator("#viewer");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await background(), "rgb(250, 250, 245)", "Default remains Monokai Light");
    for (const [palette, colors] of Object.entries({
      monokai: ["rgb(250, 250, 245)", "rgb(39, 40, 34)"],
      github: ["rgb(255, 255, 255)", "rgb(13, 17, 23)"],
      solarized: ["rgb(253, 246, 227)", "rgb(0, 43, 54)"],
      "high-contrast": ["rgb(255, 255, 255)", "rgb(0, 0, 0)"]
    })) {
      await root.evaluate((element, palette) => {
        element.dataset.theme = palette;
        element.classList.remove("light", "dark");
      }, palette);
      assert.equal(await background(), colors[0], palette);
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await root.getAttribute("data-theme"), palette);
      assert.equal(await background(), colors[1], palette);
      await page.evaluate(() => renderPalette("viewer"));
      assert.equal(await background(), colors[1], "Rendering preserves the palette and mode");
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await background(), colors[0]);
    }
    assert.equal(warnings.length, 0, "Core palettes need no optional pack");
    await root.evaluate((element) => {
      element.dataset.theme = "dracula";
    });
    await page.evaluate(() => renderPalette("viewer"));
    assert.match(warnings[0], /json\.themes\.css/);
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(warnings.length, 1, "Repeated renders do not repeat a missing-pack warning");
    await root.evaluate((element) => {
      element.dataset.theme = "custom-user";
    });
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(warnings.length, 1, "Custom CSS names are supported without a pack");
    await page.addStyleTag({ path: path.join(__dirname, "../json.themes.css") });
    await root.evaluate((element) => {
      element.dataset.theme = "bubblegum";
    });
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(warnings.length, 1, "Loaded packs do not warn for other presets");
    const paletteSelect = require("node:fs")
      .readFileSync(path.join(__dirname, "../index.html"), "utf8")
      .match(/<select id="preview-palette"[\s\S]*?<\/select>/)[0];
    const paletteNames = [...paletteSelect.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]).filter((name) => name !== "custom");
    assert.equal(paletteNames.length, 48);
    assert.equal(new Set(paletteNames).size, 48);
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const name of paletteNames) assert.match(readme, new RegExp("\\|\\s*`" + name + "`\\s*\\|"), `${name} must be documented`);
    const failures = await root.evaluate((element, names) => {
      const luminance = (value) => {
        const channels = value.startsWith("#")
          ? value
              .slice(1)
              .match(/../g)
              .map((part) => parseInt(part, 16))
          : value
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number);
        const linear = channels.map((channel) => channel / 255).map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      const failures = [];
      for (const name of names.filter((name) => !["monokai", "github", "solarized", "high-contrast"].includes(name))) {
        element.dataset.theme = name;
        for (const mode of ["light", "dark"]) {
          element.classList.toggle("dark", mode === "dark");
          element.classList.toggle("light", mode === "light");
          const style = getComputedStyle(element);
          const variables = [...style].map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => /^#[\da-f]{6}$/i.test(value));
          const backgrounds = [style.backgroundColor, ...variables.filter(([name]) => /-(?:alt|code-bg|add|remove)$/.test(name)).map(([, value]) => value)];
          const textColors = [["text", style.color], ...variables.filter(([name]) => /-(?:text|secondary|accent|string|literal|error|warn|info|debug|comment|keyword|number|property|tag|link|quote|toggle|placeholder|muted)$/.test(name))];
          for (const [property, value] of textColors) {
            if (backgrounds.some((background) => contrast(value, background) < 4.5)) failures.push(`${name} ${mode} ${property}`);
          }
          const border = variables.find(([name]) => /^--by-(?:view|json|md)-border$/.test(name))?.[1];
          if (border && contrast(border, style.backgroundColor) < 3) failures.push(`${name} ${mode} border`);
        }
      }
      element.dataset.theme = "high-contrast";
      return failures;
    }, paletteNames);
    assert.deepEqual(failures, [], "New palettes must keep text and control boundaries readable in both modes");
    for (const mode of ["light", "dark"]) {
      await root.evaluate((element, mode) => {
        element.classList.toggle("dark", mode === "dark");
        element.classList.toggle("light", mode === "light");
      }, mode);
      await root.locator(".byVIEWcopy").focus();
      const measurements = await root.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color) => {
          const channels = color.startsWith("#")
            ? color
                .slice(1)
                .match(/../g)
                .map((part) => parseInt(part, 16))
            : color
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map(Number);
          const values = channels.map((channel) => channel / 255).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
        const variables = [...style].filter((property) => property.startsWith("--by-")).map((property) => [property, style.getPropertyValue(property).trim()]);
        const backgrounds = [style.backgroundColor, ...variables.filter(([property]) => /-(?:alt|code-bg|add|remove)$/.test(property)).map(([, value]) => value)];
        const text = variables.filter(([property, value]) => /^#[0-9a-f]{6}$/i.test(value) && !/-(?:bg|border|alt|add|remove)$/.test(property));
        const button = getComputedStyle(element.querySelector(".byVIEWcopy"));
        return {
          text: text.flatMap(([property, value]) => backgrounds.map((bg) => ({ property, ratio: contrast(value, bg) }))),
          border: contrast(button.borderTopColor, style.backgroundColor),
          focus: contrast(button.outlineColor, style.backgroundColor),
          outline: parseFloat(button.outlineWidth)
        };
      });
      assert.ok(measurements.text.length >= 5);
      for (const { property, ratio } of measurements.text) assert.ok(ratio >= 7, mode + " " + property + ": " + ratio.toFixed(2));
      assert.ok(measurements.border >= 3);
      assert.ok(measurements.focus >= 3 && measurements.outline >= 2);
    }
    await root.evaluate((element) => {
      element.classList.add("light", "dark");
      element.dataset.theme = "github";
    });
    assert.equal(await background(), "rgb(13, 17, 23)", "Dark wins when both classes exist");
    await root.evaluate((element) => {
      element.dataset.theme = "light";
    });
    assert.equal(await background(), "rgb(250, 250, 245)", "Legacy mode aliases override classes");
    await page.addStyleTag({ content: '.byJSONdocument.light[data-theme="custom-ocean"] { --by-view-bg: #f3f8fc; } .byJSONdocument.dark[data-theme="custom-ocean"] { --by-view-bg: #102a43; }' });
    await root.evaluate((element) => {
      element.dataset.theme = "custom-ocean";
      element.classList.remove("light", "dark");
    });
    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const link = document.createElement("link");
          link.id = "byVIEWtheme";
          link.rel = "stylesheet";
          link.href = "https://legacy.test/json.dark.css?cache=1#theme";
          link.onload = resolve;
          document.head.appendChild(link);
        })
    );
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(await background(), "rgb(250, 250, 245)", "An unclassified custom palette starts in Light");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await background(), "rgb(16, 42, 67)");
    assert.equal(await root.getAttribute("data-theme"), "custom-ocean");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/json.dark.css?cache=1#theme");
    assert.equal(await page.locator("#other").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(39, 40, 34)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
  } finally {
    await browser.close();
  }
});

/* --- CONTROLS AND CLIPBOARD FEEDBACK --- */
test("viewer defaults, optional tools, and copy feedback", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 }, reducedMotion: "reduce" });
    await page.setContent('<div id="viewer"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(
      (args) => {
        window.renderUI = async (options = {}) => {
          const result = byJSONviewer(document.getElementById("viewer"), ...args, options);
          await result?.ready;
          const deadline = Date.now() + 3000;
          while (document.querySelectorAll("#viewer li").length < 3) {
            if (Date.now() > deadline) throw new Error("JSON rendering timed out");
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        };
      },
      [{ needle: 1, branch: { active: true } }]
    );
    await page.evaluate(() => renderUI());
    assert.equal(await page.locator(".byVIEWcontrols button").count(), 5);
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 1);
    assert.equal(await page.locator(".byVIEWactions :is(input, select, button):visible").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const controlsPosition of ["top", "bottom"]) {
      for (const toolbar of [true, false]) {
        const edges = await page.evaluate(
          async (options) => {
            await renderUI(options);
            const host = document.getElementById("viewer");
            const bounds = host.getBoundingClientRect();
            const style = getComputedStyle(host);
            const panel = host.querySelector(".byVIEWpanel").getBoundingClientRect();
            const first = host.firstElementChild,
              last = host.lastElementChild;
            const topToolbar = first.classList.contains("byVIEWtoolbar");
            const bottomToolbar = last.classList.contains("byVIEWtoolbar");
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
            return [
              ((topToolbar ? first.getBoundingClientRect().top : panel.top) - bounds.top - parseFloat(style.borderTopWidth)) / rem,
              (bounds.bottom - parseFloat(style.borderBottomWidth) - (bottomToolbar ? last.getBoundingClientRect().bottom : panel.bottom)) / rem
            ];
          },
          { controlsPosition, toolbar }
        );
        const expected = [toolbar && controlsPosition === "top" ? 0 : 0.75, toolbar && controlsPosition === "bottom" ? 0 : 0.75];
        assert.ok(
          edges.every((edge, index) => Math.abs(edge - expected[index]) < 0.01),
          `${controlsPosition}, toolbar=${toolbar}: ${edges}`
        );
      }
    }
    await page.evaluate(() => renderUI({ displayContainer: false, statusBar: true }));
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    assert.equal(await page.locator(".byVIEWpanel").evaluate((panel) => parseFloat(getComputedStyle(panel).borderTopWidth)), 0);
    assert.match(await page.locator(".byVIEWcontent").textContent(), /needle/);
    await page.evaluate(() => renderUI({ displayContainer: true, statusBar: false }));
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    assert.ok(await page.locator(".byVIEWpanel").evaluate((panel) => parseFloat(getComputedStyle(panel).borderTopWidth) > 0));
    await page.evaluate(() => renderUI());

    await page.evaluate(() => renderUI({ fontSizeControls: false, statusBar: false }));
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    await page.evaluate(() => renderUI());
    await page.evaluate(() => renderUI({ controlsSize: "invalid" }));
    assert.equal(await page.locator(".byVIEWtoolbar").getAttribute("data-size"), "regular");
    for (const scale of [1, 1.5]) {
      for (const controlsSize of ["xs", "small", "regular", "large", "xl"]) {
        for (const font of ["ui-monospace, monospace", "Georgia, serif"]) {
          for (const mode of ["light", "dark"]) {
            const errors = await page.evaluate(
              async ({ scale, controlsSize, font, mode }) => {
                document.documentElement.style.fontSize = `${scale}rem`;
                const host = document.getElementById("viewer");
                host.dataset.theme = mode;
                host.style.setProperty("--by-view-controls-font", font);
                await renderUI({ controlsSize });
                const button = host.querySelector(".byVIEWthemeToggle");
                const rect = button.getBoundingClientRect();
                const style = getComputedStyle(button),
                  thumb = getComputedStyle(button, "::after");
                const innerWidth = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
                const innerHeight = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
                const position = (value, extent) => (value.endsWith("%") ? (parseFloat(value) * extent) / 100 : parseFloat(value));
                const transform = new DOMMatrixReadOnly(thumb.transform);
                const centerX = rect.left + parseFloat(style.borderLeftWidth) + position(thumb.left, innerWidth) + transform.m41 + parseFloat(thumb.width) / 2;
                const centerY = rect.top + parseFloat(style.borderTopWidth) + position(thumb.top, innerHeight) + transform.m42 + parseFloat(thumb.height) / 2;
                const icons = [...button.querySelectorAll("svg")];
                const icon = icons[mode === "dark" ? 1 : 0].getBoundingClientRect();
                const toolbarSize = parseFloat(getComputedStyle(host.querySelector(".byVIEWtoolbar")).fontSize);
                const expectedSize = { xs: 0.5, small: 0.7, regular: 0.875, large: 1, xl: 1.25 }[controlsSize] * parseFloat(getComputedStyle(document.documentElement).fontSize);
                return [Math.abs(centerX - icon.x - icon.width / 2), Math.abs(centerY - icon.y - icon.height / 2), Math.abs(centerY - rect.y - rect.height / 2), Math.abs(toolbarSize - expectedSize)];
              },
              { scale, controlsSize, font, mode }
            );
            assert.ok(
              errors.every((error) => error < 0.06),
              `${scale} ${controlsSize} ${font} ${mode}: ${errors}`
            );
          }
        }
      }
    }
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "";
      document.getElementById("viewer").style.removeProperty("--by-view-controls-font");
      await renderUI();
    });
    for (const mode of ["light", "dark"]) {
      await page.locator("#viewer").evaluate((element, mode) => {
        element.dataset.theme = mode;
      }, mode);
      await page.evaluate(() => renderUI({ toolbar: false, controlsPosition: "bottom", sorting: false, pagination: false, collapsible: false, details: false, lineNumbers: false, loadMore: false }));
      assert.equal(await page.locator("#viewer :is(button, input, select, summary):visible").count(), 0);
      assert.equal(await page.locator(".byVIEWtoolbar").count(), 0);
      assert.equal(await page.locator("#viewer").evaluate((element) => element.classList.contains("byVIEWbottom")), false);
      assert.match(await page.locator("#viewer").textContent(), /needle/);
    }
    await page.evaluate(() => renderUI({ collapsible: false, collapsed: true }));
    assert.equal(await page.locator(".byJSONtoggle").count(), 0);
    assert.equal(await page.locator("#viewer li:visible").count(), 3);
    await page.evaluate(() => renderUI({ credits: false }));
    assert.equal(await page.locator(".byVIEWinfo").count(), 0);
    assert.equal(await page.locator(".byVIEWcontrols button").count(), 5);
    await page.evaluate(() => renderUI({ credits: false, themeToggle: false, fontSizeControls: false, copyButton: false }));
    assert.equal(await page.locator(".byVIEWtoolbar").count(), 0);
    await page.evaluate((options) => renderUI({ fontSizeControls: true, ...options }), {});
    assert.equal(await page.locator(".byVIEWfontSize").count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Denied");
          }
        }
      });
    });
    await page.locator(".byVIEWcopy").click();
    await page.mouse.move(0, 0);
    await page.locator(".byVIEWcopy").evaluate((element) => element.blur());
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "error");
    assert.equal(await page.locator(".byVIEWcopy").textContent(), "Failed");
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (value) => {
        window.copiedSource = value;
      };
    });
    await page.locator(".byVIEWcopy").click();
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "success");
    assert.match(await page.evaluate(() => copiedSource), /needle/);
  } finally {
    await browser.close();
  }
});

/* --- DOCUMENT AND CONTENT SURFACES --- */
test("document and content backgrounds stay independent through theme and toolbar changes", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, channel: process.env.BROWSER_CHANNEL || "chrome" });
  try {
    const page = await browser.newPage();
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.setContent('<div id="viewer" data-theme="light"></div><div id="neighbor" data-theme="light"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(async () => {
      for (const id of ["viewer", "neighbor"]) {
        const result = byJSONviewer(document.getElementById(id), { ready: true });
        await result?.ready;
      }
    });
    const root = page.locator("#viewer");
    const neighbor = await page.locator("#neighbor").evaluate((element) => getComputedStyle(element).backgroundColor);
    await root.evaluate((element) => {
      element.style.setProperty("--by-view-document-bg", "transparent");
      element.style.setProperty("--by-view-container-bg", "#123456");
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#viewer .byVIEWcopy")).backgroundColor === "rgb(18, 52, 86)");
    for (const changeMode of [false, true]) {
      if (changeMode) await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await root.evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
      assert.equal(await root.locator(".byVIEWpanel").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(18, 52, 86)");
      assert.equal(
        await root
          .locator(".byVIEWcopy")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor),
        "rgb(18, 52, 86)"
      );
      assert.equal(await root.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    }
    assert.equal(await page.locator("#neighbor").evaluate((element) => getComputedStyle(element).backgroundColor), neighbor);
    await root.evaluate((element) => element.style.removeProperty("--by-view-container-bg"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#viewer .byVIEWcopy")).backgroundColor === "rgb(39, 40, 34)");
    assert.notEqual(
      await root
        .locator(".byVIEWcopy")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgba(0, 0, 0, 0)"
    );
    assert.equal(await root.locator(".byVIEWpanel > .byVIEWstatus").textContent(), "Object \u00b7 1 property");
    await root.evaluate((element) => byJSONviewer(element, [1, 2], { statusBar: false }));
    assert.equal(await root.locator(".byVIEWstatus").isVisible(), false);
    assert.equal(await root.locator(".byVIEWstatus").textContent(), "Array \u00b7 2 items");
  } finally {
    await browser.close();
  }
});

/* --- INTERACTION MOTION --- */
test("animation options preserve initial visibility and override system motion preferences", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.route("https://cdn.jsdelivr.net/**", (route) => (route.request().url().endsWith("fontawesome.min.css") ? route.fulfill({ body: "", contentType: "text/css" }) : route.abort()));
    await page.setContent('<div id="motion-viewer" data-theme="light"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(() => {
      window.renderMotion = async (animations, appearAnimation = false) => {
        window.motionController = byJSONviewer(document.getElementById("motion-viewer"), { ready: true, nested: [1, 2] }, { animations, appearAnimation });
        await motionController?.ready;
      };
    });
    await page.evaluate(() => renderMotion());
    const root = page.locator("#motion-viewer");
    assert.equal(await root.evaluate((element) => element.classList.contains("byVIEWmotion")), true);
    assert.equal(await root.evaluate((element) => getComputedStyle(element).opacity), "1");
    assert.equal(await root.evaluate((element) => element.getAnimations({ subtree: true }).length), 0, "Initial content does not animate");
    assert.equal(
      await root
        .locator("button")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration.split(",")[0]),
      "0.18s"
    );
    const disclosure = await root.evaluateHandle((element) => {
      const details = document.createElement("details");
      details.id = "motion-disclosure";
      details.innerHTML = "<summary>Details</summary><p>Already available content</p>";
      element.append(details);
      getComputedStyle(details, "::details-content").blockSize;
      return details;
    });
    await disclosure.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "0");
    const opening = await disclosure.evaluate(async (details) => {
      details.open = true;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Number(getComputedStyle(details, "::details-content").opacity);
    });
    assert.ok(opening > 0 && opening < 1, "A deliberate disclosure eases in even with reduced motion requested");
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "1");
    await disclosure.evaluate((details) => {
      details.open = false;
    });
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "0");
    assert.equal(await disclosure.evaluate((details) => details.open), false);
    await page.evaluate(() => renderMotion(false));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await root.evaluate((element) => element.classList.contains("byVIEWmotion")), false);
    assert.equal(
      await root
        .locator("button")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration),
      "0s"
    );
    assert.equal(await root.evaluate((element) => element.getAnimations({ subtree: true }).length), 0);
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.evaluate(() => renderMotion(true));
    await page.waitForFunction(() => document.getElementById("motion-viewer").classList.contains("byVIEWready"));
    const fade = await root.evaluate((element) => {
      const before = getComputedStyle(element).backgroundColor;
      element.querySelector('[aria-label^="Switch to"]').click();
      const transition = element.getAnimations().find((animation) => animation.transitionProperty === "background-color");
      if (!transition) return { active: false };
      transition.pause();
      transition.currentTime = 90;
      const middle = getComputedStyle(element).backgroundColor;
      transition.finish();
      return { active: true, before, middle, after: getComputedStyle(element).backgroundColor, fontTransition: getComputedStyle(element).transitionProperty.includes("font-size") };
    });
    assert.equal(fade.active, true, "Theme backgrounds fade after the first paint");
    assert.notEqual(fade.middle, fade.before);
    assert.notEqual(fade.middle, fade.after);
    assert.equal(fade.fontTransition, false);
    await root.evaluate((element) => {
      element.dataset.theme = "high-contrast";
    });
    assert.equal(await root.evaluate((element) => element.getAnimations().filter((animation) => animation.transitionProperty === "background-color").length), 0);
    const entrance = await page.evaluate(async () => {
      await renderMotion(true, true);
      const element = document.getElementById("motion-viewer");
      const animation = element.getAnimations().find((animation) => animation.animationName === "byVIEWappear");
      if (!animation) return { active: false };
      animation.pause();
      animation.currentTime = 90;
      return { active: true, opacity: Number(getComputedStyle(element).opacity), content: element.textContent.length };
    });
    assert.equal(entrance.active, true, "Entrance motion is explicit even when the system requests reduced motion");
    assert.ok(entrance.opacity > 0 && entrance.opacity < 1);
    assert.ok(entrance.content > 0, "Rendering completes without waiting for the animation");
    await page.evaluate(() => renderMotion(false, true));
    assert.equal(await root.evaluate((element) => element.getAnimations({ subtree: true }).length), 0, "Animations off overrides the requested entrance");
  } finally {
    await browser.close();
  }
});

/* --- INITIAL APPEARANCE --- */
test("appearance options override markup and preserve independent viewer state", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await page.setContent('<style>html{font-size:20px}</style><div id="appearance" class="host light" data-theme="light"></div><div id="neighbor" class="dark" data-theme="monokai" style="font-size:2rem">Neighbor</div>');

    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(() => {
      window.appearanceTarget = document.getElementById("appearance");
      window.renderAppearance = async (options = {}) => {
        window.appearanceInstance = byJSONviewer(appearanceTarget, { answer: 42 }, { chunkLatency: 0, ...options });
        await appearanceInstance?.ready;
      };
    });
    const neighbor = await page.locator("#neighbor").evaluate((element) => element.outerHTML);
    await page.evaluate(() => renderAppearance({ theme: "dark", palette: "github", fontSize: 1.5, animations: false }));
    assert.deepEqual(
      await page
        .locator("#appearance")
        .evaluate((element) => [element.classList.contains("host"), element.classList.contains("dark"), element.classList.contains("light"), element.dataset.theme, element.style.fontSize, getComputedStyle(element).fontSize]),
      [true, true, false, "github", "1.5rem", "30px"]
    );
    const controls = page.locator("#appearance .byVIEWthemeToggle");
    assert.equal(await controls.getAttribute("aria-label"), "Switch to light theme");
    await controls.click();
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.classList.contains("light"), element.dataset.theme, element.style.fontSize]), [true, "github", "1.5rem"]);
    const buttonSize = await controls.evaluate((element) => getComputedStyle(element).fontSize);
    await page.getByRole("button", { name: "Increase text size", exact: true }).click();
    await page.evaluate(() => renderAppearance());
    assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), "1.625rem");
    await page.getByRole("button", { name: "Reset text size", exact: true }).click();
    assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), "1.5rem");
    assert.equal(await controls.evaluate((element) => getComputedStyle(element).fontSize), buttonSize);
    await page.evaluate(() => renderAppearance({ fontSize: 1.25 }));
    assert.equal(await page.locator("#appearance").evaluate((element) => getComputedStyle(element).fontSize), "25px");
    await page.getByRole("button", { name: "Increase text size", exact: true }).click();
    await page.getByRole("button", { name: "Reset text size", exact: true }).click();
    assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), "1.25rem");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "24px";
    });
    assert.equal(await page.locator("#appearance").evaluate((element) => getComputedStyle(element).fontSize), "30px", "The multiplier follows root text-size changes");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    for (const [fontSize, expected] of [
      ["1.25rem", 25],
      ["1.25em", 25],
      ["20px", 20],
      ["125%", 25],
      ["1px", 10],
      ["100px", 60],
      ["4em", 60]
    ]) {
      await page.evaluate((fontSize) => renderAppearance({ fontSize }), fontSize);
      assert.equal(await page.locator("#appearance").evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), expected, fontSize);
      const preset = await page.locator("#appearance").evaluate((element) => [element.style.fontSize, element.dataset.byViewDefaultFontSize]);
      assert.equal(preset[0], preset[1]);
      await page.getByRole("button", { name: expected === 60 ? "Decrease text size" : "Increase text size", exact: true }).click();
      await page.getByRole("button", { name: "Reset text size", exact: true }).click();
      assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), preset[0]);
    }
    await page.evaluate(() => {
      document.body.style.fontSize = "1.5rem";
      return renderAppearance({ fontSize: "1em" });
    });
    assert.equal(await page.locator("#appearance").evaluate((element) => getComputedStyle(element).fontSize), "30px", "em remains relative to the parent");
    await page.evaluate(() => {
      document.body.style.fontSize = "";
      document.documentElement.style.fontSize = "24px";
      return renderAppearance({ fontSize: "100px" });
    });
    assert.equal(await page.locator("#appearance").evaluate((element) => getComputedStyle(element).fontSize), "72px", "CSS values retain the rem limit when the root size changes");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    for (const [requested, expected] of [
      [-1, 0.5],
      [0, 0.5],
      [0.25, 0.5],
      [0.5, 0.5],
      [3, 3],
      [4, 3]
    ]) {
      await page.evaluate((fontSize) => renderAppearance({ fontSize }), requested);
      assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), `${expected}rem`);
      assert.equal(await page.locator("#appearance").evaluate((element) => element.dataset.byViewDefaultFontSize), `${expected}rem`);
      assert.equal(await page.getByRole("button", { name: "Decrease text size", exact: true }).isDisabled(), expected === 0.5);
      assert.equal(await page.getByRole("button", { name: "Increase text size", exact: true }).isDisabled(), expected === 3);
      await page.getByRole("button", { name: expected === 3 ? "Decrease text size" : "Increase text size", exact: true }).click();
      await page.getByRole("button", { name: "Reset text size", exact: true }).click();
      assert.equal(await page.locator("#appearance").evaluate((element) => element.style.fontSize), `${expected}rem`);
    }
    await page.evaluate(() => {
      appearanceTarget.dataset.theme = "dark";
      appearanceTarget.classList.remove("dark");
      appearanceTarget.classList.add("light");
      return renderAppearance({ palette: "high-contrast", toolbar: false });
    });
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.dataset.theme, element.classList.contains("dark"), getComputedStyle(element).colorScheme]), ["high-contrast", true, "dark"]);
    await page.evaluate(() => {
      appearanceTarget.dataset.theme = "dark";
      return renderAppearance({ theme: "light", toolbar: false });
    });
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.dataset.theme, element.classList.contains("dark"), element.classList.contains("light")]), ["light", false, true]);
    await page.evaluate(() => renderAppearance({ theme: "dark", palette: "custom-ocean", fontSize: 1.125, toolbar: false }));
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.dataset.theme, element.classList.contains("dark"), element.style.fontSize]), ["custom-ocean", true, "1.125rem"]);
    const preserved = await page.locator("#appearance").evaluate((element) => [element.className, element.dataset.theme, element.style.fontSize]);
    await page.evaluate(() => renderAppearance());
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.className, element.dataset.theme, element.style.fontSize]), preserved);
    await page.evaluate(() => renderAppearance({ theme: null, palette: null, fontSize: null }));
    assert.deepEqual(await page.locator("#appearance").evaluate((element) => [element.className, element.dataset.theme, element.style.fontSize]), preserved, "Blank exported appearance fields retain the container settings");
    for (const options of [
      { theme: "sepia" },
      { palette: "dark" },
      { palette: "bad name" },
      { fontSize: NaN },
      { fontSize: Infinity },
      { fontSize: "wrong" },
      { fontSize: "inherit" },
      { fontSize: true },
      { theme: "light", palette: "github", fontSize: "1.25" }
    ]) {
      const before = await page.locator("#appearance").evaluate((element) => element.outerHTML);
      const name = await page.evaluate(async (options) => {
        try {
          await renderAppearance(options);
        } catch (error) {
          return error.name;
        }
      }, options);
      assert.equal(name, "RangeError");
      assert.equal(await page.locator("#appearance").evaluate((element) => element.outerHTML), before, "Invalid appearance must not replace the current document");
    }

    assert.equal(await page.locator("#neighbor").evaluate((element) => element.outerHTML), neighbor);
  } finally {
    await browser.close();
  }
});
