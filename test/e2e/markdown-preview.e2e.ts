import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const addListener = Reflect.get(
      Worker.prototype,
      "addEventListener",
    ) as typeof Worker.prototype.addEventListener;
    Object.defineProperty(Worker.prototype, "addEventListener", {
      value(type: string, listener: EventListener, options?: AddEventListenerOptions) {
        return addListener.call(
          this,
          type,
          type === "message"
            ? (event: Event) => setTimeout(() => listener.call(this, event), 150)
            : listener,
          options,
        );
      },
    });
  });
});

test("shows progress before sustained typing ends when worker results lag behind input", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# Progress\n\nStart ");
  const article = page.locator(".rendered-pane article");
  await expect(article).toContainText("Start");
  await editor.press("ControlOrMeta+End");
  let finished = false;
  await Promise.all([
    page.keyboard.type("abcdefghijklmnopqrstuvwxyz".repeat(2), { delay: 30 }).then(() => {
      finished = true;
    }),
    (async () => {
      await expect(article).toContainText("Start abc");
      expect(finished).toBe(false);
    })(),
  ]);
  await expect(article).toContainText("abcdefghijklmnopqrstuvwxyz".repeat(2));
});

test("opens a note with its prepared full preview without a lite-render flash", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill("# First\n\n| A | B |\n| - | - |\n| one | two |");
  await editor.press("ControlOrMeta+s");
  await expect(page.locator(".rendered-pane table")).toHaveCount(1);
  await page.getByRole("button", { name: "New file", exact: true }).click();
  const name = page.getByRole("textbox", { name: "File name" });
  await name.fill("second.md");
  await name.press("Enter");
  await editor.fill("# Second\n\nOther content.");
  await expect(page.locator(".rendered-pane h1")).toHaveText("Second");
  await page.evaluate(() => {
    const article = document.querySelector(".rendered-pane article")!;
    const failures: string[] = [];
    const observer = new MutationObserver(() => {
      if (article.querySelector("h1")?.textContent === "First" && !article.querySelector("table"))
        failures.push("missing table");
    });
    observer.observe(article, { childList: true, subtree: true });
    Reflect.set(window, "switchProbe", { failures, observer });
  });
  await page.locator(".note-list").getByRole("button", { name: "First", exact: true }).click();
  await expect(page.locator(".rendered-pane table")).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const probe = Reflect.get(window, "switchProbe");
      probe.observer.disconnect();
      return probe.failures;
    }),
  ).toEqual([]);
});
