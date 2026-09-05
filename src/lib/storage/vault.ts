import { VaultDatabase, type SearchDocument } from "./database.js";
import { VaultFilesystem } from "./filesystem.js";
import type {
  AttachmentMetadata,
  BackupOperation,
  GithubBackupState,
  Note,
  NoteMetadata,
  SaveNoteInput,
  SearchState,
  VaultOptions,
  VaultSearchResult,
} from "./types.js";

const DEFAULT_DATABASE_NAME = "onyx-vault";
const DEFAULT_DIRECTORY_NAME = "onyx";

export class Vault {
  readonly #database: VaultDatabase;
  readonly #filesystem: VaultFilesystem;

  private constructor(database: VaultDatabase, filesystem: VaultFilesystem) {
    this.#database = database;
    this.#filesystem = filesystem;
  }

  static async open(options: VaultOptions = {}): Promise<Vault> {
    assertBrowser();
    const database = await VaultDatabase.open(options.databaseName ?? DEFAULT_DATABASE_NAME);
    try {
      const filesystem = await VaultFilesystem.open(
        options.directoryName ?? DEFAULT_DIRECTORY_NAME,
      );
      return new Vault(database, filesystem);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  requestPersistentStorage(): Promise<boolean> {
    return navigator.storage.persist();
  }

  isStoragePersistent(): Promise<boolean> {
    return navigator.storage.persisted();
  }

  async saveNote(input: SaveNoteInput): Promise<Note> {
    const id = input.id ?? crypto.randomUUID();
    const existing = await this.#database.getNote(id);
    const now = new Date().toISOString();
    const path = existing?.path ?? `notes/${id}.md`;
    const markdown = input.markdown;
    const metadata: NoteMetadata = {
      id,
      title: input.title.trim() || "Untitled",
      path,
      tags: normalizeTags(input.tags ?? existing?.tags ?? []),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      size: new Blob([markdown]).size,
    };

    const previousMarkdown = existing ? await this.#filesystem.readText(path) : undefined;
    await this.#filesystem.writeText(path, markdown);
    try {
      await this.#database.putNote(metadata, toSearchDocument(metadata, markdown), {
        id: crypto.randomUUID(),
        kind: "note:upsert",
        entityId: id,
        noteId: id,
        path,
        revision: metadata.revision,
        createdAt: now,
      });
    } catch (error) {
      await this.#restoreNoteFile(path, previousMarkdown, error);
    }
    return { ...metadata, markdown };
  }

  async getNote(id: string): Promise<Note | undefined> {
    const metadata = await this.#database.getNote(id);
    if (!metadata) return undefined;
    const markdown = await this.#filesystem.readText(metadata.path);
    return { ...metadata, markdown };
  }

