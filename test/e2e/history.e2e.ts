import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

test("previews and restores a local version and keeps the replaced text", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
  await editor.fill("# First version");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.clock.setFixedTime(new Date("2027-01-01T00:06:00Z"));
  await editor.fill("# Second version");
  await page.keyboard.press("ControlOrMeta+S");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search notes or commands…").fill("Show note history");
  await page.getByRole("option", { name: /Show note history/ }).click();
  const dialog = page.getByRole("dialog", { name: "Note history" });
  const versions = dialog.getByRole("navigation", { name: "Snapshots" }).getByRole("button");
  await expect(versions).toHaveCount(3);
  await versions.nth(1).click();
  await expect(dialog.getByLabel("Snapshot preview")).toHaveText("# First version");
  await dialog.getByRole("button", { name: "Restore snapshot" }).click();
  await dialog.getByRole("button", { name: "Close history" }).click();
  await expectMarkdown(editor, "# First version");
  await page.reload();
  await expectMarkdown(page.getByRole("textbox", { name: "Markdown editor" }), "# First version");
});
