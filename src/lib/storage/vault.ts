import {
  createSearchPostings,
  VaultDatabase,
  type SearchDocument,
  type SearchPosting,
} from "./database.js";
import { detectBrowserStorageSupport } from "../browser-storage.js";
import { normalizeAttachmentFolder, titleFromMarkdown } from "../markdown-utils.js";
import { VaultCoordination } from "./coordination.js";
import { MirroredVaultFilesystem, VaultFilesystem } from "./filesystem.js";
import type {
  AddAttachmentInput,
  AttachmentMetadata,
  BackupOperation,
  FolderMetadata,
  GithubBackupState,
  ImportNoteInput,
  Note,
  NoteMetadata,
  SaveNoteInput,
  VaultOptions,
  VaultBackupSnapshot,
  VaultBackupManifest,
  VaultRestoreFile,
  VaultRestoreResult,
  VaultSearchResult,
  VaultStorageUsage,
  VaultFileStorageStatus,
  VaultChangeEvent,
  VaultOperationContext,
  VaultOperationOptions,
} from "./types.js";
import { VaultConflictError } from "./types.js";

const DEFAULT_DATABASE_NAME = "onyx-vault";
const DEFAULT_DIRECTORY_NAME = "onyx";

/** Trashed notes are permanently deleted after 30 days. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

function isPathWithin(path: string, parent: string): boolean {
  return !parent || path === parent || path.startsWith(`${parent}/`);
}

function moveSourcePath(path: string, from: string, to: string): string {
  const suffix = path.slice(from.length).replace(/^\/+/, "");
  return to ? (suffix ? `${to}/${suffix}` : to) : suffix;
}

export class Vault {
  readonly #database: VaultDatabase;
  readonly #filesystem: MirroredVaultFilesystem;
  readonly #coordination: VaultCoordination;
  #nativeDirectoryName?: string;
  #nativeDirectoryPermission: VaultFileStorageStatus["nativeDirectoryPermission"];
  #activeOperation?: VaultOperationContext;

  private constructor(
    database: VaultDatabase,
    filesystem: MirroredVaultFilesystem,
    coordination = new VaultCoordination(DEFAULT_DATABASE_NAME, DEFAULT_DIRECTORY_NAME),
  ) {
    this.#database = database;
    this.#filesystem = filesystem;
    this.#coordination = coordination;
    this.#nativeDirectoryPermission = detectBrowserStorageSupport().directoryPicker
      ? "not-configured"
      : "unsupported";
  }

  static async open(options: VaultOptions = {}): Promise<Vault> {
    assertBrowser();
    const support = detectBrowserStorageSupport();
    if (!support.indexedDb) {
      throw new Error(
        "IndexedDB is unavailable. Onyx cannot save or index notes in this browser. Try a current browser outside private mode.",
      );
    }
    if (!support.opfs) {
      throw new Error(
        "Origin private file storage (OPFS) is unavailable. Onyx cannot save note files in this browser. Try a current browser outside private mode.",
      );
    }

    let database: VaultDatabase;
    try {
      database = await VaultDatabase.open(options.databaseName ?? DEFAULT_DATABASE_NAME);
    } catch (cause) {
      throw new Error(
        "IndexedDB could not be opened. Check this site's browser storage permissions or leave private mode, then reload.",
        { cause },
      );
    }
    try {
      const opfs = await VaultFilesystem.open(options.directoryName ?? DEFAULT_DIRECTORY_NAME);
      let vault: Vault;
      const filesystem = new MirroredVaultFilesystem(opfs, (reason) => {
        vault.#nativeDirectoryPermission = reason === "permission" ? "prompt" : "error";
      });
      vault = new Vault(
        database,
        filesystem,
        new VaultCoordination(
          options.databaseName ?? DEFAULT_DATABASE_NAME,
          options.directoryName ?? DEFAULT_DIRECTORY_NAME,
        ),
      );
      await vault.#restoreNativeDirectory();
      return vault;
    } catch (cause) {
      database.close();
      throw new Error(
        "Origin private file storage (OPFS) could not be opened. Check this site's browser storage permissions or leave private mode, then reload.",
        { cause },
      );
    }
  }

  getFileStorageStatus(): VaultFileStorageStatus {
    return {
      nativeDirectoryAvailable: detectBrowserStorageSupport().directoryPicker,
      nativeDirectoryName: this.#nativeDirectoryName,
      nativeDirectoryPermission: this.#nativeDirectoryPermission,
      mode: this.#nativeDirectoryPermission === "granted" ? "native-directory" : "opfs",
    };
  }

  async connectNativeDirectory(): Promise<VaultFileStorageStatus> {
    if (typeof globalThis.showDirectoryPicker !== "function") return this.getFileStorageStatus();
    const handle = await globalThis.showDirectoryPicker({ id: "onyx-vault", mode: "readwrite" });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      this.#nativeDirectoryName = handle.name;
      this.#nativeDirectoryPermission = permission;
      return this.getFileStorageStatus();
    }
    return this.#withLock(async () => {
      const nativeFilesystem = await VaultFilesystem.fromDirectory(handle);
      await this.#filesystem.copyTo(nativeFilesystem);
      await this.#database.setNativeDirectoryHandle(handle);
      this.#nativeDirectoryName = handle.name;
      this.#nativeDirectoryPermission = "granted";
      return this.getFileStorageStatus();
    });
  }

  async disconnectNativeDirectory(): Promise<VaultFileStorageStatus> {
    return this.#withLock(async () => {
      this.#filesystem.detach();
      await this.#database.deleteNativeDirectoryHandle();
      this.#nativeDirectoryName = undefined;
      this.#nativeDirectoryPermission = detectBrowserStorageSupport().directoryPicker
        ? "not-configured"
        : "unsupported";
      return this.getFileStorageStatus();
    });
  }

  close(): void {
    this.#database.close();
    this.#coordination.close();
  }

  subscribe(listener: (event: VaultChangeEvent) => void): () => void {
    return this.#coordination.subscribe(listener);
  }

  runExclusive<T>(task: (context: VaultOperationContext) => Promise<T>): Promise<T> {
    return this.#withLock(task);
  }

  async requestPersistentStorage(): Promise<boolean> {
    try {
      const storage = navigator.storage;
      return typeof storage?.persist === "function" ? await storage.persist() : false;
    } catch {
      return false;
    }
  }

  async isStoragePersistent(): Promise<boolean> {
    try {
      const storage = navigator.storage;
      return typeof storage?.persisted === "function" ? await storage.persisted() : false;
    } catch {
      return false;
    }
  }

  async getStorageUsage(): Promise<VaultStorageUsage> {
    return this.#withLock(async () => {
      const [notes, attachments, persistent, estimate] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(),
        this.isStoragePersistent(),
        navigator.storage.estimate?.() ?? Promise.resolve({} as StorageEstimate),
      ]);
      return {
        attachmentBytes: attachments.reduce((total, attachment) => total + attachment.size, 0),
        attachmentCount: attachments.length,
        noteBytes: notes.reduce((total, note) => total + note.size, 0),
        noteCount: notes.length,
        persistent,
        persistentStorageAvailable:
          typeof navigator.storage?.persist === "function" &&
          typeof navigator.storage?.persisted === "function",
        quota: estimate.quota,
        usage: estimate.usage,
        fileStorage: this.getFileStorageStatus(),
      };
    });
  }

  async #restoreNativeDirectory(): Promise<void> {
    if (!detectBrowserStorageSupport().directoryPicker) return;
    try {
      const handle = await this.#database.getNativeDirectoryHandle();
      if (!handle) return;
      this.#nativeDirectoryName = handle.name;
      const permission = await handle.queryPermission({ mode: "readwrite" });
      this.#nativeDirectoryPermission = permission;
      if (permission !== "granted") return;
      this.#filesystem.attach(await VaultFilesystem.fromDirectory(handle));
    } catch {
      this.#nativeDirectoryPermission = "denied";
    }
  }

  async saveNote(input: SaveNoteInput): Promise<Note> {
    const id = input.id ?? crypto.randomUUID();
    return this.#withLock(async () => {
      const existing = await this.#database.getNote(id);
      const actualRevision = existing?.revision ?? 0;
      if (input.expectedRevision !== undefined && input.expectedRevision !== actualRevision) {
        throw new VaultConflictError(id, input.expectedRevision, actualRevision);
      }

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
        revision: actualRevision + 1,
        size: new Blob([markdown]).size,
        sourcePath: input.sourcePath ?? existing?.sourcePath,
        // Saving a trashed note must not resurrect it; trash state only changes via trash/restore.
        ...(existing?.deletedAt ? { deletedAt: existing.deletedAt } : {}),
      };

      const previousMarkdown = existing
        ? ((await this.#database.getNoteMarkdown(id)) ?? (await this.#filesystem.readText(path)))
        : undefined;
      let fileSaved = true;
      try {
        await this.#filesystem.writeText(path, markdown);
      } catch (error) {
        if (!isQuotaExceededError(error)) throw error;
        fileSaved = false;
      }
      try {
        const searchDocument = toSearchDocument(metadata, markdown);
        await this.#database.putNote(
          metadata,
          markdown,
          searchDocument,
          createSearchPostings(searchDocument),
          {
            id: crypto.randomUUID(),
            kind: "note:upsert",
            entityId: id,
            noteId: id,
            path,
            revision: metadata.revision,
            createdAt: now,
          },
        );
      } catch (error) {
        if (fileSaved && !(error instanceof VaultConflictError)) {
          await this.#restoreNoteFile(path, previousMarkdown, error);
        }
        throw error;
      }
      this.#publish({ kind: "note", noteId: id });
      return { ...metadata, markdown };
    });
  }

  async getNote(id: string): Promise<Note | undefined> {
    return this.#withLock(async () => {
      const metadata = await this.#database.getNote(id);
      if (!metadata) return undefined;
      const markdown =
        (await this.#database.getNoteMarkdown(id)) ??
        (await this.#filesystem.readText(metadata.path));
      return { ...metadata, markdown };
    });
  }

  async listNotes(): Promise<NoteMetadata[]> {
    return this.#withLock(async () => {
      const notes = await this.#database.getNotes();
      return notes
        .filter((note) => !note.deletedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
  }

  async listTrashedNotes(): Promise<NoteMetadata[]> {
    return this.#withLock(async () => {
      const notes = await this.#database.getNotes();
      return notes
        .filter((note) => Boolean(note.deletedAt))
        .sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
    });
  }

  /** Moves a note to the trash, keeping its files so it can be restored. */
  async trashNote(noteId: string): Promise<boolean> {
    return this.#withLock(async () => {
      const note = await this.#database.getNote(noteId);
      if (!note || note.deletedAt) return false;
      const attachments = await this.#database.getAttachments(noteId);
      const now = new Date().toISOString();
      const attachmentOperations: BackupOperation[] = attachments.map(
        (attachment): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "attachment:delete",
          entityId: attachment.id,
          noteId,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        }),
      );
      const operation: BackupOperation = {
        id: crypto.randomUUID(),
        kind: "note:delete",
        entityId: noteId,
        noteId,
        path: note.path,
        revision: note.revision + 1,
        createdAt: now,
      };
      const trashed = await this.#database.trashNote(
        noteId,
        now,
        now,
        operation,
        attachmentOperations,
      );
      if (trashed) this.#publish({ kind: "note", noteId });
      return trashed;
    });
  }

  /** Restores a trashed note to its former folder, renaming on path conflicts. */
  async restoreNote(noteId: string): Promise<boolean> {
    return this.#withLock(async () => {
      const note = await this.#database.getNote(noteId);
      if (!note || !note.deletedAt) return false;
      const [notes, attachments] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(noteId),
      ]);
      const now = new Date().toISOString();
      const taken = new Set(
        notes
          .filter((candidate) => candidate.id !== noteId && !candidate.deletedAt)
          .flatMap((candidate) =>
            candidate.sourcePath ? [candidate.sourcePath.toLocaleLowerCase()] : [],
          ),
      );
      const sourcePath =
        note.sourcePath && taken.has(note.sourcePath.toLocaleLowerCase())
          ? uniqueRestoreSourcePath(note.sourcePath, taken)
          : undefined;
      const attachmentOperations: BackupOperation[] = attachments.map(
        (attachment): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "attachment:upsert",
          entityId: attachment.id,
          noteId,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        }),
      );
      const operation: BackupOperation = {
        id: crypto.randomUUID(),
        kind: "note:upsert",
        entityId: noteId,
        noteId,
        path: note.path,
        revision: note.revision + 1,
        createdAt: now,
      };
      const restored = await this.#database.restoreNote(
        noteId,
        now,
        operation,
        attachmentOperations,
        sourcePath,
      );
      if (restored) this.#publish({ kind: "note", noteId });
      return restored;
    });
  }

  /** Permanently deletes one trashed note and its files. Cannot be undone. */
  async purgeNote(noteId: string): Promise<boolean> {
    return this.#withLock(async () => {
      const note = await this.#database.getNote(noteId);
      if (!note) return false;
      const attachments = await this.#database.getAttachments(noteId);
      const markdown =
        (await this.#database.getNoteMarkdown(noteId)) ??
        (await this.#filesystem.readText(note.path).catch(() => ""));
      const attachmentFiles = await Promise.all(
        attachments.map(async (attachment) => {
          try {
            return { attachment, file: await this.#filesystem.read(attachment.path) };
          } catch {
            return { attachment, file: undefined };
          }
        }),
      );
      const now = new Date().toISOString();
      const operations: BackupOperation[] = [
        ...attachments.map((attachment): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "attachment:delete",
          entityId: attachment.id,
          noteId,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        })),
        {
          id: crypto.randomUUID(),
          kind: "note:delete",
          entityId: noteId,
          noteId,
          path: note.path,
          revision: note.revision + 1,
          createdAt: now,
        },
      ];

      try {
        await this.#filesystem.remove(note.path, { ignoreMissing: true });
        for (const attachment of attachments) {
          await this.#filesystem.remove(attachment.path, { ignoreMissing: true });
        }
        await this.#database.deleteNote(
          noteId,
          attachments.map((attachment) => attachment.id),
          operations,
        );
      } catch (error) {
        if (markdown) await this.#filesystem.writeText(note.path, markdown).catch(() => undefined);
        for (const { attachment, file } of attachmentFiles) {
          if (file) await this.#filesystem.write(attachment.path, file).catch(() => undefined);
        }
        throw error;
      }
      this.#publish({ kind: "note", noteId });
      return true;
    });
  }

  /** Permanently deletes every trashed note. Cannot be undone. */
  async emptyTrash(): Promise<number> {
    const trashed = await this.listTrashedNotes();
    let purged = 0;
    for (const note of trashed) {
      if (await this.purgeNote(note.id)) purged += 1;
    }
    return purged;
  }

  /** Permanently deletes trashed notes older than the retention window. */
  async purgeExpiredTrash(
    now: Date = new Date(),
    retentionMs: number = TRASH_RETENTION_MS,
  ): Promise<string[]> {
    const trashed = await this.listTrashedNotes();
    const cutoff = now.getTime() - retentionMs;
    const purged: string[] = [];
    for (const note of trashed) {
      const deletedAt = note.deletedAt ? Date.parse(note.deletedAt) : Number.NaN;
      if (Number.isNaN(deletedAt) || deletedAt > cutoff) continue;
      if (await this.purgeNote(note.id)) purged.push(note.id);
    }
    return purged;
  }

  listFolders(): Promise<FolderMetadata[]> {
    return this.#withLock(() => this.#database.getFileFolders());
  }

  async saveFolders(folders: FolderMetadata[]): Promise<void> {
    await this.#withLock(async () => {
      await this.#database.setFileFolders(folders);
      this.#publish({ kind: "vault" });
    });
  }

  async importNotes(inputs: ImportNoteInput[]): Promise<VaultRestoreResult> {
    if (inputs.length === 0) return { attachmentCount: 0, noteCount: 0 };

    return this.#withLock(async () => {
      const importedAt = new Date().toISOString();
      const [existingNotes, existingAttachments, operations, version] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(),
        this.#database.getBackupOperations(),
        this.#getVaultVersion(),
      ]);
      const existingNoteContents = await Promise.all(
        existingNotes.map(async (note) => ({
          markdown:
            (await this.#database.getNoteMarkdown(note.id)) ??
            (await this.#filesystem.readText(note.path)),
          note,
        })),
      );
      const existingNoteFiles = existingNoteContents.map(({ markdown, note }) => ({
        contents: new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
        path: note.path,
      }));
      const existingAttachmentFiles = await Promise.all(
        existingAttachments.map(async (attachment) => ({
          contents: (await this.#filesystem.read(attachment.path)) as Blob,
          path: attachment.path,
        })),
      );

      const importedNotes: NoteMetadata[] = [];
      const importedAttachments: AttachmentMetadata[] = [];
      const importedFiles: VaultRestoreFile[] = [];
      const importedOperations: BackupOperation[] = [];
      const markdownById = new Map(
        existingNoteContents.map(({ markdown, note }) => [note.id, markdown]),
      );
      for (const input of inputs) {
        const noteId = crypto.randomUUID();
        const notePath = `notes/${noteId}.md`;
        importedNotes.push({
          id: noteId,
          title: input.title.trim() || "Untitled",
          path: notePath,
          tags: [],
          createdAt: importedAt,
          updatedAt: importedAt,
          revision: 1,
          size: new Blob([input.markdown]).size,
          sourcePath: input.sourcePath,
        });
        importedFiles.push({
          contents: new Blob([input.markdown], { type: "text/markdown;charset=utf-8" }),
          path: notePath,
        });
        markdownById.set(noteId, input.markdown);
        importedOperations.push({
          id: crypto.randomUUID(),
          kind: "note:upsert",
          entityId: noteId,
          noteId,
          path: notePath,
          revision: 1,
          createdAt: importedAt,
        });

        for (const attachment of input.attachments) {
          const attachmentId = crypto.randomUUID();
          const attachmentPath = `attachments/${noteId}/${attachmentId}`;
          importedAttachments.push({
            id: attachmentId,
            noteId,
            name: attachment.name,
            path: attachmentPath,
            type: attachment.contents.type || "application/octet-stream",
            size: attachment.contents.size,
            createdAt: importedAt,
            updatedAt: importedAt,
            sourcePath: attachment.sourcePath,
          });
          importedFiles.push({ contents: attachment.contents, path: attachmentPath });
          importedOperations.push({
            id: crypto.randomUUID(),
            kind: "attachment:upsert",
            entityId: attachmentId,
            noteId,
            path: attachmentPath,
            revision: 1,
            createdAt: importedAt,
          });
        }
      }

      const notes = [...existingNotes, ...importedNotes];
      const attachments = [...existingAttachments, ...importedAttachments];
      const documents = notes.map((note) =>
        toSearchDocument(note, markdownById.get(note.id) ?? ""),
      );
      await this.#filesystem.replace(
        [...existingNoteFiles, ...existingAttachmentFiles, ...importedFiles],
        () =>
          this.#database.replaceVault(
            notes,
            notes.map((note) => ({ noteId: note.id, markdown: markdownById.get(note.id) ?? "" })),
            attachments,
            documents,
            documents.flatMap(createSearchPostings),
            [...operations, ...importedOperations],
            version,
          ),
      );
      this.#publish({ kind: "vault" });
      return { attachmentCount: importedAttachments.length, noteCount: importedNotes.length };
    });
  }

  async getAttachment(
    id: string,
  ): Promise<{ metadata: AttachmentMetadata; file: File } | undefined> {
    return this.#withLock(async () => {
      const metadata = await this.#database.getAttachment(id);
      if (!metadata) return undefined;
      return { metadata, file: await this.#filesystem.read(metadata.path) };
    });
  }

  listAttachments(noteId?: string): Promise<AttachmentMetadata[]> {
    return this.#withLock(async () => {
      if (noteId) return this.#database.getAttachments(noteId);
      const [notes, attachments] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(),
      ]);
      const trashedIds = new Set(notes.filter((note) => note.deletedAt).map((note) => note.id));
      return attachments.filter((attachment) => !trashedIds.has(attachment.noteId));
    });
  }

  /** Stores a file for a note under `folder`, renaming it if that vault path is already taken. */
  async addAttachment(input: AddAttachmentInput): Promise<AttachmentMetadata> {
    return this.#withLock(async () => {
      if (!(await this.#database.getNote(input.noteId))) {
        throw new Error("Save the note before adding attachments to it");
      }
      const taken = new Set(
        (await this.#database.getAttachments()).flatMap((attachment) =>
          attachment.sourcePath ? [attachment.sourcePath.toLocaleLowerCase()] : [],
        ),
      );
      const folder = normalizeAttachmentFolder(input.folder);
      if (!folder) throw new Error("The attachment folder name is invalid");
      const name = uniqueAttachmentName(sanitizeAttachmentName(input.name), (candidate) =>
        taken.has(`${folder}/${candidate}`.toLocaleLowerCase()),
      );
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const attachment: AttachmentMetadata = {
        id,
        noteId: input.noteId,
        name,
        path: `attachments/${input.noteId}/${id}`,
        type: input.contents.type || "application/octet-stream",
        size: input.contents.size,
        createdAt: now,
        updatedAt: now,
        sourcePath: folder ? `${folder}/${name}` : name,
      };
      await this.#filesystem.write(attachment.path, input.contents);
      try {
        await this.#database.putAttachment(attachment, {
          id: crypto.randomUUID(),
          kind: "attachment:upsert",
          entityId: id,
          noteId: input.noteId,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        });
      } catch (error) {
        await this.#filesystem.remove(attachment.path, { ignoreMissing: true }).catch(() => {});
        throw error;
      }
      this.#publish({ kind: "note", noteId: input.noteId });
      return attachment;
    });
  }

  /** Moves every attachment stored under the vault folder `from` into `to`. */
  async moveAttachmentFolder(from: string, to: string): Promise<AttachmentMetadata[]> {
    return this.#withLock(async () => {
      if (!from || from === to) return [];
      const attachments = await this.#database.getAttachments();
      const now = new Date().toISOString();
      const moved = attachments.flatMap((attachment) => {
        const sourcePath = attachment.sourcePath;
        if (!sourcePath || sourcePath === from || !isPathWithin(sourcePath, from)) return [];
        return [
          { ...attachment, sourcePath: moveSourcePath(sourcePath, from, to), updatedAt: now },
        ];
      });
      const occupied = new Set(
        attachments
          .filter((attachment) => !moved.some((candidate) => candidate.id === attachment.id))
          .flatMap((attachment) =>
            attachment.sourcePath ? [attachment.sourcePath.toLocaleLowerCase()] : [],
          ),
      );
      const movedPaths = new Set<string>();
      for (const attachment of moved) {
        const sourcePath = attachment.sourcePath?.toLocaleLowerCase();
        if (!sourcePath || occupied.has(sourcePath) || movedPaths.has(sourcePath)) {
          throw new Error("The attachments folder contains a file with the same name");
        }
        movedPaths.add(sourcePath);
      }
      await this.#database.updateAttachments(moved);
      if (moved.length) this.#publish({ kind: "vault" });
      return moved;
    });
  }

  /** Permanently deletes one attachment with its stored bytes. */
  async deleteAttachment(id: string): Promise<AttachmentMetadata | undefined> {
    return this.#withLock(async () => {
      const attachment = await this.#database.getAttachment(id);
      if (!attachment) return undefined;
      let file: File | undefined;
      try {
        file = await this.#filesystem.read(attachment.path);
      } catch {
        // The metadata can still be removed when the stored file is already missing.
      }
      const now = new Date().toISOString();
      const operation: BackupOperation = {
        id: crypto.randomUUID(),
        kind: "attachment:delete",
        entityId: attachment.id,
        noteId: attachment.noteId,
        path: attachment.path,
        revision: 1,
        createdAt: now,
      };
      try {
        await this.#filesystem.remove(attachment.path, { ignoreMissing: true });
        await this.#database.deleteAttachments([attachment.id], [operation]);
      } catch (error) {
        if (file) await this.#filesystem.write(attachment.path, file).catch(() => undefined);
        throw error;
      }
      this.#publish({ kind: "note", noteId: attachment.noteId });
      return attachment;
    });
  }

  /** Deletes every attachment whose vault link lives in `folder`, with its stored bytes. */
  async deleteAttachmentFolder(folder: string): Promise<AttachmentMetadata[]> {
    return this.#withLock(async () => {
      if (!folder) return [];
      const attachments = await this.#database.getAttachments();
      const targeted = attachments.filter(
        (attachment) =>
          attachment.sourcePath &&
          (attachment.sourcePath === folder || isPathWithin(attachment.sourcePath, folder)),
      );
      if (targeted.length === 0) return [];
      const now = new Date().toISOString();
      const removed = await Promise.all(
        targeted.map(async (attachment) => {
          try {
            return { attachment, file: await this.#filesystem.read(attachment.path) };
          } catch {
            return { attachment, file: undefined };
          }
        }),
      );
      const operations: BackupOperation[] = targeted.map((attachment): BackupOperation => ({
        id: crypto.randomUUID(),
        kind: "attachment:delete",
        entityId: attachment.id,
        noteId: attachment.noteId,
        path: attachment.path,
        revision: 1,
        createdAt: now,
      }));
      try {
        for (const attachment of targeted) {
          await this.#filesystem.remove(attachment.path, { ignoreMissing: true });
        }
        await this.#database.deleteAttachments(
          targeted.map((attachment) => attachment.id),
          operations,
        );
      } catch (error) {
        for (const { attachment, file } of removed) {
          if (file) await this.#filesystem.write(attachment.path, file).catch(() => undefined);
        }
        throw error;
      }
      this.#publish({ kind: "vault" });
      return targeted;
    });
  }

  /** Moves a note's attachments with it, except those kept in the shared `pinnedFolder`. */
  async moveAttachmentSourcePaths(
    noteId: string,
    from: string,
    to: string,
    pinnedFolder?: string,
  ): Promise<void> {
    await this.#withLock(async () => {
      const attachments = await this.#database.getAttachments(noteId);
      const now = new Date().toISOString();
      const moved = attachments.map((attachment) => {
        const sourcePath = attachment.sourcePath;
        if (!sourcePath || !isPathWithin(sourcePath, from)) return attachment;
        if (pinnedFolder && isPathWithin(sourcePath, pinnedFolder)) return attachment;
        return {
          ...attachment,
          sourcePath: moveSourcePath(sourcePath, from, to),
          updatedAt: now,
        };
      });
      if (moved.every((attachment, index) => attachment === attachments[index])) return;
      await this.#database.updateAttachments(moved);
      this.#publish({ kind: "note", noteId });
    });
  }

  async search(query: string, tags: string[] = []): Promise<VaultSearchResult[]> {
    return this.#withLock(async () => {
      const terms = tokenize(normalizeSearchText(query));
      const requiredTags = normalizeTags(tags);
      if (terms.length === 0) {
        const [documents, notes] = await Promise.all([
          this.#database.getSearchDocuments(),
          this.#database.getNotes(),
        ]);
        const metadataById = new Map(
          notes.filter((note) => !note.deletedAt).map((note) => [note.id, note]),
        );
        return documents
          .filter((document) => requiredTags.every((tag) => document.tags.includes(tag)))
          .map((document) => scoreDocument(document, [], metadataById.get(document.noteId), []))
          .filter((result): result is VaultSearchResult => result !== undefined)
          .sort((left, right) => right.note.updatedAt.localeCompare(left.note.updatedAt));
      }

      const postingsByTerm = await Promise.all(
        terms.map((term) => this.#database.getSearchPostings(term)),
      );
      const matchingNoteIds = intersectPostingNoteIds(postingsByTerm);
      if (matchingNoteIds.length === 0) return [];

      const { documents, notes } = await this.#database.getSearchRecords(matchingNoteIds);
      const metadataById = new Map(
        notes.filter((note) => !note.deletedAt).map((note) => [note.id, note]),
      );
      const postingsByNote = new Map<string, SearchPosting[]>();
      for (const posting of postingsByTerm.flat()) {
        const postings = postingsByNote.get(posting.noteId) ?? [];
        postings.push(posting);
        postingsByNote.set(posting.noteId, postings);
      }

      return documents
        .filter((document) => requiredTags.every((tag) => document.tags.includes(tag)))
        .map((document) =>
          scoreDocument(
            document,
            terms,
            metadataById.get(document.noteId),
            postingsByNote.get(document.noteId) ?? [],
          ),
        )
        .filter((result): result is VaultSearchResult => result !== undefined)
        .sort(
          (left, right) =>
            right.score - left.score || right.note.updatedAt.localeCompare(left.note.updatedAt),
        );
    });
  }

  getGithubBackupState(): Promise<GithubBackupState | undefined> {
    return this.#withLock(() => this.#database.getGithubBackupState());
  }

  saveGithubBackupState(
    state: Omit<GithubBackupState, "updatedAt">,
    options: VaultOperationOptions = {},
  ): Promise<void> {
    return this.#withLock(async () => {
      await this.#database.setGithubBackupState({
        ...state,
        updatedAt: new Date().toISOString(),
      });
      this.#publish({ kind: "backup" });
    }, options.context);
  }

  clearGithubBackupState(options: VaultOperationOptions = {}): Promise<void> {
    return this.#withLock(async () => {
      await this.#database.deleteGithubBackupState();
      this.#publish({ kind: "backup" });
    }, options.context);
  }

  async clear(): Promise<void> {
    await this.#withLock(async () => {
      const now = new Date().toISOString();
      const [notes, attachments, version] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(),
        this.#getVaultVersion(),
      ]);
      const operations = [
        ...attachments.map((attachment): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "attachment:delete",
          entityId: attachment.id,
          noteId: attachment.noteId,
          path: attachment.path,
          revision: 1,
          createdAt: now,
        })),
        ...notes.map((note): BackupOperation => ({
          id: crypto.randomUUID(),
          kind: "note:delete",
          entityId: note.id,
          noteId: note.id,
          path: note.path,
          revision: note.revision + 1,
          createdAt: now,
        })),
      ];
      await this.#filesystem.replace([], () =>
        this.#database.replaceVault([], [], [], [], [], operations, version),
      );
      await this.#database.setFileFolders([]);
      this.#publish({ kind: "vault" });
    });
  }

  getPendingBackupOperations(): Promise<BackupOperation[]> {
    return this.#withLock(() => this.#database.getBackupOperations());
  }

  async createBackupSnapshot(options: VaultOperationOptions = {}): Promise<VaultBackupSnapshot> {
    return this.#withLock(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { operations, noteContents, version } = await this.#getBackupSnapshotRecords();
        const latestByPath = new Map<string, BackupOperation>();
        for (const operation of operations) latestByPath.set(operation.path, operation);

        const changes = await Promise.all(
          [...latestByPath.values()].map(async (operation) => {
            if (operation.kind.endsWith(":delete")) {
              return { contents: null, path: operation.path };
            }
            if (operation.kind === "note:upsert") {
              const markdown = noteContents.get(operation.noteId);
              if (markdown !== undefined) {
                return {
                  contents: new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
                  path: operation.path,
                };
              }
            }
            return { contents: await this.#filesystem.read(operation.path), path: operation.path };
          }),
        );
        if (version === (await this.#getVaultVersion())) {
          return { changes, operationIds: operations.map((operation) => operation.id) };
        }
      }
      throw new VaultConflictError("vault", 0, 1);
    }, options.context);
  }

  acknowledgeBackupOperations(ids: string[], options: VaultOperationOptions = {}): Promise<void> {
    return this.#withLock(async () => {
      await this.#database.removeBackupOperations(ids);
      this.#publish({ kind: "backup" });
    }, options.context);
  }

  async createBackupManifest(options: VaultOperationOptions = {}): Promise<VaultBackupManifest> {
    return this.#withLock(async () => {
      const [notes, attachments] = await Promise.all([
        this.#database.getNotes(),
        this.#database.getAttachments(),
      ]);
      const activeNotes = notes.filter((note) => !note.deletedAt);
      const activeIds = new Set(activeNotes.map((note) => note.id));
      return {
        version: 1,
        notes: activeNotes,
        attachments: attachments.filter((attachment) => activeIds.has(attachment.noteId)),
      };
    }, options.context);
  }

  async restoreBackup(
    files: VaultRestoreFile[],
    options: {
      manifest?: VaultBackupManifest;
      pendingPaths?: string[];
      restoredAt: string;
      context?: VaultOperationContext;
    },
  ): Promise<VaultRestoreResult> {
    return this.#withLock(async () => {
      const filesByPath = new Map(files.map((file) => [file.path, file]));
      const notes = options.manifest
        ? validateManifestNotes(options.manifest.notes, filesByPath)
        : await inferNotes(files, options.restoredAt);
      const noteIds = new Set(notes.map((note) => note.id));
      const attachments = options.manifest
        ? validateManifestAttachments(options.manifest.attachments, filesByPath, noteIds)
        : inferAttachments(files, noteIds, options.restoredAt);
      const acceptedPaths = new Set([
        ...notes.map((note) => note.path),
        ...attachments.map((attachment) => attachment.path),
      ]);
      const restoredFiles = files.filter((file) => acceptedPaths.has(file.path));
      const markdownByPath = new Map(
        await Promise.all(
          restoredFiles
            .filter((file) => file.path.startsWith("notes/"))
            .map(async (file) => [file.path, await file.contents.text()] as const),
        ),
      );
      const documents = notes.map((note) =>
        toSearchDocument(note, markdownByPath.get(note.path) ?? ""),
      );
      const operations = (options.pendingPaths ?? [])
        .map((path) => restoreOperation(path, acceptedPaths.has(path), options.restoredAt))
        .filter((operation): operation is BackupOperation => operation !== undefined);
      const version = await this.#getVaultVersion();

      await this.#filesystem.replace(restoredFiles, async () => {
        await this.#database.replaceVault(
          notes,
          notes.map((note) => ({ noteId: note.id, markdown: markdownByPath.get(note.path) ?? "" })),
          attachments,
          documents,
          documents.flatMap(createSearchPostings),
          operations,
          version,
        );
        await this.#database.setFileFolders([]);
      });
      this.#publish({ kind: "vault" });
      return { attachmentCount: attachments.length, noteCount: notes.length };
    }, options.context);
  }

  async #getVaultVersion(): Promise<number> {
    const database = this.#database as unknown as {
      getVaultVersion?: () => Promise<number>;
    };
    return typeof database.getVaultVersion === "function"
      ? database.getVaultVersion.call(this.#database)
      : 0;
  }

  async #getBackupSnapshotRecords(): Promise<{
    operations: BackupOperation[];
    noteContents: Map<string, string>;
    version: number;
  }> {
    const database = this.#database as unknown as {
      getBackupSnapshotRecords?: () => Promise<{
        operations: BackupOperation[];
        noteContents: Map<string, string>;
        version: number;
      }>;
    };
    if (typeof database.getBackupSnapshotRecords === "function") {
      return database.getBackupSnapshotRecords.call(this.#database);
    }

    const operations = await this.#database.getBackupOperations();
    const noteIds = [
      ...new Set(
        operations
          .filter((operation) => operation.kind === "note:upsert")
          .map((operation) => operation.noteId),
      ),
    ];
    const noteContents = new Map(
      (
        await Promise.all(
          noteIds.map(
            async (noteId) => [noteId, await this.#database.getNoteMarkdown(noteId)] as const,
          ),
        )
      ).filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
    );
    return { operations, noteContents, version: await this.#getVaultVersion() };
  }

  async #withLock<T>(
    task: (context: VaultOperationContext) => Promise<T>,
    context?: VaultOperationContext,
  ): Promise<T> {
    if (context && context === this.#activeOperation) return task(context);
    return this.#coordination.runExclusive(async () => {
      const operation = { id: crypto.randomUUID() } satisfies VaultOperationContext;
      const previous = this.#activeOperation;
      this.#activeOperation = operation;
      try {
        return await task(operation);
      } finally {
        this.#activeOperation = previous;
      }
    });
  }

  #publish(change: Pick<VaultChangeEvent, "kind" | "noteId">): void {
    this.#coordination.publish(change);
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
}

