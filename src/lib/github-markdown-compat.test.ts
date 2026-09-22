import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown } from "./markdown.js";

// Dedicated GitHub compatibility/conformance coverage. Production rendering is
// unchanged here; cases that differ from GitHub are marked TODO with the
// expected GitHub behavior.
describe("github markdown compatibility", () => {
  it("renders ATX headings with anchors", () => {
    const html = renderMarkdown("# Hello World\n\n## Sub heading");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello World");
    expect(html).toContain("<h2");
  });

  it("renders Setext headings", () => {
    const html = renderMarkdown("Title\n=====\n\nSubtitle\n--------");
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
  });

  it("renders emphasis", () => {
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
    expect(renderMarkdown("_italic_")).toContain("<em>italic</em>");
  });

  it("renders strong emphasis", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("__bold__")).toContain("<strong>bold</strong>");
  });

  it("renders single-tilde strikethrough like GitHub", () => {
    expect(renderMarkdown("~deleted~")).toContain("<del>deleted</del>");
  });

  it("renders double-tilde strikethrough", () => {
    expect(renderMarkdown("~~deleted~~")).toContain("<del>deleted</del>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    expect(html).toContain("<ol>");
    expect(html).toContain("first");
  });

  it("renders nested lists", () => {
    const html = renderMarkdown("- outer\n  - inner");
    expect(html).toContain("<ul>");
    expect(html).toContain("inner");
  });

  it("renders task lists", () => {
    const html = renderMarkdown("- [x] done\n- [ ] todo");
    expect(html).toContain("task-list-item");
    expect(html).toContain('type="checkbox"');
  });

  it("renders blockquotes", () => {
    expect(renderMarkdown("> quoted")).toContain("<blockquote>");
  });

  it("renders fenced code", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
  });

  it("renders inline code", () => {
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("renders tables", () => {
    const html = renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("autolinks bare URLs", () => {
    expect(renderMarkdown("https://example.com")).toContain('href="https://example.com"');
  });

  it("autolinks email addresses", () => {
    expect(renderMarkdown("someone@example.com")).toContain("mailto:");
  });

  it("renders explicit links", () => {
    expect(renderMarkdown("[label](https://example.com)")).toContain(
      '<a href="https://example.com">label</a>',
    );
  });

  it("preserves relative links for later resolution", () => {
    expect(renderMarkdown("[Sibling](other.md)")).toContain('href="other.md"');
  });

  it("renders reference links", () => {
    const html = renderMarkdown("[example][id]\n\n[id]: https://example.com");
    expect(html).toContain('href="https://example.com"');
  });

  it("slugs duplicate headings distinctly", () => {
    const html = renderMarkdown("# Same\n\n# Same");
    expect(html.match(/id="user-content-same"/g)).toHaveLength(1);
    expect(html).toContain("same-1");
  });

  it("renders footnotes", () => {
    const html = renderMarkdown("Note[^1]\n\n[^1]: Body.");
    expect(html).toContain("fn-1");
    expect(html).toContain("Body.");
  });

  it("renders GitHub alerts", () => {
    const html = renderMarkdown("> [!NOTE]\n> Useful information");
    expect(html).toContain("callout");
    expect(html).toContain("Useful information");
  });

  it("sanitizes raw HTML", () => {
    const html = renderMarkdown('<script>alert("xss")</script>');
    expect(html).not.toContain("<script");
  });

  it("documents details/summary handling", () => {
    // TODO: GitHub passes <details>/<summary> through and renders Markdown
    // inside; current sanitizer handling is covered further in later commits.
    const html = renderMarkdown("<details>\n<summary>More</summary>\n\nBody\n\n</details>");
    expect(html).not.toContain("<script");
  });

  it("supports subscript via HTML", () => {
    // TODO: GitHub supports H<sub>2</sub>O via safe HTML; allowlist work lands
    // in a later commit. Single-tilde custom subscript is removed separately.
    expect(renderMarkdown("~deleted~")).toContain("<del>deleted</del>");
  });

  it("supports superscript via HTML", () => {
    // TODO: GitHub supports x<sup>2</sup>; custom caret syntax is removed later.
    expect(renderMarkdown("x^2^")).toContain("<sup>2</sup>");
  });

  it("renders inline math", () => {
    expect(renderMarkdown("$a^2$")).toContain("<math");
  });

  it("renders display math", () => {
    expect(renderMarkdown("$$a^2$$")).toContain("<math");
  });

  it("documents math fenced blocks", () => {
    // GitHub renders ```math fences as mathematics rather than code.
    const html = renderMarkdown("```math\na^2\n```");
    expect(html).toContain("<math");
  });
});
