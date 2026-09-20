import { expect, test, type Page } from "@playwright/test";
import themeCatalog from "../lib/theme-catalog.json" with { type: "json" };

test("does not render an obsolete pane toolbar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator(".source-switcher")).toHaveCount(0);
});

async function blockNextVaultWrite(page: Page): Promise<void> {
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
}

async function waitForBlockedVaultWrite(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean((window as typeof window & { onyxWriteBlocked?: boolean }).onyxWriteBlocked),
  );
}

async function releaseVaultWrite(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as typeof window & { onyxReleaseWrite?: () => void }).onyxReleaseWrite?.(),
  );
}

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

test("opens the command palette in the sidebar and returns focus to the opener", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText("Preferences", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAttribute("aria-expanded", "false");

  const palette = page.getByRole("button", { name: "Open the command palette" });
  await expect(palette).toHaveClass(/search-palette-button/);
  const paletteButtonBounds = await palette.boundingBox();
  expect(paletteButtonBounds?.height).toBeGreaterThanOrEqual(26);
  expect(paletteButtonBounds?.width).toBeGreaterThanOrEqual(32);
  await palette.click();
  const commandPalette = page.locator("#command-palette");
  await expect(commandPalette).toBeVisible();
  await expect(commandPalette).toHaveAttribute("role", "search");
  await expect(page.locator(".palette-backdrop")).toHaveCount(0);
  await expect(page.locator(".app")).not.toHaveAttribute("inert");
  await expect(commandPalette.locator('input[role="combobox"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeFocused();
});

test("toggles the command palette from the keyboard and restores a collapsed sidebar", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await page.getByRole("button", { name: "Hide notes sidebar" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+K");

  await expect(page.locator(".sidebar #command-palette")).toBeVisible();
  await expect(page.locator(".app")).not.toHaveClass(/sidebar-collapsed/);
  await page.keyboard.press("ControlOrMeta+K");

  await expect(page.locator("#command-palette")).toHaveCount(0);
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
});

test("moves the sidebar to the right by holding and dragging its toggle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const app = page.locator(".app");
  const toggle = page.getByRole("button", { name: "Hide notes sidebar" });
  const box = await toggle.boundingBox();
  if (!box) throw new Error("sidebar toggle has no box");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator(".sidebar-drop-target")).toHaveAttribute("data-side", "left");
  await page.mouse.move(viewport.width - 40, viewport.height / 2, { steps: 5 });
  await expect(page.locator(".sidebar-drop-target")).toHaveAttribute("data-side", "right");
  await page.mouse.up();

  await expect(app).toHaveClass(/sidebar-right/);
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".sidebar-drop-target")).toHaveCount(0);

  await page.reload();
  await expect(app).toHaveClass(/sidebar-right/);
});

test("chooses the sidebar position from its context menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const app = page.locator(".app");

  await page.locator(".sidebar-footer").click({ button: "right", position: { x: 2, y: 2 } });
  await page.getByRole("menuitemradio", { name: "Sidebar on the right" }).click();
  await expect(app).toHaveClass(/sidebar-right/);
  await expect(page.getByRole("menu")).toHaveCount(0);

  const noteList = page.locator(".note-list");
  const listBox = await noteList.boundingBox();
  if (!listBox) throw new Error("note list has no box");
  await noteList.click({ button: "right", position: { x: 20, y: listBox.height - 4 } });
  await expect(page.getByRole("menuitemradio", { name: "Sidebar on the right" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("menuitemradio", { name: "Sidebar on the left" }).click();
  await expect(app).not.toHaveClass(/sidebar-right/);
});

test("chooses the sidebar position from the command palette", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  const app = page.locator(".app");

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("sidebar position right");
  await page.keyboard.press("Enter");
  await expect(app).toHaveClass(/sidebar-right/);

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("sidebar position left");
  await page.keyboard.press("Enter");
  await expect(app).not.toHaveClass(/sidebar-right/);
});

test("adjusts content width from the command palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "Open the command palette" }).click();
  const slider = page.getByRole("slider", { name: "Content width" });
  await expect(slider).toHaveValue("700");
  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "840";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(slider).toHaveValue("840");
  await expect(page.locator(".editor-shell")).toHaveAttribute("style", /--content-width: 840px/);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("slider", { name: "Content width" })).toHaveCount(0);
  await expect(page.getByText(/words? · \d+ min/)).toBeVisible();
});

