import { expect, test, type Page } from "@playwright/test";
import { mermaidExamples, mermaidFence } from "../fixtures/mermaid.ts";
import themeCatalog from "../../src/lib/theme-catalog.json" with { type: "json" };

const preview = ".rendered-pane article";
const diagramSvg = `${preview} .diagram-mermaid > svg`;

async function writeDiagram(page: Page, source: string) {
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(mermaidFence(source));
  await expect(page.locator(diagramSvg).first()).toBeVisible();
}

test("renders all 33 built-in diagram types in the real Markdown worker", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(
    mermaidExamples.map(([type, source]) => `## ${type}\n\n${mermaidFence(source)}`).join("\n\n"),
  );
  await expect(page.locator(diagramSvg)).toHaveCount(mermaidExamples.length);
  await expect(page.locator(`${preview} .diagram-error`)).toHaveCount(0);
  for (const [type] of mermaidExamples) {
    await expect(page.locator(`${diagramSvg}.pele-${type}`)).toHaveCount(1);
  }
  await expect
    .poll(() =>
      page
        .locator(diagramSvg)
        .evaluateAll((svgs) =>
          svgs.every((svg) => getComputedStyle(svg).fontFamily.includes("Geist")),
        ),
    )
    .toBe(true);
  const dimensions = await page.locator(diagramSvg).evaluateAll((svgs) =>
    svgs.map((svg) => {
      const box = svg.getBoundingClientRect();
      return { width: box.width, height: box.height, available: svg.parentElement!.clientWidth };
    }),
  );
  for (const { width, height, available } of dimensions) {
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(available + 1);
  }
  expect(errors).toEqual([]);
});

test("recovers after invalid input, rapid edits, and switching notes", async ({ page }) => {
  await page.goto("/");
  await writeDiagram(page, "flowchart LR\n A[Draft] --> B[Review]");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill(mermaidFence("flowchart LR\n A["));
  await expect(page.locator(`${preview} [role=status]`)).toContainText("Unable to render Mermaid");
  await expect(page.locator(`${preview} pre`)).toHaveText("flowchart LR\n A[");
  for (const label of ["First", "Second", "Final"]) {
    await editor.fill(mermaidFence(`flowchart LR\n A[${label}] --> B[Published]`));
  }
  await expect(page.locator(`${diagramSvg} text`).first()).toHaveText("Final");
  await expect(page.locator(`${preview} .diagram-error`)).toHaveCount(0);
  await page.getByRole("button", { name: "New file" }).click();
  const name = page.getByRole("textbox", { name: "File name" });
  await name.fill("diagrams.md");
  await name.press("Enter");
  await expect(page.locator(diagramSvg)).toHaveCount(0);
  await writeDiagram(page, "sequenceDiagram\n Writer->>Onyx: Save");
  await expect(page.locator(`${diagramSvg}.pele-sequence`)).toBeVisible();
  await expect(page.locator(`${diagramSvg}.pele-flowchart`)).toHaveCount(0);
});

test("keeps diagrams visible throughout typing and the settled worker render", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await editor.fill(
    `${mermaidFence("flowchart TD\n A[Draft] --> B[Review] --> C[Published]")}\n\nParagraph below the diagram. `,
  );
  await expect(page.locator(`${diagramSvg} text`).first()).toHaveText("Draft");
  await expect(page.locator(diagramSvg)).toHaveCSS("font-family", /Geist/);
  await editor.press("ControlOrMeta+End");
  const frames = page.evaluate(
    () =>
      new Promise<{ missing: number; minHeight: number; maxHeight: number }>((resolve) => {
        let remaining = 150;
        let missing = 0;
        let minHeight = Infinity;
        let maxHeight = 0;
        function measure() {
          const svg = document.querySelector(".rendered-pane .diagram-mermaid > svg");
          if (!svg) missing += 1;
          const height = svg?.getBoundingClientRect().height ?? 0;
          minHeight = Math.min(minHeight, height);
          maxHeight = Math.max(maxHeight, height);
          if (--remaining) requestAnimationFrame(measure);
          else resolve({ missing, minHeight, maxHeight });
        }
        requestAnimationFrame(measure);
      }),
  );
  await page.keyboard.type("Keep this diagram visible while writing.", { delay: 25 });
  const { missing, minHeight, maxHeight } = await frames;
  expect(missing).toBe(0);
  expect(maxHeight - minHeight).toBeLessThan(1);
  await expect(page.locator(`${preview} p`).last()).toContainText("while writing.");
});

