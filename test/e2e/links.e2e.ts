import { expect, test, type Page } from "@playwright/test";

async function createNote(page: Page, name: string, contents: string): Promise<void> {
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await page.getByRole("button", { name: "New file" }).click();
  const fileName = page.getByRole("textbox", { name: "File name" });
  await fileName.fill(name);
  await fileName.press("Enter");
  await editor.fill(contents);
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
}

test("follows wiki links by note name and offers to create missing notes", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  const article = page.locator(".rendered-pane article");

  await createNote(page, "Garden.md", "# Garden\n\n## Tomatoes\n\nWater daily.");
  await createNote(
    page,
    "Journal.md",
    "# Journal\n\nSee [[garden#Tomatoes|the tomatoes]] and [[Seed list]].",
  );

  await article.getByRole("link", { name: "the tomatoes" }).click();
  await expect(editor).toHaveValue(/# Garden/);
  await page.goBack();
  await expect(editor).toHaveValue(/# Journal/);

  await article.getByRole("link", { name: "Seed list" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Create “Seed list”?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(
    page.locator(".note-list").getByRole("button", { name: "Seed list", exact: true }),
  ).toHaveAttribute("aria-current", "true");
});

test("filters notes by a tag from the rendered note or the palette", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await createNote(page, "Roadmap.md", "---\ntags: [planning]\n---\n# Roadmap\n\nQ3 goals #work");
  await createNote(page, "Groceries.md", "# Groceries\n\nMilk and eggs #home");

  await createNote(page, "Standup.md", "# Standup\n\nNotes for #work today.");
  await page.locator(".rendered-pane article").getByRole("link", { name: "#work" }).click();
  const paletteSearch = page.getByPlaceholder("Search notes or commands…");
  await expect(paletteSearch).toHaveValue("#work");
  await expect(page.getByRole("option", { name: /Roadmap/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Standup/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Groceries/ })).toHaveCount(0);

  await paletteSearch.fill("#planning");
  await expect(page.getByRole("option", { name: /Roadmap/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Standup/ })).toHaveCount(0);
});

test("lists the notes that link to the open note", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await createNote(page, "Garden.md", "# Garden\n\nTomatoes and beans.");
  await createNote(page, "Journal.md", "# Journal\n\nWorked in the [[Garden]].");
  await createNote(page, "Plan.md", "# Plan\n\n[Garden notes](Garden.md) and `[[Garden]]`.");
  await createNote(page, "Recipes.md", "# Recipes\n\nNothing about plants.");

  await page.locator(".note-list").getByRole("button", { name: "Garden", exact: true }).click();
  await expect(editor).toHaveValue(/# Garden/);
  const backlinks = page.getByRole("navigation", { name: "Linked from" });
  await expect(backlinks.getByRole("button")).toHaveText(["Journal", "Plan"]);

  await backlinks.getByRole("button", { name: "Journal" }).click();
  await expect(editor).toHaveValue(/# Journal/);
  await expect(page.getByRole("navigation", { name: "Linked from" })).toHaveCount(0);
  await page.goBack();
  await expect(editor).toHaveValue(/# Garden/);
});