test("offers formatting actions from the command palette", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("hello");
  await editor.selectText();

  await page.getByRole("button", { name: "Open the command palette" }).click();
  for (const label of [
    "Bold",
    "Italic",
    "Strikethrough",
    "Highlight",
    "Heading",
    "Bulleted list",
    "Numbered list",
    "Task list",
    "Quote",
    "Callout",
    "Inline code",
    "Code block",
    "Link",
    "Divider",
    "Math",
  ]) {
    await expect(page.getByRole("option", { name: new RegExp(label) })).toBeVisible();
  }

  await page.getByRole("option", { name: /^Bold/ }).click();
  await expect(editor).toHaveValue("**hello**");

  await expect(page.getByRole("tab", { name: "Tools" })).toHaveCount(0);
  await expect(page.locator(".sidebar-switcher")).toHaveCount(0);
  await expect(page.locator(".formatting-tools")).toHaveCount(0);
  await expect(page.getByText(/words? · \d+ min/)).toBeVisible();
});

test("offers note transfer actions from the command palette", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Palette export\n\nA note to copy.");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxCopied?: string };
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void (state.onyxCopied = text) },
    });
  });

  await page.getByRole("button", { name: "Open the command palette" }).click();
  for (const label of [
    "Copy this note as Markdown",
    "Download this note as Markdown",
    "Copy this note as plain text",
    "Download this note as plain text",
    "Copy this note as rich text",
    "Download this note as rich text",
    "Copy this note as HTML",
    "Download this note as HTML",
    "Save this note as a PDF",
  ]) {
    await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
  }

  await page.getByRole("option", { name: "Copy this note as plain text", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { onyxCopied?: string }).onyxCopied))
    .toBe("Palette export\n\nA note to copy.");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Open the command palette" }).click();
  await page.getByRole("option", { name: "Download this note as HTML", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("palette-export.html");
});

test("opens every settings section from the command palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  const settingsCommands = [
    ["settings", "Editor settings", "Editor"],
    ["settings-themes", "Theme settings", "Themes"],
    ["shortcuts", "Keyboard shortcuts", "Keyboard shortcuts"],
    ["settings-github", "GitHub backup & sync settings", "Backup & sync"],
    ["settings-repository", "Sync repository settings", "Sync repository"],
    ["settings-backup", "Sync status settings", "Sync status"],
    ["storage", "Storage choices", "Storage choices"],
    ["settings-transfer", "Import & export settings", "Import & export"],
    ["settings-vault", "Vault settings", "Vault"],
  ] as const;

  for (const [id, command, section] of settingsCommands) {
    await page.getByRole("button", { name: "Open the command palette" }).click();
    const option = page.locator(`#palette-${id}`);
    await expect(option).toBeVisible();
    await expect(option).toContainText(command);
    await option.click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: section, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByRole("button", { name: "Close settings" }).click();
  }
});

test("offers additional color themes and persists the selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-theme",
    themeCatalog.defaultColorTheme,
  );

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Themes", exact: true }).click();

  const colorThemes = page.getByRole("radiogroup", { name: "Color theme" });
  await expect(colorThemes.getByRole("radio")).toHaveCount(Object.keys(themeCatalog.themes).length);

  for (const [id, theme] of Object.entries(themeCatalog.themes)) {
    const option = colorThemes.getByRole("radio").filter({
      has: page.getByText(theme.label, { exact: true }),
    });
    await expect(option).toHaveCount(1);
    await option.click();
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", id);
    await expect(option).toHaveAttribute("aria-checked", "true");
  }

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "solarized");
});

