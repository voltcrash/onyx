import { describe, expect, it } from "vite-plus/test";
import {
  attachmentMarkdown,
  normalizeAttachmentFolder,
  resolveLocalAttachmentUrl,
  rewriteLocalLinks,
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
