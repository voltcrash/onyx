import type { Vault } from "#lib/storage/vault.ts";
import type { NoteSnapshot } from "#lib/storage/types.ts";

export function createHistoryController(host: {
  vault(): Vault | undefined;
  noteId(): string;
  settle(): Promise<boolean>;
  prepare(): Promise<void>;
  reload(): Promise<void>;
}) {
  let open = $state(false);
  let snapshots = $state<NoteSnapshot[]>([]);
  let selected = $state<NoteSnapshot>();
  let error = $state("");
  let busy = $state(false);
  let source: { vault: Vault; noteId: string } | undefined;
  let sequence = 0;

  async function show(): Promise<void> {
    if (!(await host.settle())) return;
    const vault = host.vault(),
      noteId = host.noteId();
    if (!vault || !noteId) return;
    const request = ++sequence;
    const versions = await vault.listNoteSnapshots(noteId);
    await host.prepare();
    if (request !== sequence || vault !== host.vault() || noteId !== host.noteId()) return;
    source = { vault, noteId };
    snapshots = versions;
    selected = versions[0];
    error = "";
    open = true;
  }

  async function restore(): Promise<void> {
    if (!source || !selected || busy) return;
    const { vault, noteId } = source;
    if (vault !== host.vault() || noteId !== host.noteId()) return;
    busy = true;
    try {
      if (!(await host.settle())) return;
      await vault.restoreNoteSnapshot(noteId, selected.id);
      if (vault !== host.vault() || noteId !== host.noteId()) return;
      await host.reload();
      snapshots = await vault.listNoteSnapshots(noteId);
      selected = snapshots.find((snapshot) => snapshot.id === selected?.id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The snapshot could not be restored.";
    } finally {
      busy = false;
    }
  }

  return {
    get open() {
      return open;
    },
    get snapshots() {
      return snapshots;
    },
    get selected() {
      return selected;
    },
    get busy() {
      return busy;
    },
    get error() {
      return error;
    },
    show,
    restore,
    select(snapshot: NoteSnapshot) {
      selected = snapshot;
    },
    close() {
      if (!busy) {
        sequence += 1;
        open = false;
        source = undefined;
      }
    },
  };
}
