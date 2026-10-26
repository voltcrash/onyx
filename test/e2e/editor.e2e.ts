import { expect, test } from "@playwright/test";

test("does not render an obsolete pane toolbar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator(".source-switcher")).toHaveCount(0);
});

test("navigates relative notes with browser history and rendered fragments", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  const createNote = async (name: string, contents: string): Promise<void> => {
    await page.getByRole("button", { name: "New file" }).click();
    const fileName = page.getByRole("textbox", { name: "File name" });
    await fileName.fill(name);
    await fileName.press("Enter");
    await editor.fill(contents);
    await page.keyboard.press("ControlOrMeta+S");
    await expect(page.getByText("Unsaved", { exact: true })).toBeHidden();
    await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  };

  const destination = [
    "# Note C",
    "",
    ...Array.from({ length: 30 }, (_, index) => `Filler paragraph ${index + 1}.`),
    "",
    "## target heading",
    "",
    "C target content.",
    "",
    "## target heading",
    "",
    "C duplicate content.",
  ].join("\n");
  await createNote(
    "note-a.md",
    "# Note A\n\n[A to B](note-b.md)\n\n[A to C](note-c.md#target%20heading)\n\n[Missing](missing.md)\n\n[Malformed](bad%ZZ.md)",
  );
  await createNote("note-b.md", "# Note B\n\n[B to C](note-c.md)");
  await createNote("note-c.md", destination);

  await page.locator(".note-list").getByRole("button", { name: "Note A", exact: true }).click();
  await expect(editor).toHaveValue(/# Note A/);
  const relativeLink = page.getByRole("link", { name: "A to B", exact: true });
  for (const modifiers of [["Control"], ["Shift"], ["Alt"]] as const) {
    await relativeLink.click({ modifiers: [...modifiers] });
    await expect(editor).toHaveValue(/# Note A/);
  }
  await relativeLink.click({ button: "middle" });
  await expect(editor).toHaveValue(/# Note A/);
  const startingHistoryLength = await page.evaluate(() => history.length);
  const startingUrl = page.url();

  await page.getByRole("link", { name: "A to B", exact: true }).click();
  await expect(editor).toHaveValue(/# Note B/);
  await expect(page.locator(".rendered-pane article")).toContainText("B to C");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 1);

  await page.getByRole("link", { name: "B to C", exact: true }).click();
  await expect(editor).toHaveValue(/# Note C/);
  await expect(page.locator(".rendered-pane article")).toContainText("C target content.");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.back());
  await expect(editor).toHaveValue(/# Note B/);
  await expect(page.locator(".rendered-pane article")).toContainText("B to C");
  await page.evaluate(() => history.back());
  await expect(editor).toHaveValue(/# Note A/);
  await expect(page.locator(".rendered-pane article")).toContainText("A to C");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.forward());
  await expect(editor).toHaveValue(/# Note B/);
  await page.evaluate(() => history.forward());
  await expect(editor).toHaveValue(/# Note C/);
  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.back());
  await expect(editor).toHaveValue(/# Note B/);
  await page.evaluate(() => history.back());
  await expect(editor).toHaveValue(/# Note A/);
  const missingLinkHistoryLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "Missing", exact: true }).click();
  await expect(editor).toHaveValue(/# Note A/);
  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => history.length)).toBe(missingLinkHistoryLength);
  const malformedLink = page.getByRole("link", { name: "Malformed", exact: true });
  // Resting on a link gives SvelteKit's hover preloading time to read its href.
  await malformedLink.hover();
  await page.mouse.move(1, 1, { steps: 2 });
  await malformedLink.hover();
  await page.waitForTimeout(100);
  await malformedLink.click();
  await expect(editor).toHaveValue(/# Note A/);
  expect(await page.evaluate(() => history.length)).toBe(missingLinkHistoryLength);
  expect(pageErrors.filter((message) => message.includes("URI malformed"))).toEqual([]);

  await page.getByRole("link", { name: "A to C", exact: true }).click();
  await expect(editor).toHaveValue(/# Note C/);
  const firstTarget = page.locator(".rendered-pane #user-content-target-heading").first();
  await expect(firstTarget).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pane = document.querySelector<HTMLElement>(".rendered-pane");
          const target = document.querySelector<HTMLElement>(
            ".rendered-pane #user-content-target-heading",
          );
          if (!pane || !target) return false;
          const paneBounds = pane.getBoundingClientRect();
          const targetBounds = target.getBoundingClientRect();
          return targetBounds.top >= paneBounds.top && targetBounds.bottom <= paneBounds.bottom;
        }),
      { message: "the destination fragment is visible after the full renderer commits" },
    )
    .toBe(true);
});

test("uses the first Markdown heading for notes with front matter", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();

  await markdown.fill("---\ntitle: Metadata title\n---\n\n# Rendered title");

  await expect(page.getByRole("button", { name: "Rendered title", exact: true })).toBeVisible();
  await expect(page.locator(".rendered-pane h1")).toHaveText("Rendered title");
});

test("continues list markers when Enter is pressed in the editor", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("- first");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor).toHaveValue("- first\n- ");
  await editor.press("Enter");
  await expect(editor).toHaveValue("- first\n");

  await editor.fill("- [x] Done");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor).toHaveValue("- [x] Done\n- [ ] ");

  await editor.fill("1. First");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor).toHaveValue("1. First\n2. ");

  // Splitting mid-line leaves the caret after the new marker.
  await editor.fill("- abc");
  await editor.press("Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("Enter");
  await expect(editor).toHaveValue("- \n- abc");
  await page.keyboard.type("X");
  await expect(editor).toHaveValue("- \n- Xabc");

  await editor.fill("- ");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor).toHaveValue("");
});

test("indents lines with Tab and outdents with Shift+Tab", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("- a");
  await editor.press("End");
  await editor.press("Tab");
  await expect(editor).toHaveValue("  - a");
  await editor.press("Shift+Tab");
  await expect(editor).toHaveValue("- a");

  await editor.fill("- a\n- b");
  await editor.press("ControlOrMeta+a");
  await editor.press("Tab");
  await expect(editor).toHaveValue("  - a\n  - b");
  await editor.press("Shift+Tab");
  await expect(editor).toHaveValue("- a\n- b");
});

test("toggles checkboxes without leaving the editor", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("- [ ] Buy milk");
  await editor.press("End");
  await editor.press("Alt+Enter");
  await expect(editor).toHaveValue("- [x] Buy milk");
  await editor.press("Alt+Enter");
  await expect(editor).toHaveValue("- [ ] Buy milk");

  await editor.fill("- Buy milk");
  await editor.press("End");
  await editor.press("Alt+Enter");
  await expect(editor).toHaveValue("- [ ] Buy milk");
});

test("renumbers ordered items after the new one", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("1. one\n2. two");
  await editor.press("ArrowUp");
  await editor.press("Enter");
  await expect(editor).toHaveValue("1. one\n2. \n3. two");
});

test("wraps the selection instead of replacing it", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("Buy milk");
  await editor.press("ControlOrMeta+a");
  await editor.press("(");
  await expect(editor).toHaveValue("(Buy milk)");

  await editor.fill("Buy milk");
  await editor.press("ControlOrMeta+a");
  await editor.press("*");
  await expect(editor).toHaveValue("*Buy milk*");
});

test("pastes a link over selected text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("the guide");
  await editor.press("ControlOrMeta+a");
  await page.evaluate((url) => navigator.clipboard.writeText(url), "https://example.com/guide");
  await editor.press("ControlOrMeta+v");
  await expect(editor).toHaveValue("[the guide](https://example.com/guide)");
});
