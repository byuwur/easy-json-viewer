const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../json.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byJSONdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

let bootstrapCSS;
const getBootstrapCSS = () =>
  (bootstrapCSS ??= (async () => {
    if (process.env.BOOTSTRAP_CSS_PATH) return require("node:fs/promises").readFile(process.env.BOOTSTRAP_CSS_PATH, "utf8");
    const response = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css");
    assert.ok(response.ok, "Unable to load pinned Bootstrap CSS");
    return response.text();
  })());

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
        relativeSize: 0.75,
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
          byJSONviewer(
            root,
            { features: ["Collapsible nodes", "Light & dark", "Progressive rendering"], author: { name: "BONYUR", philosophy: "Simple is complicated enough." } },
            { chunkLatency: 0 }
          );
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
    await t.test("text size controls preserve outer position and keep collapse arrows visible", async () => {
      const result = await page.evaluate(() => {
        const root = document.createElement("pre");
        document.body.appendChild(root);
        try {
          root.style.width = "320px";
          byJSONviewer(root, { property: "Text size sample" }, { themeToggle: false, copyButton: false });
          const top = root.getBoundingClientRect().top;
          const buttons = root.querySelectorAll(".byVIEWfontSize");
          while (!buttons[2].disabled) buttons[2].click();
          const maxSize = parseFloat(getComputedStyle(root).fontSize);
          const maxTop = root.getBoundingClientRect().top;
          const toggle = root.querySelector(".byJSONtoggle");
          const arrow = getComputedStyle(toggle, "::before");
          const arrowLeft = toggle.getBoundingClientRect().left + parseFloat(arrow.left);
          const maxArrowVisible = arrowLeft >= root.getBoundingClientRect().left && arrowLeft + parseFloat(arrow.width) <= root.getBoundingClientRect().right;
          while (!buttons[0].disabled) buttons[0].click();
          const minTop = root.getBoundingClientRect().top;
          buttons[1].click();
          return { maxSize, top, maxTop, minTop, maxArrowVisible, resetTop: root.getBoundingClientRect().top };
        } finally {
          root.remove();
        }
      });
      assert.equal(result.maxSize, 48);
      assert.equal(result.maxArrowVisible, true);
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
          const failed =
            (await copy()).startsWith("Copy failed.") && root.querySelector(".byVIEWcopy").textContent === "Failed" && !root.querySelector(".byVIEWcopy").disabled && copies.length === copyCount;
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
            const toolbar = getComputedStyle(root.querySelector(".byVIEWtoolbar"));
            const credits = getComputedStyle(root.querySelector(".byVIEWinfo"));
            return { matched: toolbar.backgroundColor === background, opaque: !toolbar.backgroundColor.includes("rgba"), color: credits.color, opacity: credits.opacity };
          });
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(138, 136, 117)", opacity: "0.25" });
        const background = await themed.locator("#first").evaluate((root) => getComputedStyle(root).backgroundColor);
        await themed.locator("#first .byVIEWthemeToggle").click();
        await themed.waitForFunction((before) => getComputedStyle(document.getElementById("first")).backgroundColor !== before, background);
        assert.deepEqual(await palette(), { matched: true, opaque: true, color: "rgb(117, 113, 94)", opacity: "0.25" });
        assert.equal(await themed.locator("#viewer-theme").getAttribute("href"), "https://themes.test/json.light.css/archive/json.dark.css?keep=json.light.css#json.light.css");
        assert.equal(await themed.locator("#byVIEWtheme").getAttribute("href"), "https://themes.test/other.dark.css");
        assert.deepEqual(
          await themed
            .locator("#first .byVIEWthemeToggle, #second .byVIEWthemeToggle")
            .evaluateAll((buttons) => buttons.map((button) => [button.querySelectorAll("svg").length, button.title, button.getAttribute("aria-label")])),
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
            [640, ""]
          ]) {
            root.style.width = `${width}px`;
            for (const controlsSize of ["small", "regular", "large"]) {
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
                      return rect.height > track.height * 0.65 && rect.top >= track.top + 1 && rect.bottom <= track.bottom - 1;
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
                  const compactWhenWide = !controlsCompact || width < 640 || sameRow;
                  if (!fits || !separated || !aligned || !compactWhenWide || !equalHeight || !themeFits)
                    failures.push({ width, fontFamily, controlsSize, controlsCompact, controlsPosition, fits, separated, aligned, compactWhenWide, equalHeight, themeFits });
                  sizes[controlsSize] = buttons[1].getBoundingClientRect().width;
                }
              }
            }
          }
          root.style.fontSize = "48px";
          const fixedButtonSize = root.querySelector(".byVIEWfontSize").getBoundingClientRect().width === sizes.large;
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
        assert.ok(results.sizes.small < results.sizes.regular && results.sizes.regular < results.sizes.large);
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
            for (const controlsSize of ["small", "regular", "large"]) {
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
    await t.test("displayed, copied, and downloaded starters match with CDN or local assets", async () => {
      const playground = await browser.newPage();
      const errors = [];
      playground.on("pageerror", (error) => errors.push(error.message));
      await playground.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.copiedHTML = text;
            }
          }
        });
      });
      await playground.route("**/*", async (route) => {
        if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
        const url = new URL(route.request().url());
        if (url.origin !== "https://viewer.test") return route.abort();
        const file = path.basename(url.pathname);
        if (/^json\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
        const body = await fs.readFile(path.join(__dirname, "..", file));
        await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      await playground.goto("https://viewer.test/index.html");
      assert.ok((await playground.locator("#integration-code").inputValue()).includes('href="https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@main/json.css"'));
      assert.equal(await playground.locator('[data-install="cdn"]').getAttribute("aria-pressed"), "true");
      await playground.locator('[data-install="cdn"]').click();
      const cdnCode = await playground.locator("#integration-code").inputValue();
      assert.ok(cdnCode.includes("easy-json-viewer@main/"));
      const renderer = playground.frameLocator("#preview-frame").locator("#byJSONrenderer");
      await renderer.locator(".byJSONstring").first().waitFor();
      await renderer.evaluate((root) => {
        root.style.fontFamily = "serif";
      });
      assert.equal(await playground.locator("#forceMonospace").isChecked(), false);
      assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontFamily), "serif");
      const defaultSize = await renderer.evaluate((root) => getComputedStyle(root).fontSize);
      await renderer.locator(".byVIEWfontSize").nth(2).click();
      assert.notEqual(await renderer.evaluate((root) => getComputedStyle(root).fontSize), defaultSize);
      await playground.locator("#forceMonospace").check();
      assert.equal(JSON.parse(await playground.locator("#options-json").inputValue()).forceMonospace, true);
      assert.ok(await renderer.evaluate((root) => getComputedStyle(root).fontFamily.includes("monospace")));
      await playground.locator("#controlsSize-small").evaluate((input) => input.click());
      await playground.locator("#controlsCompact").check();
      await playground.locator("#controlsPosition-bottom").evaluate((input) => input.click());
      assert.deepEqual(await renderer.evaluate((root) => [root.lastElementChild.dataset.size, root.classList.contains("byVIEWcompact"), root.classList.contains("byVIEWbottom")]), [
        "small",
        true,
        true
      ]);
      const selected = JSON.parse(await playground.locator("#options-json").inputValue());
      assert.deepEqual([selected.controlsSize, selected.controlsCompact, selected.controlsPosition], ["small", true, "bottom"]);
      await playground.locator("#controlsCompact").uncheck();
      await playground.locator("#controlsSize-regular").evaluate((input) => input.click());
      const originalSource = await playground.locator("#json-source").inputValue();
      await playground.locator("#json-source").fill(JSON.stringify(Array.from({ length: 70 }, (_, index) => ({ index, value: "Scrollable preview" }))));
      await renderer.locator("li").nth(69).waitFor();
      for (const compact of [false, true]) {
        await playground.locator("#controlsCompact").evaluate((input, compact) => {
          if (input.checked !== compact) input.click();
        }, compact);
        for (const position of ["bottom", "top"]) {
          await playground.locator(`#controlsPosition-${position}`).evaluate((input) => input.click());
          await renderer.locator("li").nth(209).waitFor();
          for (const fraction of [0, 0.5, 1]) {
            const visible = await renderer.evaluate(
              async (root, { fraction, position }) => {
                const view = root.ownerDocument.defaultView;
                const scroller = root.ownerDocument.scrollingElement;
                scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * fraction;
                await new Promise((resolve) => view.requestAnimationFrame(resolve));
                const toolbar = root.querySelector(".byVIEWtoolbar");
                const bounds = toolbar.getBoundingClientRect();
                const controls = root.querySelector(".byVIEWcontrols").getBoundingClientRect();
                const credits = root.querySelector(".byVIEWinfo").getBoundingClientRect();
                const button = root.querySelector(".byVIEWcopy");
                const rect = button.getBoundingClientRect();
                return {
                  scrollable: scroller.scrollHeight > scroller.clientHeight,
                  visible: bounds.top >= 0 && bounds.bottom <= view.innerHeight,
                  pinned: Math.abs(position === "top" ? bounds.top : view.innerHeight - bounds.bottom) < 1,
                  creditsOrdered: position !== "bottom" || credits.top >= controls.bottom || (credits.top < controls.bottom && credits.bottom > controls.top),
                  opaque: getComputedStyle(toolbar).backgroundColor === getComputedStyle(root).backgroundColor,
                  clickable: button.contains(root.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
                };
              },
              { fraction, position }
            );
            assert.deepEqual(
              visible,
              { scrollable: true, visible: true, pinned: true, creditsOrdered: true, opaque: true, clickable: true },
              `Playground iframe: ${position}, compact=${compact}, scroll=${fraction}`
            );
          }
        }
      }
      await renderer.evaluate((root) => {
        root.ownerDocument.scrollingElement.scrollTop = 0;
      });
      await playground.locator("#json-source").fill(originalSource);
      await renderer.locator(".byJSONstring").filter({ hasText: "easy-json-viewer" }).first().waitFor();
      await playground.locator("#reset-settings").click();
      assert.equal(await playground.locator("#controlsSize-regular").isChecked(), true);
      assert.equal(await playground.locator("#controlsCompact").isChecked(), true);
      assert.equal(await playground.locator("#controlsPosition-top").isChecked(), true);
      assert.equal(await playground.locator("#forceMonospace").isChecked(), false);
      assert.equal(JSON.parse(await playground.locator("#options-json").inputValue()).forceMonospace, false);
      assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontFamily), "serif");
      assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontSize), defaultSize);
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      const source = '{"message":"</script><script>window.injected=true</script>","__proto__":{"kept":true},"items":[1,true,null]}';
      await playground.locator("#json-source").fill(source);
      await playground.locator("#withLinks").uncheck();
      await playground.locator('label[for="theme-light"]').click();
      assert.equal(await renderer.locator(".byVIEWthemeToggle svg").count(), 2);
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      await playground.locator('[data-install="local"]').click();
      const code = await playground.locator("#integration-code").inputValue();
      assert.ok(code.includes('document.addEventListener("DOMContentLoaded"'));
      assert.ok(!code.includes('"withLinks": false'));
      assert.ok(code.includes('src="./json.js" defer'));
      for (const name of ["themeToggle", "fontSizeControls", "copyButton"]) {
        await playground.locator(`#${name}`).evaluate((element) => {
          element.checked = false;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "viewer-starter-"));
      await Promise.all(["json.js", "json.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
      const exported = await browser.newPage();
      exported.on("pageerror", (error) => errors.push(error.message));
      await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
        const file = path.basename(new URL(route.request().url()).pathname);
        const body = await fs.readFile(path.join(__dirname, "..", file));
        if (file.endsWith(".js")) await new Promise((resolve) => setTimeout(resolve, 75));
        await route.fulfill({ body, contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      try {
        for (const mode of ["cdn", "local"]) {
          if (mode === "local") {
            await playground.locator("#source-preset").selectOption("bigNumbers");
            await playground.locator("#json-source").fill('{"balance":"-900719925474099312349","unit":"edited","extra":42}');
          }
          await playground.locator(`[data-install="${mode}"]`).click();
          const displayed = await playground.locator("#integration-code").inputValue();
          assert.equal(displayed, mode === "cdn" ? cdnCode : code);
          await playground.locator("#copy-code").click();
          assert.equal(await playground.evaluate(() => window.copiedHTML), displayed);
          const [download] = await Promise.all([playground.waitForEvent("download"), playground.locator("#download-html").click()]);
          assert.equal(download.suggestedFilename(), "easy-json-viewer.html");
          const file = path.join(directory, download.suggestedFilename());
          await download.saveAs(file);
          const html = await fs.readFile(file, "utf8");
          assert.equal(html, displayed);
          assert.ok(Buffer.byteLength(html) < 2048, "Starter should stay small");
          await exported.goto(pathToFileURL(file).href);
          await exported.waitForFunction(() => document.getElementById("viewer").children.length > 0);
          assert.equal(await exported.evaluate(() => window.injected), undefined);
          assert.deepEqual(await exported.locator("#viewer-data").evaluate((element) => JSON.parse(element.textContent)), {
            project: "easy-json-viewer",
            description: "A little less noise. A lot more JSON.",
            openSource: true,
            dependencies: 0
          });
          assert.equal(await exported.locator("head script[src][defer]").count(), 1);
          assert.equal(await exported.locator("body script[src], body link[rel='stylesheet']").count(), 0);
          assert.equal(await exported.locator("#viewer").getAttribute("data-theme"), "dark");
          assert.equal(await exported.locator("#byVIEWtheme").count(), 0);
          assert.equal(await exported.locator('head link[rel="stylesheet"]').count(), 1);
          assert.doesNotMatch(html, /\.(light|dark)\.css|\.min\.(css|js)/);
          const background = await exported.locator("#viewer").evaluate((element) => getComputedStyle(element).backgroundColor);
          await exported.locator(".byVIEWthemeToggle").click();
          await exported.waitForFunction((before) => getComputedStyle(document.getElementById("viewer")).backgroundColor !== before, background);
          const fontSize = await exported.locator("#viewer").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
          await exported.locator(".byVIEWfontSize").nth(2).click();
          assert.ok(await exported.locator("#viewer").evaluate((element, before) => parseFloat(getComputedStyle(element).fontSize) > before, fontSize));
        }
      } finally {
        await exported.close();
        await fs.rm(directory, { recursive: true, force: true });
      }
      await playground.locator("#json-source").fill("{");
      await playground.waitForFunction(() => document.getElementById("json-source").getAttribute("aria-invalid") === "true");
      assert.equal(await playground.locator("#copy-code").isDisabled(), false);
      assert.equal(await playground.locator("#download-html").isDisabled(), false);
      await playground.locator("#chunkSize").evaluate((element) => {
        element.value = "0";
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
      assert.equal(await playground.locator("#configuration").evaluate((element) => element.checkValidity()), false);
      assert.equal(await playground.locator("#integration-code").inputValue(), code);
      await playground.locator("#copy-code").click();
      assert.equal(await playground.evaluate(() => window.copiedHTML), code);
      assert.deepEqual(errors, []);
      await playground.close();
    });
  } finally {
    await browser.close();
  }
});

test("family customization, navigation and monospace controls", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.lastCopy = text;
          }
        }
      })
    );
    await page.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      if (/^json\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    assert.equal(await page.locator("#controlsCompact").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsCompact, true);
    assert.equal(await frame.locator(".byJSONdocument").evaluate((root) => root.classList.contains("byVIEWcompact")), true);
    assert.deepEqual(await frame.evaluate(async (source) => {
      const host = document.createElement("div");
      document.body.append(host);
      const states = [];
      let controller;
      try {
        for (const options of [undefined, { controlsCompact: false }, { controlsCompact: true }, undefined]) {
          controller = byJSONviewer(host, source, options);
          await controller?.ready;
          states.push(host.classList.contains("byVIEWcompact"));
        }
        controller = byJSONviewer(host, source, { themeToggle: false, fontSizeControls: false, copyButton: false });
        await controller?.ready;
        states.push(host.querySelectorAll(".byVIEWinfo").length === 1 && !host.querySelector(".byVIEWcontrols"));
        return states;
      } finally {
        controller?.destroy?.();
        host.remove();
      }
    }, "Sample"), [true, false, true, true, true], "Compact defaults, opt-out, rerenders, and disabled controls agree");
    assert.deepEqual(await page.locator(".form-switch .form-check-input").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.width, height: style.height };
    }), { width: "44px", height: "24px" });
    assert.equal(await page.locator(".form-switch .form-check-input").evaluateAll((inputs) => inputs.every((input) => {
      const toggle = input.getBoundingClientRect();
      const row = input.closest(".form-switch").getBoundingClientRect();
      return Math.abs(toggle.right - row.right) < 1 && Math.abs(toggle.top + toggle.height / 2 - row.top - row.height / 2) < 1;
    })), true, "Every switch lines up at the right edge and center of its row");
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(await page.locator("#controlsSize").evaluate((size) => {
        const a = size.querySelector(".btn-group").getBoundingClientRect();
        const b = document.querySelector("#controlsPosition .btn-group").getBoundingClientRect();
        return Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && a.right < b.left;
      }), true, "Size and position controls share one evenly divided row");
    }
    assert.deepEqual(await page.locator(".accordion-button").allTextContents().then((labels) => labels.map((label) => label.trim()).slice(0, 3)), ["Preview appearance", "Viewer controls", "Rendering"]);
    assert.deepEqual(await page.locator("#options-json").evaluate((editor) => Object.keys(JSON.parse(editor.value)).slice(0, 18)), [
      "theme", "palette", "fontFamily", "fontSize", "lineHeight", "controlsFont", "backgroundColor", "textColor", "customThemeCSS", "forceMonospace",
      "toolbar", "credits", "themeToggle", "fontSizeControls", "copyButton", "controlsCompact", "controlsSize", "controlsPosition"
    ]);
    assert.equal(await page.locator(".intro h1 + p").textContent(), "Plain JavaScript. No dependencies. Open source. Free. Forever.");
    assert.ok((await page.locator("header .brand-mark").textContent()).trim());

    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#141618");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(20, 22, 24)");
    assert.equal(await page.locator('.source-editor').first().evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(20, 22, 24)");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#141618");
    await page.locator("#site-theme").evaluate((button) => button.click());
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#fff");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#fff");
    const root = frame.locator(".byJSONdocument");
    const initial = await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") }));
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    assert.equal(await page.locator('[aria-label="Viewer suite"] a').count(), 8);
    assert.equal(await page.locator('[aria-label="Viewer suite"]').getByRole("link", { name: "JSON", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".site-footer .fa-heart").count(), 1);
    assert.equal(await page.locator("header .fa-github").count(), 1);
    assert.equal(
      await page.evaluate(() => Boolean(document.querySelector('[aria-label="Viewer suite"]').compareDocumentPosition(document.querySelector("footer")) & Node.DOCUMENT_POSITION_FOLLOWING)),
      true
    );
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    await page.evaluate(() => {
      for (const [id, value] of [
        ["preview-font", "Georgia, serif"],
        ["preview-size", "1.5"],
        ["preview-leading", "1.8"],
        ["preview-controls-font", "system-ui, sans-serif"],
        ["preview-bg", "#123456"],
        ["preview-ink", "#fedcba"]
      ]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    assert.deepEqual(
      await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: style.lineHeight, bg: style.backgroundColor, text: style.color };
      }),
      { font: "Georgia, serif", size: "24px", line: "43.2px", bg: "rgb(18, 52, 86)", text: "rgb(254, 220, 186)" }
    );
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /system-ui/);
    await page.locator("#copy-appearance").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes("--by-view-controls-font"));
    assert.match(await page.evaluate(() => lastCopy), /\.byJSONdocument/);
    assert.ok((await page.evaluate(() => lastCopy)).includes("--by-view-bg: #123456"));
    await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
    const configuration = JSON.parse(await page.locator("#options-json").inputValue());
    for (const [name, value] of Object.entries({
      theme: "dark",
      fontFamily: "Georgia, serif",
      fontSize: 1.5,
      lineHeight: 1.8,
      controlsFont: "system-ui, sans-serif",
      backgroundColor: "#123456",
      textColor: "#fedcba"
    })) {
      assert.deepEqual(configuration[name], value, name);
    }
    assert.ok(!["options", "appearance", "callbacks"].some((key) => key in configuration));
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const match of readme.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)) {
      assert.ok(match[1] in configuration, `Missing parameter: ${match[1]}`);
    }
    await page.locator("#copy-options").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.startsWith("{"));
    assert.deepEqual(JSON.parse(await page.evaluate(() => lastCopy)), configuration);
    assert.ok(!Object.keys(configuration).some((key) => key.startsWith("preview")));
    await page.locator('[data-options-view="form"]').evaluate((button) => button.click());
    await page.locator("#reset-settings").evaluate((button) => button.click());
    assert.deepEqual(await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") })), initial);
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});


