import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

test("toggles sidebar find and replace with the platform shortcut", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Find target\n\nNeedle once.\n\nNeedle twice.\n\nNEEDLE three times.");

  await page.getByRole("button", { name: "Hide notes sidebar" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+f");
  const findPanel = page.getByRole("search", { name: "Find and replace" });
  const findInput = page.getByRole("searchbox", { name: "Find in note" });
  await expect(findPanel).toBeVisible();
  await expect(findInput).toBeFocused();
  await expect(page.locator(".app")).not.toHaveClass(/sidebar-collapsed/);

  await findInput.fill("needle");
  await expect(page.locator(".find-count")).toHaveText("1 of 3");
  await expect(page.locator(".source-editor .find-match")).toHaveCount(3);
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(page.locator(".find-count")).toHaveText("2 of 3");

  await page.getByRole("textbox", { name: "Replace with" }).fill("Signal");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expectMarkdown(editor, /Needle once\.[\s\S]*Signal twice\./);

  await page.getByRole("button", { name: "Replace all" }).click();
  await expectMarkdown(
    editor,
    /Find target[\s\S]*Signal once\.[\s\S]*Signal twice\.[\s\S]*Signal three times\./,
  );
  await expect(page.locator(".find-count")).toHaveText("No matches");

  await page.keyboard.press("ControlOrMeta+f");
  await expect(findPanel).toBeHidden();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await expect(editor).toBeFocused();
});

test("supports match case and whole-word find options", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("cat cater CAT");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+f");

  const findInput = page.getByRole("searchbox", { name: "Find in note" });
  await findInput.fill("cat");
  await expect(page.locator(".find-count")).toHaveText("1 of 3");
  await page.getByRole("button", { name: /Match case/ }).click();
  await expect(page.locator(".find-count")).toHaveText("1 of 2");
  await page.getByRole("button", { name: /Match case/ }).click();
  await page.getByRole("button", { name: /Whole word/ }).click();
  await expect(page.locator(".find-count")).toHaveText("1 of 2");
});
