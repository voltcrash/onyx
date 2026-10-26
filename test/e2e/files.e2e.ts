import { expect, test, type Page } from "@playwright/test";

test("creates, moves, and manages folders and files", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const folderName = page.getByRole("textbox", { name: "Folder name" });
  await folderName.fill("Plans");
  await folderName.press("Enter");
  const folder = page.getByRole("button", { name: "Plans", exact: true });
  await expect(folder).toBeVisible();

  await folder.click({ button: "right" });
  const folderMenu = page.getByRole("menu", { name: "File actions" });
  await expect(folderMenu.getByRole("menuitem", { name: "New file", exact: true })).toBeVisible();
  await folderMenu.getByRole("menuitem", { name: "New file", exact: true }).click();
  const fileName = page.getByRole("textbox", { name: "File name" });
  await fileName.fill("Today.md");
  await fileName.press("Enter");
  const file = page.locator(".note-list").getByRole("button", { name: "Today", exact: true });
  await expect(file).toBeVisible();

  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const archiveName = page.getByRole("textbox", { name: "Folder name" });
  await archiveName.fill("Archive");
  await archiveName.press("Enter");
  const archive = page.getByRole("button", { name: "Archive", exact: true });
  await expect(archive).toBeVisible();
  expect(
    await page.locator("[data-folder-path]").evaluateAll((rows) =>
      rows
        .map((row) => row.getAttribute("data-folder-path"))
        .filter((path): path is string => path !== null)
        .filter((path) => !path.includes("/")),
    ),
  ).toEqual(["Archive", "Plans"]);

  await file.dragTo(archive);
  await expect(file).toHaveAttribute("data-file-path", "Archive/Today.md");
  await file.dragTo(folder);
  await expect(file).toHaveAttribute("data-file-path", "Plans/Today.md");
  await folder.dragTo(archive);
  await expect(file).toHaveAttribute("data-file-path", "Archive/Plans/Today.md");

  await file.click({ button: "right" });
  const fileMenu = page.getByRole("menu", { name: "File actions" });
  await expect(fileMenu.getByRole("menuitem", { name: "Open", exact: true })).toBeVisible();
  await expect(fileMenu.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
  await expect(
    fileMenu.getByRole("menuitem", { name: "Copy relative path", exact: true }),
  ).toBeVisible();
  await expect(fileMenu.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
  await fileMenu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(file).toBeHidden();
  await openTrash(page);
  await expect(page.getByRole("button", { name: "Restore Today", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close trash" }).click();
});

test("sets and remembers a custom folder icon", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const folderName = page.getByRole("textbox", { name: "Folder name" });
  await folderName.fill("Ideas");
  await folderName.press("Enter");

  const folder = page.getByRole("button", { name: "Ideas", exact: true });
  await folder.click({ button: "right" });
  const folderMenu = page.getByRole("menu", { name: "File actions" });
  await folderMenu.getByRole("menuitem", { name: "Set icon", exact: true }).click();
  const iconMenu = page.getByRole("menu", { name: "Set folder icon" });
  await iconMenu.getByRole("menuitemradio", { name: "Idea", exact: true }).click();

  await expect(folder).toHaveAttribute("data-folder-icon", "lightbulb");
  await page.reload();
  await expect(page.getByRole("button", { name: "Ideas", exact: true })).toHaveAttribute(
    "data-folder-icon",
    "lightbulb",
  );
});

test("pins folders and individual files and remembers their pins", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const folderName = page.getByRole("textbox", { name: "Folder name" });
  await folderName.fill("Aardvark");
  await folderName.press("Enter");

  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const pinnedFolderName = page.getByRole("textbox", { name: "Folder name" });
  await pinnedFolderName.fill("Pinned");
  await pinnedFolderName.press("Enter");
  const folder = page.locator('[data-folder-path="Pinned"]');
  await expect(folder).toBeVisible();
  await folder.click({ button: "right" });
  const folderMenu = page.getByRole("menu", { name: "File actions" });
  await folderMenu.getByRole("menuitemcheckbox", { name: "Pin folder", exact: true }).click();
  await expect(folder.locator(".folder-pin-indicator")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("[data-folder-path]").evaluateAll((rows) =>
        rows
          .map((row) => row.getAttribute("data-folder-path"))
          .filter((path): path is string => path !== null)
          .filter((path) => !path.includes("/")),
      ),
    )
    .toEqual(["Pinned", "Aardvark"]);

  await folder.click({ button: "right" });
  await page
    .getByRole("menu", { name: "File actions" })
    .getByRole("menuitem", { name: "New file", exact: true })
    .click();
  const otherFileName = page.getByRole("textbox", { name: "File name" });
  await otherFileName.fill("Aardvark.md");
  await otherFileName.press("Enter");
  const otherFile = page.locator('[data-file-path="Pinned/Aardvark.md"]');
  await expect(otherFile).toBeVisible();

  await folder.click({ button: "right" });
  await page
    .getByRole("menu", { name: "File actions" })
    .getByRole("menuitem", { name: "New file", exact: true })
    .click();
  const fileName = page.getByRole("textbox", { name: "File name" });
  await fileName.fill("Reference.md");
  await fileName.press("Enter");
  const file = page.locator('[data-file-path="Pinned/Reference.md"]');
  await expect(file).toBeVisible();
  await file.click({ button: "right" });
  const fileMenu = page.getByRole("menu", { name: "File actions" });
  await fileMenu.getByRole("menuitemcheckbox", { name: "Pin file", exact: true }).click();
  await expect(file).toHaveAttribute("data-file-pinned", "true");
  await expect(file.locator(".file-pin-indicator")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-file-path^="Pinned/"]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-file-path"))),
    )
    .toEqual(["Pinned/Reference.md", "Pinned/Aardvark.md"]);

  await editor.fill("# Keep this file pinned");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(file).toHaveAttribute("data-file-pinned", "true");

  await page.reload();
  const reloadedFolder = page.locator('[data-folder-path="Pinned"]');
  const reloadedFile = page.locator('[data-file-path="Pinned/Reference.md"]');
  await expect(reloadedFolder.locator(".folder-pin-indicator")).toBeVisible();
  await expect(reloadedFile).toHaveAttribute("data-file-pinned", "true");
  await expect(reloadedFile.locator(".file-pin-indicator")).toBeVisible();

  await reloadedFile.click({ button: "right" });
  await page
    .getByRole("menu", { name: "File actions" })
    .getByRole("menuitemcheckbox", { name: "Unpin file", exact: true })
    .click();
  await expect(reloadedFile).not.toHaveAttribute("data-file-pinned", "true");
  await expect(reloadedFile.locator(".file-pin-indicator")).toHaveCount(0);
});

// Trash lives outside the file tree and opens from the command palette.
async function openTrash(page: Page) {
  await page.getByRole("button", { name: "Open the command palette" }).click();
  await page.getByRole("option", { name: /^Open trash/ }).click();
}

test("moves deleted notes to trash, restores them, and deletes them forever", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await page.getByRole("button", { name: "New file" }).click();
  const fileName = page.getByRole("textbox", { name: "File name" });
  await fileName.fill("Trashme.md");
  await fileName.press("Enter");
  const file = page.locator(".note-list").getByRole("button", { name: "Trashme", exact: true });
  await expect(file).toBeVisible();

  await editor.fill("# Trashme\n\nThis note will visit the trash.");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();

  // Deleting moves the note to trash instead of destroying it.
  await file.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(file).toBeHidden();
  await expect(page.getByRole("button", { name: "Close trash" })).toBeHidden();

  // Trash opens as its own sidebar panel with its keyboard shortcut.
  await page.keyboard.press("ControlOrMeta+g");
  await expect(page.getByRole("button", { name: "Close trash" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore Trashme", exact: true })).toBeVisible();

  // Restoring brings the note back to the file tree and closes the panel.
  await page.getByRole("button", { name: "Restore Trashme", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close trash" })).toBeHidden();
  const restored = page.locator(".note-list").getByRole("button", { name: "Trashme", exact: true });
  await expect(restored).toHaveAttribute("aria-current", "true");
  await expect(editor).toHaveValue(/# Trashme/);

  // Deleting forever removes the note from the trash.
  await restored.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(restored).toBeHidden();
  await openTrash(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Trashme forever", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore Trashme", exact: true })).toBeHidden();
  await expect(page.getByText("Trash is empty")).toBeVisible();
  await page.getByRole("button", { name: "Close trash" }).click();

  // Empty trash permanently deletes every trashed note at once.
  await page.getByRole("button", { name: "New file" }).click();
  const secondName = page.getByRole("textbox", { name: "File name" });
  await secondName.fill("Trashmetoo.md");
  await secondName.press("Enter");
  const second = page
    .locator(".note-list")
    .getByRole("button", { name: "Trashmetoo", exact: true });
  await expect(second).toBeVisible();
  await second.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(second).toBeHidden();
  await openTrash(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Empty trash", exact: true }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();
});

test("deletes one image from the attachments folder without deleting its sibling", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.evaluate(() => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    for (const name of ["keep.png", "trash.png"]) {
      transfer.items.add(new File([bytes], name, { type: "image/png" }));
    }
    const input = document.querySelectorAll<HTMLInputElement>(
      'input.transfer-input[type="file"]',
    )[1];
    if (!input) throw new Error("attachment input was not found");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const kept = page.locator('.attachment-row[data-attachment-path="attachments/keep.png"]');
  const trashed = page.locator('.attachment-row[data-attachment-path="attachments/trash.png"]');
  await expect(kept).toBeVisible();
  await expect(trashed).toBeVisible();

  await kept.click();
  const preview = page.getByRole("dialog", { name: "keep.png" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Close image preview" }).click();
  await expect(preview).toBeHidden();

  await trashed.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "File actions" });
  await expect(menu.getByRole("menuitem", { name: "Open in new tab", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();

  await expect(trashed).toBeHidden();
  await expect(kept).toBeVisible();

  await kept.click();
  const keptPreview = page.getByRole("dialog", { name: "keep.png" });
  await expect(keptPreview).toBeVisible();
  await keptPreview.getByRole("button", { name: "Delete keep.png", exact: true }).click();
  await expect(keptPreview).toBeHidden();
  await expect(kept).toBeHidden();
});

test("stores pasted images in the attachments folder with GitHub-style links", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Photos\n\n");
  await editor.focus();
  await page.evaluate(() => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const file = new File([bytes], "image.png", { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const target = document.querySelector(
      'textarea[aria-label="Markdown editor"]',
    ) as HTMLTextAreaElement;
    target.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  });

  await expect(editor).toHaveValue(
    /!\[image-\d{8}-\d{6}\.png\]\(attachments\/image-\d{8}-\d{6}\.png\)$/,
  );
  await expect(page.locator(".rendered-pane img[src^='blob:']")).toHaveCount(1);
  await expect(page.locator(".attachment-folder-row")).toHaveText("attachments");
  await expect(page.locator(".attachment-folder-row")).toHaveAttribute(
    "data-folder-icon",
    "paperclip",
  );
  await editor.press("ControlOrMeta+S");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          new Promise<string[]>((resolve, reject) => {
            const request = indexedDB.open("onyx-vault");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const read = database
                .transaction("noteContents", "readonly")
                .objectStore("noteContents")
                .getAll();
              read.onerror = () => reject(read.error);
              read.onsuccess = () => {
                database.close();
                resolve(read.result.map((record: { markdown: string }) => record.markdown));
              };
            };
          }),
      ),
    )
    .toEqual(expect.arrayContaining([expect.stringContaining("# Photos")]));

  await page.reload();
  await expect(editor).toBeEnabled();
  await expect(editor).toHaveValue(
    /!\[image-\d{8}-\d{6}\.png\]\(attachments\/image-\d{8}-\d{6}\.png\)$/,
  );
  await expect(page.locator(".attachment-folder-row")).toHaveText("attachments");
  await expect(page.locator(".attachment-folder-row")).toHaveAttribute(
    "data-folder-icon",
    "paperclip",
  );

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Folder", { exact: true }).fill("media");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(editor).toHaveValue(/\]\(media\/image-\d{8}-\d{6}\.png\)$/);
  await page.getByLabel("Hide the attachments folder in the sidebar").check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".attachment-folder-row")).toHaveCount(0);
});
