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
