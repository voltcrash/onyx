import { expect, test } from "@playwright/test";

test("sorts the sidebar by name and dates while pins stay first and preferences survive reload", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  for (const [name, date] of [
    ["Apple", "2027-01-01"],
    ["Zebra", "2027-01-02"],
    ["Pinned", "2027-01-03"],
  ]) {
    await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
    await page.getByRole("button", { name: "New file", exact: true }).click();
    const input = page.getByRole("textbox", { name: "File name" });
    await input.fill(`${name}.md`);
    await input.press("Enter");
    await editor.fill(`# ${name}`);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  }
  await page.locator('[data-file-path="Pinned.md"]').click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Pin file", exact: true }).click();
  const paths = () =>
    page
      .locator(".note-list [data-file-path]")
      .evaluateAll((rows) =>
        rows
          .map((row) => row.getAttribute("data-file-path"))
          .filter((path) => ["Pinned.md", "Apple.md", "Zebra.md"].includes(path ?? "")),
      );
  await page.getByRole("combobox", { name: "Sort direction" }).selectOption("desc");
  await expect.poll(paths).toEqual(["Pinned.md", "Zebra.md", "Apple.md"]);
  await page.getByRole("combobox", { name: "Sort notes by" }).selectOption("createdAt");
  await page.getByRole("combobox", { name: "Sort direction" }).selectOption("asc");
  await expect.poll(paths).toEqual(["Pinned.md", "Apple.md", "Zebra.md"]);
  await page.clock.setFixedTime(new Date("2027-01-04T12:00:00Z"));
  await page.locator('[data-file-path="Apple.md"]').click();
  await editor.fill("# Apple\n\nUpdated");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saving…", { exact: true })).toBeHidden();
  await page.getByRole("combobox", { name: "Sort notes by" }).selectOption("updatedAt");
  await page.getByRole("combobox", { name: "Sort direction" }).selectOption("desc");
  await expect.poll(paths).toEqual(["Pinned.md", "Apple.md", "Zebra.md"]);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sort notes by" })).toHaveValue("updatedAt");
  await expect(page.getByRole("combobox", { name: "Sort direction" })).toHaveValue("desc");
  await expect.poll(paths).toEqual(["Pinned.md", "Apple.md", "Zebra.md"]);
});
