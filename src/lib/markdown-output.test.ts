import { describe, expect, it } from "vite-plus/test";

import { createHtmlDocument, formatHtmlSource, outputFileName } from "./markdown-output.js";

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

describe("outputFileName", () => {
  it("builds a safe file name from a note title", () => {
    expect(outputFileName("Project Aurora: résumé", "html")).toBe("project-aurora-resume.html");
    expect(outputFileName("   ", "pdf")).toBe("note.pdf");
  });
});
