import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown } from "./markdown.js";

interface Fixture {
  name: string;
  markdown: string;
  contains: string[];
  notContains?: string[];
}

// Curated subset of official GFM/CommonMark examples for syntax common in
// notes. Each fixture asserts DOM behavior rather than byte-exact HTML, since
// GitHub post-processes with classes the renderer does not reproduce.
const FIXTURES: Fixture[] = [
  {
    name: "emphasis with asterisks and underscores",
    markdown: "*foo* and _bar_",
    contains: ["<em>foo</em>", "<em>bar</em>"],
  },
  {
    name: "strong emphasis",
    markdown: "**foo** and __bar__",
    contains: ["<strong>foo</strong>", "<strong>bar</strong>"],
  },
  {
    name: "backslash escapes",
    markdown: "\\*not emphasis\\*",
    contains: ["*not emphasis*"],
    notContains: ["<em>"],
  },
  {
    name: "entities",
    markdown: "&amp; &lt; &copy;",
    contains: ["&#x26;", "&#x3C;", "©"],
  },
  {
    name: "inline links with titles",
    markdown: '[link](/uri "title")',
    contains: ['<a href="/uri" title="title">link</a>'],
  },
  {
    name: "bare URL autolinks",
    markdown: "Visit https://example.com now",
    contains: ['<a href="https://example.com">https://example.com</a>'],
  },
  {
    name: "email autolinks",
    markdown: "Write to someone@example.com",
    contains: ["mailto:someone@example.com"],
  },
  {
    name: "unordered lists with mixed markers",
    markdown: "- a\n* b\n+ c",
    contains: ["<ul>", "<li>a</li>"],
  },
  {
    name: "ordered lists",
    markdown: "1. one\n2. two",
    contains: ["<ol>", "one"],
  },
  {
    name: "blockquotes",
    markdown: "> # Heading\n> text",
    contains: ["<blockquote>", "text"],
  },
  {
    name: "indented code blocks",
    markdown: "    code",
    contains: ["<pre><code>code"],
  },
  {
    name: "fenced code with info string",
    markdown: "```js\nx();\n```",
    contains: ["<pre", "<code"],
  },
  {
    name: "tables with alignment",
    markdown: "| a | b |\n| :-- | --: |\n| 1 | 2 |",
    contains: ["<table>", 'align="left"', 'align="right"'],
  },
  {
    name: "task lists",
    markdown: "- [x] done\n- [ ] open",
    contains: ["task-list-item", "checked", "disabled"],
  },
  {
    name: "strikethrough",
    markdown: "~~gone~~",
    contains: ["<del>gone</del>"],
  },
  {
    name: "tag filtering keeps safe tags",
    markdown: "<b>bold</b>",
    contains: ["<b>bold</b>"],
  },
  {
    name: "tag filtering drops scripts",
    markdown: '<script>alert("x")</script>',
    contains: [],
    notContains: ["<script"],
  },
  {
    name: "hard breaks with two spaces",
    markdown: "one  \ntwo",
    contains: ["<br>"],
  },
  {
    name: "thematic breaks",
    markdown: "***",
    contains: ["<hr"],
  },
];

describe("official GFM conformance fixtures", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const html = renderMarkdown(fixture.markdown);
      for (const expected of fixture.contains) expect(html).toContain(expected);
      for (const absent of fixture.notContains ?? []) expect(html).not.toContain(absent);
    });
  }
});
