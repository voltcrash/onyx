# Search and AI discovery

The production origin is `https://onyx.voltcrash.com` (also the repository homepage).
`src/lib/site.ts` owns canonical URLs, public paths and guide content. If the production
hostname changes, update that constant and `static/robots.txt` together. Do not use an
untrusted request host to generate canonical URLs.

## What is public

The editor entry point, `/about` and three workflow guides are indexable. The product
pages are prerendered with their text, links, metadata and JSON-LD in the initial HTML;
they do not load the editor, its fonts, or its local vault. The editor stays at `/` so
existing installs and local vaults keep their origin and URL. Its head describes the
application, never the active note. Local notes are not public server routes.

The sitemap lists only public pages. Authentication and error responses send `noindex`.
Vercel builds with `VERCEL_ENV=preview` or `development` also exclude indexing; this variable
is read at build time. Prerendered pages include a robots meta tag because static
hosting does not preserve the server hook’s response headers. Dynamic pages use the
HTTP header. Vercel deployment
protection should remain enabled for private preview deployments. Robots exclusions are
crawl instructions, not access controls.

`User-agent: *` permits public crawling, including Googlebot, Bingbot, OAI-SearchBot,
ChatGPT-User, Claude-SearchBot and Claude-User, while excluding `/api/`. Avoid adding
separate bot groups unless they repeat the API restriction: specific groups supersede
wildcard groups. This change does not add a special training-crawler policy.

`/llms.txt` is an optional concise product reference generated from the same guide data.
It does not force an AI service to discover or recommend Onyx. The main discovery paths
are crawlable HTML, internal links, descriptive content and the sitemap. Structured data
uses actual app capabilities; there are no invented reviews, ratings or endorsements.

## Production follow-through

These actions require ownership of external services and are not performed by this PR:

1. Deploy, then check the actual response headers and HTML for `/`, `/about`, each guide,
   `/robots.txt` and `/sitemap.xml`. Confirm that no CDN, firewall, deployment protection,
   or platform-level `X-Robots-Tag` blocks the production site or search crawlers.
2. Verify the production domain in Google Search Console and Bing Webmaster Tools.
   Submit `https://onyx.voltcrash.com/sitemap.xml` and inspect the public page URLs.
   No verification tokens are included in the repository.
3. Validate `/about` with Schema.org Validator and Google's Rich Results Test. Valid
   WebApplication metadata helps describe the app but does not guarantee a rich result.
4. Use Search Console to monitor indexing, non-brand search impressions, click-through
   rate and Core Web Vitals after deployment. Use server logs to check crawler access.
   Evaluate real field data before adding performance dependencies or tracking scripts.
5. Keep guide claims synchronized with shipped features. Publish useful examples and
   earn relevant links from real users and documentation; avoid keyword stuffing,
   fabricated comparisons, doorway pages and automated backlink submissions.

Allow time for recrawling. Rankings, indexing, snippets and AI citations or recommendations
are decisions made by each provider and cannot be guaranteed by a code change.

## References

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [OpenAI: publisher discovery guidance](https://help.openai.com/en/articles/12627856)
- [Anthropic: search and user crawlers](https://privacy.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)

## Validation

Run `vp check`, `vp run check`, `vp test` and `vp run test:e2e`. The SEO end-to-end tests
inspect initial HTML and HTTP headers, canonical URLs with tracking parameters, JSON-LD,
sitemap coverage, crawl directives, plain-text discovery, unknown pages, authentication,
and guide navigation with JavaScript disabled. Rebuild with `VERCEL_ENV=preview` to
verify preview responses are excluded before deploying a new hosting configuration.
