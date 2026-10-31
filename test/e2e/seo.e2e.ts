import { expect, test } from "@playwright/test";
import { canonicalUrl, publicPaths } from "../../src/lib/site.ts";

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
    expect(html).toContain("<h1");
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts)
      expect(JSON.parse(script[1])["@context"]).toBe("https://schema.org");
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
  const reference = await llms.text();
  expect(reference).toContain(`(${canonicalUrl("/")})`);
  expect(reference).not.toMatch(/\/about|\/guides/);
});

test("errors and authentication responses remain excluded", async ({ request }) => {
  for (const path of ["/missing", "/api/auth/get-session"]) {
    const response = await request.get(`http://localhost:4173${path}`);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
  for (const path of ["/about", "/guides/offline-markdown-editor"]) {
    const response = await request.get(`http://localhost:4173${path}`);
    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
});