async function inferNotes(files: VaultRestoreFile[], restoredAt: string): Promise<NoteMetadata[]> {
  return Promise.all(
    files.flatMap((file) => {
      const match = file.path.match(/^notes\/([^/]+)\.md$/);
      if (!match) return [];
      return [
        file.contents.text().then((markdown): NoteMetadata => ({
          id: match[1],
          title: titleFromMarkdown(markdown),
          path: file.path,
          tags: [],
          createdAt: restoredAt,
          updatedAt: restoredAt,
          revision: 1,
          size: file.contents.size,
        })),
      ];
    }),
  );
}

function inferAttachments(
  files: VaultRestoreFile[],
  noteIds: Set<string>,
  restoredAt: string,
): AttachmentMetadata[] {
  return files.flatMap((file) => {
    const match = file.path.match(/^attachments\/([^/]+)\/([^/]+)$/);
    if (!match || !noteIds.has(match[1])) return [];
    return [
      {
        id: match[2],
        noteId: match[1],
        name: match[2],
        path: file.path,
        type: file.contents.type || "application/octet-stream",
        size: file.contents.size,
        createdAt: restoredAt,
        updatedAt: restoredAt,
      },
    ];
  });
}

function validateManifestNotes(
  notes: NoteMetadata[],
  files: Map<string, VaultRestoreFile>,
): NoteMetadata[] {
  return notes.map((note) => {
    const file = files.get(note.path);
    if (!file || !note.path.match(/^notes\/[^/]+\.md$/) || note.path !== `notes/${note.id}.md`) {
      throw new Error("The backup manifest contains an invalid note");
    }
    return { ...note, tags: normalizeTags(note.tags), size: file.contents.size };
  });
}

