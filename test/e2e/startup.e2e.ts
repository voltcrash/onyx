import { expect, test } from "@playwright/test";
import { expectMarkdown } from "./helpers.ts";

test("opens and saves notes while the preview worker is still loading", async ({ page }) => {
  await page.addInitScript(() => {
    const add = Reflect.get(
      Worker.prototype,
      "addEventListener",
    ) as typeof Worker.prototype.addEventListener;
    const pending: Array<() => void> = [];
    Reflect.set(window, "releasePreview", () => {
      Reflect.set(window, "previewReleased", true);
      for (const deliver of pending.splice(0)) deliver();
    });
    Worker.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      return add.call(
        this,
        type,
        type === "message"
          ? (event: Event) => {
              const deliver = () => {
                if (typeof listener === "function") listener.call(this, event);
                else listener?.handleEvent(event);
              };
              if (Reflect.get(window, "previewReleased")) deliver();
              else pending.push(deliver);
            }
          : listener,
        options,
      );
    };
  });
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled({ timeout: 5000 });
  await editor.fill("# Ready before preview\n\nSaved while the worker waits.");
  await editor.press("ControlOrMeta+s");
  await expect(page.locator(".note-list")).toContainText("Ready before preview");
  await page.evaluate(() => Reflect.get(window, "releasePreview")());
  await expect(page.locator(".rendered-pane h1")).toHaveText("Ready before preview");
  await page.reload();
  await expect(editor).toBeEnabled({ timeout: 5000 });
  await expectMarkdown(editor, "# Ready before preview\n\nSaved while the worker waits.");
});
