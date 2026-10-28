import { canonicalUrl, publicPaths } from "#lib/site.ts";

export const prerender = true;
export function GET() {
  const urls = publicPaths.map((path) => `<url><loc>${canonicalUrl(path)}</loc></url>`).join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    },
  );
}
