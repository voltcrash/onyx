import { expect, test } from "@playwright/test";
import themeCatalog from "../../src/lib/theme-catalog.json" with { type: "json" };

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
    "cascadia-code": "Cascadia Code Variable",
    "system-mono": "ui-monospace",
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
  await expect(headingFont.locator("option")).toHaveCount(6);

  await headingType.selectOption("sans-serif");
  await expect(headingFont).toHaveValue("geist");
  await expect(headingFont.locator("option")).toHaveCount(6);
  await headingFont.selectOption("manrope");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Manrope Variable/);

  await headingType.selectOption("monospace");
  await expect(headingFont).toHaveValue("cascadia-code");
  await expect(headingFont.locator("option")).toHaveCount(6);
  await headingFont.selectOption("jetbrains-mono");
  await expect(page.locator(".type-specimen h4")).toHaveCSS(
    "font-family",
    /JetBrains Mono Variable/,
  );

  await headingType.selectOption("slab-serif");
  await expect(headingFont).toHaveValue("arvo");
  await expect(headingFont.locator("option")).toHaveCount(6);
  await headingFont.selectOption("bitter");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Bitter Variable/);

  await headingType.selectOption("rounded-sans");
  await expect(headingFont).toHaveValue("fredoka");
  await expect(headingFont.locator("option")).toHaveCount(6);
  await headingFont.selectOption("lexend");
  await expect(page.locator(".type-specimen h4")).toHaveCSS("font-family", /Lexend Variable/);
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
