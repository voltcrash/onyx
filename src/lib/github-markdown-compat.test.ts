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

  it("strips unsafe attributes and protocols from raw HTML", () => {
    const html = renderMarkdown(
      '<img src="x" onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>\n\n<p onclick="alert(1)">hi</p>',
    );
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("parses raw HTML before sanitization", () => {
    expect(renderMarkdown("<b>bold</b>")).toContain("<b>bold</b>");
  });

  it("documents details/summary handling", () => {
    // TODO: GitHub passes <details>/<summary> through and renders Markdown
    // inside; current sanitizer handling is covered further in later commits.
    const html = renderMarkdown("<details>\n<summary>More</summary>\n\nBody\n\n</details>");
    expect(html).not.toContain("<script");
  });

  it("supports subscript via HTML", () => {
    const html = renderMarkdown("~text~");
    expect(html).toContain("<del>text</del>");
    expect(html).not.toContain("<sub>");
  });

  it("allows GitHub-compatible safe HTML elements", () => {
    expect(renderMarkdown("H<sub>2</sub>O")).toContain("H<sub>2</sub>O");
    expect(renderMarkdown("x<sup>2</sup>")).toContain("x<sup>2</sup>");
    expect(renderMarkdown("<ins>inserted</ins>")).toContain("<ins>inserted</ins>");
  });

  it("allows safe anchors while stripping unsafe attributes", () => {
    const html = renderMarkdown('<a id="custom" href="#section">jump</a>');
    expect(html).toContain('href="#user-content-section"');
    const unsafe = renderMarkdown('<a href="#x" onclick="alert(1)" style="color:red">x</a>');
    expect(unsafe).not.toContain("onclick");
    expect(unsafe).not.toContain("style");
  });

  it("does not treat carets as superscript", () => {
    // GitHub documents superscript via safe HTML `<sup>`, not `^text^`.
    const html = renderMarkdown("x^2^");
    expect(html).not.toContain("<sup>");
    expect(html).toContain("x^2^");
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
