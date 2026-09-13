import { describe, expect, it } from "vite-plus/test";

import {
  createHtmlDocument,
  formatHtmlSource,
  markdownToPlainText,
  outputFileName,
} from "./markdown-output.js";

describe("formatHtmlSource", () => {
  it("indents block elements and keeps inline markup on one line", () => {
    const formatted = formatHtmlSource(
      "<h1>Title</h1><ul><li>One <strong>bold</strong> word</li><li>Two</li></ul>",
    );

    expect(formatted).toBe(
      [
        "<h1>",
        "  Title",
        "</h1>",
        "<ul>",
        "  <li>",
        "    One <strong>bold</strong> word",
        "  </li>",
        "  <li>",
        "    Two",
        "  </li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("copies preserved blocks and void elements through untouched", () => {
    const formatted = formatHtmlSource(
      '<pre><code>const a = 1;\n  const b = 2;</code></pre><hr><p><img src="a.png" alt="a"></p>',
    );

    expect(formatted).toBe(
      [
        "<pre><code>const a = 1;",
        "  const b = 2;</code></pre>",
        "<hr>",
        "<p>",
        '  <img src="a.png" alt="a">',
        "</p>",
      ].join("\n"),
    );
  });
});

describe("createHtmlDocument", () => {
  it("produces a standalone document with an escaped title", () => {
    const document = createHtmlDocument({ title: 'Notes & "plans"', body: "<p>Hello</p>" });

    expect(document.startsWith("<!doctype html>")).toBe(true);
    expect(document).toContain("<title>Notes &amp; &quot;plans&quot;</title>");
    expect(document).toContain("<p>Hello</p>");
    expect(document).toContain("<style>");
  });
});

describe("markdownToPlainText", () => {
  it("keeps the words and structure of a note without its markup", () => {
    const text = markdownToPlainText(`---
title: Hidden
---

# Plan **ahead**

Read the [guide](https://example.com/guide) and <https://example.com>.
Soft wrapped line.

1. First
   - Nested _item_
2. Second

- [x] Done
- [ ] Pending

> Quoted \`code\`

\`\`\`ts
const a = 1;
  const b = 2;
\`\`\`

---

| Name | State |
| --- | --- |
| Onyx | Ready |

![Diagram](diagram.png) and $x^2$.`);

    expect(text).toBe(
      [
        "Plan ahead",
        "",
        "Read the guide (https://example.com/guide) and https://example.com.\nSoft wrapped line.",
        "",
        "1. First\n   - Nested item\n2. Second",
        "",
        "- [x] Done\n- [ ] Pending",
        "",
        "> Quoted code",
        "",
        "const a = 1;\n  const b = 2;",
        "",
        "* * *",
        "",
        "Name  State\n----  -----\nOnyx  Ready",
        "",
        "Diagram and x^2.",
      ].join("\n"),
    );
  });

  it("marks footnote references and drops their back links", () => {
    expect(markdownToPlainText("Claim[^1].\n\n[^1]: Source.")).toBe(
      "Claim[1].\n\nFootnotes\n\n1. Source.",
    );
  });
});

describe("outputFileName", () => {
  it("builds a safe file name from a note title", () => {
    expect(outputFileName("Project Aurora: résumé", "html")).toBe("project-aurora-resume.html");
    expect(outputFileName("   ", "pdf")).toBe("note.pdf");
  });
});
