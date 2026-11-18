import { expect, test as base, type Page } from "@playwright/test";
import { expectMarkdown } from "./helpers";

// WebKit needs a persistent profile for OPFS. An empty path creates a fresh temporary profile.
const test = base.extend<{ vaultPage: Page }>({
  vaultPage: async ({ playwright, browserName, baseURL }, use) => {
    const context = await playwright[browserName].launchPersistentContext("", { baseURL });
    try {
      await use(context.pages()[0] ?? (await context.newPage()));
    } finally {
      await context.close();
    }
  },
});

test.slow();

test("saves a note, edits it offline and restores the exported ZIP in a new vault", async ({
  vaultPage: page,
}, testInfo) => {
  const initial = "# Field notes\n\nWritten online.";
  const edited = initial + "\n\nEdited offline.";
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  const saved = page.getByRole("button", { name: /Saved locally/ });

  await page.goto("/");
  await expect(editor).toBeEnabled();
  await editor.fill(initial);
  await editor.press("ControlOrMeta+s");
  await expect(saved).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await page.context().setOffline(true);
  await page.reload();
  await expectMarkdown(editor, initial);
  await editor.fill(edited);
  await editor.press("ControlOrMeta+s");
  await expect(saved).toBeVisible();

  const noteFiles = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle("onyx");
    const notes = await vault.getDirectoryHandle("notes");
    const contents = [];
    for await (const handle of notes.values()) {
      if (handle.kind === "file") contents.push(await (await handle.getFile()).text());
    }
    return contents;
  });
  expect(noteFiles).toContain(edited);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Import & export", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  const archive = testInfo.outputPath("field-notes.zip");
  await (await downloading).saveAs(archive);
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.locator(".vault-trigger").click();
  await page.getByRole("menuitem", { name: "New vault" }).click();
  const vaultTabs = page.getByRole("tablist", { name: /Vaults/ }).getByRole("tab");
  await expect(vaultTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expectMarkdown(editor, /^# Welcome to Onyx/);
  await expect(editor).toBeEnabled();
  await page.locator('input[type="file"][accept^=".zip"]').setInputFiles(archive);
  await expectMarkdown(editor, edited);
  await page.reload();
  await expect(vaultTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expectMarkdown(editor, edited);
});
