import { describe, expect, it, vi } from "vite-plus/test";

import { utf8ByteLength, Vault } from "./vault.js";

describe("Vault saves", () => {
  it("keeps a note in IndexedDB when OPFS is over quota", async () => {
    const putNote = vi.fn().mockResolvedValue(undefined);
    const database = { getNote: vi.fn().mockResolvedValue(undefined), putNote };
    const filesystem = {
      writeText: vi
        .fn()
        .mockRejectedValue(new DOMException("Storage quota exceeded", "QuotaExceededError")),
    };
    const vault = Reflect.construct(Vault, [database, filesystem]) as Vault;

    await expect(vault.saveNote({ title: "Draft", markdown: "kept text" })).resolves.toMatchObject({
      markdown: "kept text",
      revision: 1,
    });
    expect(putNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft" }),
      "kept text",
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
    );
  });
});

describe("utf8ByteLength", () => {
  it("matches the size of a Blob holding the same text", () => {
    for (const value of [
      "",
      "ascii",
      "café",
      "日本語",
      "😀 emoji",
      "lone \ud800 high",
      "lone \udc00 low",
    ]) {
      expect(utf8ByteLength(value)).toBe(new Blob([value]).size);
    }
  });
});

describe("Vault backlinks", () => {
  const note = (id: string, sourcePath: string, deletedAt?: string) => ({
    id,
    title: sourcePath.replace(/^.*\//, "").replace(/\.md$/, ""),
    path: `notes/${id}.md`,
    tags: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    revision: 1,
    size: 0,
    sourcePath,
    ...(deletedAt ? { deletedAt } : {}),
  });

  it("lists notes that link to a note by wiki link or relative link, excluding trash", async () => {
    const database = {
      getNotes: vi
        .fn()
        .mockResolvedValue([
          note("target", "garden/Tomatoes.md"),
          note("wiki", "Journal.md"),
          note("relative", "garden/Plan.md"),
          note("unrelated", "Other.md"),
          note("trashed", "Old.md", "2026-10-02T00:00:00.000Z"),
        ]),
      getNoteContents: vi.fn().mockResolvedValue([
        { noteId: "wiki", markdown: "Today [[Tomatoes]]." },
        { noteId: "relative", markdown: "[plants](Tomatoes.md)" },
        { noteId: "unrelated", markdown: "`[[Tomatoes]]`" },
        { noteId: "trashed", markdown: "[[Tomatoes]]" },
        { noteId: "target", markdown: "[[Tomatoes]]" },
      ]),
    };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
    const vault = Reflect.construct(Vault, [database, {}, coordination]) as Vault;

    const backlinks = await vault.listBacklinks("target");
    expect(backlinks.map(({ id }) => id)).toEqual(["wiki", "relative"]);
  });
});