test("opens general settings on Editor and the storage shortcut on Storage choices", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editor", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Fonts", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scrolling", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore default fonts" })).toHaveCount(0);

  await page.locator("#font-heading-type").selectOption("sans-serif");
  await page.locator("#font-heading").selectOption("inter");
  await expect(page.getByRole("button", { name: "Restore default fonts" })).toBeVisible();
  await page.getByRole("button", { name: "Restore default fonts" }).click();
  await expect(page.getByRole("button", { name: "Restore default fonts" })).toHaveCount(0);

  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Open local storage settings" }).click();
  await expect(page.getByRole("button", { name: "Storage choices", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("applies every code font to nested code content", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const codeFonts = {
    "geist-mono": "Geist Mono Variable",
    "jetbrains-mono": "JetBrains Mono Variable",
    "fira-code": "Fira Code Variable",
    "source-code-pro": "Source Code Pro Variable",
    "roboto-mono": "Roboto Mono Variable",
    "cascadia-code": "Cascadia Code Variable",
    "ubuntu-sans-mono": "Ubuntu Sans Mono Variable",
    "google-sans-code": "Google Sans Code Variable",
    inconsolata: "Inconsolata Variable",
    "noto-sans-mono": "Noto Sans Mono Variable",
  };

  for (const [id, family] of Object.entries(codeFonts)) {
    await page.locator("#font-code").selectOption(id);
    await expect(page.locator(".type-specimen-code pre code")).toHaveCSS(
      "font-family",
      new RegExp(family),
    );
  }
});

test("filters typefaces by selected font type", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const headingType = page.locator("#font-heading-type");
  const headingFont = page.locator("#font-heading");

  await expect(headingType).toHaveValue("serif");
  await expect(headingFont.locator("option")).toHaveCount(12);

  await headingType.selectOption("sans-serif");
  await expect(headingFont).toHaveValue("geist");
  await expect(headingFont.locator("option")).toHaveCount(15);
  await headingFont.selectOption("manrope");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Manrope Variable/);

  await headingType.selectOption("monospace");
  await expect(headingFont).toHaveValue("geist-mono");
  await expect(headingFont.locator("option")).toHaveCount(11);
  await headingFont.selectOption("jetbrains-mono");
  await expect(page.locator(".type-specimen h4")).toHaveCSS(
    "font-family",
    /JetBrains Mono Variable/,
  );

  await headingType.selectOption("slab-serif");
  await expect(headingFont).toHaveValue("roboto-slab");
  await expect(headingFont.locator("option")).toHaveCount(5);
  await headingFont.selectOption("bitter");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Bitter Variable/);

  await headingType.selectOption("rounded-sans");
  await expect(headingFont).toHaveValue("nunito");
  await expect(headingFont.locator("option")).toHaveCount(7);
  await headingFont.selectOption("lexend");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Lexend Variable/);
});

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
  await expect(editor).toHaveValue("# Latest concurrent edit");
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

  await expect(editor).toHaveValue("");
  await page.reload();
  await expect(editor).toHaveValue(/# Welcome to Onyx/);
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
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-theme",
    themeCatalog.defaultColorTheme,
  );
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

  await expect(editor).toHaveValue("");
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
  await page.getByRole("button", { name: "Close settings" }).click();

  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Written offline\n\nOnyx keeps working without a connection.");
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.keyboard.press("ControlOrMeta+S");
});

