import { expect, test } from "@playwright/test";
import {
  blockNextVaultWrite,
  expectMarkdown,
  releaseVaultWrite,
  waitForBlockedVaultWrite,
} from "./helpers.ts";

test("highlights Markdown source without violating the content security policy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, "onyxCspViolations", { value: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(event.effectiveDirective);
    });
  });
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Heading\n\n**Bold** and _italic_ with [a link](https://example.com).");
  await expect(editor.locator(".md-heading")).toContainText(["# ", "Heading"]);
  await expect(editor.locator(".md-strong").filter({ hasText: "Bold" })).toBeVisible();
  await expect(editor).toHaveCSS("white-space", /pre-wrap|break-spaces/);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "onyxCspViolations")))
    .toEqual([]);
});

test("undoes formatting and browser edits and clears history when switching notes", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("Original");
  await editor.press("ControlOrMeta+a");
  await editor.press("ControlOrMeta+b");
  await expectMarkdown(editor, "**Original**");
  await editor.press("ControlOrMeta+z");
  await expectMarkdown(editor, "Original");
  await editor.press("ControlOrMeta+Shift+z");
  await expectMarkdown(editor, "**Original**");
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "historyUndo",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expectMarkdown(editor, "Original");
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "historyRedo",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expectMarkdown(editor, "**Original**");

  await page.getByRole("button", { name: "New file" }).click();
  const name = page.getByRole("textbox", { name: "File name" });
  await name.fill("fresh.md");
  await name.press("Enter");
  await expectMarkdown(editor, "");
  await editor.fill("Fresh");
  await editor.press("ControlOrMeta+z");
  await expectMarkdown(editor, "");
  await editor.press("ControlOrMeta+z");
  await expectMarkdown(editor, "");
});

