import { expect, test, type Page } from "@playwright/test";
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

for (const updateWaiting of [false, true]) {
  test(
    updateWaiting
      ? "fetches the latest document when an update is waiting"
      : "reopens the installed app without fetching its document",
    async ({ page, context }) => {
      await page.goto("/");
      await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/service-worker.js", { type: "module" });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
              once: true,
            }),
          );
        }
      });
      if (updateWaiting) {
        await page.evaluate(() =>
          navigator.serviceWorker
            .register("/service-worker.js?startup-update", { type: "module" })
            .then(() => undefined),
        );
        await expect
          .poll(() =>
            page.evaluate(
              async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL,
            ),
          )
          .toContain("startup-update");
      }
      let requests = 0;
      await context.route(new URL("/", page.url()).href, (route) => {
        requests += 1;
        return route.fulfill({ status: 503, body: "network unavailable" });
      });
      const response = await page.reload();
      expect(response?.fromServiceWorker()).toBe(true);
      expect(response?.status()).toBe(updateWaiting ? 503 : 200);
      if (!updateWaiting)
        await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
      expect(requests).toBe(updateWaiting ? 1 : 0);
    },
  );
}

async function installServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/service-worker.js", { type: "module" });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
        once: true,
      }),
    );
  });
}

const startupMarker = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--startup-deployment").trim(),
  );

test("gives a newer deployment its own startup stylesheet", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await installServiceWorker(page);
  // A waiting update makes the worker fetch the document, as after a deployment.
  await page.evaluate(() =>
    navigator.serviceWorker
      .register("/service-worker.js?next", { type: "module" })
      .then(() => undefined),
  );
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    .toBe(true);
  await context.route(new URL("/", page.url()).href, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(/\?v=[^"]+"/g, '?v=next"');
    await route.fulfill({ response, body });
  });
  await context.route(/\/startup\.css(\?|$)/, (route) =>
    route.fulfill({ contentType: "text/css", body: ":root { --startup-deployment: next; }" }),
  );
  await page.reload();
  await expect.poll(() => startupMarker(page)).toBe("next");
});

test("styles the startup shell from the cache while offline", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await installServiceWorker(page);
  await context.route(/\/startup\.css(\?|$)/, (route) =>
    route.fulfill({ status: 503, body: "network unavailable" }),
  );
  const stylesheet = page.waitForResponse(/\/startup\.css(\?|$)/);
  await page.reload();
  const response = await stylesheet;
  expect(response.fromServiceWorker()).toBe(true);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("@layer base");
});
