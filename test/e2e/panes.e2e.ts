import { expect, test, type Page } from "@playwright/test";

test("renders read-only Markdown in the rendered pane", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();

  await editor.fill(
    "# Formatting tour\n\nThis has **bold**, _italic_, ~~strike~~, ==highlight==, `code`, and [a link](https://example.com).\n\n## Lists\n\n- First item\n- **Bold item**\n- [x] Finished\n- [ ] Pending\n\n1. Ordered first\n2. Ordered second\n\n> A quoted line\n\n---\n\n```ts\nconst value = 42;\n```\n\n| Name | State |\n| --- | --- |\n| Onyx | Ready |",
  );

  const article = page.locator(".rendered-pane article.prose");
  await expect(article).toBeVisible();
  await expect(article.locator("h1")).toHaveText("Formatting tour");
  await expect(article.locator("em")).toHaveText("italic");
  await expect(article.locator("em")).toHaveCSS("font-synthesis", "style");
  await expect(article.locator("del")).toHaveText("strike");
  await expect(article.locator("mark")).toHaveText("highlight");
  await expect(article.locator("table")).toBeVisible();
  await expect(article.locator("ul")).toHaveCSS("list-style-type", "disc");
  await expect(article.locator("ol")).toHaveCSS("list-style-type", "decimal");
  await expect(article.locator(".task-list-item input[type=checkbox]")).toHaveCount(2);
  await expect(article.locator(".task-list-item input[type=checkbox]").nth(0)).toBeChecked();
  await expect(article.locator(".task-list-item input[type=checkbox]").nth(1)).not.toBeChecked();
  await expect(article.locator(".task-list-item input[type=checkbox]").first()).toBeDisabled();
  await expect(article.locator("pre code.hljs")).toHaveCount(1);
  await expect(article.locator('pre[data-code-language="TS"]')).toHaveCount(1);
  await expect(article.locator(".hljs-keyword")).toHaveText("const");
  await expect(article.locator(".hljs-number")).toHaveText("42");
});

test("keeps source and rendered panes synchronized and lets each pane be tucked away", async ({
  page,
}) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();

  await markdown.fill("# Written on the right");
  await expect(page.locator(".rendered-pane h1")).toHaveText("Written on the right");

  const handle = page.getByRole("group", { name: "Pane visibility" });
  await expect(handle).toBeVisible();
  await expect(handle.getByRole("button")).toHaveCount(2);
  const dividerBox = await page.locator(".pane-divider").boundingBox();
  const handleBox = await handle.boundingBox();
  if (!dividerBox || !handleBox) throw new Error("The divider handle is not laid out");
  expect(handleBox.x + handleBox.width / 2).toBeCloseTo(dividerBox.x + dividerBox.width / 2, 0);
  expect(handleBox.y + handleBox.height / 2).toBeCloseTo(dividerBox.y + dividerBox.height / 2, 0);

  await page.getByRole("button", { name: "Hide the source pane" }).click();
  await expect(markdown).toBeHidden();
  await expect(handle).toHaveCount(0);
  await expect(page.locator(".pane-divider")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Show the source pane" }).click();
  await expect(markdown).toBeVisible();
  await expect(handle).toBeVisible();

  await markdown.fill("# Written on the left");
  await expect(markdown).toHaveValue("# Written on the left");

  await expect(page.locator(".rendered-pane h1")).toHaveText("Written on the left");
  await page.getByRole("button", { name: "Hide the rendered pane" }).click();
  await expect(page.locator(".rendered-pane")).toBeHidden();
  await expect(page.locator(".pane-divider")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const sourcePaneBox = await page.locator(".source-pane").boundingBox();
  const sourceEditorBox = await markdown.boundingBox();
  if (!sourcePaneBox || !sourceEditorBox) throw new Error("The source pane is not laid out");
  expect(sourceEditorBox.x + sourceEditorBox.width).toBeCloseTo(
    sourcePaneBox.x + sourcePaneBox.width,
    0,
  );
  await page.getByRole("button", { name: "Show the rendered pane" }).click();
  await expect(page.locator(".rendered-pane")).toBeVisible();

  await page.evaluate(() => localStorage.setItem("onyx:pane-layout", "rows"));
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(handle).toHaveCSS("flex-direction", "column");
  const stackedDividerBox = await page.locator(".pane-divider").boundingBox();
  const stackedHandleBox = await handle.boundingBox();
  if (!stackedDividerBox || !stackedHandleBox) {
    throw new Error("The stacked divider handle is not laid out");
  }
  expect(stackedHandleBox.x + stackedHandleBox.width / 2).toBeCloseTo(
    stackedDividerBox.x + stackedDividerBox.width / 2,
    0,
  );
  expect(stackedHandleBox.y + stackedHandleBox.height / 2).toBeCloseTo(
    stackedDividerBox.y + stackedDividerBox.height / 2,
    0,
  );
  await page.getByRole("button", { name: "Hide the source pane" }).click();
  await expect(page.locator(".pane-divider")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("coalesces rapid input without postponing the rendered text", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await markdown.fill("# Rapid");
  await expect(page.locator(".rendered-pane h1")).toHaveText("Rapid");

  const scheduledFrames = await page.evaluate(() => {
    const callbacks: FrameRequestCallback[] = [];
    const requestFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    const editor = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Markdown editor"]',
    )!;
    for (const character of " preview") {
      editor.value += character;
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: character, inputType: "insertText" }),
      );
    }

    const count = callbacks.length;
    callbacks[0]?.(performance.now());
    window.requestAnimationFrame = requestFrame;
    return count;
  });

  expect(scheduledFrames).toBe(1);
  await expect(page.locator(".rendered-pane h1")).toHaveText("Rapid preview");
});

