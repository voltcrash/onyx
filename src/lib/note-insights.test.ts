import { describe, expect, it } from "vite-plus/test";
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
