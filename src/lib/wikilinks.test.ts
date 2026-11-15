import { describe, expect, it } from "vite-plus/test";
import {
  createWikiLinkResolver,
  linksToNote,
  rewriteMovedWikiLinks,
  resolveWikiLink,
  splitWikiTarget,
  stripCode,
  wikiLinkHref,
} from "./wikilinks.js";

const notes = [
  { id: "plan", title: "Plan", sourcePath: "projects/Plan.md" },
  { id: "plan-archive", title: "Plan", sourcePath: "archive/old/Plan.md" },
  { id: "ideas", title: "Ideas", sourcePath: "Ideas.md" },
  { id: "daily", title: "Today", sourcePath: "journal/2026-10-26.md" },
  { id: "untitled", title: "Loose thought" },
];

describe("wiki link targets", () => {
  it("splits headings from names", () => {
    expect(splitWikiTarget(" Plan # Goals ")).toEqual({ name: "Plan", fragment: "Goals" });
    expect(splitWikiTarget("Plan")).toEqual({ name: "Plan", fragment: "" });
  });

  it("builds relative hrefs", () => {
    expect(wikiLinkHref("My Plan#Next steps")).toBe("My%20Plan.md#Next%20steps");
    expect(wikiLinkHref("notes/a.md")).toBe("notes/a.md");
  });
});

describe("resolveWikiLink", () => {
  it("matches file names case-insensitively, with or without an extension", () => {
    expect(resolveWikiLink(notes, "ideas")?.id).toBe("ideas");
    expect(resolveWikiLink(notes, "Ideas.md")?.id).toBe("ideas");
    expect(resolveWikiLink(notes, "Loose thought")?.id).toBe("untitled");
    expect(resolveWikiLink(notes, "Missing")).toBeUndefined();
  });

  it("prefers the linking note's folder, then the shortest path", () => {
    expect(resolveWikiLink(notes, "Plan")?.id).toBe("plan");
    expect(resolveWikiLink(notes, "Plan", "archive/old/Other.md")?.id).toBe("plan-archive");
  });

  it("matches the end of a path when the name has folders", () => {
    expect(resolveWikiLink(notes, "old/Plan")?.id).toBe("plan-archive");
    expect(resolveWikiLink(notes, "journal/2026-10-26")?.id).toBe("daily");
  });
});

describe("linksToNote", () => {
  const ideas = notes[2]!;

  it("finds wiki links and relative Markdown links", () => {
    expect(linksToNote("See [[Ideas|my ideas]].", "projects/Plan.md", ideas, notes)).toBe(true);
    expect(linksToNote("See [ideas](../Ideas.md#top).", "projects/Plan.md", ideas, notes)).toBe(
      true,
    );
    expect(linksToNote("See [ideas](Ideas.md).", "projects/Plan.md", ideas, notes)).toBe(false);
  });

  it("ignores embeds, code and other notes", () => {
    expect(linksToNote("![[Ideas]]", "Plan.md", ideas, notes)).toBe(false);
    expect(linksToNote("`[[Ideas]]`\n```\n[[Ideas]]\n```", "Plan.md", ideas, notes)).toBe(false);
    expect(linksToNote("[[Plan]]", "Ideas.md", ideas, notes)).toBe(false);
  });

  it("finds backlinks with the same case-insensitive matching as navigation", () => {
    expect(linksToNote("See [[ideas#Next|next steps]].", "Plan.md", ideas, notes)).toBe(true);
    expect(linksToNote("[[PROJECTS/PLAN]]", "Ideas.md", notes[0]!, notes)).toBe(true);
  });

  it("blanks code while keeping line positions", () => {
    expect(stripCode("a `b` c\n```\nx\n```\nd")).toBe("a   c\n\n\n\nd");
  });
});

