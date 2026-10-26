import { expect, test } from "@playwright/test";

for (const { device, width, top, side, bottom } of [
  { device: "desktop", width: 1440, top: 52, side: 72, bottom: 60 },
  { device: "mobile", width: 390, top: 28, side: 22, bottom: 70 },
]) {
  test(`preserves source pane margins on ${device}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await expect(editor).toBeEnabled();
    await editor.fill("# Spacing\n\nRoom to write.");

    await expect(editor).toHaveCSS("padding", `${top}px ${side}px ${bottom}px`);
    const offsets = await editor
      .locator(".cm-line")
      .first()
      .evaluate((line) => {
        const scroller = line.closest(".cm-scroller")!.getBoundingClientRect();
        const bounds = line.getBoundingClientRect();
        return { top: bounds.top - scroller.top, left: bounds.left - scroller.left };
      });
    expect(offsets.top).toBeCloseTo(top, 0);
    expect(offsets.left).toBeCloseTo(side, 0);
    await expect(editor.locator(".cm-line").first()).toHaveCSS("padding", "0px");
  });
}
