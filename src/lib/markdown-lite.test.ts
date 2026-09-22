import { describe, expect, it } from "vite-plus/test";

import { renderMarkdownBlocks } from "./markdown-lite.js";

describe("renderMarkdownBlocks", () => {
  it("consumes a list marker with no content", () => {
    expect(renderMarkdownBlocks("- ")).toEqual([
      { html: "<p>- </p>", element: true, lines: { start: 0, end: 1 } },
    ]);
  });

  it("keeps a list with blank lines between items in a single list", () => {
    expect(renderMarkdownBlocks("- [x] Open\n\n- [ ] Next\n- [ ] Later")).toEqual([
      {
        html: '<ul><li class="task-list-item"><p><input type="checkbox" checked disabled>Open</p></li><li class="task-list-item"><p><input type="checkbox" disabled>Next</p></li><li class="task-list-item"><p><input type="checkbox" disabled>Later</p></li></ul>',
        element: true,
        lines: { start: 0, end: 4 },
      },
    ]);
  });

  it("keeps tight lists free of item paragraphs", () => {
    expect(renderMarkdownBlocks("- one\n- two")).toEqual([
      {
        html: "<ul><li>one</li><li>two</li></ul>",
        element: true,
        lines: { start: 0, end: 2 },
      },
    ]);
  });

  it("preserves relative Markdown note links for preview navigation", () => {
    const html = renderMarkdownBlocks("[Other](other.md)")
      .map((block) => block.html)
      .join("");
    expect(html).toContain('href="other.md"');
    const fragment = renderMarkdownBlocks("[Section](other.md#heading)")
      .map((block) => block.html)
      .join("");
    expect(fragment).toContain('href="other.md#heading"');
  });

  it("leaves external and fragment-only links untouched", () => {
    const external = renderMarkdownBlocks("[Site](https://example.com)")
      .map((block) => block.html)
      .join("");
    expect(external).toContain('href="https://example.com"');
    const fragment = renderMarkdownBlocks("[Section](#heading)")
      .map((block) => block.html)
      .join("");
    expect(fragment).toContain('href="#heading"');
  });
});
