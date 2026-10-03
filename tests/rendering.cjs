const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const test = require("node:test");
const { chromium } = require("playwright");

test("JSON rendering", async (t) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, "../json.js") });
    const benchmark = JSON.parse(await fs.readFile(path.join(__dirname, "../test.json"), "utf8"));
    const results = await page.evaluate(async (benchmark) => {
      const waitFor = async (verify) => {
        const deadline = Date.now() + 2000;
        while (!verify()) {
          if (Date.now() > deadline) throw new Error("Rendering timed out");
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      };
      const render = async (value, count = 0, options = {}) => {
        const root = document.createElement("div");
        byJSONviewer(root, value, { themeToggle: false, fontSizeControls: false, chunkLatency: 0, ...options });
        await waitFor(() => root.querySelectorAll("li").length === count);
        return root;
      };
      const cases = [
        ["primitive values render", async () => {
          for (const [value, expected] of [[null, "null"], [true, "true"], [false, "false"], [0, "0"], [-12.5, "-12.5"], [42n, "42"], [Infinity, "null"], [NaN, "null"]]) {
            if ((await render(value)).textContent !== expected) return false;
          }
          return true;
        }],
        ["strings preserve JSON escapes and Unicode", async () => {
          const value = 'quotes " slash \\ newline\n\t\u00e1\ud83d\ude00';
          return (await render(value)).textContent === JSON.stringify(value);
        }],
        ["HTML strings and keys stay inert", async () => {
          const root = await render({ '<img src=x onerror=alert(1)>': '<script>alert(1)</script>' }, 1);
          return !root.querySelector("img, script") && root.textContent.includes("<script>alert(1)</script>");
        }],
        ["empty collections have no toggles", async () => {
          const object = await render({});
          const array = await render([]);
          return object.textContent === "{}" && array.textContent === "[]" && !object.querySelector("a") && !array.querySelector("a");
        }],
        ["nested objects and arrays render", async () => {
          const root = await render({ list: [1, { active: true }] }, 4);
          return root.querySelectorAll("ul").length === 2 && root.querySelectorAll("ol").length === 1 && root.querySelectorAll(".byJSONliteral")[1]?.textContent === "true";
        }],
        ["chunked arrays keep order and commas", async () => {
          const root = await render([0, 1, 2, 3, 4], 5, { chunkSize: 2, chunkLatency: 5 });
          return [...root.querySelectorAll("ol > li")].map(li => li.textContent).join("|") === "0,|1,|2,|3,|4";
        }],
        ["chunked objects keep key order", async () => {
          const root = await render({ first: 1, second: 2, third: 3 }, 3, { chunkSize: 1, chunkLatency: 5 });
          return [...root.querySelectorAll("ul > li")].map(li => li.textContent).join("|") === '"first": 1,|"second": 2,|"third": 3';
        }],
        ["invalid chunk options use defaults", async () => {
          const root = await render([1, 2], 2, { chunkSize: 0, chunkLatency: -1 });
          return root.querySelectorAll("li").length === 2;
        }],
        ["collapse and placeholder restore the root", async () => {
          const root = await render([1, 2], 2, { collapsed: true });
          const toggle = root.querySelector(".byJSONtoggle");
          if (toggle.getAttribute("aria-expanded") !== "false" || !root.querySelector("ol").classList.contains("collapsed")) return false;
          root.querySelector(".byJSONplaceholder").click();
          return toggle.getAttribute("aria-expanded") === "true" && !root.querySelector("ol").classList.contains("collapsed");
        }],
        ["nested collapse works without a root toggle", async () => {
          const root = await render({ child: [1] }, 2, { rootCollapsible: false, collapsed: true });
          const toggle = root.querySelector(".byJSONtoggle");
          if (root.firstElementChild.tagName !== "UL" || toggle.getAttribute("aria-expanded") !== "false") return false;
          toggle.click();
          return toggle.getAttribute("aria-expanded") === "true";
        }],
        ["unquoted keys preserve values", async () => {
          const root = await render({ name: "John" }, 1, { withQuotes: false });
          return root.querySelector("li").textContent === 'name: "John"';
        }],
        ["supported URL protocols get safe links", async () => {
          for (const value of ["https://example.com", "http://example.com", "ftp://example.com", "ftps://example.com"]) {
            const link = (await render(value)).querySelector("a");
            if (link?.getAttribute("href") !== value || link.target !== "_blank" || link.rel !== "noopener noreferrer") return false;
          }
          return true;
        }],
        ["executable URLs stay text", async () => {
          for (const value of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
            if ((await render(value)).querySelector("a")) return false;
          }
          return true;
        }],
        ["links can be disabled", async () => !(await render("https://example.com", 0, { withLinks: false })).querySelector("a")],
        ["big-number objects render as scalars", async () => {
          const value = { isLosslessNumber: true, toString: () => "900719925474099312345" };
          const root = await render(value, 0, { bigNumbers: true });
          return root.textContent === value.toString() && !root.querySelector(".byJSONtoggle");
        }],
        ["rerender cancels pending chunks", async () => {
          const root = document.createElement("div");
          const options = { themeToggle: false, fontSizeControls: false, chunkSize: 1, chunkLatency: 10 };
          byJSONviewer(root, ["stale", "stale", "stale"], options);
          byJSONviewer(root, ["current"], options);
          await new Promise(resolve => setTimeout(resolve, 60));
          return root.querySelectorAll("li").length === 1 && root.querySelector("li").textContent === '"current"';
        }],
        ["separate viewers render independently", async () => {
          const [first, second] = await Promise.all([render([1, 2], 2), render({ value: 3 }, 1)]);
          return first.querySelectorAll("li").length === 2 && second.querySelector("li").textContent === '"value": 3';
        }],
        ["invalid targets throw TypeError", async () => {
          try { byJSONviewer(null, {}); } catch (error) { return error instanceof TypeError; }
          return false;
        }],
        ["benchmark document renders completely", async () => {
          const countItems = value => value && typeof value === "object" ? Object.values(value).reduce((count, item) => count + 1 + countItems(item), 0) : 0;
          const root = await render(benchmark, countItems(benchmark));
          return root.classList.contains("byJSONdocument") && root.querySelectorAll("li").length === countItems(benchmark);
        }]
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
  } finally {
    await browser.close();
  }
});
