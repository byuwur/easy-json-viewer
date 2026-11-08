/*
 * File: tests/playground.cjs
 * Desc: JSON playground configuration, previews, and exports; library checks live in rendering.cjs.
 */

// --- DEPENDENCIES ---
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { chromium, firefox, webkit } = require("playwright");
const browserEngine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(browserEngine), "Unsupported BROWSER_ENGINE");
const browserType = { chromium, firefox, webkit }[browserEngine];
// Browser channels and executable overrides apply only to Chromium.
const launchBrowser = () =>
  browserType.launch(
    browserEngine === "chromium"
      ? {
          channel: process.env.BROWSER_CHANNEL || undefined,
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
        }
      : {}
  );

// Read the displayed source without line numbers or status text.
const readStarter = async (page) => {
  await page.locator('#integration-code[aria-busy="false"]').waitFor();
  return (await page.locator("#integration-code .byCODEtext").allTextContents()).join("\n");
};

// --- THEME FIXTURES ---
// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../json.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byJSONdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

// --- PLAYGROUND ASSETS ---
let bootstrapCSS;
// Use the playground's pinned stylesheet so responsive checks exercise its real layout.
const getBootstrapCSS = () =>
  (bootstrapCSS ??= (async () => {
    if (process.env.BOOTSTRAP_CSS_PATH) return require("node:fs/promises").readFile(process.env.BOOTSTRAP_CSS_PATH, "utf8");
    const response = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css");
    assert.ok(response.ok, "Unable to load pinned Bootstrap CSS");
    return response.text();
  })());

