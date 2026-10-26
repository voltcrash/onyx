import { describe, expect, it } from "vite-plus/test";
import {
  basename,
  decodePath,
  encodePath,
  fileStem,
  hasControlCharacters,
  isMarkdownPath,
  isPathWithin,
  joinPath,
  movePath,
  normalizeFileName,
  normalizeFolderName,
  noteFilePath,
  noteFolderPath,
  parentPath,
  relativePath,
  resolveRelativePath,
} from "./paths.js";

describe("path segments", () => {
  it("joins and splits paths without empty segments", () => {
    expect(joinPath("", "a.md")).toBe("a.md");
    expect(joinPath("notes//daily/", "a.md")).toBe("notes/daily/a.md");
    expect(parentPath("notes/daily/a.md")).toBe("notes/daily");
    expect(parentPath("a.md")).toBe("");
  });

  it("reads the last segment across either separator", () => {
    expect(basename("notes/daily/a.md")).toBe("a.md");
    expect(basename("images\\photo.png")).toBe("photo.png");
    expect(basename("")).toBe("");
  });

  it("strips Markdown extensions from file stems", () => {
    expect(fileStem("notes/Plan.MD")).toBe("Plan");
    expect(fileStem("notes/Plan.markdown")).toBe("Plan");
    expect(fileStem("notes/photo.png")).toBe("photo.png");
    expect(fileStem("notes/.md")).toBe("Untitled");
    expect(isMarkdownPath("a/b.Markdown")).toBe(true);
    expect(isMarkdownPath("a/b.mdx")).toBe(false);
  });
});

describe("folder containment", () => {
  it("treats the root as containing everything", () => {
    expect(isPathWithin("a/b.md", "")).toBe(true);
    expect(isPathWithin("a", "a")).toBe(true);
    expect(isPathWithin("a/b.md", "a")).toBe(true);
    expect(isPathWithin("ab/c.md", "a")).toBe(false);
  });

  it("moves paths between folders", () => {
    expect(movePath("a/b/c.md", "a/b", "x")).toBe("x/c.md");
    expect(movePath("a/b", "a/b", "x/y")).toBe("x/y");
    expect(movePath("a/c.md", "a", "")).toBe("c.md");
  });
});

describe("relative paths", () => {
  it("resolves links against a note's folder", () => {
    expect(resolveRelativePath("notes/daily", "../img/a.png")).toBe("notes/img/a.png");
    expect(resolveRelativePath("", "./a.md")).toBe("a.md");
    expect(resolveRelativePath("notes", "../../a.md")).toBeUndefined();
    expect(resolveRelativePath("notes", "img\\a.png")).toBeUndefined();
    expect(resolveRelativePath("notes", "")).toBeUndefined();
  });

  it("builds links from a folder to a file", () => {
    expect(relativePath("notes/daily", "attachments/a.png")).toBe("../../attachments/a.png");
    expect(relativePath("notes", "notes/a.png")).toBe("a.png");
    expect(relativePath("", "a/b.png")).toBe("a/b.png");
    expect(relativePath("a", "a")).toBe("../a");
  });

  it("decodes escapes and leaves malformed ones alone", () => {
    expect(decodePath("my%20notes/a%231.md")).toBe("my notes/a#1.md");
    expect(decodePath("100%.md")).toBe("100%.md");
  });

  it("encodes each segment but keeps separators", () => {
    expect(encodePath("my notes/a b#1.md")).toBe("my%20notes/a%20b%231.md");
  });
});

describe("note names", () => {
  it("falls back to the title when a note has no source path", () => {
    expect(noteFilePath({ title: "a/b", sourcePath: " " })).toBe("a-b.md");
    expect(noteFilePath({ title: "" })).toBe("Untitled.md");
    expect(noteFolderPath({ title: "x", sourcePath: "notes/x.md" })).toBe("notes");
  });

  it("validates and completes file and folder names", () => {
    expect(normalizeFileName(" Plan ")).toBe("Plan.md");
    expect(normalizeFileName("Plan.markdown")).toBe("Plan.markdown");
    expect(normalizeFolderName(" Daily ")).toBe("Daily");
    expect(() => normalizeFileName("a/b")).toThrow("File names cannot be empty");
    expect(() => normalizeFolderName("..")).toThrow("Folder names cannot be empty");
    expect(() => normalizeFolderName("a\u0007")).toThrow("control characters");
    expect(hasControlCharacters("a\u007f")).toBe(true);
    expect(hasControlCharacters("plain")).toBe(false);
  });
});