test("container themes are scoped, independent, and compatible with legacy links", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent('<div id="outside" class="dark">Host</div><div id="first" data-theme="dark"></div><div id="second" class="light"></div><div id="third"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(async (args) => {
      window.renderTheme = async (element) => {
        const controller = window.byJSONviewer(element, ...args);
        if (controller?.ready) await controller.ready;
      };
      for (const id of ["first", "second", "third"]) await renderTheme(document.getElementById(id));
    }, [{"message":"Local theme"}]);
    const color = (id) => page.locator("#" + id).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await color("first"), "rgb(39, 40, 34)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
    assert.equal(await page.locator("#first .byVIEWtoolbar").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted").trim()), "#75715e");
    await page.locator("#first .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#first").getAttribute("data-theme"), "light");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#second").getAttribute("class").then((classes) => classes.split(/\s+/).includes("dark")), true);
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

test("named palettes retain mode, isolate custom CSS, and meet High Contrast targets", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="outside">Host</div><div id="viewer"></div><div id="other" data-theme="dark"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate(async (args) => {
      window.renderPalette = async (id) => {
        const controller = window.byJSONviewer(document.getElementById(id), ...args);
        if (controller?.ready) await controller.ready;
      };
      await renderPalette("viewer");
      await renderPalette("other");
    }, [{"name":"Theme","active":true,"count":1}]);
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
            ? color.slice(1).match(/../g).map((part) => parseInt(part, 16))
            : color.match(/[\d.]+/g).slice(0, 3).map(Number);
          const values = channels.map((channel) => channel / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
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
    await root.evaluate((element) => { element.dataset.theme = "light"; });
    assert.equal(await background(), "rgb(250, 250, 245)", "Legacy mode aliases override classes");
    await page.addStyleTag({ content: '.byJSONdocument.light[data-theme="ocean"] { --by-view-bg: #f3f8fc; } .byJSONdocument.dark[data-theme="ocean"] { --by-view-bg: #102a43; }' });
    await root.evaluate((element) => { element.dataset.theme = "ocean"; element.classList.remove("light", "dark"); });
    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await page.evaluate(() => new Promise((resolve) => {
      const link = document.createElement("link");
      link.id = "byVIEWtheme";
      link.rel = "stylesheet";
      link.href = "https://legacy.test/json.dark.css?cache=1#theme";
      link.onload = resolve;
      document.head.appendChild(link);
    }));
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(await background(), "rgb(250, 250, 245)", "An unclassified custom palette starts in Light");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await background(), "rgb(16, 42, 67)");
    assert.equal(await root.getAttribute("data-theme"), "ocean");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/json.dark.css?cache=1#theme");
    assert.equal(await page.locator("#other").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(39, 40, 34)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");

  } finally {
    await browser.close();
  }
});

