import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

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
  await expectMarkdown(editor, "**hello**");

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
  await expectMarkdown(editor, /Project Aurora/);
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
