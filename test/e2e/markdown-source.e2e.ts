import { expect, test } from "@playwright/test";

test("keeps source code and lists readable and highlights GFM source", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(
    "# Contrast\n\n`inline code`\n\n- List item\n\n~~deleted~~\n\n```js\nconst x = 1\n```",
  );
  await expect(editor.locator(".md-strikethrough").filter({ hasText: "deleted" })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const ratios = await editor.evaluate((element) => {
      const background = getComputedStyle(
        document.querySelector(".rendered-pane")!,
      ).backgroundColor;
      const luminance = (color: string) => {
        const [r, g, b] = color
          .match(/\d+/g)!
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const bg = luminance(background);
      return [...element.querySelectorAll(".md-code, .md-list, .md-mark")].map((token) => {
        const fg = luminance(getComputedStyle(token).color);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
    });
    expect(ratios.length).toBeGreaterThan(3);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
