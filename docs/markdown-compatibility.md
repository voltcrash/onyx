# Markdown compatibility

Onyx renders Markdown close to the current GitHub.com experience, with a small
set of Onyx-only note-taking extensions kept separate from GitHub behavior.
This is not a claim of perfect GitHub compatibility; differences are noted
below and covered by `src/lib/github-markdown-compat.test.ts`,
`src/lib/gfm-fixtures.test.ts`, and `src/lib/github-compare.test.ts`.

## Architecture

```text
Markdown source
→ remark parser (CommonMark/GFM + GitHub/Onyx extensions)
→ remark-rehype with raw HTML → rehype-raw
→ heading slugs and generated markup
→ rehype-sanitize (narrow allowlist)
→ syntax highlighting, math typesetting, link resolution
→ renderer → preview styles
```

`src/lib/markdown-lite.ts` is a temporary first-paint and active-typing
renderer. It keeps the preview responsive while text is changing, then the
full renderer replaces it once input settles. It is not a second GitHub
Markdown implementation (`src/routes/page-controller.svelte.ts` always loads
the full renderer).

## 1. CommonMark/GFM — supported

Headings (ATX/Setext), emphasis, strong emphasis, `~~strikethrough~~`
(including GitHub single-tilde behavior), ordered/unordered/nested lists, task
lists, blockquotes, thematic breaks, fenced/indented code, inline code,
tables, autolinks, explicit/reference/collapsed/shortcut links, footnotes,
hard breaks (two-space and backslash; single newlines do not break).

## 2. GitHub writing features — supported

- Alerts: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` only. The marker
  must start the blockquote; trailing marker-line text folds into the body
  (no custom titles); nested alerts stay plain blockquotes.
- Raw HTML: parsed then sanitized. `sub`, `sup`, `ins`, `details`, `summary`,
  and safe anchors pass; scripts, event handlers, `javascript:` URLs, and
  style attributes are stripped.
- Math: `$…$`, `$$…$$`, ````math`fences, and the alternate`$`…`$` inline
  syntax (KaTeX output; GitHub uses a different engine).
- Diagrams: ``mermaid`, ``geojson`, ````topojson`, ````stl` fences are
  recognized. Mermaid renders client-side when loaded; geographic/model
  fences show a structural summary plus source instead of GitHub's
  interactive viewers.
- Heading anchors use `github-slugger` (via `rehype-slug`) with a
  `user-content-` prefix; `#section` links are re-pointed after sanitizing.
- Emoji shortcodes (`:tada:`) via `remark-gemoji`.

## 3. Onyx-only extensions — intentionally different

- `[[wiki links]]` (with `|label` and `!embed` forms).
- `==highlight==` marks.
- Non-GitHub callout kinds (e.g. `[!TODO]`); rendered with an extra
  `onyx-callout` class to stay distinguishable from GitHub alerts.

Pass `{ dialect: "github" }` in `MarkdownRenderOptions` to disable the
Onyx-only layer; the default `"onyx"` dialect preserves the product
experience. There is no user-facing dialect setting.

## Comparing against GitHub

Run the live comparison harness explicitly (never in the normal suite):

```sh
GITHUB_MARKDOWN_COMPARE=1 \
GITHUB_MARKDOWN_TEXT='$(cat path/to/fixture.md)' \
GITHUB_TOKEN=ghp_optional \
vp test run src/lib/github-compare.test.ts
```

Output is normalized before comparison, so GitHub-only classes and Onyx-only
extensions show up as structural diffs, not failures.
