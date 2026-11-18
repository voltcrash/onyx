import { expect, it, vi } from "vite-plus/test";
import { repairNoteFiles } from "./repair.js";

const files = Array.from({ length: 24 }, (_, index) => ({
  id: String(index),
  path: `${index}.md`,
  markdown: `note ${index}`,
}));

it("bounds concurrent file reads while repairing stale and missing files", async () => {
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
  const pending = new Set(["0"]);
  await repairNoteFiles(files, filesystem, pending);
  expect(pending).toEqual(new Set(["2"]));
  expect(filesystem.readText).toHaveBeenCalledTimes(24);
  expect(maximum).toBe(8);
  expect(filesystem.writeText.mock.calls).toEqual([
    ["1.md", "note 1"],
    ["2.md", "note 2"],
  ]);
});

it("propagates non-quota repair failures", async () => {
  const failure = new Error("disk error");
  await expect(
    repairNoteFiles(
      files.slice(0, 1),
      {
        readText: async () => "stale",
        writeText: async () => {
          throw failure;
        },
      },
      new Set(),
    ),
  ).rejects.toBe(failure);
});
