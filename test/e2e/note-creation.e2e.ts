import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

test("creates from a template and opens a configurable daily note without replacing edits", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.clock.setFixedTime(new Date(2026, 10, 14, 9, 5));
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const folder = page.getByRole("textbox", { name: "Folder name" });
  await folder.fill("Templates");
  await folder.press("Enter");
  await page.getByRole("button", { name: "Templates", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const name = page.getByRole("textbox", { name: "File name" });
  await name.fill("Meeting.md");
  await name.press("Enter");
  await editor.fill("# {{title}}\n\n{{date}} at {{time}}\n\n## Agenda");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search notes or commands…").fill("New note from template");
  await page.getByRole("option", { name: /New note from template/ }).click();
  const dialog = page.getByRole("dialog", { name: "New note from template" });
  await dialog
    .getByLabel("Template", { exact: true })
    .selectOption({ label: "Templates/Meeting.md" });
  await dialog.getByLabel("New note path").fill("Projects/Review.md");
  await dialog.getByRole("button", { name: "Create from template" }).click();
  await expect(dialog).toBeHidden();
  await expectMarkdown(editor, "# Review\n\n2026-11-14 at 09:05\n\n## Agenda");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Daily notes folder", { exact: true }).fill("Journal");
  await page.getByLabel("Daily note template", { exact: true }).fill("Templates/Meeting.md");
  await page.getByRole("button", { name: "Save note creation preferences" }).click();
  await expect(page.getByText("Note creation preferences saved.")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.keyboard.press("ControlOrMeta+Shift+d");
  await expectMarkdown(editor, "# 2026-11-14\n\n2026-11-14 at 09:05\n\n## Agenda");
  await expect(page.locator('[data-file-path="Journal/2026-11-14.md"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await editor.fill("# Kept daily entry");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search notes or commands…").fill("Open today's daily note");
  await page.getByRole("option", { name: /Open today's daily note/ }).click();
  await expectMarkdown(editor, "# Kept daily entry");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Shift+d");
  await expectMarkdown(
    page.getByRole("textbox", { name: "Markdown editor" }),
    "# Kept daily entry",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Daily notes folder", { exact: true })).toHaveValue("Journal");
});
