import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown } from "./markdown.js";
import { compareMarkdownHtml, comparisonExcerpt, normalizeMarkdownHtml } from "./github-compare.js";

// `process` types are unavailable in this browser-first codebase, so env vars
// are read through `globalThis` without Node type dependencies.
function testEnv(name: string): string | undefined {
  const holder = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  return holder.process?.env?.[name];
}

describe("github comparison harness", () => {
  it("normalizes volatile attributes while keeping semantics", () => {
    expect(
      normalizeMarkdownHtml(
        '<h1 id="user-content-hi" class="x">Hi</h1><a class="y" href="https://example.com">go</a>',
      ),
    ).toBe('<h1>Hi</h1><a href="https://example.com">go</a>');
  });

  it("keeps checkbox and alignment semantics", () => {
    expect(
      normalizeMarkdownHtml(
        '<li class="task-list-item"><input type="checkbox" checked disabled></li>',
      ),
    ).toBe('<li><input type="checkbox" checked disabled></li>');
    expect(normalizeMarkdownHtml('<th align="right">R</th>')).toBe('<th align="right">R</th>');
  });

  it("reports the first structural difference", () => {
    const comparison = compareMarkdownHtml("<p>one</p>", "<p>two</p>");
    expect(comparison.equal).toBe(false);
    expect(comparison.firstDifference).toBeGreaterThanOrEqual(0);
    expect(comparisonExcerpt(comparison)).toContain("First difference");
    expect(compareMarkdownHtml("<p>same</p>", "<p>same</p>").equal).toBe(true);
  });

  // Live check against GitHub's official API. Skipped in the ordinary suite so
  // unit tests never need network access; invoke explicitly (see
  // github-compare.ts header). Reports semantic differences without asserting
  // byte-exact equality.
  it.runIf(testEnv("GITHUB_MARKDOWN_COMPARE") === "1")(
    "reports rendering differences against GitHub",
    async () => {
      const source = testEnv("GITHUB_MARKDOWN_TEXT") ?? "# Sample\n\nSome **text** with a table.\n";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      };
      const token = testEnv("GITHUB_TOKEN");
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("https://api.github.com/markdown", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: source, mode: "gfm" }),
      });
      expect(response.ok).toBe(true);
      const comparison = compareMarkdownHtml(renderMarkdown(source), await response.text());
      console.log(comparisonExcerpt(comparison));
    },
  );
});