test("preserves the whole note while rendering only nearby source lines", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  const contents = Array.from({ length: 1000 }, (_, index) => "Paragraph " + index + ".").join(
    "\n\n",
  );
  await editor.fill(contents);
  await expectMarkdown(editor, contents);
  await expect.poll(() => editor.locator(".cm-line").count()).toBeLessThan(200);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type("\nEnd of note.");
  await expectMarkdown(editor, contents + "\nEnd of note.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect
    .poll(() =>
      page.evaluate(async (expected) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("onyx-vault");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<boolean>((resolve, reject) => {
            const request = database
              .transaction("noteContents")
              .objectStore("noteContents")
              .getAll();
            request.onsuccess = () =>
              resolve(
                request.result.some((note: { markdown: string }) => note.markdown === expected),
              );
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      }, contents + "\nEnd of note."),
    )
    .toBe(true);
  await page.reload();
  await expectMarkdown(editor, contents + "\nEnd of note.");
});

test("blocks keyboard and paste edits while an import is running", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Before import");
  await editor.press("ControlOrMeta+s");
  await expect(
    page.locator(".note-list").getByRole("button", { name: "Before import", exact: true }),
  ).toBeVisible();
  await blockNextVaultWrite(page);
  await page.locator('input[type="file"][webkitdirectory]').evaluate((element) => {
    const transfer = new DataTransfer();
    const file = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", { value: "import/imported.md" });
    transfer.items.add(file);
    (element as HTMLInputElement).files = transfer.files;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForBlockedVaultWrite(page);
  await expect(editor).toBeDisabled();
  await editor.dispatchEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await editor.dispatchEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "Unexpected paste");
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  });
  await expectMarkdown(editor, "# Before import");
  await releaseVaultWrite(page);
  await expect(editor).toBeEnabled();
  await expectMarkdown(editor, "# Imported");
});

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
  await expectMarkdown(editor, /# Note A/);
  const relativeLink = page.getByRole("link", { name: "A to B", exact: true });
  for (const modifiers of [["Control"], ["Shift"], ["Alt"]] as const) {
    await relativeLink.click({ modifiers: [...modifiers] });
    await expectMarkdown(editor, /# Note A/);
  }
  await relativeLink.click({ button: "middle" });
  await expectMarkdown(editor, /# Note A/);
  const startingHistoryLength = await page.evaluate(() => history.length);
  const startingUrl = page.url();

  await page.getByRole("link", { name: "A to B", exact: true }).click();
  await expectMarkdown(editor, /# Note B/);
  await expect(page.locator(".rendered-pane article")).toContainText("B to C");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 1);

  await page.getByRole("link", { name: "B to C", exact: true }).click();
  await expectMarkdown(editor, /# Note C/);
  await expect(page.locator(".rendered-pane article")).toContainText("C target content.");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.back());
  await expectMarkdown(editor, /# Note B/);
  await expect(page.locator(".rendered-pane article")).toContainText("B to C");
  await page.evaluate(() => history.back());
  await expectMarkdown(editor, /# Note A/);
  await expect(page.locator(".rendered-pane article")).toContainText("A to C");
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.forward());
  await expectMarkdown(editor, /# Note B/);
  await page.evaluate(() => history.forward());
  await expectMarkdown(editor, /# Note C/);
  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => history.length)).toBe(startingHistoryLength + 2);

  await page.evaluate(() => history.back());
  await expectMarkdown(editor, /# Note B/);
  await page.evaluate(() => history.back());
  await expectMarkdown(editor, /# Note A/);
  const missingLinkHistoryLength = await page.evaluate(() => history.length);
  await page.getByRole("link", { name: "Missing", exact: true }).click();
  await expectMarkdown(editor, /# Note A/);
  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => history.length)).toBe(missingLinkHistoryLength);
  const malformedLink = page.getByRole("link", { name: "Malformed", exact: true });
  // Resting on a link gives SvelteKit's hover preloading time to read its href.
  await malformedLink.hover();
  await page.mouse.move(1, 1, { steps: 2 });
  await malformedLink.hover();
  await page.waitForTimeout(100);
  await malformedLink.click();
  await expectMarkdown(editor, /# Note A/);
  expect(await page.evaluate(() => history.length)).toBe(missingLinkHistoryLength);
  expect(pageErrors.filter((message) => message.includes("URI malformed"))).toEqual([]);

  await page.getByRole("link", { name: "A to C", exact: true }).click();
  await expectMarkdown(editor, /# Note C/);
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
  await expectMarkdown(editor, "- first\n- ");
  await editor.press("Enter");
  await expectMarkdown(editor, "- first\n");

  await editor.fill("- [x] Done");
  await editor.press("End");
  await editor.press("Enter");
  await expectMarkdown(editor, "- [x] Done\n- [ ] ");

  await editor.fill("1. First");
  await editor.press("End");
  await editor.press("Enter");
  await expectMarkdown(editor, "1. First\n2. ");

  // Splitting mid-line leaves the caret after the new marker.
  await editor.fill("- abc");
  await editor.press("Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("Enter");
  await expectMarkdown(editor, "- \n- abc");
  await page.keyboard.type("X");
  await expectMarkdown(editor, "- \n- Xabc");

  await editor.fill("- ");
  await editor.press("End");
  await editor.press("Enter");
  await expectMarkdown(editor, "");
});

test("indents lines with Tab and outdents with Shift+Tab", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("- a");
  await editor.press("End");
  await editor.press("Tab");
  await expectMarkdown(editor, "  - a");
  await editor.press("Shift+Tab");
  await expectMarkdown(editor, "- a");

  await editor.fill("- a\n- b");
  await editor.press("ControlOrMeta+a");
  await editor.press("Tab");
  await expectMarkdown(editor, "  - a\n  - b");
  await editor.press("Shift+Tab");
  await expectMarkdown(editor, "- a\n- b");
});

test("toggles checkboxes without leaving the editor", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("- [ ] Buy milk");
  await editor.press("End");
  await editor.press("Alt+Enter");
  await expectMarkdown(editor, "- [x] Buy milk");
  await editor.press("Alt+Enter");
  await expectMarkdown(editor, "- [ ] Buy milk");

  await editor.fill("- Buy milk");
  await editor.press("End");
  await editor.press("Alt+Enter");
  await expectMarkdown(editor, "- [ ] Buy milk");
});

test("renumbers ordered items after the new one", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("1. one\n2. two");
  await editor.press("ArrowUp");
  await editor.press("Enter");
  await expectMarkdown(editor, "1. one\n2. \n3. two");
});

test("wraps the selection instead of replacing it", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill("Buy milk");
  await editor.press("ControlOrMeta+a");
  await editor.press("(");
  await expectMarkdown(editor, "(Buy milk)");

  await editor.fill("Buy milk");
  await editor.press("ControlOrMeta+a");
  await editor.press("*");
  await expectMarkdown(editor, "*Buy milk*");
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
  await expectMarkdown(editor, "[the guide](https://example.com/guide)");
});
