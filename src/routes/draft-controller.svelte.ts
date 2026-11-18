import type { SaveState } from "#lib/components/app-types.ts";
import { titleFromMarkdown } from "#lib/markdown-utils.ts";
import { normalizeFileName, noteFilePath } from "#lib/paths.ts";
import { VaultConflictError, type Vault } from "#lib/storage/index.ts";
import type { Note } from "#lib/storage/types.ts";

export function createDraftController(
  initialMarkdown: string,
  host: {
    vault(): Vault | undefined;
    noteId(): string;
    markdown(): string;
    clearing(): boolean;
    reportError(message: string): void;
    saved(vault: Vault, note: Note): Promise<void>;
    openCopy(vault: Vault, id: string): Promise<void>;
  },
) {
  let lastSavedMarkdown = $state(initialMarkdown);
  let revision = 0;
  let status = $state<SaveState>("loading");
  let conflict = $state(false);
  let timer: number | undefined;
  let run: Promise<boolean> | undefined;
  let requested = false;

  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }

  function cancelPending() {
    clearTimer();
    requested = false;
    return run;
  }

  function fail(message: string, isConflict: boolean) {
    status = "error";
    conflict = isConflict;
    host.reportError(message);
  }

  async function flush(): Promise<boolean> {
    while (requested) {
      requested = false;
      clearTimer();
      const vault = host.vault();
      const id = host.noteId();
      if (!vault || !id || host.clearing()) return false;
      const contents = host.markdown();
      status = "saving";
      let note: Note;
      try {
        note = await vault.saveNote({
          id,
          title: titleFromMarkdown(contents),
          markdown: contents,
          expectedRevision: revision,
        });
      } catch (error) {
        requested = false;
        if (vault === host.vault() && id === host.noteId())
          fail(
            error instanceof Error ? error.message : "Autosave failed.",
            error instanceof VaultConflictError,
          );
        return false;
      }
      if (vault !== host.vault()) return false;
      if (id === host.noteId()) {
        revision = note.revision;
        lastSavedMarkdown = contents;
        const dirty = host.markdown() !== contents;
        status = dirty ? "unsaved" : "saved";
        if (dirty) requested = true;
        conflict = false;
        host.reportError("");
      }
      await host.saved(vault, note);
    }
    return true;
  }

  function saveDraft(): Promise<boolean> {
    clearTimer();
    requested = true;
    return (run ??= flush().finally(() => {
      run = undefined;
    }));
  }

  async function settleDraft(): Promise<boolean> {
    clearTimer();
    while (run || host.markdown() !== lastSavedMarkdown) {
      if (!(await (run ?? saveDraft()))) return false;
    }
    return true;
  }

  function queueSave() {
    if (host.clearing()) return;
    status = "unsaved";
    if (run) requested = true;
    clearTimer();
    timer = window.setTimeout(() => void saveDraft(), 700);
  }

  async function saveConflictCopy() {
    const vault = host.vault();
    if (!vault || !conflict) return;
    const pending = cancelPending();
    if (pending) await pending;
    if (vault !== host.vault() || !conflict) return;
    const contents = host.markdown();
    const base = `${titleFromMarkdown(contents).replace(/[\\/]/g, "-")} (conflict copy)`;
    const taken = new Set(
      (await vault.listNotes()).map((note) => noteFilePath(note).toLocaleLowerCase()),
    );
    let name = normalizeFileName(base);
    for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1)
      name = normalizeFileName(`${base} ${index}`);
    const copy = await vault.saveNote({ title: base, markdown: contents, sourcePath: name });
    if (vault === host.vault()) await host.openCopy(vault, copy.id);
  }

  return {
    queueSave,
    saveDraft,
    settleDraft,
    cancelPending,
    saveConflictCopy,
    markConflict() {
      fail("This note changed in another tab. Reload it before saving.", true);
    },
    reset(contents: string, currentRevision: number) {
      revision = currentRevision;
      lastSavedMarkdown = contents;
      status = "saved";
      conflict = false;
    },
    get revision() {
      return revision;
    },
    get conflict() {
      return conflict;
    },
    get lastSavedMarkdown() {
      return lastSavedMarkdown;
    },
    get status() {
      return status;
    },
    set status(value) {
      status = value;
    },
  };
}
