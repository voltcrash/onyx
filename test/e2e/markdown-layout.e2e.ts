import { expect, test } from "@playwright/test";

test("lays out links, nested tasks, math and code without stray scrollbars", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(
    '# Layout\n\n[External](https://example.com)\n\n- [x] Parent\n  - [ ] Child\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n```ts\nconst long = "' +
      "word".repeat(80) +
      '";\n```',
  );
  const article = page.locator(".rendered-pane article");
  await expect(article.locator("math")).toHaveCount(1);
  await expect(article.locator('a[href="https://example.com"]')).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  const tasks = await article
    .locator("input")
    .evaluateAll((inputs) => inputs.map((input) => input.getBoundingClientRect().x));
  expect(tasks[1]! - tasks[0]!).toBeGreaterThanOrEqual(16);
  const math = article.locator(".katex");
  expect(await math.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(math).toHaveCSS("overflow-y", "hidden");
  await expect(article.locator("pre")).toHaveCSS("color-scheme", "dark");
  await expect(article.locator("pre code")).toHaveCSS("overflow-x", "visible");
  expect(
    await article.locator("pre").evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
});

test("aligns the wrapped lines of a task item with its text", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  const long = "Wrap this task item onto more lines ".repeat(4);
  await editor.fill(`- [ ] ${long}\n  - [ ] ${long}\n\n- [ ] Loose\n\n- [ ] ${long}`);

  const items = page.locator(".rendered-pane li.task-list-item");
  await expect(items).toHaveCount(4);
  const layouts = await items.evaluateAll((elements) =>
    elements.map((item) => {
      const checkbox = item.querySelector("input")!;
      const text = [...checkbox.parentElement!.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim(),
      )!;
      const range = document.createRange();
      range.setStart(text, text.textContent!.search(/\S/));
      range.setEnd(text, text.textContent!.trimEnd().length);
      const lines = [...range.getClientRects()].map((rect) => Math.round(rect.left));
      return {
        lines: lines.length,
        lefts: new Set(lines).size,
        gap: lines[0]! - checkbox.getBoundingClientRect().right,
      };
    }),
  );
  for (const layout of [layouts[0], layouts[1], layouts[3]]) {
    expect(layout!.lines).toBeGreaterThan(1);
    expect(layout!.lefts).toBe(1);
    expect(layout!.gap).toBeGreaterThanOrEqual(6);
  }
});

test("left-aligns wrapped outline entries", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(`# ${"A long heading that wraps in the outline ".repeat(3)}\n\n## Short`);
  await page.locator(".note-outline summary").click();

  const entry = page.getByRole("navigation", { name: "Outline" }).getByRole("button").first();
  const lefts = await entry.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return [...range.getClientRects()].map((rect) => Math.round(rect.left));
  });
  expect(lefts.length).toBeGreaterThan(1);
  expect(new Set(lefts).size).toBe(1);
});
