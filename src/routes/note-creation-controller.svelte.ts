import type { Vault } from "#lib/storage/vault.ts";
import type { NoteMetadata } from "#lib/storage/types.ts";
import { fileStem, isPathWithin, joinPath, noteFilePath, parentPath } from "#lib/paths.ts";
import { rewriteLocalLinks, titleFromMarkdown } from "#lib/markdown-utils.ts";
import {
  dailyNoteDate,
  defaultNoteCreationPreferences,
  normalizeCreationPreferences,
  normalizeNotePath,
  readCreationPreferences,
  renderNoteTemplate,
  writeCreationPreferences,
  type NoteCreationPreferences,
} from "#lib/note-creation.ts";

export function createNoteCreationController(host: {
  vault(): Vault | undefined;
  vaultId(): string;
  settle(): Promise<boolean>;
  prepare(): Promise<void>;
  open(noteId: string): Promise<void>;
  refresh(): Promise<void>;
  showError(message: string): void;
}) {
  let preferences = $state<NoteCreationPreferences>({ ...defaultNoteCreationPreferences });
  let templates = $state<NoteMetadata[]>([]);
  let open = $state(false);
  let selectedId = $state("");
  let path = $state("");
  let error = $state("");
  let busy = $state(false);
  let source: Vault | undefined;
  let sequence = 0;

  async function showTemplates(): Promise<void> {
    if (!(await host.settle())) return;
    const vault = host.vault();
    if (!vault) return;
    const request = ++sequence;
    const notes = await vault.listNotes();
    await host.prepare();
    if (request !== sequence || vault !== host.vault()) return;
    templates = notes.filter((note) =>
      isPathWithin(parentPath(noteFilePath(note)), preferences.templatesFolder),
    );
    selectedId = templates[0]?.id ?? "";
    path = "";
    error = "";
    source = vault;
    open = true;
  }
  async function createAtPath(
    vault: Vault,
    targetPath: string,
    template?: NoteMetadata,
    now = new Date(),
  ): Promise<void> {
    const contents = template ? (await vault.getNote(template.id))?.markdown : "# {{title}}\n";
    if (contents === undefined) throw new Error("The selected template no longer exists");
    if (vault !== host.vault()) return;
    const source = renderNoteTemplate(contents, fileStem(targetPath), now);
    const markdown = template
      ? rewriteLocalLinks(source, noteFilePath(template), targetPath, (path) => path)
      : source;
    const note = await vault.saveNote({
      sourcePath: targetPath,
      markdown,
      title: titleFromMarkdown(markdown),
    });
    if (vault !== host.vault()) return;
    await host.open(note.id);
    await host.refresh();
  }
  async function createFromTemplate(): Promise<void> {
    if (busy || !source || source !== host.vault()) return;
    const vault = source;
    busy = true;
    try {
      if (!(await host.settle())) return;
      const template = templates.find((note) => note.id === selectedId);
      if (!template) throw new Error("Choose a template first");
      await createAtPath(vault, normalizeNotePath(path), template);
      if (vault === host.vault()) open = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The note could not be created.";
    } finally {
      busy = false;
    }
  }
  async function openDailyNote(): Promise<void> {
    const vault = host.vault();
    if (!vault || !(await host.settle())) return;
    try {
      const now = new Date(),
        notes = await vault.listNotes();
      const path = joinPath(preferences.dailyFolder, `${dailyNoteDate(now)}.md`);
      const existing = notes.find(
        (note) => noteFilePath(note).toLocaleLowerCase() === path.toLocaleLowerCase(),
      );
      if (vault !== host.vault()) return;
      if (existing) {
        await host.open(existing.id);
        return;
      }
      const template = preferences.dailyTemplate
        ? notes.find(
            (note) =>
              noteFilePath(note).toLocaleLowerCase() ===
              preferences.dailyTemplate.toLocaleLowerCase(),
          )
        : undefined;
      if (preferences.dailyTemplate && !template)
        throw new Error("The daily note template does not exist");
      await createAtPath(vault, path, template, now);
    } catch (cause) {
      host.showError(
        cause instanceof Error ? cause.message : "The daily note could not be opened.",
      );
    }
  }
  return {
    get preferences() {
      return preferences;
    },
    loadPreferences() {
      sequence += 1;
      open = false;
      source = undefined;
      preferences = readCreationPreferences(host.vaultId());
    },
    setPreferences(value: NoteCreationPreferences) {
      const next = normalizeCreationPreferences(value);
      writeCreationPreferences(host.vaultId(), next);
      preferences = next;
    },
    get templates() {
      return templates;
    },
    get open() {
      return open;
    },
    get busy() {
      return busy;
    },
    get error() {
      return error;
    },
    get path() {
      return path;
    },
    set path(value: string) {
      path = value;
    },
    get selectedId() {
      return selectedId;
    },
    set selectedId(value: string) {
      selectedId = value;
    },
    showTemplates,
    createFromTemplate,
    openDailyNote,
    close() {
      if (!busy) {
        sequence += 1;
        open = false;
        source = undefined;
      }
    },
  };
}
