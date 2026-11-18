import { expect, test } from "@playwright/test";
import {
  blockNextVaultWrite,
  expectMarkdown,
  releaseVaultWrite,
  waitForBlockedVaultWrite,
} from "./helpers.ts";

test("persists edits made while an earlier save is still in flight", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await blockNextVaultWrite(page);

  await editor.fill("# First edit");
  await page.keyboard.press("ControlOrMeta+S");
  await waitForBlockedVaultWrite(page);
  await editor.fill("# Latest concurrent edit");
  await releaseVaultWrite(page);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("onyx-vault");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("noteContents", "readonly");
        const records = await new Promise<Array<{ markdown: string }>>((resolve, reject) => {
          const request = transaction.objectStore("noteContents").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return records.some((record) => record.markdown === "# Latest concurrent edit");
      }),
    )
    .toBe(true);
  await page.reload();
  await expectMarkdown(editor, "# Latest concurrent edit");
});

test("waits for an in-flight save before deleting the vault", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await blockNextVaultWrite(page);

  await editor.fill("# Unsynced deletion draft");
  await page.keyboard.press("ControlOrMeta+S");
  await waitForBlockedVaultWrite(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Vault", exact: true }).click();
  await page.getByRole("button", { name: "Delete all notes" }).click();

  await expect(page.getByRole("button", { name: "Checking changes…" })).toBeDisabled();
  await releaseVaultWrite(page);
  await expect(
    page.getByText(/pending changes? (?:has|have) not been backed up to GitHub/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Click to confirm" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();

  await expectMarkdown(editor, "");
  const historyCount = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve) => {
      const request = database.transaction("noteSnapshots").objectStore("noteSnapshots").count();
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return count;
  });
  expect(historyCount).toBe(0);
  await page.reload();
  await expectMarkdown(editor, /# Welcome to Onyx/);
});

test("keeps startup usable when localStorage and persistent storage are unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });
    Object.defineProperties(navigator.storage, {
      persist: { configurable: true, value: undefined },
      persisted: { configurable: true, value: undefined },
    });
  });

  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "ember");
  await expect(page.getByRole("status")).toContainText("Browser settings cannot be saved");
  await expect(page.getByRole("status")).toContainText("Persistent storage is unavailable");
});

test("deletes all notes without restoring stale editor content", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("# This note must stay deleted\n\nThe editor must not bring this text back.");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Vault", exact: true }).click();
  await page.getByRole("button", { name: "Delete all notes", exact: true }).click();
  await page.getByRole("button", { name: "Click to confirm", exact: true }).click();

  await expectMarkdown(editor, "");
  await expect(page.getByText("0 notes", { exact: true })).toBeVisible();
  await expect(page.getByText("No notes yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /This note must stay deleted/ })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("onyx-vault");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction(["notes", "noteContents"], "readonly");
        const counts = await Promise.all(
          ["notes", "noteContents"].map(
            (storeName) =>
              new Promise<number>((resolve, reject) => {
                const request = transaction.objectStore(storeName).count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
        database.close();
        return counts;
      }),
    )
    .toEqual([0, 0]);
});

for (const unavailableFeature of ["IndexedDB", "OPFS"] as const) {
  test(`shows a startup fallback when ${unavailableFeature} is unavailable`, async ({ page }) => {
    await page.addInitScript((feature) => {
      if (feature === "IndexedDB") {
        Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
      } else {
        Object.defineProperty(navigator.storage, "getDirectory", {
          configurable: true,
          value: undefined,
        });
      }
    }, unavailableFeature);

    await page.goto("/");

    await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(
      unavailableFeature === "IndexedDB"
        ? "IndexedDB is unavailable"
        : "Origin private file storage (OPFS) is unavailable",
    );
  });
}

test("keeps the editor usable and pauses GitHub features offline", async ({ context, page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icons\/icon\.svg$/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("type", "image/svg+xml");
  await page.evaluate(async () => {
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    });
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("button", { name: "Open local storage settings" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await expect(
    page.getByText("GitHub settings are paused until your connection returns."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sync repository", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sync status", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Repository", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close settings" }).click();

  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Written offline\n\nOnyx keeps working without a connection.");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.keyboard.press("ControlOrMeta+S");
});

test("keeps newly created vaults discoverable without localStorage", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Unavailable", "SecurityError");
      },
    });
  });
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.locator(".vault-trigger").click();
  await page.getByRole("menuitem", { name: "New vault" }).click();
  await expect(page.getByRole("tablist", { name: /Vaults/ }).getByRole("tab")).toHaveCount(2);
  await expect(editor).toBeEnabled();
  await editor.fill("# Durable vault");
  await page.keyboard.press("ControlOrMeta+S");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const request = indexedDB.open("onyx-registry");
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const get = database.transaction("registry").objectStore("registry").get("vaults");
        const value = await new Promise<{ vaults: unknown[] }>((resolve, reject) => {
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        });
        database.close();
        return value.vaults.length;
      }),
    )
    .toBe(2);
  await expect(page.locator(".file-tree-row.file")).toContainText("Durable vault");
  await page.reload();
  await expectMarkdown(editor, "# Durable vault");
});