test("searches note titles and Markdown content from the command palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(
    page.locator(".notes-heading").getByRole("button", { name: "New note" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".notes-heading").getByRole("button", { name: "Open the command palette" }),
  ).toHaveCount(1);
  const filesPanel = page.locator(".files-panel");
  const childOrder = await filesPanel.evaluate((panel) =>
    ["file-toolbar", "note-list"].map((className) =>
      [...panel.children].findIndex((child) => child.classList.contains(className)),
    ),
  );
  expect(childOrder).toEqual([0, 1]);

  await page.getByRole("button", { name: "New file" }).click();
  await page.getByRole("textbox", { name: "File name" }).press("Enter");
  await expect(page.getByRole("button", { name: "Untitled", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Project Aurora\n\nThe neutrino research summary is ready.");
  await expect(editor).toHaveValue(/Project Aurora/);
  await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.keyboard.press("ControlOrMeta+S");

  await expect(page.getByPlaceholder("Search all notes")).toHaveCount(0);
  await page.getByRole("button", { name: "Open the command palette" }).click();
  const paletteSearch = page.getByPlaceholder("Search notes or commands…");
  await paletteSearch.fill("neut");
  const result = page.getByRole("option", { name: /Project Aurora/ });
  await expect(result).toBeVisible();
  await expect(result).toContainText("the neutrino research summary is ready.");

  await paletteSearch.fill("Project Aurora");
  const project = page.getByRole("option", { name: /Project Aurora/ });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page.locator("#command-palette")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Project Aurora", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("toggles sidebar find and replace with the platform shortcut", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Find target\n\nNeedle once.\n\nNeedle twice.\n\nNEEDLE three times.");

  await page.getByRole("button", { name: "Hide notes sidebar" }).click();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+f");
  const findPanel = page.getByRole("search", { name: "Find and replace" });
  const findInput = page.getByRole("searchbox", { name: "Find in note" });
  await expect(findPanel).toBeVisible();
  await expect(findInput).toBeFocused();
  await expect(page.locator(".app")).not.toHaveClass(/sidebar-collapsed/);

  await findInput.fill("needle");
  await expect(page.locator(".find-count")).toHaveText("1 of 3");
  await expect(page.locator(".source-find-layer .find-match")).toHaveCount(3);
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(page.locator(".find-count")).toHaveText("2 of 3");

  await page.getByRole("textbox", { name: "Replace with" }).fill("Signal");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(editor).toHaveValue(/Needle once\.[\s\S]*Signal twice\./);

  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(editor).toHaveValue(
    /Find target[\s\S]*Signal once\.[\s\S]*Signal twice\.[\s\S]*Signal three times\./,
  );
  await expect(page.locator(".find-count")).toHaveText("No matches");

  await page.keyboard.press("ControlOrMeta+f");
  await expect(findPanel).toBeHidden();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await expect(editor).toBeFocused();
});

test("supports match case and whole-word find options", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("cat cater CAT");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+f");

  const findInput = page.getByRole("searchbox", { name: "Find in note" });
  await findInput.fill("cat");
  await expect(page.locator(".find-count")).toHaveText("1 of 3");
  await page.getByRole("button", { name: /Match case/ }).click();
  await expect(page.locator(".find-count")).toHaveText("1 of 2");
  await page.getByRole("button", { name: /Match case/ }).click();
  await page.getByRole("button", { name: /Whole word/ }).click();
  await expect(page.locator(".find-count")).toHaveText("1 of 2");
});

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
  const file = page.getByRole("button", { name: "Today", exact: true });
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
  page.once("dialog", (dialog) => dialog.accept());
  await fileMenu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(file).toBeHidden();
});

test("uses the first Markdown heading for notes with front matter", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();

  await markdown.fill("---\ntitle: Metadata title\n---\n\n# Rendered title");

  await expect(page.getByRole("button", { name: "Rendered title", exact: true })).toBeVisible();
  await expect(page.locator(".rendered-pane h1")).toHaveText("Rendered title");
});

