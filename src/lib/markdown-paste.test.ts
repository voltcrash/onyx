import { expect, it } from "vite-plus/test";
import { pasteUrlOverSelection } from "./markdown-utils.js";
import { renderMarkdown } from "./markdown.js";
it("escapes pasted link labels and unsafe destination delimiters", () => {
  for (const label of ["a]b", "[a]", String.raw`a\b`, "*literal*", "<literal>"]) {
    const output = renderMarkdown(pasteUrlOverSelection(label, "https://example.com/a)b<c")!);
    expect(output.match(/<a /g)).toHaveLength(1);
    expect(output).toContain('href="https://example.com/a%29b%3Cc"');
    expect(output).not.toMatch(/<em>|<strong>/);
  }
});
