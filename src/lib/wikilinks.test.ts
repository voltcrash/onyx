import { describe, expect, it } from "vite-plus/test";
import {
  linksToNote,
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
