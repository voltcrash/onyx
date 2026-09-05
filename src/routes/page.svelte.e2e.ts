import { expect, test } from "@playwright/test";

test("searches note titles and Markdown content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved to this device")).toBeVisible();

  await page.getByRole("button", { name: "New note" }).click();
  await expect(page.getByLabel("Current document")).toContainText("Untitled.md");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("# Project Aurora\n\nThe neutrino research summary is ready.");
  await expect(editor).toHaveValue(/Project Aurora/);
  await expect(page.getByText("Unsaved")).toBeVisible();
  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect(page.getByText("Saved to this device")).toBeVisible();

  await page.getByPlaceholder("Search all notes").fill("neut");
  await expect(page.getByText("1 result")).toBeVisible();
  await expect(page.getByRole("button", { name: /Project Aurora/ })).toBeVisible();
});
