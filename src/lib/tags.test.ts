import { describe, expect, it } from "vite-plus/test";
import { extractTags, normalizeTag, parseSearchQuery } from "./tags.js";

describe("extractTags", () => {
  it("reads inline tags anywhere in the text", () => {
    expect(extractTags("# Plan\n\nShip it #work and #Personal/Health.\n- [ ] #todo")).toEqual([
      "personal/health",
      "todo",
      "work",
    ]);
  });

  it("ignores headings, numbers, fragments and entities", () => {
    expect(
      extractTags(
        "# Heading\n## Sub\nFixes #42, see [x](note.md#part) and https://a.dev/#top &#169;",
      ),
    ).toEqual([]);
  });

  it("ignores code", () => {
    expect(
      extractTags("`#inline` text\n```\n#fenced\n```\n~~~~\n#tilde\n```\n~~~~\n#real"),
    ).toEqual(["real"]);
  });

  it("reads front matter tag lists in each common form", () => {
    expect(extractTags("---\ntags: [alpha, '#beta']\n---\nBody")).toEqual(["alpha", "beta"]);
    expect(extractTags("---\ntags: alpha, beta\n---\nBody")).toEqual(["alpha", "beta"]);
    expect(extractTags('---\ntitle: X\ntags:\n  - alpha\n  - "beta"\nother: 1\n---\n')).toEqual([
      "alpha",
      "beta",
    ]);
    expect(extractTags("---\ntag: solo\n---\n#body")).toEqual(["body", "solo"]);
  });

  it("does not treat front matter as inline text", () => {
    expect(extractTags("---\ncolor: '#fff'\n---\n")).toEqual([]);
  });
});

describe("parseSearchQuery", () => {
  it("separates tag filters from free text", () => {
    expect(parseSearchQuery("  roadmap #Work notes #q3/plan ")).toEqual({
      text: "roadmap notes",
      tags: ["work", "q3/plan"],
    });
    expect(parseSearchQuery("#")).toEqual({ text: "#", tags: [] });
    expect(parseSearchQuery("c# tips")).toEqual({ text: "c# tips", tags: [] });
  });
});

describe("normalizeTag", () => {
  it("lower-cases and strips markers", () => {
    expect(normalizeTag(" #Work/ ")).toBe("work");
    expect(normalizeTag("'Quoted'")).toBe("quoted");
  });
});
