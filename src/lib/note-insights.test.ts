import * as source from "./markdown-source.ts";
import { describe, expect, it, vi } from "vite-plus/test";
import { findUnlinkedMentions, noteOutline } from "./note-insights.ts";

describe("note insights", () => {
  it("extracts ATX and setext headings with source ranges, ignoring fenced examples", () => {
    const markdown = "# One\n\nTwo\n---\n\n```md\n# Example\n```\n\n### **Three**";
    expect(
      noteOutline(markdown).map(({ text, depth, start, end }) => [
        text,
        depth,
        markdown.slice(start, end),
      ]),
    ).toEqual([
      ["One", 1, "# One"],
      ["Two", 2, "Two\n---"],
      ["Three", 3, "### **Three**"],
    ]);
  });
  it("finds whole-name mentions outside links, wiki links, code, and frontmatter", () => {
    const markdown =
      "---\ntitle: Garden\n---\nGarden and garden. Gardening. [[Garden|Garden]] [Garden](Garden.md) ![Garden](a.png) `Garden`\n\n```md\nGarden\n```";
    const mentions = findUnlinkedMentions(markdown, ["Garden"]);
    expect(mentions.map(({ text }) => text)).toEqual(["Garden", "garden"]);
    for (const mention of mentions)
      expect(markdown.slice(mention.start, mention.end)).toBe(mention.text);
  });
  it("supports Unicode names, punctuation, and title/file-name aliases", () => {
    expect(
      findUnlinkedMentions("日本語 café C++ and File name", [
        "日本語",
        "café",
        "C++",
        "File name",
      ]).map(({ text }) => text),
    ).toEqual(["日本語", "café", "C++", "File name"]);
  });
});

it("keeps nested headings while returning no outline for long prose-only notes", () => {
  expect(
    noteOutline("> ## Quoted\n\n- ### Listed\n\n> Setext\n> ---").map((heading) => heading.text),
  ).toEqual(["Quoted", "Listed", "Setext"]);
  expect(
    noteOutline(Array.from({ length: 1000 }, (_, index) => `Paragraph ${index}.`).join("\n\n")),
  ).toEqual([]);
});

it("does not parse unrelated notes when looking for mentions", () => {
  const parse = vi.spyOn(source, "parseMarkdownSource");
  try {
    expect(findUnlinkedMentions("Unrelated prose.\n\n".repeat(5000), ["Garden"])).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
    expect(findUnlinkedMentions("garden and Garden", ["Garden"]).map(({ text }) => text)).toEqual([
      "garden",
      "Garden",
    ]);
    expect(parse).toHaveBeenCalledTimes(1);
  } finally {
    parse.mockRestore();
  }
});
