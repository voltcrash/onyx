import { describe, expect, it } from "vite-plus/test";

import { readMarkdownZip, writeMarkdownFolder } from "./markdown-transfer.js";

describe("Markdown archives", () => {
  it("rejects malformed ZIP archives", async () => {
    const malformed = new Blob(["this is not a zip archive"], { type: "application/zip" });

    await expect(readMarkdownZip(malformed)).rejects.toBeInstanceOf(Error);
  });

  it("stops before writing when an export would overwrite a file", async () => {
    const existingFile = {} as FileSystemFileHandle;
    const root = {
      getDirectoryHandle: async () => {
        throw new DOMException("Missing", "NotFoundError");
      },
      getFileHandle: async (name: string) => {
        if (name === "existing.md") return existingFile;
        throw new DOMException("Missing", "NotFoundError");
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(
      writeMarkdownFolder(root, [
        { contents: new Blob(["existing"]), path: "existing.md" },
        { contents: new Blob(["new"]), path: "new.md" },
      ]),
    ).rejects.toThrow("existing files would be overwritten: existing.md");
  });
});
