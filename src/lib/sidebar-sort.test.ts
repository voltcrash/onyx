import { describe, expect, it, vi } from "vite-plus/test";
import { readSidebarSort, writeSidebarSort } from "./browser-storage.ts";
import { compareSidebarNotes } from "./sidebar-sort.ts";

const notes = [
  { id: "a", title: "Apple", createdAt: "2026-01-02", updatedAt: "2026-01-03" },
  { id: "z", title: "Zebra", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
  { id: "p", title: "Pinned", pinned: true, createdAt: "2026-01-03", updatedAt: "2026-01-01" },
];
describe("sidebar sorting", () => {
  it("keeps pinned notes first in either direction and sorts dates independently", () => {
    expect(
      notes
        .toSorted((a, b) => compareSidebarNotes(a, b, { by: "name", direction: "asc" }))
        .map((note) => note.id),
    ).toEqual(["p", "a", "z"]);
    expect(
      notes
        .toSorted((a, b) => compareSidebarNotes(a, b, { by: "name", direction: "desc" }))
        .map((note) => note.id),
    ).toEqual(["p", "z", "a"]);
    expect(
      notes
        .toSorted((a, b) => compareSidebarNotes(a, b, { by: "createdAt", direction: "asc" }))
        .map((note) => note.id),
    ).toEqual(["p", "z", "a"]);
    expect(
      notes
        .toSorted((a, b) => compareSidebarNotes(a, b, { by: "updatedAt", direction: "desc" }))
        .map((note) => note.id),
    ).toEqual(["p", "a", "z"]);
  });
  it("persists valid preferences and safely handles denied storage and malformed values", () => {
    let value: string | null = null;
    vi.stubGlobal("localStorage", {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    });
    expect(writeSidebarSort({ by: "createdAt", direction: "desc" })).toBe(true);
    expect(readSidebarSort()).toEqual({ by: "createdAt", direction: "desc" });
    value = '{"by":"unexpected","direction":"asc"}';
    expect(readSidebarSort()).toEqual({ by: "name", direction: "asc" });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readSidebarSort()).toEqual({ by: "name", direction: "asc" });
    vi.unstubAllGlobals();
  });
});
