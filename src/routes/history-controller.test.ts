import { expect, it, vi } from "vite-plus/test";
import type { NoteSnapshot } from "#lib/storage/types.ts";
import type { Vault } from "#lib/storage/vault.ts";
import { createHistoryController } from "./history-controller.svelte.ts";

it("restores the snapshot chosen when Restore was pressed", async () => {
  const snapshots = [{ id: "first" }, { id: "second" }] as NoteSnapshot[];
  const restoreNoteSnapshot = vi.fn();
  const vault = {
    listNoteSnapshots: async () => snapshots,
    restoreNoteSnapshot,
  } as unknown as Vault;
  const save = Promise.withResolvers<boolean>();
  const settle = vi.fn().mockResolvedValueOnce(true).mockReturnValue(save.promise);
  const history = createHistoryController({
    vault: () => vault,
    noteId: () => "note",
    settle,
    prepare: async () => {},
    reload: async () => {},
  });
  await history.show();
  const restoring = history.restore();
  history.select(snapshots[1]!);
  save.resolve(true);
  await restoring;
  expect(restoreNoteSnapshot).toHaveBeenCalledWith("note", "first");
  expect(history.selected?.id).toBe("first");
});