function validateManifestAttachments(
  attachments: AttachmentMetadata[],
  files: Map<string, VaultRestoreFile>,
  noteIds: Set<string>,
): AttachmentMetadata[] {
  return attachments.map((attachment) => {
    const file = files.get(attachment.path);
    if (
      !file ||
      !noteIds.has(attachment.noteId) ||
      attachment.path !== `attachments/${attachment.noteId}/${attachment.id}`
    ) {
      throw new Error("The backup manifest contains an invalid attachment");
    }
    return { ...attachment, size: file.contents.size };
  });
}

function restoreOperation(
  path: string,
  exists: boolean,
  restoredAt: string,
): BackupOperation | undefined {
  const note = path.match(/^notes\/([^/]+)\.md$/);
  if (note) {
    return {
      id: crypto.randomUUID(),
      kind: exists ? "note:upsert" : "note:delete",
      entityId: note[1],
      noteId: note[1],
      path,
      revision: 1,
      createdAt: restoredAt,
    };
  }
  const attachment = path.match(/^attachments\/([^/]+)\/([^/]+)$/);
  if (!attachment) return undefined;
  return {
    id: crypto.randomUUID(),
    kind: exists ? "attachment:upsert" : "attachment:delete",
    entityId: attachment[2],
    noteId: attachment[1],
    path,
    revision: 1,
    createdAt: restoredAt,
  };
}

