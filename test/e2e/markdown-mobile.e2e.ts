import { expect, test } from "@playwright/test";

test("wraps long headings and list words on mobile and leaves room for the pane handle", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("## " + "VeryLongHeading".repeat(10) + "\n\n1. " + "LongListWord".repeat(20));
  await expect(page.locator(".rendered-pane h2")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show the rendered pane" }).click();
  expect(
    await page
      .locator(".rendered-pane")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator(".rendered-pane article")
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft)),
  ).toBeGreaterThanOrEqual(50);
});
