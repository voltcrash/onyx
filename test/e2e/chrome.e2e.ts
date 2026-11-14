import { expect, test } from "@playwright/test";
import themeCatalog from "../../src/lib/theme-catalog.json" with { type: "json" };

test("loads widgets on demand, traps dialog focus, and respects the production CSP", async ({
  page,
}) => {
  const violations: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.exposeFunction("recordViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      Reflect.get(window, "recordViolation")(event.violatedDirective);
    });
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const resources = () =>
    page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(
    (await resources()).filter((name) =>
      /\/(dialogs|command-palette|file-context-menu|vault-menu)\./.test(name),
    ),
  ).toEqual([]);

  const opener = page.getByRole("button", { name: "Settings", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => (await resources()).some((name) => /\/dialogs\..*\.css/.test(name)))
    .toBe(true);
  const close = dialog.getByRole("button", { name: "Close settings" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Open the command palette" }).click();
  const input = page.getByRole("combobox", { name: "Search notes and commands" });
  await expect(input).toBeFocused();
  await input.press("PageDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  const paged = await input.getAttribute("aria-activedescendant");
  await expect(page.locator(`[id="${paged}"]`)).not.toHaveAttribute("aria-disabled", "true");
  await input.press("PageUp");
  await expect(input).not.toHaveAttribute("aria-activedescendant", paged!);
  await input.fill("sidebar position right");
  await expect(page.getByRole("option").first()).toBeVisible();
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  const selected = await input.getAttribute("aria-activedescendant");
  expect(selected).toBeTruthy();
  await expect(page.locator(`[id="${selected}"]`)).not.toHaveAttribute("aria-disabled", "true");
  await input.press("Enter");
  await expect(input).toBeHidden();
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("uses Onyx colors for portaled dialogs in every light and dark theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  for (const colorTheme of Object.keys(themeCatalog.themes)) {
    for (const theme of ["light", "dark"]) {
      const colors = await dialog.evaluate(
        (element, { colorTheme, theme }) => {
          document.documentElement.dataset.colorTheme = colorTheme;
          document.documentElement.dataset.theme = theme;
          const probe = document.createElement("span");
          probe.style.backgroundColor = "var(--paper)";
          probe.style.color = "var(--ink)";
          element.append(probe);
          const actual = getComputedStyle(element);
          const expected = getComputedStyle(probe);
          const colors = {
            background: actual.backgroundColor,
            ink: actual.color,
            expectedBackground: expected.backgroundColor,
            expectedInk: expected.color,
          };
          probe.remove();
          return colors;
        },
        { colorTheme, theme },
      );
      expect(colors.background, `${colorTheme} ${theme}`).toBe(colors.expectedBackground);
      expect(colors.ink, `${colorTheme} ${theme}`).toBe(colors.expectedInk);
    }
  }
});

test("navigates nested context menus and the vault switcher from the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Folder name" });
  await name.fill("Ideas");
  await name.press("Enter");
  const folder = page.getByRole("button", { name: "Ideas", exact: true });
  await folder.focus();
  await folder.press("Shift+F10");
  const submenu = page.getByRole("menuitem", { name: "Set icon", exact: true });
  await expect(submenu).toBeVisible();
  await submenu.focus();
  await submenu.press("ArrowRight");
  const iconMenu = page.getByRole("menu", { name: "Set folder icon" });
  await expect(iconMenu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => iconMenu.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("ArrowLeft");
  await expect(iconMenu).toBeHidden();
  await expect(submenu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(folder).toBeFocused();

  const vault = page.locator(".vault-trigger");
  await vault.focus();
  await vault.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "Repositories" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "New repository" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(vault).toBeFocused();
  await vault.dblclick();
  const rename = page.getByRole("textbox", { name: "Repository name" });
  await expect(rename).toBeFocused();
  await rename.fill("Research");
  await rename.press("Enter");
  await expect(vault).toContainText("Research");
});