for (const target of ["note", "vault"] as const) {
  test(`keeps the latest draft when an overlapping save fails while switching ${target}s`, async ({
    page,
  }) => {
    await page.goto("/");
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await expect(editor).toBeEnabled();
    const tabs = page.getByRole("tablist", { name: /Vaults/ }).getByRole("tab");
    const files = page.locator(".file-tree-row.file");
    if (target === "vault") {
      await page.locator(".vault-trigger").click();
      await page.getByRole("menuitem", { name: "New vault" }).click();
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    } else {
      await page.keyboard.press("ControlOrMeta+Enter");
      await expectMarkdown(editor, "");
    }
    const destination =
      target === "vault" ? tabs.first() : files.filter({ hasText: "Welcome to Onyx" });
    await expect(editor).toBeEnabled();

    await blockNextVaultWrite(page);
    await editor.fill("# Earlier edit");
    await page.keyboard.press("ControlOrMeta+S");
    await waitForBlockedVaultWrite(page);
    await page.evaluate(() => {
      const put = Reflect.get(IDBObjectStore.prototype, "put") as IDBObjectStore["put"];
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "noteContents") {
          IDBObjectStore.prototype.put = put;
          throw new DOMException("Note storage is full", "QuotaExceededError");
        }
        return put.apply(this, args);
      };
    });
    await editor.fill("# Keep this draft");
    await destination.click();
    await expect(editor).toBeDisabled();
    await releaseVaultWrite(page);
    await expect(page.getByRole("alert")).toContainText("Note storage is full");
    if (target === "vault") await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expectMarkdown(editor, "# Keep this draft");
    await expect(editor).toBeEnabled();

    await destination.click();
    if (target === "vault") await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expectMarkdown(editor, /# Welcome to Onyx/);
    await expect(editor).toBeEnabled();
    const source = target === "vault" ? tabs.nth(1) : files.filter({ hasText: "Keep this draft" });
    await source.click();
    await expectMarkdown(editor, "# Keep this draft");
    await page.reload();
    if (target === "note") await source.click();
    await expectMarkdown(editor, "# Keep this draft");
  });
}

test("settles the latest draft before creating another note", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await blockNextVaultWrite(page);
  await editor.fill("# Earlier draft");
  await page.keyboard.press("ControlOrMeta+S");
  await waitForBlockedVaultWrite(page);
  await editor.fill("# Latest draft before navigation");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(editor).toBeDisabled();
  await releaseVaultWrite(page);
  await expectMarkdown(editor, "");
  await expect(editor).toBeEnabled();
  await page
    .locator(".file-tree-row.file")
    .filter({ hasText: "Latest draft before navigation" })
    .click();
  await expectMarkdown(editor, "# Latest draft before navigation");
});

for (const webLocks of [true, false]) {
  test(`preserves a conflicted draft as a new note with Web Locks ${webLocks ? "enabled" : "unavailable"}`, async ({
    page,
    context,
  }) => {
    if (!webLocks)
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
      });
    await page.goto("/");
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await expect(editor).toBeEnabled();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await editor.fill("# Local draft");
    const other = await context.newPage();
    await other.goto("/");
    const remoteEditor = other.getByRole("textbox", { name: "Markdown editor" });
    await expect(remoteEditor).toBeEnabled();
    await remoteEditor.fill("# Remote edit");
    await other.keyboard.press("ControlOrMeta+S");
    await expect(other.locator(".file-tree-row.file")).toContainText("Remote edit");
    await expect(page.getByRole("alert")).toContainText("changed in another tab");
    await page.getByRole("button", { name: "Save a copy" }).click();
    await expectMarkdown(editor, "# Local draft");
    await expect(
      page.locator(".file-tree-row.file").filter({ hasText: "conflict copy" }),
    ).toHaveCount(1);
    await other.close();
    await page.reload();
    await page.locator(".file-tree-row.file").filter({ hasText: "conflict copy" }).click();
    await expectMarkdown(editor, "# Local draft");
  });
}

