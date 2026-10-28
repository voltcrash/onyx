import { expect, test } from "@playwright/test";
import {
  blockNextVaultWrite,
  waitForBlockedVaultWrite,
  releaseVaultWrite,
  expectMarkdown,
} from "./helpers.ts";
import { canonicalUrl, publicPaths, guides } from "../../src/lib/site.ts";

for (const path of publicPaths) {
  test(`public HTML is indexable without JavaScript: ${path}`, async ({ request }) => {
    const response = await request.get(`http://localhost:4173${path}?utm_source=seo-test`);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
    const html = await response.text();
    expect(html).not.toMatch(/noindex|nofollow|nosnippet/);
    expect(html).toContain(`rel="canonical" href="${canonicalUrl(path)}"`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('name="description"');
    if (path !== "/") {
      expect(html).toContain("<h1");
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const script of scripts)
        expect(JSON.parse(script[1])["@context"]).toBe("https://schema.org");
    }
  });
}

test("sitemap and AI discovery list only public product pages", async ({ request }) => {
  const sitemap = await request.get("http://localhost:4173/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
  const xml = await sitemap.text();
  expect([...xml.matchAll(/<loc>/g)]).toHaveLength(publicPaths.length);
  for (const path of publicPaths) expect(xml).toContain(`<loc>${canonicalUrl(path)}</loc>`);
  const robots = await request.get("http://localhost:4173/robots.txt");
  const rules = await robots.text();
  expect(rules).toContain("User-agent: *\nAllow: /\nDisallow: /api/");
  expect(rules).toContain(`Sitemap: ${canonicalUrl("/sitemap.xml")}`);
  const llms = await request.get("http://localhost:4173/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/plain");
  for (const guide of guides)
    expect(await llms.text()).toContain(canonicalUrl(`/guides/${guide.slug}`));
});

test("errors and authentication responses remain excluded", async ({ request }) => {
  for (const path of ["/guides/missing", "/missing", "/api/auth/get-session"]) {
    const response = await request.get(`http://localhost:4173${path}`);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
});

test("product pages work with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/about");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#startup-shell")).toBeHidden();
  await page.getByRole("link", { name: guides[0].title }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(guides[0].title);
  await expect(page.getByRole("link", { name: "Open Onyx and start writing" })).toBeVisible();
  await context.close();
});

test("editor links to public guides and navigation returns to the workspace", async ({ page }) => {
  await page.goto("http://localhost:4173");
  await expect(page.getByRole("textbox", { name: "Markdown editor" })).toBeEnabled();
  await page.getByRole("link", { name: "About Onyx and Markdown guides" }).click();
  await expect(page).toHaveURL("http://localhost:4173/about");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "auto");
  await page.getByRole("link", { name: "Open editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
});

test("About waits for pending edits before leaving the editor", async ({ page }) => {
  await page.goto("http://localhost:4173");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await blockNextVaultWrite(page);
  await editor.fill("# Draft before opening About");
  await page.getByRole("link", { name: "About Onyx and Markdown guides" }).click();
  await waitForBlockedVaultWrite(page);
  await expect(page).toHaveURL("http://localhost:4173/");
  await releaseVaultWrite(page);
  await expect(page).toHaveURL("http://localhost:4173/about");
  await page.getByRole("link", { name: "Open editor", exact: true }).click();
  await expectMarkdown(editor, "# Draft before opening About");
});

test("About keeps the editor open when a draft cannot be saved", async ({ page }) => {
  await page.goto("http://localhost:4173");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await page.evaluate(() => {
    const put = Reflect.get(IDBObjectStore.prototype, "put") as IDBObjectStore["put"];
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "noteContents") throw new Error("Draft save blocked for test");
      return put.apply(this, args);
    };
  });
  await editor.fill("# Keep this unsaved draft");
  await page.getByRole("link", { name: "About Onyx and Markdown guides" }).click();
  await expect(
    page.getByText("Draft save blocked for test", { exact: false }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL("http://localhost:4173/");
  await expectMarkdown(editor, "# Keep this unsaved draft");
});

test("About preserves edits made while a save is in flight", async ({ page }) => {
  await page.goto("http://localhost:4173");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeEnabled();
  await blockNextVaultWrite(page);
  await editor.fill("# First draft");
  await page.getByRole("link", { name: "About Onyx and Markdown guides" }).click();
  await waitForBlockedVaultWrite(page);
  await editor.fill("# Latest draft during save");
  await releaseVaultWrite(page);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("onyx-vault");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const records = await new Promise<Array<{ markdown: string }>>((resolve, reject) => {
          const request = database
            .transaction("noteContents", "readonly")
            .objectStore("noteContents")
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return records.some(({ markdown }) => markdown === "# Latest draft during save");
      }),
    )
    .toBe(true);
  await expect(page).toHaveURL("http://localhost:4173/");
  await expectMarkdown(editor, "# Latest draft during save");
  await page.getByRole("link", { name: "About Onyx and Markdown guides" }).click();
  await expect(page).toHaveURL("http://localhost:4173/about");
  await page.getByRole("link", { name: "Open editor", exact: true }).click();
  await expectMarkdown(editor, "# Latest draft during save");
});