test("playground palettes and editable two-mode custom themes stay synchronized", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.lastCopy = text; } } }));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    const root = frame.locator(".byJSONdocument");
    const editor = page.locator("#custom-theme-css");
    const palette = page.locator("#preview-palette");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    const initialBackground = await background();
    const hostBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await palette.inputValue(), "monokai");
    await page.waitForFunction(() => document.getElementById("custom-theme-css").value.includes('.dark[data-theme="custom"]'));
    const defaults = await editor.inputValue();
    assert.ok(defaults.includes('.byJSONdocument.light[data-theme="custom"]'));
    await palette.selectOption("github");
    const setMode = (mode) => page.evaluate((mode) => {
      const input = document.querySelector('#preview-theme, input[name="viewerTheme"][value="' + mode + '"], input[name="previewTheme"][value="' + mode + '"]');
      if (input.tagName === "SELECT") input.value = mode;
      else input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, mode);
    await setMode("dark");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await root.locator(".byVIEWthemeToggle").click();
    await page.waitForFunction(() => JSON.parse(document.getElementById("options-json").value).theme === "light");
    assert.equal(await palette.inputValue(), "github");
    assert.equal(await background(), "rgb(255, 255, 255)");
    for (const name of ["solarized", "high-contrast"]) {
      await palette.selectOption(name);
      assert.equal(await root.getAttribute("data-theme"), name);
      assert.ok((await editor.inputValue()).includes("--by-view-bg"));
      await setMode("dark");
      assert.equal(await background(), name === "solarized" ? "rgb(0, 43, 54)" : "rgb(0, 0, 0)");
    }
    await page.locator(".preview-appearance").evaluate((element) => { element.open = true; });
    const custom = '.byJSONdocument.light[data-theme="custom"] { --by-view-bg: #f3f8fc; }\n.byJSONdocument.dark[data-theme="custom"] { --by-view-bg: #102a43; }';
    await editor.fill(custom);
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await setMode("light");
    assert.equal(await background(), "rgb(243, 248, 252)");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await root.getAttribute("data-theme"), "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#copy-theme").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes('[data-theme="custom"]'));
    assert.equal(await page.evaluate(() => lastCopy), custom);
    const config = JSON.parse(await page.locator("#options-json").inputValue());
    assert.equal(config.theme, "dark");
    assert.equal(config.palette, "custom");
    assert.equal(config.customThemeCSS, custom);
    assert.ok(!("appearance" in config) && !("options" in config));
    await palette.selectOption("github");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await palette.selectOption("custom");
    assert.equal(await editor.inputValue(), custom, "Preset changes retain the draft");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#reset-settings, #reset-options").evaluate((button) => button.click());
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "monokai");
    assert.equal(await editor.inputValue(), defaults);
    assert.equal(await background(), initialBackground);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), hostBackground);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("viewer defaults, optional tools, and copy feedback", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 }, reducedMotion: "reduce" });
    await page.setContent('<div id="viewer"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    await page.evaluate((args) => {
      window.renderUI = async (options = {}) => {
        const result = byJSONviewer(document.getElementById("viewer"), ...args, options);
        await result?.ready;
        const deadline = Date.now() + 3000;
        while (document.querySelectorAll("#viewer li").length < 3) {
          if (Date.now() > deadline) throw new Error("JSON rendering timed out");
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      };
    }, [{"needle":1,"branch":{"active":true}}]);
    await page.evaluate(() => renderUI());
    assert.equal(await page.locator(".byVIEWcontrols button").count(), 5);
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 1);
    assert.equal(await page.locator(".byVIEWactions :is(input, select, button):visible").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => renderUI({ fontSizeControls: false, statusBar: false }));
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    await page.evaluate(() => renderUI());
    for (const scale of [1, 1.5]) {
      for (const controlsSize of ["small", "regular", "large"]) {
        for (const font of ["ui-monospace, monospace", "Georgia, serif"]) {
          for (const mode of ["light", "dark"]) {
            const errors = await page.evaluate(async ({ scale, controlsSize, font, mode }) => {
              document.documentElement.style.fontSize = `${scale}rem`;
              const host = document.getElementById("viewer");
              host.dataset.theme = mode;
              host.style.setProperty("--by-view-controls-font", font);
              await renderUI({ controlsSize });
              const button = host.querySelector(".byVIEWthemeToggle");
              const rect = button.getBoundingClientRect();
              const style = getComputedStyle(button), thumb = getComputedStyle(button, "::after");
              const innerWidth = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
              const innerHeight = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
              const position = (value, extent) => value.endsWith("%") ? parseFloat(value) * extent / 100 : parseFloat(value);
              const centerX = rect.left + parseFloat(style.borderLeftWidth) + position(thumb.left, innerWidth);
              const centerY = rect.top + parseFloat(style.borderTopWidth) + position(thumb.top, innerHeight);
              const icons = [...button.querySelectorAll("svg")];
              const icon = icons[mode === "dark" ? 1 : 0].getBoundingClientRect();
              return [Math.abs(centerX - icon.x - icon.width / 2), Math.abs(centerY - icon.y - icon.height / 2), Math.abs(centerY - rect.y - rect.height / 2)];
            }, { scale, controlsSize, font, mode });
            assert.ok(errors.every((error) => error < 0.06), `${scale} ${controlsSize} ${font} ${mode}: ${errors}`);
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
      await page.locator("#viewer").evaluate((element, mode) => { element.dataset.theme = mode; }, mode);
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
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } });
    });
    await page.locator(".byVIEWcopy").click();
    await page.mouse.move(0, 0);
    await page.locator(".byVIEWcopy").evaluate((element) => element.blur());
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "error");
    assert.equal(await page.locator(".byVIEWcopy").textContent(), "Failed");
    await page.evaluate(() => { navigator.clipboard.writeText = async (value) => { window.copiedSource = value; }; });
    await page.locator(".byVIEWcopy").click();
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "success");
    assert.match(await page.evaluate(() => copiedSource), /needle/);
  } finally {
    await browser.close();
  }
});
