/*
 * File: __tests__/rendering.cjs
 * Desc: Bounded, offline checks for the public JSON renderer contract.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { chromium, firefox, webkit } = require("playwright");
const engine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine), "Unsupported BROWSER_ENGINE");

test("JSON library", { timeout: 30000 }, async (t) => {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    timeout: 10000,
    ...(engine === "chromium" ? { channel: process.env.BROWSER_CHANNEL, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Load authored files directly; CDN availability is not part of this contract.
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<!doctype html><meta charset="UTF-8"><div id="viewer"></div>');
  await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
  await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
  await page.evaluate(() => {
    window.root = document.getElementById("viewer");
  });

  await t.test("host transitions cannot delay the initial palette or text resizing", async () => {
    // A painted host container has a previous background; newly created content does not.
    const hostStyle = await page.addStyleTag({ content: "* { transition: width 1s linear, height 1s linear, transform 1s linear, margin 1s linear, padding 1s linear, background-color 1s linear, opacity 1s linear !important; }" });
    try {
      const initial = await page.evaluate(() => {
        getComputedStyle(root).backgroundColor;
        byJSONviewer(root, { message: "First paint" });
        return {
          background: getComputedStyle(root).backgroundColor,
          panelBackground: getComputedStyle(root.querySelector(".byVIEWpanel")).backgroundColor,
          transitions: root.getAnimations().length,
          opacity: getComputedStyle(root).opacity
        };
      });
      assert.equal(initial.background, initial.panelBackground);
      assert.equal(initial.transitions, 0);
      assert.equal(initial.opacity, "1");
      await page.waitForFunction(() => root.classList.contains("byVIEWready"));
      const resized = await page.evaluate(() => {
        const row = root.querySelector("li");
        Object.assign(row.style, { width: "10em", height: "2em", margin: "1em", padding: "1em", transform: "translateX(0px)" });
        getComputedStyle(row).width;
        root.querySelector('[aria-label="Increase text size"]').click();
        row.style.transform = "translateX(40px)";
        const style = getComputedStyle(row);
        return {
          fontSize: parseFloat(style.fontSize),
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          margin: parseFloat(style.marginLeft),
          padding: parseFloat(style.paddingLeft),
          transform: style.transform,
          transitions: row.getAnimations().length
        };
      });
      assert.ok(Math.abs(resized.width - resized.fontSize * 10) < 0.1);
      assert.ok(Math.abs(resized.height - resized.fontSize * 2) < 0.1);
      assert.ok(Math.abs(resized.margin - resized.fontSize) < 0.1);
      assert.ok(Math.abs(resized.padding - resized.fontSize) < 0.1);
      assert.equal(resized.transform, "matrix(1, 0, 0, 1, 40, 0)");
      assert.equal(resized.transitions, 0);
      const duration = await page.evaluate(() => {
        root.querySelector(".byVIEWthemeToggle").click();
        getComputedStyle(root).backgroundColor;
        return root
          .getAnimations()
          .find((animation) => animation instanceof CSSTransition && animation.transitionProperty === "background-color")
          ?.effect.getTiming().duration;
      });
      assert.equal(duration, 200);
    } finally {
      await hostStyle.evaluate((element) => element.remove());
    }
  });

  await t.test("renders nested values and supports disclosure", async () => {
    await page.evaluate(() => byJSONviewer(root, { name: "core", values: [0, false, null] }, { collapsed: true, animations: false }));
    await page.waitForFunction(() => document.querySelectorAll("#viewer li").length === 5);
    const content = await page.locator(".byJSONcontent").textContent();
    for (const value of ["core", "0", "false", "null"]) assert.ok(content.includes(value));
    const toggle = page.locator(".byJSONtoggle").first();
    const before = await toggle.getAttribute("aria-expanded");
    await toggle.click();
    assert.notEqual(await toggle.getAttribute("aria-expanded"), before);
  });

  await t.test("keeps untrusted markup and executable URLs inert", async () => {
    await page.evaluate(() => byJSONviewer(root, { html: '<img src=x onerror="window.injected=1">', url: "javascript:alert(1)" }));
    await page.waitForFunction(() => document.querySelectorAll("#viewer li").length === 2);
    assert.equal(await page.locator("#viewer img, #viewer a[href^='javascript:']").count(), 0);
    assert.match(await page.locator(".byJSONcontent").textContent(), /<img/);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });

  await t.test("replacement cancels pending chunks", async () => {
    await page.evaluate(() => {
      byJSONviewer(root, Array(20).fill("stale"), { chunkSize: 1, chunkLatency: 1 });
      byJSONviewer(root, ["current"], { chunkSize: 1, chunkLatency: 1 });
    });
    await page.waitForFunction(() => document.querySelectorAll("#viewer li").length === 1);
    // Let the replaced renderer's scheduled chunks run before checking ownership.
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#viewer li").count(), 1);
    assert.equal(await page.locator("#viewer li").textContent(), '"current"');
  });

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