it("ignores literal wiki delimiters and links nested in labels", () => {
  for (const source of [
    String.raw`\[[Ideas]]`,
    "&#91;[Ideas]]",
    "[**[[Ideas]]**](https://example.com)",
    "    [[Ideas]]",
  ]) {
    expect(linksToNote(source, "Plan.md", notes[2]!, notes)).toBe(false);
  }
  expect(linksToNote(String.raw`\\[[Ideas]]`, "Plan.md", notes[2]!, notes)).toBe(true);
});

it("resolves used full, collapsed and shortcut references with parsed definitions", () => {
  for (const source of [
    "[label][REF]\n\n[ref]: Ideas.md#top",
    "[ref][]\n\n[ref]: Ideas.md",
    "[ref]: Ideas.md\n\n[ref]",
    "[**label**](<Ideas.md#top>)",
  ]) {
    expect(linksToNote(source, "Plan.md", notes[2]!, notes)).toBe(true);
  }
  for (const source of [
    "[unused]: Ideas.md",
    "`[ref]`\n\n[ref]: Ideas.md",
    "```\n[ref]\n```\n\n[ref]: Ideas.md",
    "![ref]\n\n[ref]: Ideas.md",
  ]) {
    expect(linksToNote(source, "Plan.md", notes[2]!, notes)).toBe(false);
  }
});

it("does not index wiki links inside math", () => {
  expect(linksToNote("$x [[Ideas]]$", "Plan.md", notes[2]!, notes)).toBe(false);
});

describe("rewriteMovedWikiLinks", () => {
  it("rewrites only resolved targets, preserving fragments, aliases, and code", () => {
    const before = [
      { id: "a", title: "Old", sourcePath: "a/Old.md" },
      { id: "b", title: "Old", sourcePath: "b/Old.md" },
      { id: "c", title: "New", sourcePath: "b/New.md" },
    ];
    const after = before.map((note) =>
      note.id === "a" ? { ...note, sourcePath: "a/New.md" } : note,
    );
    const markdown = "[[Old]] [[Old#Heading|label]] `[[Old]]`\n\n```md\n[[Old]]\n```";
    expect(rewriteMovedWikiLinks(markdown, before, after, "a/Index.md", "a/Index.md")).toBe(
      markdown.replace("[[Old]] [[Old#Heading|label]]", "[[New]] [[New#Heading|label]]"),
    );
    expect(rewriteMovedWikiLinks("[[Old|label]]", before, after, "b/Index.md", "b/Index.md")).toBe(
      "[[Old|label]]",
    );
    expect(
      rewriteMovedWikiLinks("[[a/Old#Heading|label]]", before, after, "b/Index.md", "b/Index.md"),
    ).toBe("[[a/New#Heading|label]]");
  });
});

describe("indexed wiki link targets", () => {
  it("preserves folder preference, path suffixes, extension handling and fallback titles", () => {
    const resolve = createWikiLinkResolver(notes);
    for (const name of [
      "Plan",
      "plan.md",
      "./projects/Plan",
      "old/Plan",
      "Ideas",
      "Loose thought",
      "",
      "missing",
    ]) {
      for (const from of [undefined, "projects/Other.md", "archive/old/Other.md"]) {
        expect(resolve(name, from)).toEqual(resolveWikiLink(notes, name, from));
      }
    }
    expect(linksToNote("[[Plan]]", "projects/Other.md", notes[0]!, notes, resolve)).toBe(true);
    expect(linksToNote("[[Plan]]", "archive/old/Other.md", notes[0]!, notes, resolve)).toBe(false);
  });

  it("does not read every note path again for each link in a 10,000-note vault", () => {
    let reads = 0;
    const many = Array.from({ length: 10_000 }, (_, index) => ({
      id: String(index),
      title: String(index),
      get sourcePath() {
        reads += 1;
        return `folder/Note ${index}.md`;
      },
    }));
    const resolve = createWikiLinkResolver(many);
    const indexedReads = reads;
    for (let index = 0; index < 10_000; index += 1) {
      expect(resolve(`Note ${index}`)?.id).toBe(String(index));
    }
    expect(reads).toBe(indexedReads);
  });
});