  async listNotes(): Promise<NoteMetadata[]> {
    const notes = await this.#database.getNotes();
    return notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteNote(id: string): Promise<boolean> {
    const note = await this.#database.getNote(id);
    if (!note) return false;

    const now = new Date().toISOString();
    const attachments = await this.#database.getAttachments(id);
    await this.#database.deleteNote(
      id,
      attachments.map((attachment) => attachment.id),
      [
        ...attachments.map((attachment): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "attachment:delete",
          entityId: attachment.id,
          noteId: id,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        })),
        {
          id: crypto.randomUUID(),
          kind: "note:delete",
          entityId: id,
          noteId: id,
          path: note.path,
          revision: note.revision + 1,
          createdAt: now,
        },
      ],
    );
    await this.#filesystem.remove(note.path, { ignoreMissing: true });
    await this.#filesystem.remove(`attachments/${id}`, { recursive: true, ignoreMissing: true });
    return true;
  }

  async saveAttachment(noteId: string, file: Blob, name?: string): Promise<AttachmentMetadata> {
    if (!(await this.#database.getNote(noteId))) {
      throw new Error(`Cannot attach a file to missing note: ${noteId}`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const path = `attachments/${noteId}/${id}`;
    const metadata: AttachmentMetadata = {
      id,
      noteId,
      name: name?.trim() || (file instanceof File ? file.name : "attachment"),
      path,
      type: file.type || "application/octet-stream",
      size: file.size,
      createdAt: now,
      updatedAt: now,
    };

    await this.#filesystem.write(path, file);
    try {
      await this.#database.putAttachment(metadata, {
        id: crypto.randomUUID(),
        kind: "attachment:upsert",
        entityId: id,
        noteId,
        path,
        revision: 1,
        createdAt: now,
      });
    } catch (error) {
      await this.#removeFailedWrite(path, error);
    }
    return metadata;
  }

  async getAttachment(
    id: string,
  ): Promise<{ metadata: AttachmentMetadata; file: File } | undefined> {
    const metadata = await this.#database.getAttachment(id);
    if (!metadata) return undefined;
    return { metadata, file: await this.#filesystem.read(metadata.path) };
  }

  listAttachments(noteId?: string): Promise<AttachmentMetadata[]> {
    return this.#database.getAttachments(noteId);
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const attachment = await this.#database.getAttachment(id);
    if (!attachment) return false;

    await this.#database.deleteAttachment(id, {
      id: crypto.randomUUID(),
      kind: "attachment:delete",
      entityId: id,
      noteId: attachment.noteId,
      path: attachment.path,
      revision: 1,
      createdAt: new Date().toISOString(),
    });
    await this.#filesystem.remove(attachment.path, { ignoreMissing: true });
    return true;
  }

  async search(query: string, tags: string[] = []): Promise<VaultSearchResult[]> {
    const terms = normalizeSearchText(query).split(" ").filter(Boolean);
    const requiredTags = normalizeTags(tags);
    const [documents, notes] = await Promise.all([
      this.#database.getSearchDocuments(),
      this.#database.getNotes(),
    ]);
    const metadataById = new Map(notes.map((note) => [note.id, note]));

    return documents
      .filter((document) => requiredTags.every((tag) => document.tags.includes(tag)))
      .map((document) => scoreDocument(document, terms, metadataById.get(document.noteId)))
      .filter((result): result is VaultSearchResult => result !== undefined)
      .sort(
        (left, right) =>
          right.score - left.score || right.note.updatedAt.localeCompare(left.note.updatedAt),
      );
  }

  getSearchState(): Promise<SearchState | undefined> {
    return this.#database.getSearchState();
  }

  saveSearchState(state: Omit<SearchState, "updatedAt">): Promise<void> {
    return this.#database.setSearchState({
      ...state,
      tags: normalizeTags(state.tags),
      updatedAt: new Date().toISOString(),
    });
  }

  getGithubBackupState(): Promise<GithubBackupState | undefined> {
    return this.#database.getGithubBackupState();
  }

  saveGithubBackupState(state: Omit<GithubBackupState, "updatedAt">): Promise<void> {
    return this.#database.setGithubBackupState({ ...state, updatedAt: new Date().toISOString() });
  }

  getPendingBackupOperations(): Promise<BackupOperation[]> {
    return this.#database.getBackupOperations();
  }

  acknowledgeBackupOperations(ids: string[]): Promise<void> {
    return this.#database.removeBackupOperations(ids);
  }

  async #restoreNoteFile(
    path: string,
    previousMarkdown: string | undefined,
    error: unknown,
  ): Promise<never> {
    try {
      if (previousMarkdown === undefined) {
        await this.#filesystem.remove(path, { ignoreMissing: true });
      } else {
        await this.#filesystem.writeText(path, previousMarkdown);
      }
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Failed to save note and restore its file");
    }
    throw error;
  }

  async #removeFailedWrite(path: string, error: unknown): Promise<never> {
    try {
      await this.#filesystem.remove(path, { ignoreMissing: true });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Failed to save attachment and remove its file",
      );
    }
    throw error;
  }
}

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("The vault can only be opened in a browser");
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))].sort();
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function toSearchDocument(note: NoteMetadata, markdown: string): SearchDocument {
  return {
    noteId: note.id,
    title: normalizeSearchText(note.title),
    body: normalizeSearchText(markdown),
    tags: note.tags,
    updatedAt: note.updatedAt,
  };
}

function scoreDocument(
  document: SearchDocument,
  terms: string[],
  note: NoteMetadata | undefined,
): VaultSearchResult | undefined {
  if (!note) return undefined;
  if (terms.length === 0) return { note, excerpt: excerpt(document.body, ""), score: 0 };

  let score = 0;
  for (const term of terms) {
    const titleMatches = countMatches(document.title, term);
    const bodyMatches = countMatches(document.body, term);
    const tagMatches = document.tags.filter((tag) => tag.includes(term)).length;
    if (titleMatches + bodyMatches + tagMatches === 0) return undefined;
    score += titleMatches * 5 + tagMatches * 3 + bodyMatches;
  }

  return { note, excerpt: excerpt(document.body, terms[0]), score };
}

function countMatches(value: string, term: string): number {
  let matches = 0;
  let position = 0;
  while ((position = value.indexOf(term, position)) !== -1) {
    matches += 1;
    position += term.length;
  }
  return matches;
}

function excerpt(body: string, term: string): string {
  const position = term ? body.indexOf(term) : 0;
  const start = Math.max(0, position - 80);
  const value = body.slice(start, start + 200).trim();
  return start > 0 ? `…${value}` : value;
}
