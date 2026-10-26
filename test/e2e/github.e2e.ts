import { expect, test, type Page } from "@playwright/test";
import { blockNextVaultWrite, waitForBlockedVaultWrite, releaseVaultWrite } from "./helpers.ts";

async function mockGithubSession(page: Page): Promise<void> {
  await page.route("**/api/auth/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/get-session")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          session: { id: "test-session", userId: "test-user" },
          user: { id: "test-user", email: "octocat@example.com", name: "octocat" },
        }),
      });
      return;
    }
    if (pathname.endsWith("/get-access-token") || pathname.endsWith("/refresh-token")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ accessToken: "test-token" }),
      });
      return;
    }
    await route.abort();
  });
}

test("binds a backup repository to the authenticated GitHub account", async ({ page }) => {
  let account = { id: 1, login: "octocat" };
  let repositoryChecks = 0;

  await mockGithubSession(page);
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
  await expect(page.getByText("@octocat").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();
  await expect(page.getByRole("heading", { name: "Sync status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync repository", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sync status", exact: true })).toHaveCount(0);

  account = { id: 2, login: "hubot" };
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("@hubot").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Back up now" }).click();

  await expect(
    page.getByRole("alert").getByText(/belongs to @octocat.*re-select.*@hubot/i),
  ).toBeVisible();
  expect(repositoryChecks).toBe(1);
});

test("refuses to upload a backup when its repository is public", async ({ page }) => {
  let writeRequests = 0;

  await mockGithubSession(page);
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
  await expect(page.getByText("@octocat").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();

  await expect(
    page.getByRole("alert").getByText("Onyx refuses to back up to a public GitHub repository"),
  ).toBeVisible();
  expect(writeRequests).toBe(0);
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

  await mockGithubSession(page);
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
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await blockNextVaultWrite(page);
  await editor.fill("# Unsynced restore draft");
  await page.keyboard.press("ControlOrMeta+S");
  await waitForBlockedVaultWrite(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await page.getByRole("button", { name: "Restore a commit" }).click();
  await expect(page.getByRole("dialog", { name: "Choose a backup commit" })).toBeHidden({
    timeout: 200,
  });
  await releaseVaultWrite(page);
  await expect(page.getByText("Back up Onyx vault")).toBeVisible();
  await expect(
    page.getByText(/pending changes? (?:has|have) not been backed up to GitHub/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore selected" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();

  await expect(editor).toHaveValue(markdown);
  await expect(page.locator('.rendered-pane img[alt="restored image"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.getByText("Restored 1 note and 1 attachment from GitHub.")).toBeVisible();
});

test("asks before replacing a newer backup made on another device", async ({ page }) => {
  const remoteSha = "a".repeat(40);
  const writes: string[] = [];

  await mockGithubSession(page);
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method !== "GET") writes.push(`${method} ${url.pathname}`);
    const json = (body: unknown) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    const repository = {
      default_branch: "main",
      name: "onyx-vault",
      owner: { login: "octocat" },
      permissions: { push: true },
      private: true,
    };
    if (url.pathname === "/user") {
      await json({ avatar_url: "https://example.com/a.png", id: 1, login: "octocat", name: null });
    } else if (url.pathname === "/user/repos") {
      await json([repository]);
    } else if (url.pathname === "/repos/octocat/onyx-vault") {
      await json(repository);
    } else if (url.pathname.endsWith("/git/ref/heads/main")) {
      await json({ object: { sha: remoteSha } });
    } else if (url.pathname.endsWith(`/git/commits/${remoteSha}`)) {
      await json({
        html_url: "https://github.com/c/remote",
        sha: remoteSha,
        tree: { sha: "base" },
      });
    } else if (url.pathname.endsWith("/git/trees/base")) {
      await json({ sha: "base", tree: [{ path: "vault/.onyx.json", type: "blob", sha: "m" }] });
    } else if (url.pathname.endsWith("/git/blobs")) {
      await json({ sha: crypto.randomUUID() });
    } else if (url.pathname.endsWith("/git/trees")) {
      await json({ sha: "tree", tree: [] });
    } else if (url.pathname.endsWith("/git/commits")) {
      await json({ html_url: "https://github.com/c/new", sha: "c".repeat(40), tree: { sha: "t" } });
    } else if (url.pathname.endsWith("/git/refs/heads/main")) {
      await json({ object: { sha: "c".repeat(40) } });
    } else {
      await route.abort();
    }
  });

  await page.goto("/");
  await expect(page.getByText("@octocat").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();
  await expect(page.getByRole("heading", { name: "Sync status" })).toBeVisible();

  await page.getByRole("button", { name: "Back up now" }).click();
  const dialog = page.getByRole("alertdialog", { name: "GitHub has a newer backup" });
  await expect(dialog).toBeVisible();
  expect(writes).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText(/Backup paused because GitHub has a newer backup/).first(),
  ).toBeVisible();
  expect(writes).toEqual([]);

  await page.getByRole("button", { name: "Back up now" }).click();
  await dialog.getByRole("button", { name: "Back up anyway" }).click();
  await expect(page.getByText(/Backed up \d+ files? in one commit/).first()).toBeVisible();
  expect(writes).toContain("PATCH /repos/octocat/onyx-vault/git/refs/heads/main");
});

test("backs up automatically once editing settles", async ({ page }) => {
  const writes: string[] = [];

  await page.clock.install();
  await mockGithubSession(page);
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method !== "GET") writes.push(`${method} ${url.pathname}`);
    const json = (body: unknown, status = 200) =>
      route.fulfill({ contentType: "application/json", status, body: JSON.stringify(body) });
    const repository = {
      default_branch: "main",
      name: "onyx-vault",
      owner: { login: "octocat" },
      permissions: { push: true },
      private: true,
    };
    if (url.pathname === "/user") {
      await json({ avatar_url: "https://example.com/a.png", id: 1, login: "octocat", name: null });
    } else if (url.pathname === "/user/repos") {
      await json([repository]);
    } else if (url.pathname === "/repos/octocat/onyx-vault") {
      await json(repository);
    } else if (url.pathname.endsWith("/git/ref/heads/main")) {
      await json({ message: "Not Found" }, 404);
    } else if (url.pathname.endsWith("/git/blobs")) {
      await json({ sha: crypto.randomUUID() });
    } else if (url.pathname.endsWith("/git/trees")) {
      await json({ sha: "tree", tree: [] });
    } else if (url.pathname.endsWith("/git/commits")) {
      await json({ html_url: "https://github.com/c/new", sha: "c".repeat(40), tree: { sha: "t" } });
    } else if (url.pathname.endsWith("/git/refs")) {
      await json({ object: { sha: "c".repeat(40) } });
    } else {
      await route.abort();
    }
  });

  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(page.getByText("@octocat").first()).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();
  await page.getByRole("checkbox", { name: /Back up automatically/ }).check();
  await page.getByRole("button", { name: "Close settings" }).click();

  await editor.fill("# Automatic\n\nSaved without pressing back up.");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.clock.fastForward("01:00");
  expect(writes).toEqual([]);

  await page.clock.fastForward("01:30");
  await expect.poll(() => writes).toContain("POST /repos/octocat/onyx-vault/git/refs");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Backup & sync", exact: true }).click();
  await expect(page.getByText("Up to date")).toBeVisible();
});
