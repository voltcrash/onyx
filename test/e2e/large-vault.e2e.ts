import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

test("browses, searches, pages and edits a 10,000-note vault", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(
      ["notes", "noteContents", "searchDocuments", "searchPostings", "settings"],
      "readwrite",
    );
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    for (let index = 0; index < 10_000; index += 1) {
      const id = `large-${index}`;
      const title = `Scale ${String(index).padStart(5, "0")}`;
      const updatedAt = "2026-01-01T00:00:00.000Z";
      const markdown = `# ${title}\n\nneedle${index}`;
      transaction.objectStore("notes").put({
        id,
        title,
        path: `notes/${id}.md`,
        sourcePath: `${title}.md`,
        tags: [],
        createdAt: updatedAt,
        updatedAt,
        revision: 1,
        size: markdown.length,
      });
      transaction.objectStore("noteContents").put({ noteId: id, markdown });
      transaction.objectStore("searchDocuments").put({
        noteId: id,
        title: title.toLowerCase(),
        body: markdown.toLowerCase(),
        tags: [],
        updatedAt,
      });
      for (const term of ["scale", `needle${index}`]) {
        transaction.objectStore("searchPostings").put({
          term,
          noteId: id,
          titleMatches: term === "scale" ? 1 : 0,
          bodyMatches: 1,
          tagMatches: 0,
        });
      }
    }
    transaction.objectStore("settings").put({
      key: "fileFolders",
      value: Array.from({ length: 1000 }, (_, index) => ({
        id: `folder-${index}`,
        path: `Archive/Folder ${index}`,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      })),
    });
    await done;
    database.close();
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle("onyx");
    const files = await vault.getDirectoryHandle("notes");
    for (let offset = 0; offset < 10_000; offset += 32) {
      await Promise.all(
        Array.from({ length: Math.min(32, 10_000 - offset) }, async (_, within) => {
          const index = offset + within;
          const handle = await files.getFileHandle(`large-${index}.md`, { create: true });
          const writer = await handle.createWritable();
          await writer.write(`# Scale ${String(index).padStart(5, "0")}\n\nneedle${index}`);
          await writer.close();
        }),
      );
    }
  });
  await page.reload();
  await expect(editor).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator(".note-list .file")).toHaveCount(100);
  await expect(page.locator('[data-folder-path^="Archive/"]')).toHaveCount(1000);
  await page.locator('[data-folder-path="Archive"]').click();
  await expect(page.locator('[data-folder-path^="Archive/"]')).toHaveCount(0);
  await page.locator('[data-folder-path="Archive"]').click();
  await expect(page.locator('[data-folder-path^="Archive/"]')).toHaveCount(1000);
  await page.getByRole("button", { name: "Open the command palette" }).click();
  const palette = page.locator("#command-palette");
  await expect(
    palette.locator(
      '[id^="palette-note-"]:not(#palette-note-history):not(#palette-note-from-template)',
    ),
  ).toHaveCount(50);
  await page.getByRole("button", { name: "Next note results", exact: true }).click();
  await expect(palette.getByText("Notes 51–100 of 10001")).toBeVisible();
  await page.getByRole("button", { name: "Previous note results", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Search notes and commands" });
  await search.fill("scale");
  await expect(palette.locator('[id^="palette-search-note-"]')).toHaveCount(50);
  await expect(palette.getByText("Notes 1–50 of 10000")).toBeVisible();
  await page.getByRole("button", { name: "Next note results", exact: true }).click();
  await expect(palette.getByText("Notes 51–100 of 10000")).toBeVisible();
  await search.fill("needle9999");
  await expect(palette.getByRole("option", { name: /Scale 09999/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expectMarkdown(editor, "# Scale 09999\n\nneedle9999");
  await editor.fill("# Scale 09999\n\nSaved in a large vault.");
  await editor.press("ControlOrMeta+s");
  await expect(page.locator(".doc-status-state")).toContainText("Saved");
  await page.reload();
  await expect(editor).toBeEnabled({ timeout: 15_000 });
  await expectMarkdown(editor, "# Scale 09999\n\nSaved in a large vault.");
});