type ScrollSide = "source" | "rendered";

// Scrolls one pane so the marker sits where the pane reads its position, then reports how far
// the marker sits from that point in each pane.
async function markerOffsets(page: Page, from: ScrollSide | null, marker: string) {
  return page.evaluate(
    ({ from, marker }: { from: ScrollSide | null; marker: string }) => {
      const scrollers = {
        source: document.querySelector<HTMLElement>(".source-body > :first-child")!,
        rendered: document.querySelector<HTMLElement>(".rendered-pane")!,
      };
      const markerTop = (scroller: HTMLElement): number => {
        if (scroller instanceof HTMLTextAreaElement) {
          const style = getComputedStyle(scroller);
          const line = scroller.value.split("\n").findIndex((text) => text.includes(marker));
          return parseFloat(style.paddingTop) + line * parseFloat(style.lineHeight);
        }
        const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode as Text;
          const index = text.data.indexOf(marker);
          if (index === -1) continue;
          const range = document.createRange();
          range.setStart(text, index);
          range.setEnd(text, index + marker.length);
          return (
            range.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop
          );
        }
        throw new Error(`${marker} is not shown`);
      };
      const offset = (scroller: HTMLElement): number => {
        const range = scroller.scrollHeight - scroller.clientHeight;
        const reference = (scroller.clientHeight * scroller.scrollTop) / range;
        return markerTop(scroller) - scroller.scrollTop - reference;
      };
      if (from) {
        const scroller = scrollers[from];
        const range = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = (markerTop(scroller) * range) / scroller.scrollHeight;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
      return { source: offset(scrollers.source), rendered: offset(scrollers.rendered) };
    },
    { from, marker },
  );
}

test("scrolls each pane to the part of the note shown in the other one", async ({ page }) => {
  await page.goto("/");
  const markdown = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(markdown).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".rendered-pane")).toBeVisible();
  // Sections differ in length and shape, so a proportional scroll would drift away from them.
  const sections = Array.from({ length: 30 }, (_, index) => {
    const body = Array.from(
      { length: (index % 4) + 1 },
      (_, line) => `Line ${line} of part ${index}.`,
    );
    const extra =
      index % 3 === 0
        ? ["", "```", ...Array.from({ length: 14 }, (_, line) => `code ${line}`), "```"]
        : index % 3 === 1
          ? ["", "- one", "- two", "- three"]
          : [];
    return [`## Marker-${index}`, "", ...body, ...extra].join("\n");
  });
  await markdown.fill(sections.join("\n\n"));
  await expect(page.locator(".rendered-pane")).toContainText("Marker-29");

  for (const [from, marker] of [
    ["rendered", "Marker-7"],
    ["source", "Marker-24"],
  ] as const) {
    const other = from === "source" ? "rendered" : "source";
    await markerOffsets(page, from, marker);
    await expect
      .poll(async () => Math.abs((await markerOffsets(page, null, marker))[other]), {
        message: `${other} follows ${from} to ${marker}`,
      })
      .toBeLessThan(40);
  }

  // Typing at the end updates the source, and the rendered pane follows it down.
  await markdown.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\nThe last word.");
  await expect(page.locator(".rendered-pane").getByText("The last word.")).toBeInViewport();
});

test("keeps a native scrollbar only on the right pane during synced scrolling", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

  const scrollbarWidths = () =>
    page.evaluate(() => ({
      source: getComputedStyle(
        document.querySelector<HTMLTextAreaElement>(".source-body > textarea")!,
      ).scrollbarWidth,
      rendered: getComputedStyle(document.querySelector<HTMLElement>(".rendered-pane")!)
        .scrollbarWidth,
    }));

  await expect(page.locator(".editor-shell")).toHaveClass(/hide-leading-scrollbar/);
  await expect.poll(scrollbarWidths).toEqual({ source: "none", rendered: "auto" });

  await page.evaluate(() => localStorage.setItem("onyx:pane-order", "rendered-first"));
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator(".editor-shell")).toHaveClass(/panes-swapped/);
  await expect.poll(scrollbarWidths).toEqual({ source: "auto", rendered: "none" });

  await page.evaluate(() => localStorage.setItem("onyx:pane-layout", "rows"));
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await expect(page.locator(".editor-shell")).not.toHaveClass(/hide-leading-scrollbar/);
  await expect.poll(scrollbarWidths).toEqual({ source: "auto", rendered: "auto" });
});

