import { expect, test } from "@playwright/test";

test("traps modal focus and returns it to the opener", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAttribute("aria-expanded", "false");

  const palette = page.getByRole("button", { name: "Open the command palette" });
  await palette.click();
  await expect(page.getByRole("combobox", { name: "Search notes and commands" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeFocused();
});

test("persists edits made while an earlier save is still in flight", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await page.evaluate(() => {
    const prototype = FileSystemFileHandle.prototype;
    const createWritable = Reflect.get(
      prototype,
      "createWritable",
    ) as FileSystemFileHandle["createWritable"];
    const state = window as typeof window & {
      onyxReleaseWrite?: () => void;
      onyxWriteBlocked?: boolean;
    };
    prototype.createWritable = async function (...parameters) {
      const writable = await createWritable.apply(this, parameters);
      const write = writable.write.bind(writable);
      Object.defineProperty(writable, "write", {
        value: async (data: FileSystemWriteChunkType) => {
          state.onyxWriteBlocked = true;
          await new Promise<void>((resolve) => {
            state.onyxReleaseWrite = resolve;
          });
          return write(data);
        },
      });
      prototype.createWritable = createWritable;
      return writable;
    };
  });

  await editor.fill("# First edit");
  await page.getByRole("button", { name: /Save/ }).first().click();
  await page.waitForFunction(() =>
    Boolean((window as typeof window & { onyxWriteBlocked?: boolean }).onyxWriteBlocked),
  );
  await editor.fill("# Latest concurrent edit");
  await page.evaluate(() =>
    (window as typeof window & { onyxReleaseWrite?: () => void }).onyxReleaseWrite?.(),
  );

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
  await expect(editor).toHaveValue("# Latest concurrent edit");
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
  await expect(page.getByRole("status")).toContainText("Browser settings cannot be saved");
  await expect(page.getByRole("status")).toContainText("Persistent storage is unavailable");
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
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "GitHub unavailable offline" })).toBeDisabled();

  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Written offline\n\nOnyx keeps working without a connection.");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: /Save/ }).first().click();
});

test("searches note titles and Markdown content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "New note" }).click();
  await expect(page.getByRole("button", { name: "Untitled", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Project Aurora\n\nThe neutrino research summary is ready.");
  await expect(editor).toHaveValue(/Project Aurora/);
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: /Save/ }).first().click();

  await page.getByPlaceholder("Search all notes").fill("neut");
  await expect(page.getByText("1 result")).toBeVisible();
  await expect(page.getByRole("button", { name: /Project Aurora/ })).toBeVisible();
});

test("formats Markdown while editing in inline preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "Inline preview" }).click();
  const line = page.getByRole("textbox", { name: "Markdown line 3" });
  await line.fill("Onyx renders **Markdown** while you keep writing.");
  await expect(line).toContainText("Onyx renders **Markdown** while you keep writing.");
  await expect(line.locator("strong")).toHaveText("Markdown");

  await line.fill("#");
  await expect(line).not.toHaveClass(/heading-1/);
  await line.press(" ");
  await expect(line).toHaveClass(/heading-1/);
  await expect(line.locator(".md-syntax")).toHaveText("# ");
  await line.pressSequentially("Inline heading");
  await expect(line).toContainText("# Inline heading");
});

test("can reveal the active Markdown source line in inline preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("radio", { name: /Reveal source line/ }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Inline preview" }).click();

  await page.getByRole("button", { name: "Edit line 3" }).click();
  await expect(page.getByRole("textbox", { name: "Markdown line 3" })).toBeVisible();
});

test("binds a backup repository to the authenticated GitHub account", async ({ page }) => {
  let account = { id: 1, login: "octocat" };
  let repositoryChecks = 0;

  await page.route("**/auth/github/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "test-token", authenticated: true }),
    });
  });
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/user") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          avatar_url: "https://example.com/avatar.png",
          id: account.id,
          login: account.login,
          name: account.login,
        }),
      });
    } else if (url.pathname === "/user/repos") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            default_branch: "main",
            name: "onyx-vault",
            owner: { login: "octocat" },
            permissions: { push: true },
            private: true,
          },
        ]),
      });
    } else if (url.pathname === "/repos/octocat/onyx-vault") {
      repositoryChecks += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          default_branch: "main",
          name: "onyx-vault",
          owner: { login: "octocat" },
          permissions: { push: true },
          private: true,
        }),
      });
    } else {
      await route.abort();
    }
  });

  await page.goto("/");
  await expect(page.getByText("@octocat").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Repository", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();

  account = { id: 2, login: "hubot" };
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("@hubot").first()).toBeVisible();
  await page.getByRole("button", { name: "Back up now" }).click();

  await expect(
    page.getByRole("alert").getByText(/belongs to @octocat.*re-select.*@hubot/i),
  ).toBeVisible();
  expect(repositoryChecks).toBe(1);
});