function uniqueRestoreSourcePath(sourcePath: string, taken: Set<string>): string {
  const dot = sourcePath.lastIndexOf(".");
  const stem = dot > 0 ? sourcePath.slice(0, dot) : sourcePath;
  const extension = dot > 0 ? sourcePath.slice(dot) : "";
  const cleanedStem = stem.replace(/\s+\(restored(?:\s+\d+)?\)$/i, "") || stem;
  let candidate = `${cleanedStem} (restored)${extension}`;
  for (let index = 2; taken.has(candidate.toLocaleLowerCase()); index += 1) {
    candidate = `${cleanedStem} (restored ${index})${extension}`;
  }
  return candidate;
}

function sanitizeAttachmentName(name: string): string {
  let cleaned = name
    .replace(/[\\/]/g, "-")
    .replace(/[<>:"|?*#%\p{Cc}]/gu, "-")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/u, "");
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(cleaned)) {
    cleaned = `file-${cleaned}`;
  }
  return cleaned || "file";
}

function uniqueAttachmentName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 1; ; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!taken(candidate)) return candidate;
  }
}

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("The vault can only be opened in a browser");
  }
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
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
  postings: SearchPosting[],
): VaultSearchResult | undefined {
  if (!note) return undefined;
  if (terms.length === 0) return { note, excerpt: excerpt(document.body, ""), score: 0 };

  const score = postings.reduce(
    (total, posting) =>
      total + posting.titleMatches * 5 + posting.tagMatches * 3 + posting.bodyMatches,
    0,
  );

  return { note, excerpt: excerpt(document.body, terms[0]), score };
}

function intersectPostingNoteIds(groups: SearchPosting[][]): string[] {
  if (groups.length === 0) return [];
  let matches = new Set(groups[0].map((posting) => posting.noteId));
  for (const group of groups.slice(1)) {
    const noteIds = new Set(group.map((posting) => posting.noteId));
    matches = new Set([...matches].filter((id) => noteIds.has(id)));
  }
  return [...matches];
}

function tokenize(value: string): string[] {
  return [...new Set(value.match(/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu) ?? [])];
}

function excerpt(body: string, term: string): string {
  const position = term ? body.indexOf(term) : 0;
  const start = Math.max(0, position - 80);
  const value = body.slice(start, start + 200).trim();
  return start > 0 ? `…${value}` : value;
}
