import { expect, test } from "@playwright/test";

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

test("resizes the sidebar on either side and remembers its width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const sidebar = page.locator(".sidebar");
  const separator = page.getByRole("button", { name: /Resize notes sidebar/ });
  await expect(sidebar).toHaveCSS("width", "258px");

  const dragTo = async (width: number) => {
    const bounds = await separator.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("The sidebar resize handle is not laid out");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 4);
    await page.mouse.down();
    await page.mouse.move(
      (await page.locator(".app").getAttribute("class"))?.includes("sidebar-right")
        ? viewport.width - width
        : width,
      bounds.y + bounds.height / 4,
    );
    await page.mouse.up();
    await expect(sidebar).toHaveCSS("width", `${width}px`);
  };

  await dragTo(330);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "330px");
  await page.evaluate(() => localStorage.setItem("onyx:sidebar-side", "right"));
  await page.reload();
  await dragTo(380);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "380px");

  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(sidebar).toHaveCSS("width", "390px");
  await page.getByRole("button", { name: "Hide notes sidebar" }).click();
  await expect(separator).toBeHidden();
  await page.getByRole("button", { name: "Show notes sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "390px");
});

for (const side of ["left", "right"] as const) {
  test(`snaps the ${side} sidebar to its default width while dragging`, async ({ page }) => {
    await page.goto("/");
    if (side === "right") {
      await page.evaluate(() => localStorage.setItem("onyx:sidebar-side", "right"));
      await page.reload();
    }
    await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

    const sidebar = page.locator(".sidebar");
    const handle = page.getByRole("button", { name: /Resize notes sidebar/ });
    const bounds = await handle.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("The sidebar resize handle is not laid out");
    const y = bounds.y + bounds.height / 4;
    const moveToWidth = (width: number) =>
      page.mouse.move(side === "right" ? viewport.width - width : width, y);

    await page.mouse.move(bounds.x + bounds.width / 2, y);
    await page.mouse.down();
    await moveToWidth(330);
    await expect(sidebar).toHaveCSS("width", "330px");
    await moveToWidth(266);
    await expect(sidebar).toHaveCSS("width", "258px");
    await moveToWidth(278);
    await expect(sidebar).toHaveCSS("width", "278px");
    await moveToWidth(250);
    await expect(sidebar).toHaveCSS("width", "258px");
    await page.mouse.up();

    await page.reload();
    await expect(sidebar).toHaveCSS("width", "258px");
  });
}

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

test("switches repositories with mouse back and forward buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.locator(".vault-trigger").click();
  await page.getByRole("menuitem", { name: "New repository" }).click();
  const dots = page.getByRole("tablist", { name: /Repositories/ }).getByRole("tab");
  await expect(dots).toHaveCount(2);
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");

  const sidebar = page.locator(".sidebar .note-list");
  await sidebar.hover();
  async function pressMouseButton(button: 3 | 4): Promise<void> {
    await sidebar.evaluate((element, button) => {
      for (const type of ["pointerdown", "mousedown", "mouseup", "auxclick"]) {
        element.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
      }
    }, button);
  }

  await pressMouseButton(3);
  await expect(dots.nth(0)).toHaveAttribute("aria-selected", "true");

  await pressMouseButton(4);
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");
});