test("adapts to mobile and pane widths and supports keyboard zoom", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await writeDiagram(
    page,
    "sequenceDiagram\n" +
      Array.from({ length: 10 }, (_, index) => ` participant P${index} as Writer ${index}`).join(
        "\n",
      ) +
      "\n P0->>P9: Save the diagram\n P9-->>P0: Saved locally",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show the rendered pane" }).click();
  const svg = page.locator(diagramSvg);
  await expect(page.locator(`${preview} .pele-zoom-in`)).toBeVisible();
  await expect(svg).toHaveAttribute("tabindex", "0");
  const fitted = await svg.getAttribute("viewBox");
  await svg.focus();
  await svg.press("+");
  await expect(svg).not.toHaveAttribute("viewBox", fitted!);
  await svg.press("0");
  await expect(svg).toHaveAttribute("viewBox", fitted!);
  expect(
    await svg.evaluate(
      (element) => element.getBoundingClientRect().width <= element.parentElement!.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mermaid-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Hide the rendered pane" }).click();
  await expect(svg).toBeHidden();
  await page.getByRole("button", { name: "Show the rendered pane" }).click();
  await expect(svg).toBeVisible();
});

test("uses every color theme in light and dark modes and remeasures changed fonts", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await writeDiagram(
    page,
    "flowchart LR\n A[Draft a diagram] --> B{Review}\n B -->|Ready| C[Publish]",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#font-content-type").selectOption("slab-serif");
  await page.locator("#font-content").selectOption("bitter");
  await expect(page.locator(diagramSvg)).toHaveCSS("font-family", /Bitter Variable/);
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  for (const mode of ["Light", "Dark"]) {
    await page.getByRole("radio", { name: mode, exact: true }).click();
    for (const theme of Object.values(themeCatalog.themes)) {
      await page
        .getByRole("radiogroup", { name: "Color theme", exact: true })
        .getByRole("radio")
        .filter({ has: page.getByText(theme.label, { exact: true }) })
        .click();
      expect(
        await page.locator(diagramSvg).evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.getPropertyValue("--pele-fg").trim() ===
              style.getPropertyValue("--ink-body").trim() &&
            style.getPropertyValue("--pele-bg").trim() === style.getPropertyValue("--paper").trim()
          );
        }),
      ).toBe(true);
    }
  }
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.screenshot({ path: testInfo.outputPath("mermaid-dark.png") });
});

test("keeps hostile diagrams inert, preserves image privacy, and handles SVG note links", async ({
  page,
}) => {
  const errors: string[] = [];
  const violations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Reflect.set(window, "onyxDiagramCsp", []);
    document.addEventListener("securitypolicyviolation", (event) =>
      Reflect.get(window, "onyxDiagramCsp").push(event.effectiveDirective),
    );
  });
  page.on("request", (request) => {
    if (request.url().includes("diagram-tracker.example")) violations.push(request.url());
  });
  await page.goto("/");
  await writeDiagram(
    page,
    'flowchart LR\n A["<img src=x onerror=alert(1)>"] --> B\n click A "javascript:alert(1)"\n click B "missing-note.md"\n C@{img: "https://diagram-tracker.example/track.png", label: "Image", h: 60}',
  );
  await expect(
    page.locator(
      `${preview} script, ${preview} image, ${preview} img, ${preview} [onerror], ${preview} a[href^="javascript:"]`,
    ),
  ).toHaveCount(0);
  await page.locator(`${diagramSvg} a[href="missing-note.md"]`).click();
  expect(errors).toEqual([]);
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(window, "onyxDiagramCsp"))).toEqual([]);
});

test("renders without workers and continues editing offline", async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(window, "Worker", { value: undefined }));
  await page.goto("/");
  await writeDiagram(page, "flowchart LR\n A[Offline] --> B[Ready]");
  await context.setOffline(true);
  await writeDiagram(page, "sequenceDiagram\n Writer->>Onyx: Works offline");
  await expect(page.locator(`${diagramSvg}.pele-sequence`)).toBeVisible();
});

test("exports diagrams as standalone SVG and prints the complete unzoomed diagram", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await writeDiagram(page, "flowchart LR\n A[Draft] --> B[Published]");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (html: string) => Reflect.set(window, "onyxDiagramHtml", html) },
    });
    window.print = () =>
      Reflect.set(window, "onyxDiagramPrint", document.querySelector(".print-document")?.outerHTML);
  });
  async function fileMenu(submenu: string, format: string) {
    await page.locator(".file.active").click({ button: "right" });
    await page.getByRole("menuitem", { name: submenu }).hover();
    await page
      .getByRole("menu", { name: submenu })
      .getByRole("menuitem", { name: format, exact: true })
      .click();
  }
  await fileMenu("Copy as", "HTML");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "onyxDiagramHtml")))
    .toContain("<svg");
  const copied = await page.evaluate(() => Reflect.get(window, "onyxDiagramHtml") as string);
  expect(copied).not.toContain("<script");
  await fileMenu("Export as", "PDF");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "onyxDiagramPrint")))
    .toContain("<svg");
  expect(await page.evaluate(() => Reflect.get(window, "onyxDiagramPrint"))).not.toContain(
    "pele-zoom",
  );
  await page.evaluate(() =>
    document.body.insertAdjacentHTML("beforeend", Reflect.get(window, "onyxDiagramPrint")),
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-document .diagram-mermaid > svg")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mermaid-print.png") });
  await page.locator(".print-document").evaluate((element) => element.remove());
  await page.emulateMedia({ media: "screen" });
  const downloadPromise = page.waitForEvent("download");
  await fileMenu("Export as", "HTML");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const path = testInfo.outputPath("diagram.html");
  await download.saveAs(path);
  await page.goto(`file://${path}`);
  await expect(page.locator(".diagram-mermaid > svg")).toBeVisible();
  await expect(page.locator(".diagram-mermaid svg text").first()).toHaveText("Draft");
  await expect(page.locator("script")).toHaveCount(0);
});