test("moves a pane by dragging its grip beside the divider or with the arrow keys", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  const shell = page.locator(".editor-shell");
  const panesBox = await shell.boundingBox();
  if (!panesBox) throw new Error("The panes are not laid out");
  const gripOffset = async (name: string) => {
    const divider = await page.locator(".pane-divider").boundingBox();
    const box = await page.getByRole("button", { name }).boundingBox();
    if (!divider || !box) throw new Error("The divider or grip is not laid out");
    expect(box.y + box.height / 2).toBeCloseTo(divider.y + divider.height / 2, 0);
    return box.x + box.width / 2 - divider.x;
  };
  const leadingOffset = await gripOffset("Move the source pane");
  expect(leadingOffset).toBeLessThan(-14);
  expect(leadingOffset).toBeGreaterThan(-40);
  const trailingOffset = await gripOffset("Move the rendered pane");
  expect(trailingOffset).toBeGreaterThan(14);
  expect(trailingOffset).toBeLessThan(40);

  const gripLocator = page.getByRole("button", { name: "Move the source pane" });
  const pill = () =>
    gripLocator.evaluate((element) => getComputedStyle(element, "::after").opacity);
  expect(await pill()).toBe("0");
  await gripLocator.hover();
  await expect.poll(pill).toBe("1");

  const grip = await gripLocator.boundingBox();
  if (!grip) throw new Error("The source pane grip is not laid out");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(panesBox.x + panesBox.width / 2, panesBox.y + panesBox.height - 20, {
    steps: 10,
  });
  await expect(page.locator(".pane-drop-slot")).toBeVisible();
  await page.mouse.up();
  await expect(shell).toHaveClass(/panes-stacked/);
  await expect(shell).toHaveClass(/panes-swapped/);
  await expect(page.locator(".pane-drop-slot")).toHaveCount(0);
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

  const renderedGrip = await page
    .getByRole("button", { name: "Move the rendered pane" })
    .boundingBox();
  if (!renderedGrip) throw new Error("The rendered pane grip is not laid out");
  await page.mouse.move(
    renderedGrip.x + renderedGrip.width / 2,
    renderedGrip.y + renderedGrip.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(panesBox.x + panesBox.width - 20, panesBox.y + panesBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(shell).not.toHaveClass(/panes-stacked/);
  await expect(shell).not.toHaveClass(/panes-swapped/);

  await page.getByRole("button", { name: "Move the source pane" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(shell).toHaveClass(/panes-swapped/);
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  expect(await gripOffset("Move the source pane")).toBeGreaterThan(14);
});

for (const layout of ["columns", "rows"] as const) {
  test(`snaps the ${layout} divider to an exact 50/50 split while dragging`, async ({ page }) => {
    await page.goto("/");
    if (layout === "rows") {
      await page.evaluate(() => localStorage.setItem("onyx:pane-layout", "rows"));
      await page.reload();
    }
    await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();

    const shell = page.locator(".editor-shell");
    const stacked = layout === "rows";
    if (stacked) await expect(shell).toHaveClass(/panes-stacked/);
    const bounds = await shell.boundingBox();
    const resizeBounds = await page.locator(".pane-resize").boundingBox();
    if (!bounds || !resizeBounds) throw new Error("The pane divider is not laid out");
    const start = stacked
      ? { x: bounds.x + bounds.width / 4, y: resizeBounds.y + resizeBounds.height / 2 }
      : { x: resizeBounds.x + resizeBounds.width / 2, y: bounds.y + bounds.height / 4 };
    const moveTo = async (offset: number) => {
      await page.mouse.move(
        stacked ? start.x : bounds.x + offset,
        stacked ? bounds.y + offset : start.y,
      );
    };
    const split = () =>
      shell.evaluate((element) => Number.parseFloat(element.style.getPropertyValue("--split")));
    const span = stacked ? bounds.height : bounds.width;

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await moveTo(span * 0.3);
    await expect.poll(split).toBeLessThan(50);
    await moveTo(span / 2 + 8);
    await expect.poll(split).toBe(50);
    await moveTo(span / 2 + 20);
    await expect.poll(split).toBeGreaterThan(50);
    await moveTo(span / 2 - 8);
    await expect.poll(split).toBe(50);
    await page.mouse.up();
    await page.reload();
    await expect.poll(split).toBe(50);
  });
}
