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
