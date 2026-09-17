import { describe, expect, it } from "vite-plus/test";

import { renderMarkdownBlocks } from "./markdown-lite.js";

describe("renderMarkdownBlocks", () => {
  it("consumes a list marker with no content", () => {
    expect(renderMarkdownBlocks("- ")).toEqual([
      { html: "<p>- </p>", element: true, lines: { start: 0, end: 1 } },
    ]);
  });
});