// --- PLAYGROUND AND STARTER EXPORTS ---
test("displayed, copied, and downloaded starters match with CDN or local assets", async () => {
  const browser = await launchBrowser();
  try {
    const playground = await browser.newPage();
    const errors = [];
    playground.on("pageerror", (error) => errors.push(error.message));
    // Capture clipboard writes without depending on OS clipboard permissions.
    await playground.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            window.copiedHTML = text;
          }
        }
      });
    });
    // Keep the pinned CODE companion real while serving this viewer from local authored assets.
    await playground.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if (["https://cdn.jsdelivr.net/gh/byuwur/easy-code-viewer@v1.7/code.min.css", "https://cdn.jsdelivr.net/gh/byuwur/easy-code-viewer@v1.7/code.min.js"].includes(url.href)) {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        assert.ok(response.ok, "Unable to load pinned CODE asset");
        return route.fulfill({ body: await response.text(), contentType: url.pathname.endsWith(".js") ? "text/javascript" : "text/css" });
      }
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      if (/^json\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      const body = await fs.readFile(path.join(__dirname, "..", file));
      await route.fulfill({ body, contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await playground.goto("https://viewer.test/index.html");
    assert.equal(await playground.locator(".playground-toolbar #open-file").count(), 1);
    assert.equal(await playground.locator('[aria-label="JSON examples"] [data-feature]').count(), 6);
    assert.equal(await playground.locator("#source-panel #apply-source").count(), 1);
    assert.equal(await playground.locator("#run-benchmark, #playground > .discovery").count(), 0);
    const release = await playground
      .frameLocator("#preview-frame")
      .locator(".byVIEWtoolbar")
      .evaluate(() => byJSONviewer.VERSION);
    assert.ok((await playground.frameLocator("#preview-frame").locator(".byVIEWinfo").textContent()).includes(` v${release} `), "Credits must match the runtime release");
    assert.equal(await playground.locator("#theme-light").isChecked(), true);
    assert.equal(await playground.locator("#theme-dark").isChecked(), false);
    assert.equal(await playground.frameLocator("#preview-frame").locator("#byJSONrenderer").getAttribute("data-theme"), "light");
    const cdnBase = "https://cdn.jsdelivr.net/gh/byuwur/easy-json-viewer@latest/";
    const starterViewer = playground.locator("#integration-code.byCODEdocument");
    assert.equal(await playground.evaluate(() => byCODEviewer.VERSION), "1.7");
    assert.equal(await starterViewer.getAttribute("data-theme"), "dark");
    await starterViewer.locator(".byCODEtext").first().waitFor();
    assert.ok((await starterViewer.locator(".byCODElineNumber").count()) > 0);
    assert.equal(await starterViewer.locator(".byVIEWtoolbar, button, input, select").count(), 0);
    assert.equal(await starterViewer.locator(".byVIEWstatus:visible").count(), 0);
    assert.deepEqual(await starterViewer.evaluate((element) => [element, element.querySelector(".byVIEWpanel"), element.querySelector(".byCODElineNumber")].map((node) => getComputedStyle(node).backgroundColor)), [
      "rgba(0, 0, 0, 0)",
      "rgba(0, 0, 0, 0)",
      "rgba(0, 0, 0, 0)"
    ]);
    assert.ok((await starterViewer.locator(".byCODEtag").count()) > 0);
    assert.equal(await playground.locator("#integration-code script").count(), 0);
    const starterTagColor = await starterViewer
      .locator(".byCODEtag")
      .first()
      .evaluate((token) => getComputedStyle(token).color);
    await playground.locator("#site-theme").click();
    assert.equal(await starterViewer.getAttribute("data-theme"), "light");
    assert.notEqual(
      await starterViewer
        .locator(".byCODEtag")
        .first()
        .evaluate((token) => getComputedStyle(token).color),
      starterTagColor
    );
    await playground.locator("#site-theme").click();
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const extension of ["css", "js"]) assert.ok(readme.includes(`${cdnBase}json.min.${extension}`), "README assets must match the CDN starter");
    assert.equal(await playground.locator("#install-note").textContent(), "CDN follows the latest release; updates may take time to reach caches.");
    assert.ok((await readStarter(playground)).includes(`href="${cdnBase}json.min.css"`));
    assert.equal(await playground.locator('[data-install="cdn"]').getAttribute("aria-pressed"), "true");
    await playground.locator('[data-install="cdn"]').click();
    const cdnCode = await readStarter(playground);
    assert.match(cdnCode, /^ {2}<head>$/m);
    assert.match(cdnCode, /^ {4}<script>$/m);
    assert.match(cdnCode, /^ {6}document\.addEventListener\("DOMContentLoaded", \(\) => \{$/m);
    assert.ok(cdnCode.includes(cdnBase));
    const renderer = playground.frameLocator("#preview-frame").locator("#byJSONrenderer");
    await renderer.locator(".byJSONstring").first().waitFor();
    await renderer.evaluate((root) => {
      root.style.fontFamily = "serif";
    });
    assert.equal(await playground.locator("#forceMonospace").isChecked(), false);
    assert.equal(await renderer.evaluate((root) => getComputedStyle(root).fontFamily), "serif");
    const defaultSize = await renderer.evaluate((root) => getComputedStyle(root).fontSize);
    await playground.locator("#fontSizeControls").check();
    await renderer.locator(".byVIEWfontSize").nth(2).click();
    assert.notEqual(await renderer.evaluate((root) => getComputedStyle(root).fontSize), defaultSize);
    await playground.locator("#forceMonospace").check();
    assert.equal(JSON.parse(await playground.locator("#options-json").inputValue()).forceMonospace, true);
    assert.ok(await renderer.evaluate((root) => getComputedStyle(root).fontFamily.includes("monospace")));
    await playground.locator("#controlsSize-small").evaluate((input) => input.click());
    await playground.locator("#controlsCompact").check();
    await playground.locator("#controlsPosition-bottom").evaluate((input) => input.click());
    assert.deepEqual(await renderer.evaluate((root) => [root.lastElementChild.dataset.size, root.classList.contains("byVIEWcompact"), root.classList.contains("byVIEWbottom")]), ["small", true, true]);
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
                visible: bounds.top >= -1 && bounds.bottom <= view.innerHeight + 1,
                pinned: Math.abs(position === "top" ? bounds.top : view.innerHeight - bounds.bottom) < 1,
                creditsOrdered: position !== "bottom" || credits.top >= controls.bottom || (credits.top < controls.bottom && credits.bottom > controls.top),
                opaque: getComputedStyle(root.querySelector(".byVIEWcopy")).backgroundColor === getComputedStyle(root).backgroundColor,
                clickable: button.contains(root.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
              };
            },
            { fraction, position }
          );
          assert.deepEqual(visible, { scrollable: true, visible: true, pinned: true, creditsOrdered: true, opaque: true, clickable: true }, `Playground iframe: ${position}, compact=${compact}, scroll=${fraction}`);
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
    assert.equal(await readStarter(playground), cdnCode);
    const source = '{"message":"</script><script>window.injected=true</script>","__proto__":{"kept":true},"items":[1,true,null]}';
    await playground.locator("#json-source").fill(source);
    await playground.locator("#withLinks").uncheck();
    await playground.locator('label[for="theme-light"]').click();
    assert.equal(await renderer.locator(".byVIEWthemeToggle svg").count(), 2);
    assert.equal(await readStarter(playground), cdnCode);
    await playground.locator('[data-install="local"]').click();
    const code = await readStarter(playground);
    assert.ok(code.includes('document.addEventListener("DOMContentLoaded"'));
    assert.ok(!code.includes('"withLinks": false'));
    assert.ok(code.includes('src="./json.js" defer'));
    for (const name of ["toolbar", "credits", "themeToggle", "fontSizeControls", "copyButton"]) {
      await playground.locator(`#${name}`).evaluate((element) => {
        element.checked = false;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "viewer-starter-"));
    await Promise.all(["json.js", "json.css"].map((file) => fs.copyFile(path.join(__dirname, "..", file), path.join(directory, file))));
    // Run the exported starter in a fresh page to catch missing assets or initialization.
    const exported = await browser.newPage();
    exported.on("pageerror", (error) => errors.push(error.message));
    await exported.route("https://cdn.jsdelivr.net/**", async (route) => {
      const file = path.basename(new URL(route.request().url()).pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
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
        const displayed = await readStarter(playground);
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
        assert.equal(await exported.locator("#viewer").getAttribute("data-theme"), "light");
        assert.equal(await exported.locator("#byVIEWtheme").count(), 0);
        assert.equal(await exported.locator('head link[rel="stylesheet"]').count(), 1);
        assert.doesNotMatch(html, /\.(light|dark)\.css/);
        for (const extension of ["css", "js"]) assert.ok(html.includes(`json${mode === "cdn" ? ".min" : ""}.${extension}`));
        const background = await exported.locator("#viewer").evaluate((element) => getComputedStyle(element).backgroundColor);
        await exported.locator(".byVIEWthemeToggle").click();
        await exported.waitForFunction((before) => getComputedStyle(document.getElementById("viewer")).backgroundColor !== before, background);
        assert.equal(await exported.locator(".byVIEWfontSize").count(), 3);
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
    assert.equal(await readStarter(playground), code);
    await playground.locator("#copy-code").click();
    assert.equal(await playground.evaluate(() => window.copiedHTML), code);
    assert.deepEqual(errors, []);
    await playground.close();
  } finally {
    await browser.close();
  }
});

// --- CONFIGURATION AND FAMILY NAVIGATION ---
test("family customization, navigation and monospace controls", async () => {
  const bootstrapJS = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/js/bootstrap.min.js").then((response) => {
    assert.ok(response.ok, "Unable to load pinned Bootstrap JS");
    return response.text();
  });
  const browser = await launchBrowser();
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
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/js/bootstrap.min.js") return route.fulfill({ body: bootstrapJS, contentType: "text/javascript" });
      const url = new URL(route.request().url());
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      if (/^json\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    assert.equal(await page.locator("#controlsCompact").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsCompact, true);
    assert.equal(await frame.locator(".byJSONdocument").evaluate((root) => root.classList.contains("byVIEWcompact")), true);
    assert.deepEqual(
      await frame.evaluate(async (source) => {
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
      }, "Sample"),
      [true, false, true, true, true],
      "Compact defaults, opt-out, rerenders, and disabled controls agree"
    );
    assert.deepEqual(
      await page
        .locator(".form-switch .form-check-input")
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { width: style.width, height: style.height };
        }),
      { width: "44px", height: "24px" }
    );
    assert.equal(
      await page.locator(".form-switch .form-check-input").evaluateAll((inputs) =>
        inputs.every((input) => {
          const toggle = input.getBoundingClientRect();
          const row = input.closest(".form-switch").getBoundingClientRect();
          return Math.abs(toggle.right - row.right) < 1 && Math.abs(toggle.top + toggle.height / 2 - row.top - row.height / 2) < 1;
        })
      ),
      true,
      "Every switch lines up at the right edge and center of its row"
    );
    await page.locator("#config-panel").evaluate((panel) => panel.classList.add("active"));
    for (const width of [360, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(
        await page.locator("#controlsSize").evaluate((size) => {
          const a = size.querySelector(".btn-group").getBoundingClientRect();
          const position = document.getElementById("controlsPosition");
          const b = position.querySelector(".btn-group").getBoundingClientRect();
          const legend = position.querySelector("legend");
          return (
            Math.abs(a.top - b.top) < 1 &&
            Math.abs(size.getBoundingClientRect().width - 2 * position.getBoundingClientRect().width) < 1 &&
            a.right < b.left &&
            legend.textContent === "Position" &&
            legend.getBoundingClientRect().height <= parseFloat(getComputedStyle(legend).lineHeight) + 1 &&
            [...size.querySelectorAll("label")].every((label) => label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= a.right + 1)
          );
        }),
        true,
        "Size and position controls share a 2:1 row without wrapping"
      );
    }
    assert.deepEqual(
      await page
        .locator(".accordion-button")
        .allTextContents()
        .then((labels) => labels.map((label) => label.trim()).slice(0, 3)),
      ["Preview appearance", "Viewer controls", "Rendering"]
    );
    assert.deepEqual(await page.locator("#options-json").evaluate((editor) => Object.keys(JSON.parse(editor.value)).slice(0, 21)), [
      "theme",
      "palette",
      "fontFamily",
      "fontSize",
      "lineHeight",
      "controlsFont",
      "backgroundColor",
      "containerBackgroundColor",
      "textColor",
      "customThemeCSS",
      "forceMonospace",
      "toolbar",
      "credits",
      "themeToggle",
      "fontSizeControls",
      "copyButton",
      "controlsCompact",
      "animations",
      "appearAnimation",
      "controlsSize",
      "controlsPosition"
    ]);
    assert.equal(await page.locator(".intro h1 + p").textContent(), "Plain JavaScript. No dependencies. Open source. Free. Forever.");
    assert.ok((await page.locator("header .brand-mark").textContent()).trim());

    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#141618");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(20, 22, 24)");
    assert.equal(
      await page
        .locator(".source-editor")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgb(20, 22, 24)"
    );
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#141618");
    await page.locator("#site-theme").evaluate((button) => button.click());
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#fff");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#fff");
    const root = frame.locator(".byJSONdocument");
    const initial = await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") }));
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    assert.equal(await page.locator('[aria-label="Viewer suite"] a').count(), 9);
    assert.equal(await page.locator(".viewer-suite").getByRole("link", { name: "MD.edit", exact: true }).getAttribute("href"), "https://byuwur.github.io/easy-md-editor/");
    assert.equal(await page.locator('[aria-label="Viewer suite"]').getByRole("link", { name: "JSON", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".site-footer .fa-heart").count(), 1);
    assert.equal(await page.locator("header .fa-github").count(), 1);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Viewer suite"]').compareDocumentPosition(document.querySelector("footer")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".preview-appearance"), "::details-content").opacity === "1");
    // Firefox may defer focus until the newly opened disclosure has rendered.
    await page.waitForFunction(() => {
      const radio = document.getElementById("preview-controls-font-0");
      radio.focus();
      return document.activeElement === radio;
    });
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#preview-controls-font-1").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsFont, "system-ui, sans-serif");
    await page.keyboard.press("ArrowLeft");
    await page.evaluate(() => {
      for (const [id, value] of [
        ["preview-font", "Georgia, serif"],
        ["preview-size", "1.5"],
        ["preview-leading", "1.8"],
        ["preview-controls-font", "system-ui, sans-serif"],
        ["preview-bg", "#123456"],
        ["preview-ink", "#fedcba"]
      ]) {
        const input = id === "preview-controls-font" ? document.querySelector(`[name="preview-controls-font"][value="${value}"]`) : document.getElementById(id);
        if (input.type === "radio") input.checked = true;
        else input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await frame.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor === "rgb(18, 52, 86)", ".byJSONdocument");
    assert.deepEqual(
      await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: Math.round(parseFloat(style.lineHeight) * 1000) / 1000, bg: style.backgroundColor, text: style.color };
      }),
      { font: "Georgia, serif", size: "24px", line: 43.2, bg: "rgb(18, 52, 86)", text: "rgb(254, 220, 186)" }
    );
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /system-ui/);
    await page.locator("#copy-appearance").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes("--by-view-controls-font"));
    assert.match(await page.evaluate(() => lastCopy), /\.byJSONdocument/);
    assert.ok((await page.evaluate(() => lastCopy)).includes("--by-view-document-bg: #123456"));
    await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
    const configuration = JSON.parse(await page.locator("#options-json").inputValue());
    for (const [name, value] of Object.entries({
      theme: "light",
      fontFamily: "Georgia, serif",
      fontSize: 1.5,
      lineHeight: 1.8,
      controlsFont: "system-ui, sans-serif",
      backgroundColor: "#123456",
      containerBackgroundColor: null,
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
    for (const [size, rem] of [
      ["xs", 0.5],
      ["xl", 1.25]
    ]) {
      await page.locator(`label[for="controlsSize-${size}"]`).click();
      await frame.waitForFunction((size) => document.querySelector(".byVIEWtoolbar").dataset.size === size, size);
      assert.equal(await frame.locator(".byVIEWtoolbar").evaluate((toolbar) => parseFloat(getComputedStyle(toolbar).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize)), rem);
      await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
      assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsSize, size);
      await page.locator("#copy-options").evaluate((button) => button.click());
      await page.waitForFunction((size) => JSON.parse(window.lastCopy).controlsSize === size, size);
      await page.locator('[data-options-view="form"]').evaluate((button) => button.click());
    }
    await page.locator("#displayContainer").uncheck();
    await frame.waitForFunction(() => document.querySelector(".byVIEWplain"));
    assert.equal(await page.locator("#statusBar").isDisabled(), true);
    assert.equal(await page.locator("#statusBar").isChecked(), true);
    assert.equal(await frame.locator(".byVIEWstatus:visible").count(), 0);
    assert.equal(await frame.locator(".byVIEWpanel").evaluate((panel) => parseFloat(getComputedStyle(panel).borderTopWidth)), 0);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).displayContainer, false);
    await page.locator("#copy-options").evaluate((button) => button.click());
    await page.waitForFunction(() => JSON.parse(window.lastCopy).displayContainer === false);
    await page.locator("#displayContainer").check();
    await frame.waitForFunction(() => !document.querySelector(".byVIEWplain"));
    assert.equal(await page.locator("#statusBar").isDisabled(), false);
    await frame.locator(".byVIEWpanel > .byVIEWstatus").waitFor({ state: "visible" });
    assert.equal(await frame.locator(".byVIEWpanel > .byVIEWstatus:visible").count(), 1);
    await page.locator("#reset-settings").evaluate((button) => button.click());
    assert.deepEqual(await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") })), initial);
    assert.equal(await page.locator("#theme-light").isChecked(), true);
    assert.equal(await root.getAttribute("data-theme"), "light");
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    await page.setViewportSize({ width: 1280, height: 900 });
    const jsonSource = page.locator("#json-source");
    const largeSource = JSON.stringify({ message: "Imported live", padding: "x".repeat(70000) });
    await page.locator("#local-file").setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.from(largeSource) });
    await frame.waitForFunction(() => document.querySelector("#byJSONrenderer").textContent.includes("Imported live"));
    assert.equal(await jsonSource.inputValue(), largeSource);
    assert.equal(await page.locator("#source-preset").inputValue(), "custom");
    await jsonSource.fill(largeSource.replace("Imported live", "Superseded edit"));
    await jsonSource.fill(largeSource.replace("Imported live", "Latest live edit"));
    await frame.waitForFunction(() => document.querySelector("#byJSONrenderer").textContent.includes("Latest live edit"));
    assert.equal(await frame.locator("#byJSONrenderer").evaluate((element) => element.textContent.includes("Superseded edit")), false);
    await jsonSource.fill('{"incomplete":');
    await page.waitForFunction(() => document.getElementById("json-source").getAttribute("aria-invalid") === "true");
    assert.equal(await frame.locator("#byJSONrenderer").evaluate((element) => element.textContent.includes("Latest live edit")), true);
    await page.evaluate(() => {
      for (const [name, value] of [
        ["chunkSize", 1],
        ["chunkLatency", 10]
      ]) {
        const input = document.getElementById(name);
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const chunkedSource = JSON.stringify(Array.from({ length: 80 }, (_, index) => `Obsolete chunk ${index} ` + "x".repeat(1000)));
    await jsonSource.fill(chunkedSource);
    await frame.waitForFunction(() => document.querySelector("#byJSONrenderer").getAttribute("aria-busy") === "true" && document.querySelector("#byJSONrenderer").textContent.includes("Obsolete chunk 0"));
    await jsonSource.fill(largeSource.replace("Imported live", "Replacement during rendering"));
    await frame.waitForFunction(() => document.querySelector("#byJSONrenderer").getAttribute("aria-busy") === "false" && document.querySelector("#byJSONrenderer").textContent.includes("Replacement during rendering"));
    assert.equal(await frame.locator("#byJSONrenderer li").count(), 2);
    assert.equal(await frame.locator("#byJSONrenderer").evaluate((element) => element.textContent.includes("Obsolete chunk")), false);
    await page.locator("#source-preset").selectOption("benchmark");
    await page.waitForFunction(() => document.getElementById("preview-status").textContent.startsWith("Rendered"));
    const benchmark = await jsonSource.inputValue();
    const changedBenchmark = JSON.stringify({ ...JSON.parse(benchmark), liveEdit: "Benchmark edits stay live" });
    await jsonSource.fill(changedBenchmark);
    await frame.waitForFunction(() => document.querySelector("#byJSONrenderer").textContent.includes("Benchmark edits stay live"));
    await page.evaluate(() => {
      window.originalFileText = File.prototype.text;
      File.prototype.text = () =>
        new Promise((resolve) => {
          window.finishFileRead = resolve;
        });
    });
    try {
      for (const action of ["edit", "sample", "restore", "format"]) {
        await jsonSource.fill(largeSource);
        await page.locator("#local-file").setInputFiles({ name: "pending.json", mimeType: "application/json", buffer: Buffer.from('{"obsolete":true}') });
        if (action === "edit") await jsonSource.fill('{"newer":"edit"}');
        else if (action === "sample") await page.locator("#source-preset").selectOption("nested");
        else if (action === "restore") await page.locator("#restore-source").click();
        else await page.locator("#format-source").click();
        const expected = await jsonSource.inputValue();
        await page.evaluate(() => window.finishFileRead('{"obsolete":true}'));
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await jsonSource.inputValue(), expected, "Late imports preserve newer edits and source actions");
      }
    } finally {
      await page.evaluate(() => {
        File.prototype.text = window.originalFileText;
      });
    }
    for (const example of ["nested", "mixed", "urls", "characters", "bigNumbers", "progressive"]) {
      await page.locator(`#features [data-feature="${example}"]`).click();
      await page.waitForFunction((expected) => document.getElementById("source-preset").value === expected && document.getElementById("preview-status").textContent.startsWith("Rendered"), example === "progressive" ? "basic" : example);
      assert.equal(await page.locator("#json-source").getAttribute("aria-invalid"), "false");
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// --- PALETTES AND CUSTOM THEME EDITING ---
test("playground palettes and editable two-mode custom themes stay synchronized", async () => {
  // Fetch before routing so CDN failures reject this test instead of an unowned route handler.
  const [pickerCSS, pickerJS] = await Promise.all(
    ["css", "js"].map(async (extension) => {
      const response = await fetch(`https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/${extension}/pickr.min.${extension}`);
      assert.ok(response.ok, `Unable to load pinned Pickr ${extension.toUpperCase()}`);
      return response.text();
    })
  );
  const browser = await launchBrowser();
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
      const url = new URL(route.request().url());
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/pickr.min.css") return route.fulfill({ body: pickerCSS, contentType: "text/css" });
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/js/pickr.min.js") return route.fulfill({ body: pickerJS, contentType: "text/javascript" });
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.7/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname).replace(/\.min(?=\.(?:css|js)$)/, "");
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    const root = frame.locator(".byJSONdocument");
    const editor = page.locator("#custom-theme-css");
    const palette = page.locator("#preview-palette");
    const background = () =>
      root.evaluate((element) => {
        for (const animation of element.getAnimations()) if (animation.transitionProperty === "background-color") animation.finish();
        return getComputedStyle(element).backgroundColor;
      });
    // Hiding the header must disable dependent controls without erasing their configured values.
    const headerSettings = page.locator('#credits, #themeToggle, #fontSizeControls, #copyButton, #controlsCompact, [name="controlsSize"], [name="controlsPosition"]');
    const selectedSettings = await headerSettings.evaluateAll((controls) => controls.map((control) => [control.value, control.checked]));
    await page.locator("#toolbar").uncheck();
    await page.waitForFunction(() => document.getElementById("credits").disabled);
    assert.equal(await headerSettings.evaluateAll((controls) => controls.every((control) => control.disabled)), true);
    assert.equal(await page.locator("#animations").isEnabled(), true, "Content motion is independent of the viewer header");
    if (await page.locator("#displayContainer").count()) assert.equal(await page.locator("#displayContainer").isEnabled(), true);
    assert.deepEqual(await headerSettings.evaluateAll((controls) => controls.map((control) => [control.value, control.checked])), selectedSettings);
    await page.locator("#toolbar").check();
    await page.waitForFunction(() => !document.getElementById("credits").disabled);
    assert.equal(await headerSettings.evaluateAll((controls) => controls.every((control) => !control.disabled)), true);
    assert.equal(await page.locator("#appearAnimation").isChecked(), false);
    await page.locator("#appearAnimation").check();
    await page.locator("#animations").uncheck();
    await page.waitForFunction(() => document.getElementById("appearAnimation").disabled);
    assert.equal(await page.locator("#appearAnimation").isChecked(), true, "Disabling motion preserves the entrance preference");
    await page.locator("#animations").check();
    await page.waitForFunction(() => !document.getElementById("appearAnimation").disabled);
    await page.locator("#appearAnimation").uncheck();
    const initialBackground = await background();
    const hostBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await palette.inputValue(), "monokai");
    await page.waitForFunction(() => document.getElementById("custom-theme-css").value.includes('.dark[data-theme="custom"]'));
    const defaults = await editor.inputValue();
    assert.ok(defaults.includes('.byJSONdocument.light[data-theme="custom"]'));
    await palette.selectOption("github");
    const setMode = (mode) =>
      page.evaluate((mode) => {
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
    assert.equal(await palette.locator("optgroup").count(), 5);
    assert.equal(await palette.locator("option").count(), 49);
    for (const [name, expected] of Object.entries({
      solarized: "rgb(0, 43, 54)",
      dracula: "rgb(40, 42, 54)",
      darcula: "rgb(43, 43, 43)",
      discord: "rgb(49, 51, 56)",
      sakura: "rgb(48, 28, 44)",
      bubblegum: "rgb(59, 11, 45)",
      terminal: "rgb(13, 26, 17)",
      "high-contrast": "rgb(0, 0, 0)"
    })) {
      await palette.selectOption(name);
      assert.equal(await root.getAttribute("data-theme"), name);
      assert.ok((await editor.inputValue()).includes("--by-view-bg"));
      await setMode("dark");
      assert.equal(await background(), expected);
    }
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    // Distinct light and dark values expose mode mixups and CSS leaking into the host page.
    const custom = '.byJSONdocument.light[data-theme="custom"] { --by-view-bg: #f3f8fc; }\n.byJSONdocument.dark[data-theme="custom"] { --by-view-bg: #102a43; }';
    // fill() does not wait for the disclosure's opening transition.
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".preview-appearance"), "::details-content").opacity === "1");
    await editor.fill(custom);
    assert.equal(await editor.inputValue(), custom);
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
    await page.locator("#preview-bg").evaluate((field) => (field.closest("details").open = true));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("preview-bg").closest("details"), "::details-content").opacity === "1");
    await page.locator("#preview-bg").fill("transparent");
    await page.locator("#preview-bg").dispatchEvent("change");
    await page.locator('[data-color-picker="preview-container-bg"]').click();
    const picker = page.locator(".pcr-app.visible");
    await picker.locator('.pcr-type[data-type="HEXA"]').waitFor();
    assert.deepEqual(await picker.locator(".pcr-type:visible").evaluateAll((formats) => formats.map((format) => format.dataset.type)), ["HEXA"]);
    assert.match(await picker.locator(".pcr-result").inputValue(), /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
    assert.equal(await page.locator("#preview-container-bg").inputValue(), "", "Opening the picker retains the theme default");
    await picker.locator(".pcr-result").fill("#345678cc");
    await picker.locator(".pcr-result").press("Enter");
    await picker.locator(".pcr-save").click();
    assert.equal((await page.locator("#preview-container-bg").inputValue()).toLowerCase(), "#345678cc");
    await page.waitForFunction(() => {
      const document = window.document.getElementById("preview-frame").contentDocument;
      return getComputedStyle(document.querySelector(".byVIEWcopy")).backgroundColor === "rgba(52, 86, 120, 0.8)";
    });
    assert.equal(await background(), "rgba(0, 0, 0, 0)");
    await page.locator("#preview-bg").fill("not a color");
    await page.locator("#preview-bg").dispatchEvent("change");
    assert.equal(await page.locator("#preview-bg").evaluate((field) => field.checkValidity()), false);
    await page.locator("#reset-settings").click();
    assert.equal(await page.locator("#preview-bg").evaluate((field) => field.checkValidity()), true);
  } finally {
    await browser.close();
  }
});
