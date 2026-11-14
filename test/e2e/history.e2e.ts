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
  await expect(
    page.locator(".note-list").getByRole("button", { name: "First version", exact: true }),
  ).toHaveAttribute("aria-current", "true");
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
  await expect(
    page.locator(".note-list").getByRole("button", { name: "First version", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await page.reload();
  await expectMarkdown(page.getByRole("textbox", { name: "Markdown editor" }), "# First version");
});

test("prunes snapshots to fifty after a real save", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  const noteId = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const notes = await new Promise<Array<{ id: string }>>((resolve) => {
      const request = database.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    const noteId = notes[0]!.id;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("noteSnapshots", "readwrite");
      const store = transaction.objectStore("noteSnapshots");
      store.clear();
      for (let index = 0; index < 50; index += 1)
        store.put({
          id: `old-${index}`,
          noteId,
          markdown: `Old version ${index}`,
          createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString(),
        });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return noteId;
  });
  await editor.fill("# Latest retained version");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  const snapshots = await page.evaluate(async (noteId) => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
    });
    const snapshots = await new Promise<Array<{ id: string; markdown: string }>>((resolve) => {
      const request = database
        .transaction("noteSnapshots")
        .objectStore("noteSnapshots")
        .index("noteId")
        .getAll(noteId);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return snapshots;
  }, noteId);
  expect(snapshots).toHaveLength(50);
  expect(snapshots.map((snapshot) => snapshot.id)).not.toContain("old-0");
  expect(snapshots.map((snapshot) => snapshot.markdown)).toContain("# Latest retained version");
});

test("upgrades version four storage without replacing existing notes", async ({ page }) => {
  await page.goto("/llms.txt");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("onyx-vault", 4);
      request.onupgradeneeded = () => {
        const database = request.result;
        const notes = database.createObjectStore("notes", { keyPath: "id" });
        for (const field of ["updatedAt", "title", "deletedAt"]) notes.createIndex(field, field);
        const attachments = database.createObjectStore("attachments", { keyPath: "id" });
        attachments.createIndex("noteId", "noteId");
        const queue = database.createObjectStore("backupQueue", { keyPath: "id" });
        queue.createIndex("createdAt", "createdAt");
        queue.createIndex("noteId", "noteId");
        database.createObjectStore("settings", { keyPath: "key" });
        database.createObjectStore("searchDocuments", { keyPath: "noteId" });
        const postings = database.createObjectStore("searchPostings", {
          keyPath: ["term", "noteId"],
        });
        postings.createIndex("noteId", "noteId");
        const contents = database.createObjectStore("noteContents", { keyPath: "noteId" });
        notes.put({
          id: "legacy",
          title: "Legacy",
          path: "notes/legacy.md",
          sourcePath: "Legacy.md",
          tags: [],
          revision: 1,
          size: 13,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        });
        contents.put({ noteId: "legacy", markdown: "# Legacy text" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.goto("/");
  await expectMarkdown(page.getByRole("textbox", { name: "Markdown editor" }), "# Legacy text");
  const schema = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
    });
    const schema = {
      version: database.version,
      snapshots: database.objectStoreNames.contains("noteSnapshots"),
    };
    database.close();
    return schema;
  });
  expect(schema).toEqual({ version: 5, snapshots: true });
});
