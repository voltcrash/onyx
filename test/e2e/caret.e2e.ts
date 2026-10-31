import { expect, test } from "@playwright/test";

for (const { device, width } of [
  { device: "desktop", width: 1440 },
  { device: "mobile", width: 390 },
]) {
  test(`keeps the empty editor caret on one visual line on ${device}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await expect(editor).toBeEnabled();
    await editor.fill("");
    await expect(editor).toBeFocused();
    const placeholder = editor.locator(".cm-placeholder");
    await expect(placeholder).toBeVisible();

    const expectLineSizedFragments = async () => {
      // An inline block makes Chromium's native caret span the entire multiline placeholder.
      await expect
        .poll(() =>
          placeholder.evaluate((element) => {
            const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
            return (
              Math.max(...Array.from(element.getClientRects(), (rect) => rect.height)) / lineHeight
            );
          }),
        )
        .toBeLessThanOrEqual(1);
    };
    await expectLineSizedFragments();
  });
}