test("recovers an interrupted replacement before an already-open tab continues", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Durable original");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.locator(".file-tree-row.file")).toContainText("Durable original");
  const path = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("onyx-vault");
      request.onsuccess = () => resolve(request.result);
    });
    const notes = await new Promise<Array<{ path: string }>>((resolve) => {
      const request = database.transaction("notes").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("onyx");
    const write = async (directory: FileSystemDirectoryHandle, name: string, text: string) => {
      const writable = await (
        await directory.getFileHandle(name, { create: true })
      ).createWritable();
      await writable.write(text);
      await writable.close();
    };
    const recovery = await root.getDirectoryHandle(".onyx-recovery", { create: true });
    const recoveryNotes = await recovery.getDirectoryHandle("notes", { create: true });
    await recovery.getDirectoryHandle("attachments", { create: true });
    const name = notes[0].path.slice("notes/".length);
    await write(recoveryNotes, name, "# Durable original");
    await write(root, ".onyx-replacement.json", JSON.stringify({ generation: "terminated-tab" }));
    await write(await root.getDirectoryHandle("notes"), name, "# Uncommitted replacement");
    return name;
  });
  await page.getByRole("button", { name: "Open the command palette" }).click();
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        try {
          const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("onyx");
          return await (
            await (await (await root.getDirectoryHandle("notes")).getFileHandle(name)).getFile()
          ).text();
        } catch {
          return undefined;
        }
      }, path),
    )
    .toBe("# Durable original");
  await page.keyboard.press("Escape");
  await editor.fill("# After recovery");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.locator(".file-tree-row.file")).toContainText("After recovery");
  await page.reload();
  await expectMarkdown(editor, "# After recovery");
});

test("settles a reverted draft while its earlier save is still running", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectMarkdown(editor, "");
  await editor.fill("# Destination");
  await page.keyboard.press("ControlOrMeta+S");
  const destination = page.locator(".file-tree-row.file").filter({ hasText: "Destination" });
  await expect(destination).toBeVisible();
  const source = page.locator(".file-tree-row.file").filter({ hasText: "Welcome to Onyx" });
  await source.click();
  await expectMarkdown(editor, /# Welcome to Onyx/);
  const original = await editor.evaluate(
    (element) =>
      (element as HTMLElement & { markdownEditor: { value: string } }).markdownEditor.value,
  );
  await blockNextVaultWrite(page);
  await editor.fill("# In-flight edit");
  await page.keyboard.press("ControlOrMeta+S");
  await waitForBlockedVaultWrite(page);
  await editor.fill(original);
  await destination.click();
  await expect(editor).toBeDisabled();
  await releaseVaultWrite(page);
  await expectMarkdown(editor, "# Destination");
  await expect(editor).toBeEnabled();
  await page.locator(".file-tree-row.file").filter({ hasText: "Welcome to Onyx" }).click();
  await expectMarkdown(editor, original);
  await page.reload();
  await page.locator(".file-tree-row.file").filter({ hasText: "Welcome to Onyx" }).click();
  await expectMarkdown(editor, original);
});

