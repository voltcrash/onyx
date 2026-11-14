import { describe, expect, it } from "vite-plus/test";
import { shouldRecordSnapshot } from "./database.ts";

describe("snapshot throttling", () => {
  const versions = [
    { id: "one", noteId: "note", markdown: "first", createdAt: "2026-11-14T00:00:00.000Z" },
  ];
  it("keeps the first version and waits five minutes between edits", () => {
    expect(shouldRecordSnapshot([], "first", versions[0]!.createdAt)).toBe(true);
    expect(shouldRecordSnapshot(versions, "second", "2026-11-14T00:04:59.999Z")).toBe(false);
    expect(shouldRecordSnapshot(versions, "second", "2026-11-14T00:05:00.000Z")).toBe(true);
  });
  it("preserves destructive rewrites immediately without duplicate content", () => {
    expect(shouldRecordSnapshot(versions, "second", "2026-11-14T00:00:01.000Z", true)).toBe(true);
    expect(shouldRecordSnapshot(versions, "first", "2026-11-14T00:06:00.000Z", true)).toBe(false);
  });
});
