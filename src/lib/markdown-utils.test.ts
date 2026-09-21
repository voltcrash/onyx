import { describe, expect, it } from "vite-plus/test";
import {
  attachmentMarkdown,
  continueListOnEnter,
  indentEditorLines,
  normalizeAttachmentFolder,
  resolveLocalAttachmentUrl,
  rewriteLocalLinks,
  toggleCheckboxes,
  wrapSelectionWith,
} from "./markdown-utils.js";

describe("attachment markdown", () => {
  it("embeds images and links other files relative to the note", () => {
    expect(
      attachmentMarkdown("my photo.png", "attachments/my photo.png", undefined, "image/png"),
    ).toBe("![my photo.png](attachments/my%20photo.png)");
    expect(
      attachmentMarkdown("report.pdf", "attachments/report.pdf", "trips/day.md", "application/pdf"),
    ).toBe("[report.pdf](../attachments/report.pdf)");
  });

  it("links resolve back to the stored attachment", () => {
    const link = attachmentMarkdown("a b.png", "media/a b.png", "notes/deep/day.md", "image/png");
    const destination = link.match(/\]\((.+)\)$/)![1]!;
    expect(
      resolveLocalAttachmentUrl(destination, "notes/deep/day.md", [
        { name: "a b.png", sourcePath: "media/a b.png", url: "blob:x" },
      ]),
    ).toBe("blob:x");
  });
});

describe("normalizeAttachmentFolder", () => {
  it("accepts nested folders and rejects unsafe names", () => {
    expect(normalizeAttachmentFolder(" assets/images/ ")).toBe("assets/images");
    expect(normalizeAttachmentFolder("")).toBeUndefined();
    expect(normalizeAttachmentFolder("../outside")).toBeUndefined();
    expect(normalizeAttachmentFolder("bad:name")).toBeUndefined();
  });
});

describe("continueListOnEnter", () => {
  it("continues bullets, tasks, and ordered items", () => {
    expect(continueListOnEnter("- Buy milk", 10)).toEqual({
      value: "- Buy milk\n- ",
      caret: 13,
    });
    expect(continueListOnEnter("- [x] Done", 10)).toEqual({
      value: "- [x] Done\n- [ ] ",
      caret: 17,
    });
    expect(continueListOnEnter("1. First", 8)).toEqual({
      value: "1. First\n2. ",
      caret: 12,
    });
  });

  it("exits the list from an empty item", () => {
    expect(continueListOnEnter("- ", 2)).toEqual({ value: "", caret: 0 });
    expect(continueListOnEnter("- [ ]", 5)).toEqual({ value: "", caret: 0 });
    expect(continueListOnEnter("3. ", 3)).toEqual({ value: "", caret: 0 });
  });

  it("leaves other lines alone", () => {
    expect(continueListOnEnter("Plain text", 5)).toBeUndefined();
    expect(continueListOnEnter("- item", 1)).toBeUndefined();
  });

  it("exits the list when Enter is pressed on the fresh marker", () => {
    const first = continueListOnEnter("- Buy milk", 10)!;
    expect(first).toEqual({ value: "- Buy milk\n- ", caret: 13 });
    expect(continueListOnEnter(first.value, first.caret)).toEqual({
      value: "- Buy milk\n",
      caret: 11,
    });
  });
});

describe("indentEditorLines", () => {
  it("indents and outdents a single line with the caret", () => {
    expect(indentEditorLines("- a", 3, 3, 1)).toEqual({ value: "  - a", start: 5, end: 5 });
    expect(indentEditorLines("  - a", 5, 5, -1)).toEqual({ value: "- a", start: 3, end: 3 });
  });

  it("clamps the caret when outdenting past it", () => {
    expect(indentEditorLines("  - a", 1, 1, -1)).toEqual({ value: "- a", start: 0, end: 0 });
  });

  it("indents every selected line and keeps the selection on its text", () => {
    expect(indentEditorLines("- a\n- b", 0, 7, 1)).toEqual({
      value: "  - a\n  - b",
      start: 2,
      end: 11,
    });
  });

  it("ignores a trailing line start so fully selected lines stay covered", () => {
    expect(indentEditorLines("- a\n- b\n- c", 0, 8, 1)).toEqual({
      value: "  - a\n  - b\n- c",
      start: 2,
      end: 12,
    });
  });

  it("leaves blank lines alone inside a range", () => {
    expect(indentEditorLines("- a\n\n- b", 0, 8, 1)).toEqual({
      value: "  - a\n\n  - b",
      start: 2,
      end: 12,
    });
  });

  it("outdents one space and tabs", () => {
    expect(indentEditorLines(" - a", 4, 4, -1)).toEqual({ value: "- a", start: 3, end: 3 });
    expect(indentEditorLines("\t- a", 4, 4, -1)).toEqual({ value: "- a", start: 3, end: 3 });
  });
});

