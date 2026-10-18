const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

test("JSON rendering", async (t) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
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
        root.querySelector(".byVIEWinfo").remove();
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
            if (root.firstElementChild.tagName !== "UL" || toggle.getAttribute("aria-expanded") !== "false") return false;
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
        const opacity = Number(getComputedStyle(label).opacity);
        const info = {
          version: byJSONviewer.VERSION,
          text: label.textContent.replace(/\s+/g, " ").trim(),
          semiTransparent: opacity > 0 && opacity < 1,
          count: root.querySelectorAll(".byVIEWinfo").length,
          independent: label.parentElement === root,
          controls: root.querySelectorAll(".byVIEWcontrols").length,
          buttons: root.querySelectorAll("button").length,
          links: [...label.querySelectorAll("a")].map((link) => [link.href, link.target, link.rel])
        };
        root.remove();
        return info;
      });
      assert.deepEqual(info, {
        version: "2.10",
        text: "easy-json-viewer · v2.10 · @byUwUr",
        semiTransparent: true,
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
    await t.test("text size controls keep the viewer's outer spacing fixed", async () => {
      const result = await page.evaluate(() => {
        const root = document.createElement("pre");
        document.body.appendChild(root);
        try {
          byJSONviewer(root, "Text size sample", { themeToggle: false, copyButton: false });
          const top = root.getBoundingClientRect().top;
          const buttons = root.querySelectorAll(".byVIEWfontSize");
          while (!buttons[2].disabled) buttons[2].click();
          const maxSize = parseFloat(getComputedStyle(root).fontSize);
          const maxTop = root.getBoundingClientRect().top;
          while (!buttons[0].disabled) buttons[0].click();
          const minTop = root.getBoundingClientRect().top;
          buttons[1].click();
          return { maxSize, top, maxTop, minTop, resetTop: root.getBoundingClientRect().top };
        } finally {
          root.remove();
        }
      });
      assert.equal(result.maxSize, 48);
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
            { bigNumbers: true, collapsed: true, chunkLatency: 1000 }
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
        const url = new URL(route.request().url());
        if (url.origin !== "https://viewer.test") return route.abort();
        const file = path.basename(url.pathname);
        const body = await fs.readFile(path.join(__dirname, "..", file));
        await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
      });
      await playground.goto("https://viewer.test/index.html");
      const cdnCode = await playground.locator("#integration-code").inputValue();
      const renderer = playground.frameLocator("#preview-frame").locator("#byJSONrenderer");
      await renderer.locator(".byJSONstring").first().waitFor();
      await renderer.evaluate((root) => {
        root.style.fontFamily = "serif";
      });
      assert.equal(await playground.locator("#forceMonospace").isChecked(), false);
      assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontFamily), "serif");
      await playground.locator("#forceMonospace").check();
      assert.equal(JSON.parse(await playground.locator("#options-json").inputValue()).forceMonospace, true);
      assert.ok(await renderer.evaluate((root) => getComputedStyle(root).fontFamily.includes("monospace")));
      await playground.locator("#reset-settings").click();
      assert.equal(await playground.locator("#forceMonospace").isChecked(), false);
      assert.equal(JSON.parse(await playground.locator("#options-json").inputValue()).forceMonospace, false);
      assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontFamily), "serif");
      assert.equal(await playground.locator("#integration-code").inputValue(), cdnCode);
      const source = '{"message":"</script><script>window.injected=true</script>","__proto__":{"kept":true},"items":[1,true,null]}';
      await playground.locator("#json-source").fill(source);
      await playground.locator("#withLinks").uncheck();
      await playground.locator("#theme-light").check();
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
      await Promise.all(["json.js", "json.css", "json.light.css", "json.dark.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
      const exported = await browser.newPage();
      exported.on("pageerror", (error) => errors.push(error.message));
      await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
        const file = path.basename(new URL(route.request().url()).pathname).replace(".min.", ".");
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
          assert.equal(download.suggestedFilename(), "my-json-viewer.html");
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
          assert.equal(
            await exported
              .locator("#byVIEWtheme")
              .getAttribute("href")
              .then((href) => href.endsWith("json.dark.css")),
            true
          );
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
    await t.test("legacy demo loads styles and deferred scripts from the head", async () => {
      const html = await fs.readFile(path.join(__dirname, "..", "index.old.html"), "utf8");
      const structure = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return { themes: doc.querySelectorAll("head #byVIEWtheme").length, libraries: doc.querySelectorAll("head script[src][defer]").length, bodyAssets: doc.querySelectorAll("body script[src], body link[rel='stylesheet']").length };
      }, html);
      assert.deepEqual(structure, { themes: 1, libraries: 1, bodyAssets: 0 });
    });
  } finally {
    await browser.close();
  }
});
