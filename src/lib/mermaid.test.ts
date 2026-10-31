import { describe, expect, it } from "vite-plus/test";
import { mermaidExamples, mermaidFence } from "../../test/fixtures/mermaid.js";
import { renderMarkdown, renderMarkdownBlocks, renderMarkdownTree } from "./markdown.js";
import {
  createHtmlDocument,
  formatHtmlSource,
  markdownToPlainText,
  markdownToRtf,
} from "./markdown-output.js";

describe("Mermaid diagrams", () => {
  it.each(mermaidExamples)("renders %s as SVG in both Markdown dialects", (type, source) => {
    for (const dialect of ["onyx", "github"] as const) {
      const html = renderMarkdown(mermaidFence(source), undefined, { dialect });
      expect(html).toContain(`class="pele pele-${type}"`);
      expect(html).toContain("viewBox=");
      expect(html).not.toContain("diagram-error");
      expect(html).not.toMatch(/(?:NaN|Infinity)/);
    }
  });

  it.each([
    "graph TD\n A --> B",
    "flowchart-elk LR\n A --> B",
    "stateDiagram\n [*] --> Ready",
    "xychart\n x-axis [A, B]\n bar [1, 2]",
    "sankey\n A,B,1",
    "block\n A B",
    'packet\n 0-7: "Header"',
    'treemap\n "Notes": 5',
    "ishikawa\n Missing notes\n Storage\n  Full",
    'railroad-beta\n note = sequence(terminal("title"), terminal("body"));',
    'railroad-abnf-beta\n note = "title" / "body";',
    'railroad-peg-beta\n note <- "title" / "body";',
    ...["C4Container", "C4Component", "C4Dynamic", "C4Deployment"].map(
      (type) => `${type}\n Container(app, "Onyx", "Web")`,
    ),
  ])("renders aliases and variants: %s", (source) => {
    expect(renderMarkdown(mermaidFence(source))).toContain("<svg");
  });

  it("preserves source lines, nested fences, metadata, accessibility, and Unicode labels", () => {
    const source =
      '---\ntitle: Notes\n---\n%%{init: {"flowchart": {"curve": "linear"}}}%%\nflowchart LR\n accTitle: Writing\n accDescr: Draft to published\n A["日本語 ❤"] --> B["Published"]';
    const blocks = renderMarkdownBlocks(`# Heading\n\n${mermaidFence(source)}`);
    expect(blocks.at(-1)?.lines).toEqual({ start: 2, end: source.split("\n").length + 4 });
    expect(blocks.at(-1)?.element).toBe(true);
    expect(blocks.at(-1)?.html).toContain("aria-labelledby=");
    expect(blocks.at(-1)?.html).toContain("Draft to published");
    expect(blocks.at(-1)?.html).toContain("日本語 ❤");
    expect(
      renderMarkdown(
        mermaidFence("flowchart LR\n A --> B")
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      ),
    ).toContain("<svg");
    expect(renderMarkdown("~~~mermaid\nflowchart LR\n A --> B\n~~~")).toContain("<svg");
  });

  it("gives diagrams separate accessible IDs and gradient references", () => {
    const source = "---\ntitle: Notes\n---\nsankey-beta\n Draft,Published,8";
    const html = renderMarkdown(`${mermaidFence(source)}\n\n${mermaidFence(source)}`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('id="onyx-mermaid-0-');
    expect(html).toContain('id="onyx-mermaid-1-');
    for (const [, reference] of html.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(reference);
  });

  it("preserves indentation and diagram syntax without applying prose extensions", () => {
    const source =
      'flowchart LR\n  %% #tags ==marks== and [[wiki links]] are source\n  A[[Subroutine]] --> B["#tag ==literal== [[text]]"]\n  style A fill:#fff,stroke:#333';
    const html = renderMarkdown(mermaidFence(source));
    const encoded = html.match(/data-mermaid-source="([^"]+)"/)?.[1];
    expect(decodeURIComponent(encoded ?? "")).toBe(source);
    expect(html).not.toContain('class="wikilink');
    expect(html).not.toContain("<mark>");
    expect(html).not.toContain("diagram-error");
  });

  it.each(["", "flowchart LR\n A[", "zenuml\n A->B", "flowchart LR\n" + "a".repeat(50_001)])(
    "isolates invalid or oversized diagrams and retains source",
    (source) => {
      const html = renderMarkdown(
        `${mermaidFence(source)}\n\n${mermaidFence("flowchart LR\n A --> B")}\n\nStill readable.`,
      );
      expect(html).toContain("Unable to render Mermaid diagram:");
      expect(html).toContain('role="status"');
      expect(html).toContain("<pre>");
      expect(html).toContain("<svg");
      expect(html).toContain("<p>Still readable.</p>");
    },
  );

  it("keeps source in text and RTF while exporting standalone diagrams as SVG", () => {
    const source = "flowchart LR\n A[Draft] --> B[Published]";
    const markdown = mermaidFence(source);
    const html = createHtmlDocument({
      title: "Notes",
      body: formatHtmlSource(renderMarkdown(markdown)),
    });
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
    expect(html).toContain("Draft</text>");
    expect(markdownToPlainText(markdown)).toBe(source);
    expect(markdownToRtf(markdown)).toContain("A[Draft] --> B[Published]");
    expect(JSON.stringify(renderMarkdownTree(markdown))).not.toContain("<svg");
  });

  it("keeps hostile labels, URLs, callbacks, errors, and authored SVG inert", () => {
    const markdown = `${mermaidFence('flowchart LR\n A["<script>alert(1)</script>"] --> B\n click A "javascript:alert(1)"\n click B callback')}\n\n${mermaidFence("<img src=x onerror=alert(1)>")}\n\n<svg onload="alert(1)"><script>alert(1)</script></svg>`;
    const html = renderMarkdown(markdown);
    expect(html).not.toMatch(/<(?:script|img)\b|<[^>]+\son(?:load|error)=|href="javascript:/i);
    expect(html).not.toContain("<foreignObject");
    expect(html).toContain("&#x3C;img");
    expect(html).toContain("<svg");
  });

  it("blocks diagram images in the preview and permits safe URLs in exports", () => {
    const markdown = mermaidFence(
      'flowchart LR\n A@{ img: "https://example.com/note.png", label: "Note", h: 60 }\n click A "https://example.com"',
    );
    expect(renderMarkdown(markdown)).not.toContain("<image");
    const exported = renderMarkdown(markdown, undefined, { remoteImages: "allow" });
    expect(exported).toContain("<image");
    expect(exported).toContain('rel="noopener noreferrer"');
    expect(exported).not.toContain("diagram-error");
  });
});
