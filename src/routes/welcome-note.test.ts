import { describe, expect, it } from "vite-plus/test";
import { createInitialMarkdown } from "./welcome-note.ts";

describe("createInitialMarkdown", () => {
  it("covers everything a new user needs without sending them elsewhere", () => {
    const markdown = createInitialMarkdown("meta");
    expect(markdown.startsWith("# Welcome to Onyx\n")).toBe(true);
    for (const heading of [
      "Start writing",
      "Markdown you can use",
      "Connect and organize your notes",
      "Find anything quickly",
      "Work offline",
      "Where your notes live",
      "Import and export",
      "Back up and sync with GitHub",
      "Make it yours",
      "Keyboard shortcuts",
      "Good to know",
    ])
      expect(markdown).toContain(`\n## ${heading}\n`);
    expect(markdown).not.toMatch(/\/about|\/guides/);
  });

  it("formats shortcuts for the platform's primary modifier", () => {
    expect(createInitialMarkdown("meta")).toContain("`⌘ K` Command palette");
    expect(createInitialMarkdown("control")).toContain("`Ctrl + K` Command palette");
    expect(createInitialMarkdown("control")).not.toContain("⌘");
  });
});