test.describe("mobile settings", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps settings sections usable on a phone-sized viewport", async ({ page }) => {
    await page.goto("/");
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await expect(editor).toBeEnabled();
    await expect(editor).toBeVisible();
    await expect(page.locator(".rendered-pane")).toBeHidden();

    await page.getByRole("button", { name: "Show notes sidebar" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Settings/ });
    await expect(dialog).toBeVisible();

    const layout = await dialog.locator(".settings-body").evaluate((body) => {
      const nav = body.querySelector<HTMLElement>(".settings-nav");
      const panel = body.querySelector<HTMLElement>(".settings-panel");
      if (!nav || !panel) throw new Error("Settings layout is incomplete");
      const bodyRect = body.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        bodyWidth: bodyRect.width,
        navWidth: navRect.width,
        panelWidth: panelRect.width,
        panelX: panelRect.x,
        bodyX: bodyRect.x,
        panelY: panelRect.y,
        navY: navRect.y,
        navClientWidth: nav.clientWidth,
        navScrollWidth: nav.scrollWidth,
      };
    });

    expect(layout.navWidth).toBeCloseTo(layout.bodyWidth, 1);
    expect(layout.panelWidth).toBeCloseTo(layout.bodyWidth, 1);
    expect(layout.panelX).toBeCloseTo(layout.bodyX, 1);
    expect(layout.panelY).toBeGreaterThan(layout.navY);
    expect(layout.navScrollWidth).toBeGreaterThan(layout.navClientWidth);
  });
});

test("renders read-only Markdown in the rendered pane", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill(
    "# Formatting tour\n\nThis has **bold**, _italic_, ~~strike~~, ==highlight==, `code`, and [a link](https://example.com).\n\n## Lists\n\n- First item\n- **Bold item**\n- [x] Finished\n- [ ] Pending\n\n1. Ordered first\n2. Ordered second\n\n> A quoted line\n\n---\n\n```ts\nconst value = 42;\n```\n\n| Name | State |\n| --- | --- |\n| Onyx | Ready |",
  );

  const article = page.locator(".rendered-pane article.prose");
  await expect(article).toBeVisible();
  await expect(article.locator("h1")).toHaveText("Formatting tour");
  await expect(article.locator("em")).toHaveText("italic");
  await expect(article.locator("del")).toHaveText("strike");
  await expect(article.locator("mark")).toHaveText("highlight");
  await expect(article.locator("table")).toBeVisible();
  await expect(article.locator("ul")).toHaveCSS("list-style-type", "disc");
  await expect(article.locator("ol")).toHaveCSS("list-style-type", "decimal");
  await expect(article.locator(".task-list-item input[type=checkbox]")).toHaveCount(2);
  await expect(article.locator(".task-list-item input[type=checkbox]").nth(0)).toBeChecked();
  await expect(article.locator(".task-list-item input[type=checkbox]").nth(1)).not.toBeChecked();
  await expect(article.locator(".task-list-item input[type=checkbox]").first()).toBeDisabled();
  await expect(article.locator("pre code.hljs")).toHaveCount(1);
  await expect(article.locator('pre[data-code-language="TS"]')).toHaveCount(1);
  await expect(article.locator(".hljs-keyword")).toHaveText("const");
  await expect(article.locator(".hljs-number")).toHaveText("42");
});

test("keeps source and rendered panes synchronized and lets each pane be tucked away", async ({
  page,
}) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();

  await markdown.fill("# Written on the right");
  await expect(page.locator(".rendered-pane h1")).toHaveText("Written on the right");

  await page.getByRole("button", { name: "Hide the source pane" }).click();
  await expect(markdown).toBeHidden();
  await page.getByRole("button", { name: "Show the source pane" }).click();
  await expect(markdown).toBeVisible();

  await markdown.fill("# Written on the left");
  await expect(markdown).toHaveValue("# Written on the left");

  await expect(page.locator(".rendered-pane h1")).toHaveText("Written on the left");
  await page.getByRole("button", { name: "Hide the rendered pane" }).click();
  await expect(page.locator(".rendered-pane")).toBeHidden();
  await page.getByRole("button", { name: "Show the rendered pane" }).click();
  await expect(page.locator(".rendered-pane")).toBeVisible();
});

type ScrollSide = "source" | "rendered";

