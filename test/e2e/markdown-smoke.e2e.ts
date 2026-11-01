import { expect, test } from "@playwright/test";

const fixture =
  "# Stable preview\n\n| A | B |\n| - | - |\n| one | two |\n\n$E=mc^2$\n\n> [!NOTE]\n> Keep this callout.\n\n```ts\nconst x = 1;\n```\n\nFootnote[^1].\n\n[^1]: Detail\n\n![local](attachments/picture.png)\n\nThe end. ";

test("retains full blocks and DOM while typing, then shows the latest edit", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(fixture);
  await expect(page.locator(".rendered-pane .footnotes")).toHaveCount(1);
  await editor.press("ControlOrMeta+End");
  await page.evaluate(() => {
    const article = document.querySelector(".rendered-pane article")!;
    const selectors = ["table", ".katex", ".callout", ".footnotes", "pre code.hljs", "img"];
    const originals = selectors.map((selector) => article.querySelector(selector));
    const failures: string[] = [];
    const observer = new MutationObserver(() => {
      selectors.forEach((selector, index) => {
        if (article.querySelector(selector) !== originals[index]) failures.push(selector);
      });
    });
    observer.observe(article, { childList: true, subtree: true });
    Reflect.set(window, "previewProbe", { failures, observer });
  });
  await page.keyboard.type("Latest text stays visible.", { delay: 25 });
  await expect(page.locator(".rendered-pane article")).toContainText("Latest text stays visible.");
  expect(
    await page.evaluate(() => {
      const probe = Reflect.get(window, "previewProbe");
      probe.observer.disconnect();
      return probe.failures;
    }),
  ).toEqual([]);
});