test("refuses to upload a backup when its repository is public", async ({ page }) => {
  let writeRequests = 0;

  await page.route("**/auth/github/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "test-token", authenticated: true }),
    });
  });
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") writeRequests += 1;
    if (url.pathname === "/user") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          avatar_url: "https://example.com/avatar.png",
          id: 1,
          login: "octocat",
          name: "Octo Cat",
        }),
      });
    } else if (url.pathname === "/user/repos") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            default_branch: "main",
            name: "onyx-vault",
            owner: { login: "octocat" },
            permissions: { push: true },
            private: true,
          },
        ]),
      });
    } else if (url.pathname === "/repos/octocat/onyx-vault") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          default_branch: "main",
          name: "onyx-vault",
          owner: { login: "octocat" },
          permissions: { push: true },
          private: false,
        }),
      });
    } else {
      await route.abort();
    }
  });

  await page.goto("/");
  await expect(page.getByText("@octocat").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Repository", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();

  await expect(
    page.getByRole("alert").getByText("Onyx refuses to back up to a public GitHub repository"),
  ).toBeVisible();
  expect(writeRequests).toBe(0);
});

test("imports a Markdown folder and exports its structure and attachments as ZIP", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Import & export", exact: true }).click();
  await page.locator('input[type="file"][webkitdirectory]').evaluate((element) => {
    const input = element as HTMLInputElement;
    const transfer = new DataTransfer();
    const note = new File(
      ["# Trip plans\n\nThe walking route is in ![the map](assets/map.png)."],
      "plan.md",
      { type: "text/markdown" },
    );
    const attachment = new File(["attachment fixture"], "map.png", { type: "image/png" });
    Object.defineProperty(note, "webkitRelativePath", {
      value: "markdown-import/travel/plan.md",
    });
    Object.defineProperty(attachment, "webkitRelativePath", {
      value: "markdown-import/travel/assets/map.png",
    });
    transfer.items.add(note);
    transfer.items.add(attachment);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText("Imported 1 note and 1 attachment.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Trip plans/ })).toBeVisible();
  await expect(page.locator('.preview-pane img[alt="the map"]')).toHaveAttribute("src", /^blob:/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^onyx-markdown-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.getByText("Exported 3 files to ZIP.")).toBeVisible();
});

test("restores a selected GitHub commit into the local vault", async ({ page }) => {
  const commitSha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const noteBlobSha = "c".repeat(40);
  const attachmentBlobSha = "d".repeat(40);
  const manifestBlobSha = "e".repeat(40);
  const restoredAt = "2026-09-05T12:00:00Z";
  const markdown =
    "# Restored from GitHub\n\nThis note includes a ![restored image](assets/restored.png).";
  const manifest = JSON.stringify({
    version: 1,
    notes: [
      {
        id: "restored",
        title: "Restored from GitHub",
        path: "notes/restored.md",
        tags: [],
        createdAt: restoredAt,
        updatedAt: restoredAt,
        revision: 1,
        size: markdown.length,
        sourcePath: "journal/note.md",
      },
    ],
    attachments: [
      {
        id: "image",
        noteId: "restored",
        name: "restored.png",
        path: "attachments/restored/image",
        type: "image/png",
        size: 18,
        createdAt: restoredAt,
        updatedAt: restoredAt,
        sourcePath: "journal/assets/restored.png",
      },
    ],
  });
  const blobContents = new Map([
    [noteBlobSha, markdown],
    [attachmentBlobSha, "attachment fixture"],
    [manifestBlobSha, manifest],
  ]);

  await page.route("**/auth/github/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "test-token", authenticated: true }),
    });
  });
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/user") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          avatar_url: "https://example.com/avatar.png",
          id: 1,
          login: "octocat",
          name: "Octo Cat",
        }),
      });
    } else if (url.pathname === "/repos/octocat/onyx-vault") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          default_branch: "main",
          name: "onyx-vault",
          owner: { login: "octocat" },
          permissions: { push: true },
          private: true,
        }),
      });
    } else if (url.pathname.endsWith("/commits")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            sha: commitSha,
            html_url: "https://github.com/octocat/onyx-vault/commit/test",
            author: { login: "octocat" },
            commit: {
              message: "Back up Onyx vault",
              author: { name: "Octo Cat", date: restoredAt },
              committer: { name: "Octo Cat", date: restoredAt },
            },
          },
        ]),
      });
    } else if (url.pathname.includes("/git/commits/")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sha: commitSha,
          html_url: "https://github.com/octocat/onyx-vault/commit/test",
          tree: { sha: treeSha },
          author: { name: "Octo Cat", date: restoredAt },
          committer: { name: "Octo Cat", date: restoredAt },
        }),
      });
    } else if (url.pathname.includes("/git/trees/")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sha: treeSha,
          tree: [
            { path: "vault/notes/restored.md", type: "blob", sha: noteBlobSha },
            {
              path: "vault/attachments/restored/image",
              type: "blob",
              sha: attachmentBlobSha,
            },
            { path: "vault/.onyx.json", type: "blob", sha: manifestBlobSha },
          ],
        }),
      });
    } else if (url.pathname.includes("/git/ref/heads/")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ object: { sha: commitSha } }),
      });
    } else if (url.pathname.includes("/git/blobs/")) {
      const contents = blobContents.get(url.pathname.slice(url.pathname.lastIndexOf("/") + 1));
      if (contents === undefined) {
        await route.abort();
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sha: url.pathname.slice(url.pathname.lastIndexOf("/") + 1),
          encoding: "base64",
          content: btoa(contents),
        }),
      });
    } else {
      await route.abort();
    }
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Back up Onyx vault")).toBeVisible();
  await page.getByRole("button", { name: "Restore selected" }).click();

  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toHaveValue(markdown);
  await expect(page.locator('.preview-pane img[alt="restored image"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.getByText("Restored 1 note and 1 attachment from GitHub.")).toBeVisible();
});