// Scrolls one pane so the marker sits where the pane reads its position, then reports how far
// the marker sits from that point in each pane.
async function markerOffsets(page: Page, from: ScrollSide | null, marker: string) {
  return page.evaluate(
    ({ from, marker }: { from: ScrollSide | null; marker: string }) => {
      const scrollers = {
        source: document.querySelector<HTMLElement>(".source-body > :first-child")!,
        rendered: document.querySelector<HTMLElement>(".rendered-pane")!,
      };
      const markerTop = (scroller: HTMLElement): number => {
        if (scroller instanceof HTMLTextAreaElement) {
          const style = getComputedStyle(scroller);
          const line = scroller.value.split("\n").findIndex((text) => text.includes(marker));
          return parseFloat(style.paddingTop) + line * parseFloat(style.lineHeight);
        }
        const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode as Text;
          const index = text.data.indexOf(marker);
          if (index === -1) continue;
          const range = document.createRange();
          range.setStart(text, index);
          range.setEnd(text, index + marker.length);
          return (
            range.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop
          );
        }
        throw new Error(`${marker} is not shown`);
      };
      const offset = (scroller: HTMLElement): number => {
        const range = scroller.scrollHeight - scroller.clientHeight;
        const reference = (scroller.clientHeight * scroller.scrollTop) / range;
        return markerTop(scroller) - scroller.scrollTop - reference;
      };
      if (from) {
        const scroller = scrollers[from];
        const range = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = (markerTop(scroller) * range) / scroller.scrollHeight;
      }
      return { source: offset(scrollers.source), rendered: offset(scrollers.rendered) };
    },
    { from, marker },
  );
}

test("scrolls each pane to the part of the note shown in the other one", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  // Sections differ in length and shape, so a proportional scroll would drift away from them.
  const sections = Array.from({ length: 30 }, (_, index) => {
    const body = Array.from(
      { length: (index % 4) + 1 },
      (_, line) => `Line ${line} of part ${index}.`,
    );
    const extra =
      index % 3 === 0
        ? ["", "```", ...Array.from({ length: 14 }, (_, line) => `code ${line}`), "```"]
        : index % 3 === 1
          ? ["", "- one", "- two", "- three"]
          : [];
    return [`## Marker-${index}`, "", ...body, ...extra].join("\n");
  });
  await markdown.fill(sections.join("\n\n"));
  await expect(page.locator(".rendered-pane")).toContainText("Marker-29");

  for (const [from, marker] of [
    ["rendered", "Marker-7"],
    ["source", "Marker-24"],
  ] as const) {
    const other = from === "source" ? "rendered" : "source";
    await markerOffsets(page, from, marker);
    await expect
      .poll(async () => Math.abs((await markerOffsets(page, null, marker))[other]), {
        message: `${other} follows ${from} to ${marker}`,
      })
      .toBeLessThan(40);
  }

  // Typing at the end updates the source, and the rendered pane follows it down.
  await markdown.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\nThe last word.");
  await expect(page.locator(".rendered-pane").getByText("The last word.")).toBeInViewport();
});

