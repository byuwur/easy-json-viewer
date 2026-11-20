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
  // ===== BROWSER FIXTURE =====
  await page.setContent('<!doctype html><meta charset="UTF-8"><div id="viewer"></div>');
  await page.addStyleTag({ path: path.join(__dirname, "../json.css") });
  await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
  await page.evaluate(() => {
    window.root = document.getElementById("viewer");
  });

  // ===== RENDERING BEHAVIOR =====
  await t.test("big-number adapters preserve ordinary records carrying the same marker", async () => {
    await page.evaluate(() => {
      byJSONviewer(
        root,
        [
          { isLosslessNumber: true, description: "ordinary record" },
          { isLosslessNumber: true, toString: () => "9007199254740993" }
        ],
        { bigNumbers: true, chunkLatency: 0 }
      );
    });
    await page.waitForFunction(() => root.textContent.includes("ordinary record"));
    assert.match(await page.locator(".byJSONcontent").textContent(), /9007199254740993/);
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
    await page.evaluate(() =>
      byJSONviewer(root, {
        html: '<img src=x onerror="window.injected=1">',
        url: "javascript:alert(1)"
      })
    );
    await page.waitForFunction(() => document.querySelectorAll("#viewer li").length === 2);
    assert.equal(await page.locator("#viewer img, #viewer a[href^='javascript:']").count(), 0);
    assert.match(await page.locator(".byJSONcontent").textContent(), /<img/);
    assert.equal(await page.evaluate(() => window.injected), undefined);
  });

  await t.test("live configuration preserves pending JSON chunks and applies new formatting", async () => {
    const result = await page.evaluate(async () => {
      const viewer = byJSONviewer(root, { first: [1, 2], second: [3, 4] }, { chunkSize: 1, chunkLatency: 8 });
      const panel = root.querySelector(".byVIEWpanel");
      const rootToggle = root.querySelector(".byJSONtoggle");
      rootToggle.click();
      viewer.setOptions({ theme: "dark" });
      const retained = rootToggle === root.querySelector(".byJSONtoggle") && rootToggle.getAttribute("aria-expanded") === "false";
      const ready = viewer.ready;
      viewer.setOptions({ withQuotes: false, collapsed: true, chunkLatency: 0 });
      return {
        rendered: await ready,
        retained,
        panel: panel === root.querySelector(".byVIEWpanel"),
        labels: [...root.querySelectorAll("li > .byJSONtoggle")].map((node) => [node.dataset.label, node.getAttribute("aria-expanded")]),
        entries: root.querySelectorAll("li").length
      };
    });
    assert.deepEqual(result, {
      rendered: true,
      retained: true,
      panel: true,
      labels: [
        ["first", "false"],
        ["second", "false"]
      ],
      entries: 6
    });
  });

  await t.test("replacement cancels pending chunks", async () => {
    const replaced = await page.evaluate(() => {
      const old = byJSONviewer(root, Array(20).fill("stale"), { chunkSize: 1, chunkLatency: 1 });
      byJSONviewer(root, ["current"], { chunkSize: 1, chunkLatency: 1 });
      return old.ready;
    });
    assert.equal(replaced, false);
    await page.waitForFunction(() => document.querySelectorAll("#viewer li").length === 1);
    // Let the replaced renderer's scheduled chunks run before checking ownership.
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#viewer li").count(), 1);
    assert.equal(await page.locator("#viewer li").textContent(), '"current"');
  });

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
