import { expect, it, vi } from "vite-plus/test";
import { repairNoteFiles } from "./repair.js";
import type { NoteMetadata } from "./types.js";

const notes = Array.from(
  { length: 25 },
  (_, index) => ({ id: `${index}`, path: `${index}.md` }) as NoteMetadata,
);

it("batches database reads and bounds concurrent file reads while preserving recovery", async () => {
  const database = {
    getNotes: vi.fn().mockResolvedValue(notes),
    getNoteContents: vi
      .fn()
      .mockResolvedValue(
        notes.slice(0, 24).map((note) => ({ noteId: note.id, markdown: `note ${note.id}` })),
      ),
  };
  let active = 0;
  let maximum = 0;
  const filesystem = {
    readText: vi.fn(async (path: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (path === "1.md") throw new DOMException("missing", "NotFoundError");
      return path === "2.md" ? "stale" : `note ${path.replace(".md", "")}`;
    }),
    writeText: vi.fn(async (path: string) => {
      expect(active).toBe(0);
      if (path === "2.md") throw new DOMException("full", "QuotaExceededError");
    }),
  };
  expect(await repairNoteFiles(database, filesystem)).toEqual(new Set(["2"]));
  expect(database.getNotes).toHaveBeenCalledTimes(1);
  expect(database.getNoteContents).toHaveBeenCalledTimes(1);
  expect(filesystem.readText).toHaveBeenCalledTimes(24);
  expect(maximum).toBe(8);
  expect(filesystem.writeText.mock.calls).toEqual([
    ["1.md", "note 1"],
    ["2.md", "note 2"],
  ]);
});

it("reports non-quota repair failures instead of silently opening inconsistent files", async () => {
  const failure = new Error("disk error");
  await expect(
    repairNoteFiles(
      {
        getNotes: async () => notes.slice(0, 1),
        getNoteContents: async () => [{ noteId: "0", markdown: "saved" }],
      },
      {
        readText: async () => "stale",
        writeText: async () => {
          throw failure;
        },
      },
    ),
  ).rejects.toBe(failure);
});