describe("toggleCheckboxes", () => {
  it("flips a checkbox without moving the caret", () => {
    expect(toggleCheckboxes("- [ ] Buy milk", 13, 13)).toEqual({
      value: "- [x] Buy milk",
      start: 13,
      end: 13,
    });
    expect(toggleCheckboxes("- [X] Done", 9, 9)).toEqual({
      value: "- [ ] Done",
      start: 9,
      end: 9,
    });
  });

  it("turns plain bullets and ordered items into tasks", () => {
    expect(toggleCheckboxes("- Buy milk", 9, 9)).toEqual({
      value: "- [ ] Buy milk",
      start: 13,
      end: 13,
    });
    expect(toggleCheckboxes("2. Second", 9, 9)).toEqual({
      value: "2. [ ] Second",
      start: 13,
      end: 13,
    });
  });

  it("toggles every touched line and leaves other lines alone", () => {
    expect(toggleCheckboxes("- [ ] a\n- [x] b", 0, 13)).toEqual({
      value: "- [x] a\n- [ ] b",
      start: 0,
      end: 13,
    });
    expect(toggleCheckboxes("Plain text", 5, 5)).toBeUndefined();
  });
});

describe("wrapSelectionWith", () => {
  it("surrounds the selection and keeps the inner text selected", () => {
    expect(wrapSelectionWith("Buy milk", 4, 8, "(")).toEqual({
      value: "Buy (milk)",
      start: 5,
      end: 9,
    });
    expect(wrapSelectionWith("Buy milk", 4, 8, "*")).toEqual({
      value: "Buy *milk*",
      start: 5,
      end: 9,
    });
    expect(wrapSelectionWith("code", 0, 4, "`")).toEqual({
      value: "`code`",
      start: 1,
      end: 5,
    });
  });

  it("leaves collapsed carets and other keys alone", () => {
    expect(wrapSelectionWith("Buy milk", 4, 4, "(")).toBeUndefined();
    expect(wrapSelectionWith("Buy milk", 4, 8, "x")).toBeUndefined();
    expect(wrapSelectionWith("Buy milk", 8, 4, "[")).toEqual({
      value: "Buy [milk]",
      start: 5,
      end: 9,
    });
  });
});

describe("rewriteLocalLinks", () => {
  const pinned = (path: string) => (path.startsWith("attachments/") ? path : undefined);

  it("keeps shared attachment links working when a note moves", () => {
    expect(
      rewriteLocalLinks(
        "![a](attachments/a.png) [site](https://x.dev)",
        "day.md",
        "trips/day.md",
        pinned,
      ),
    ).toBe("![a](../attachments/a.png) [site](https://x.dev)");
    expect(rewriteLocalLinks("![a](../attachments/a.png)", "trips/day.md", "day.md", pinned)).toBe(
      "![a](attachments/a.png)",
    );
  });

  it("renames the folder in links and leaves code blocks alone", () => {
    const moved = new Map([["attachments/a.png", "media/a.png"]]);
    expect(
      rewriteLocalLinks(
        "![a](attachments/a.png)\n```\n![a](attachments/a.png)\n```",
        "day.md",
        "day.md",
        (path) => moved.get(path),
      ),
    ).toBe("![a](media/a.png)\n```\n![a](attachments/a.png)\n```");
  });
});