test("mirrors retained OPFS files after permanently deleting a sibling note", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle("native-mirror-test", {
          create: true,
        }),
    });
  });
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectMarkdown(editor, "");
  await editor.fill("# Retained");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.locator(".file-tree-row.file").filter({ hasText: "Retained" })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Storage choices", exact: true }).click();
  await page.getByRole("button", { name: "Choose folder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Disconnect folder", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.evaluate(() => {
    const read = Reflect.get(Blob.prototype, "arrayBuffer") as Blob["arrayBuffer"];
    const state = window as typeof window & { unreadableFiles: number };
    state.unreadableFiles = 0;
    Blob.prototype.arrayBuffer = async function () {
      try {
        return await read.call(this);
      } catch (error) {
        if (
          this instanceof File &&
          error instanceof DOMException &&
          error.name === "NotReadableError"
        )
          state.unreadableFiles += 1;
        throw error;
      }
    };
  });

  await page
    .locator(".file-tree-row.file")
    .filter({ hasText: "Welcome to Onyx" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  // Workspace commands issued while another is still running are ignored.
  await expect(editor).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+g");
  await page.getByRole("button", { name: "Delete Welcome to Onyx forever", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete forever", exact: true })
    .click();
  await expect(page.getByText("Trash is empty.", { exact: true })).toBeVisible();
  const mirrored = await page.evaluate(async () => {
    const directory = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle("native-mirror-test")
    ).getDirectoryHandle("notes");
    const texts: string[] = [];
    for await (const [, handle] of directory.entries()) {
      if (handle.kind === "file") texts.push(await (await handle.getFile()).text());
    }
    return {
      texts,
      unreadableFiles: (window as typeof window & { unreadableFiles: number }).unreadableFiles,
    };
  });
  expect(mirrored).toEqual({ texts: ["# Retained"], unreadableFiles: 0 });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`sets the storage notice apart from the pane in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    const notice = page.locator(".storage-notice");
    await expect(notice).toBeVisible();

    const styles = await notice.evaluate((element) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("i");
      document.body.append(probe);
      const resolve = (name: string) => {
        probe.style.color = root.getPropertyValue(name);
        return getComputedStyle(probe).color;
      };
      const notice = getComputedStyle(element);
      const result = {
        background: notice.backgroundColor,
        border: `${notice.borderBottomWidth} ${notice.borderBottomStyle} ${notice.borderBottomColor}`,
        surface: resolve("--surface"),
        line: resolve("--line-soft"),
        pane: getComputedStyle(element.parentElement!).backgroundColor,
      };
      probe.remove();
      return result;
    });
    expect(styles.background).toBe(styles.surface);
    expect(styles.background).not.toBe(styles.pane);
    expect(styles.border).toBe(`1px solid ${styles.line}`);
  });
}

test("gives the storage notice's dismiss button a touch-sized target", async ({ page }) => {
  await page.goto("/");
  const dismiss = page.getByRole("button", { name: "Dismiss storage warning" });
  await expect(dismiss).toBeVisible();
  const box = (await dismiss.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);

  // The hit area reaches 44px, beyond the visible button.
  await page.mouse.click(box.x - 5, box.y + box.height / 2);
  await expect(page.locator(".storage-notice")).toHaveCount(0);
});

test("accepts edits while an inactive file from an interrupted save awaits repair", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Inactive");
  await editor.press("ControlOrMeta+s");
  await expect(page.locator(".file-tree-row.file")).toContainText("Inactive");
  const name = await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("onyx");
    const notes = await root.getDirectoryHandle("notes");
    for await (const name of notes.keys()) return name;
    throw new Error("Missing saved note");
  });
  await editor.press("ControlOrMeta+Enter");
  await expectMarkdown(editor, "");
  await editor.fill("# Foreground");
  await editor.press("ControlOrMeta+s");
  await expect(page.locator(".file-tree-row.file").filter({ hasText: "Foreground" })).toBeVisible();
  await expect(page.locator(".doc-status-state")).toContainText("Saved");
  await page.evaluate(async (name) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("onyx");
    const notes = await root.getDirectoryHandle("notes");
    const writer = await (await notes.getFileHandle(name)).createWritable();
    await writer.write("# Uncommitted file contents");
    await writer.close();
  }, name);
  await page.addInitScript((name) => {
    const read = Reflect.get(
      FileSystemFileHandle.prototype,
      "getFile",
    ) as FileSystemFileHandle["getFile"];
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name === name) {
        FileSystemFileHandle.prototype.getFile = read;
        await new Promise<void>((resolve) => Reflect.set(window, "releaseNoteRead", resolve));
      }
      return read.call(this);
    };
  }, name);
  await page.reload();
  await page.waitForFunction(() => Reflect.has(window, "releaseNoteRead"));
  await expectMarkdown(editor, "# Foreground");
  await editor.press("End");
  await editor.press("x");
  await expectMarkdown(editor, "# Foregroundx");
  await page.evaluate(() => Reflect.get(window, "releaseNoteRead")());
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("onyx");
        const notes = await root.getDirectoryHandle("notes");
        return (await (await notes.getFileHandle(name)).getFile()).text();
      }, name),
    )
    .toBe("# Inactive");
});
