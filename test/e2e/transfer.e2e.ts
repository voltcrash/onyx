import { expect, test, type Page } from "@playwright/test";

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
    const state = window as typeof window & { onyxPrinted?: string };
    window.print = () => {
      state.onyxPrinted = document.querySelector(".print-document article")?.textContent ?? "";
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
      page.evaluate(() => (window as typeof window & { onyxPrinted?: string }).onyxPrinted),
    )
    .toContain("Everything is in order.");
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

test("explains why an import failed", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  await page.locator('input[type="file"][webkitdirectory]').evaluate((element) => {
    const input = element as HTMLInputElement;
    const transfer = new DataTransfer();
    const note = new File(["# Escape"], "escape.md", { type: "text/markdown" });
    Object.defineProperty(note, "webkitRelativePath", { value: "import/../../escape.md" });
    transfer.items.add(note);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const notice = page.getByRole("alert").filter({ hasText: "Unsafe transfer path" });
  await expect(notice).toBeVisible();

  await page.locator('input[type="file"][accept^=".zip"]').evaluate((element) => {
    const input = element as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not a zip archive"], "broken.zip", { type: "application/zip" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(notice).toBeHidden();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss import and export status" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
