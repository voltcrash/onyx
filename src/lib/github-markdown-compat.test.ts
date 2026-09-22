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

  it("matches GFM autolink behavior", () => {
    expect(renderMarkdown("http://example.com")).toContain('href="http://example.com"');
    expect(renderMarkdown("www.example.com")).toContain('href="http://www.example.com"');
    const trailing = renderMarkdown("See https://example.com.");
    expect(trailing).toContain('href="https://example.com"');
    expect(trailing).toContain("</a>.");
    const parens = renderMarkdown("(https://example.com)");
    expect(parens).toContain('href="https://example.com"');
    expect(renderMarkdown("`https://example.com`")).not.toContain("<a");
    const explicit = renderMarkdown("[label](https://example.com)");
    expect(explicit.match(/<a /g)).toHaveLength(1);
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

  it("resolves relative note links after GFM parsing", () => {
    const resolve = (destination: string): string | undefined => {
      if (destination === "other.md") return "blob:other";
      if (destination === "other.md#heading") return "blob:other#heading";
      return undefined;
    };
    expect(renderMarkdown("[Sibling](other.md)", resolve)).toContain('href="blob:other"');
    expect(renderMarkdown("[Child](./folder/note.md)")).toContain('href="./folder/note.md"');
    expect(renderMarkdown("[Parent](../note.md)")).toContain('href="../note.md"');
    expect(renderMarkdown("[Section](#heading)")).toContain('href="#user-content-heading"');
    expect(renderMarkdown("[Sibling section](other.md#heading)", resolve)).toContain(
      'href="blob:other#heading"',
    );
  });

  it("leaves malformed links and external URLs alone", () => {
    expect(renderMarkdown("[broken](foo bar)")).not.toContain("<a");
    expect(renderMarkdown("[safe](https://example.com)")).toContain(
      '<a href="https://example.com">safe</a>',
    );
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

  it("matches GitHub heading slugs", () => {
    // Slugs come from rehype-slug (github-slugger), GitHub's own algorithm.
    expect(renderMarkdown("# Hello World")).toContain('id="user-content-hello-world"');
    expect(renderMarkdown("# Hello, World!")).toContain('id="user-content-hello-world"');
    expect(renderMarkdown("# foo_bar")).toContain('id="user-content-foo_bar"');
    expect(renderMarkdown("# Café")).toContain('id="user-content-café"');
    expect(renderMarkdown("# 2024 Report")).toContain('id="user-content-2024-report"');
    expect(renderMarkdown("# Hello **bold**")).toContain('id="user-content-hello-bold"');
  });

  it("slugs repeated headings with incremental suffixes", () => {
    const html = renderMarkdown("# Same\n\n# Same\n\n# Same");
    expect(html).toContain('id="user-content-same"');
    expect(html).toContain('id="user-content-same-1"');
    expect(html).toContain('id="user-content-same-2"');
  });

  it("slugs emoji and hyphenated headings without breaking anchors", () => {
    const emoji = renderMarkdown("# 🎉 Party");
    expect(emoji).toContain("party");
    expect(emoji).not.toContain('🎉"');
    const hyphens = renderMarkdown("# a -- b");
    expect(hyphens).toContain('id="user-content-a----b"');
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

  it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "renders the %s GitHub alert",
    (type) => {
      const html = renderMarkdown(`> [!${type}]\n> Body`);
      expect(html).toContain(`callout-${type.toLowerCase()}`);
      expect(html).toContain("Body");
    },
  );

  it("keeps Onyx-only callouts separate from GitHub alerts", () => {
    const html = renderMarkdown("> [!TODO]\n> Body");
    expect(html).toContain("onyx-callout");
  });

  it("folds marker-line text into the alert body instead of a custom title", () => {
    const html = renderMarkdown("> [!NOTE] Custom title\n> Body");
    expect(html).toContain('<p class="callout-title">Note</p>');
    expect(html).not.toContain('<p class="callout-title">Custom title</p>');
    expect(html).toContain("Custom title");
  });

  it("renders multiline alerts", () => {
    const html = renderMarkdown("> [!TIP]\n> First\n> Second");
    expect(html).toContain("callout-tip");
    expect(html).toContain("First");
    expect(html).toContain("Second");
  });

  it("matches lowercase alert markers", () => {
    expect(renderMarkdown("> [!note]\n> Body")).toContain("callout-note");
  });

  it("ignores alert markers that do not start the blockquote", () => {
    const html = renderMarkdown("> Intro\n>\n> [!NOTE]\n> Body");
    expect(html).not.toContain("callout-note");
  });

  it("leaves nested alerts as plain blockquotes", () => {
    const html = renderMarkdown("> Outer\n>> [!NOTE]\n>> Body");
    expect(html).not.toContain("callout-note");
  });

  it("keeps unknown marker names as Onyx-only callouts", () => {
    const html = renderMarkdown("> [!FOO]\n> Body");
    expect(html).toContain("onyx-callout");
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

  it("supports GitHub collapsed sections", () => {
    const html = renderMarkdown(
      "<details>\n<summary>More</summary>\n\nBody with **bold**\n\n</details>",
    );
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>More</summary>");
    expect(html).toContain("Body with");
    expect(html).toContain("<strong>bold</strong>");
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

  it("renders GitHub alternate inline math delimiters", () => {
    const html = renderMarkdown("This uses $` and `$ delimiters: $`\\sqrt{3x-1}+(1+x)^2`$.");
    expect(html).toContain("<math");
    expect(html).not.toContain("<code>");
  });

  it("keeps escaped dollar signs as text", () => {
    expect(renderMarkdown("\\$100")).toContain("$100");
    expect(renderMarkdown("\\$100")).not.toContain("<math");
  });

  it("keeps plain inline code as code", () => {
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
    expect(renderMarkdown("`code`")).not.toContain("<math");
  });

  it("renders display math", () => {
    expect(renderMarkdown("$$a^2$$")).toContain("<math");
  });

  it("renders GitHub math code fences as mathematics", () => {
    const html = renderMarkdown("```math\na^2 + b^2 = c^2\n```");
    expect(html).toContain("<math");
    expect(html).not.toContain("<pre>");
  });

  it("keeps non-math fences as code blocks", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).not.toContain("<math");
  });

  it("recognizes Mermaid fences as diagrams instead of code", () => {
    const html = renderMarkdown("```mermaid\ngraph TD;\n  A-->B;\n```");
    expect(html).toContain("diagram-mermaid");
    expect(html).toContain("graph TD;");
    expect(html).not.toContain("language-mermaid");
  });

  it("keeps Mermaid failures readable and inert", () => {
    const html = renderMarkdown("```mermaid\n<script>alert(1)</script>\n```");
    expect(html).toContain("diagram-mermaid");
    expect(html).not.toContain("<script");
  });

  it("recognizes GeoJSON fences with a structural summary", () => {
    const html = renderMarkdown(
      '```geojson\n{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]}}]}\n```',
    );
    expect(html).toContain("diagram-geojson");
    expect(html).toContain("GeoJSON FeatureCollection · 1 feature");
    expect(html).not.toContain("language-geojson");
  });

  it("flags malformed GeoJSON while preserving its source", () => {
    const html = renderMarkdown("```geojson\nnot json\n```");
    expect(html).toContain("diagram-geojson");
    expect(html).toContain("diagram-error");
    expect(html).toContain("Invalid GeoJSON");
    expect(html).toContain("not json");
  });

  it("recognizes TopoJSON fences separately from GeoJSON", () => {
    const html = renderMarkdown(
      '```topojson\n{"type":"Topology","objects":{"example":{"type":"GeometryCollection","geometries":[]}},"arcs":[]}\n```',
    );
    expect(html).toContain("diagram-topojson");
    expect(html).toContain("TopoJSON Topology · 1 object");
    expect(html).not.toContain("diagram-geojson");
  });

  it("flags malformed TopoJSON while preserving its source", () => {
    const html = renderMarkdown('```topojson\n{"type":"Feature"}\n```');
    expect(html).toContain("diagram-topojson");
    expect(html).toContain("diagram-error");
    expect(html).toContain("Invalid TopoJSON");
  });

  it("recognizes ASCII STL fences with a facet summary", () => {
    const html = renderMarkdown("```stl\nsolid cube\nfacet normal 0 0 1\nendsolid cube\n```");
    expect(html).toContain("diagram-stl");
    expect(html).toContain("STL model · 1 facet");
    expect(html).not.toContain("language-stl");
  });

  it("flags malformed STL while preserving its source", () => {
    const html = renderMarkdown("```stl\nnot a solid\n```");
    expect(html).toContain("diagram-stl");
    expect(html).toContain("diagram-error");
    expect(html).toContain("Invalid STL");
  });
});
