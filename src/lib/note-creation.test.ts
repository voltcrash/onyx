import { describe, expect, it, vi } from "vite-plus/test";
import {
  dailyNoteDate,
  normalizeCreationPreferences,
  normalizeNotePath,
  readCreationPreferences,
  renderNoteTemplate,
} from "./note-creation.ts";

describe("templates and daily notes", () => {
  it("expands title, local date, and time without interpreting replacement characters", () => {
    const date = new Date(2026, 10, 14, 9, 5);
    expect(
      renderNoteTemplate("# {{title}}\n{{date}} {{time}} {{unknown}}", "$& Meeting", date),
    ).toBe("# $& Meeting\n2026-11-14 09:05 {{unknown}}");
    expect(dailyNoteDate(date)).toBe("2026-11-14");
  });
  it("accepts nested note paths and rejects traversal and empty names", () => {
    expect(normalizeNotePath("Projects/Meeting")).toBe("Projects/Meeting.md");
    expect(() => normalizeNotePath("../Meeting")).toThrow();
    expect(() => normalizeNotePath("/Meeting")).toThrow();
    expect(() =>
      normalizeCreationPreferences({
        templatesFolder: "",
        dailyFolder: "Daily",
        dailyTemplate: "",
      }),
    ).toThrow();
  });
  it("uses safe defaults when browser storage is denied or contains invalid preferences", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readCreationPreferences("vault")).toEqual({
      templatesFolder: "Templates",
      dailyFolder: "Daily",
      dailyTemplate: "",
    });
    vi.stubGlobal("localStorage", { getItem: () => '{"dailyFolder":".."}' });
    expect(readCreationPreferences("vault").dailyFolder).toBe("Daily");
    vi.unstubAllGlobals();
  });
});