test("moves a pane by dragging its grip beside the divider or with the arrow keys", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const shell = page.locator(".editor-shell");
  const panesBox = await shell.boundingBox();
  if (!panesBox) throw new Error("The panes are not laid out");
  const gripOffset = async (name: string) => {
    const divider = await page.locator(".pane-divider").boundingBox();
    const box = await page.getByRole("button", { name }).boundingBox();
    if (!divider || !box) throw new Error("The divider or grip is not laid out");
    expect(box.y + box.height / 2).toBeCloseTo(divider.y + divider.height / 2, 0);
    return box.x + box.width / 2 - divider.x;
  };
  const leadingOffset = await gripOffset("Move the source pane");
  expect(leadingOffset).toBeLessThan(-14);
  expect(leadingOffset).toBeGreaterThan(-40);
  const trailingOffset = await gripOffset("Move the rendered pane");
  expect(trailingOffset).toBeGreaterThan(14);
  expect(trailingOffset).toBeLessThan(40);

  const gripLocator = page.getByRole("button", { name: "Move the source pane" });
  const pill = () =>
    gripLocator.evaluate((element) => getComputedStyle(element, "::after").opacity);
  expect(await pill()).toBe("0");
  await gripLocator.hover();
  await expect.poll(pill).toBe("1");

  const grip = await gripLocator.boundingBox();
  if (!grip) throw new Error("The source pane grip is not laid out");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(panesBox.x + panesBox.width / 2, panesBox.y + panesBox.height - 20, {
    steps: 10,
  });
  await expect(page.locator(".pane-drop-slot")).toBeVisible();
  await page.mouse.up();
  await expect(shell).toHaveClass(/panes-stacked/);
  await expect(shell).toHaveClass(/panes-swapped/);
  await expect(page.locator(".pane-drop-slot")).toHaveCount(0);
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

  const renderedGrip = await page
    .getByRole("button", { name: "Move the rendered pane" })
    .boundingBox();
  if (!renderedGrip) throw new Error("The rendered pane grip is not laid out");
  await page.mouse.move(
    renderedGrip.x + renderedGrip.width / 2,
    renderedGrip.y + renderedGrip.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(panesBox.x + panesBox.width - 20, panesBox.y + panesBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(shell).not.toHaveClass(/panes-stacked/);
  await expect(shell).not.toHaveClass(/panes-swapped/);

  await page.getByRole("button", { name: "Move the source pane" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(shell).toHaveClass(/panes-swapped/);
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  expect(await gripOffset("Move the source pane")).toBeGreaterThan(14);
});

test("copies and downloads the Markdown source from the file menu", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Packing list\n\n- **Passport**");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxCopied?: string };
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void (state.onyxCopied = text) },
    });
  });

  await useFileMenu(page, "Copy as", "Markdown");
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { onyxCopied?: string }).onyxCopied))
    .toBe("# Packing list\n\n- **Passport**");
  await expect(page.getByText("Copied this note as Markdown.")).toHaveCount(0);

  const download = page.waitForEvent("download");
  await useFileMenu(page, "Export as", "Markdown");
  expect((await download).suggestedFilename()).toBe("packing-list.md");
});

// Other formats live in the file menu, under "Export as" and "Copy as".
async function useFileMenu(page: Page, submenu: "Export as" | "Copy as", format: string) {
  await page.locator(".file.active").click({ button: "right" });
  await page.getByRole("menuitem", { name: submenu }).hover();
  await page.getByRole("menu", { name: submenu }).getByRole("menuitem", { name: format }).click();
}

test("copies and exports a note as plain text from the file menu", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Grocery list\n\n- **Fresh** bread\n- [Oats](https://example.com/oats)");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxCopied?: string };
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void (state.onyxCopied = text) },
    });
  });

  await useFileMenu(page, "Copy as", "Plain text");
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { onyxCopied?: string }).onyxCopied))
    .toBe("Grocery list\n\n- Fresh bread\n- Oats (https://example.com/oats)");

  const download = page.waitForEvent("download");
  await useFileMenu(page, "Export as", "Plain text");
  expect((await download).suggestedFilename()).toBe("grocery-list.txt");
});

test("copies a note as rich text and exports RTF from the file menu", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Meeting notes\n\nDecided on **Friday**.");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxCopied?: Record<string, string> };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: async (items: ClipboardItem[]) => {
          const copied: Record<string, string> = {};
          for (const type of items[0]!.types) {
            copied[type] = await (await items[0]!.getType(type)).text();
          }
          state.onyxCopied = copied;
        },
      },
    });
  });

  await useFileMenu(page, "Copy as", "Rich text");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { onyxCopied?: Record<string, string> }).onyxCopied,
      ),
    )
    .toEqual({
      "text/html": expect.stringContaining("<strong>Friday</strong>"),
      "text/plain": "Meeting notes\n\nDecided on Friday.",
    });

  const download = page.waitForEvent("download");
  await useFileMenu(page, "Export as", "Rich text");
  expect((await download).suggestedFilename()).toBe("meeting-notes.rtf");
});

test("copies and exports a note as HTML from the file menu", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Release notes\n\nShipped **today**.");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxCopied?: string };
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void (state.onyxCopied = text) },
    });
  });

  await useFileMenu(page, "Copy as", "HTML");
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { onyxCopied?: string }).onyxCopied))
    .toContain("<strong>today</strong>");

  const download = page.waitForEvent("download");
  await useFileMenu(page, "Export as", "HTML");
  expect((await download).suggestedFilename()).toBe("release-notes.html");
});

test("prints a note as PDF from the file menu", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Field report\n\nEverything is in order.");
  await page.evaluate(() => {
    const state = window as typeof window & { onyxPrinted?: boolean };
    window.print = () => {
      state.onyxPrinted = true;
    };
  });

  await page.locator(".file.active").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy as" }).hover();
  await expect(
    page.getByRole("menu", { name: "Copy as" }).getByRole("menuitem", { name: "PDF" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await useFileMenu(page, "Export as", "PDF");
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { onyxPrinted?: boolean }).onyxPrinted),
    )
    .toBe(true);
});

test("customizes and persists keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await page.getByRole("button", { name: "Change Focus search shortcut" }).click();
  await page.keyboard.press("ControlOrMeta+Shift+Y");
  const shortcut = page.getByRole("button", { name: "Change Focus search shortcut" });
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform));
  if (isMac) {
    await expect(shortcut.locator("kbd")).toHaveText(["⌘", "⇧", "Y"]);
    await expect(shortcut.locator(".shortcut-separator")).toHaveCount(0);
  } else {
    await expect(shortcut.locator("kbd")).toHaveText(["Ctrl", "Shift", "Y"]);
    await expect(shortcut.locator(".shortcut-separator")).toHaveText(["+", "+"]);
  }
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.keyboard.press("ControlOrMeta+Shift+Y");
  await expect(page.getByPlaceholder("Search notes or commands…")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Shift+Y");
  await expect(page.getByPlaceholder("Search notes or commands…")).toBeFocused();
});

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
  await page.getByRole("button", { name: "Sync repository", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("octocat/onyx-vault");
  await page.getByRole("button", { name: "Use this repository" }).click();

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
  await page.getByRole("button", { name: "Sync repository", exact: true }).click();
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

  await page.getByRole("button", { name: "Settings", exact: true }).click();
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
  await expect(page.getByText("Imported 1 note and 1 attachment.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Trip plans/ })).toBeVisible();
  await expect(page.locator('.rendered-pane img[alt="the map"]')).toHaveAttribute("src", /^blob:/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^onyx-markdown-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.getByText("Exported 3 files to ZIP.")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Sync status" }).click();
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

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Folder", { exact: true }).fill("media");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(editor).toHaveValue(/\]\(media\/image-\d{8}-\d{6}\.png\)$/);
  await page.getByLabel("Hide the attachments folder in the sidebar").check();
  await page.keyboard.press("Escape");
  await expect(page.locator(".attachment-folder-row")).toHaveCount(0);
});

test("switches repositories by swiping horizontally on the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.locator(".vault-trigger").click();
  await page.getByRole("menuitem", { name: "New repository" }).click();
  const dots = page.getByRole("tablist", { name: /Repositories/ }).getByRole("tab");
  await expect(dots).toHaveCount(2);
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");

  const sidebar = page.locator(".sidebar .note-list");
  await sidebar.hover();
  await page.mouse.wheel(-120, 0);
  await expect(dots.nth(0)).toHaveAttribute("aria-selected", "true");

  // Vertical scrolling must not switch repositories.
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(250);
  await expect(dots.nth(0)).toHaveAttribute("aria-selected", "true");

  await page.mouse.wheel(120, 0);
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");
});
