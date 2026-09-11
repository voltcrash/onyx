import type {
  AttachmentMetadata,
  BackupOperation,
  GithubBackupState,
  NoteMetadata,
} from "./types.js";
import { VaultConflictError } from "./types.js";

const DATABASE_VERSION = 3;
const VAULT_VERSION_KEY = "vaultVersion";
const NATIVE_DIRECTORY_HANDLE_KEY = "nativeDirectoryHandle";

export interface SearchDocument {
  noteId: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface SearchPosting {
  term: string;
  noteId: string;
  titleMatches: number;
  bodyMatches: number;
  tagMatches: number;
}

interface SettingRecord<T> {
  key: string;
  value: T;
}

export type StoreName =
  | "attachments"
  | "backupQueue"
  | "noteContents"
  | "notes"
  | "searchDocuments"
  | "searchPostings"
  | "settings";

export class VaultDatabase {
  readonly #database: IDBDatabase;

  private constructor(database: IDBDatabase) {
    this.#database = database;
  }

  static async open(name: string): Promise<VaultDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available in this environment");
    }

    const request = indexedDB.open(name, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        const notes = database.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("updatedAt", "updatedAt");
        notes.createIndex("title", "title");

        const attachments = database.createObjectStore("attachments", { keyPath: "id" });
        attachments.createIndex("noteId", "noteId");

        database.createObjectStore("searchDocuments", { keyPath: "noteId" });
        database.createObjectStore("settings", { keyPath: "key" });

        const backupQueue = database.createObjectStore("backupQueue", { keyPath: "id" });
        backupQueue.createIndex("createdAt", "createdAt");
        backupQueue.createIndex("noteId", "noteId");
      }

      if (event.oldVersion < 2) {
        const postings = database.createObjectStore("searchPostings", {
          keyPath: ["term", "noteId"],
        });
        postings.createIndex("noteId", "noteId");

        const documents = request.transaction?.objectStore("searchDocuments");
        documents?.openCursor().addEventListener("success", (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          for (const posting of createSearchPostings(cursor.value as SearchDocument)) {
            postings.put(posting);
          }
          cursor.continue();
        });
      }

      if (event.oldVersion < 3) {
        database.createObjectStore("noteContents", { keyPath: "noteId" });
      }
    };

    const database = await requestResult(request);
    database.onversionchange = () => database.close();
    return new VaultDatabase(database);
  }

  close(): void {
    this.#database.close();
  }

  getNote(id: string): Promise<NoteMetadata | undefined> {
    return this.#get<NoteMetadata>("notes", id);
  }

  getNotes(): Promise<NoteMetadata[]> {
    return this.#getAll<NoteMetadata>("notes");
  }

  async putNote(
    note: NoteMetadata,
    markdown: string,
    searchDocument: SearchDocument,
    searchPostings: SearchPosting[],
    operation: BackupOperation,
  ): Promise<void> {
    const transaction = this.#database.transaction(
      ["notes", "noteContents", "searchDocuments", "searchPostings", "backupQueue", "settings"],
      "readwrite",
    );
    const complete = transactionDone(transaction);
    try {
      const current = await requestResult<NoteMetadata | undefined>(
        transaction.objectStore("notes").get(note.id),
      );
      const actualRevision = current?.revision ?? 0;
      const expectedRevision = note.revision - 1;
      if (actualRevision !== expectedRevision) {
        transaction.abort();
        await complete.catch(() => undefined);
        throw new VaultConflictError(note.id, expectedRevision, actualRevision);
      }

      transaction.objectStore("notes").put(note);
      transaction.objectStore("noteContents").put({ noteId: note.id, markdown });
      transaction.objectStore("searchDocuments").put(searchDocument);
      const postings = transaction.objectStore("searchPostings");
      const previousKeys = await requestResult<IDBValidKey[]>(
        postings.index("noteId").getAllKeys(note.id),
      );
      for (const key of previousKeys) postings.delete(key);
      for (const posting of searchPostings) postings.put(posting);
      transaction.objectStore("backupQueue").put(operation);
      await advanceVaultVersion(transaction);
      await complete;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      await complete.catch(() => undefined);
      throw error;
    }
  }

  getAttachment(id: string): Promise<AttachmentMetadata | undefined> {
    return this.#get<AttachmentMetadata>("attachments", id);
  }

  async getAttachments(noteId?: string): Promise<AttachmentMetadata[]> {
    if (!noteId) return this.#getAll<AttachmentMetadata>("attachments");

    const transaction = this.#database.transaction("attachments", "readonly");
    const request = transaction.objectStore("attachments").index("noteId").getAll(noteId);
    const attachments = await requestResult<AttachmentMetadata[]>(request);
    await transactionDone(transaction);
    return attachments;
  }

  getSearchDocuments(): Promise<SearchDocument[]> {
    return this.#getAll<SearchDocument>("searchDocuments");
  }

  async getNoteMarkdown(noteId: string): Promise<string | undefined> {
    const record = await this.#get<{ markdown: string }>("noteContents", noteId);
    return record?.markdown;
  }

  async getBackupSnapshotRecords(): Promise<{
    operations: BackupOperation[];
    noteContents: Map<string, string>;
    version: number;
  }> {
    const transaction = this.#database.transaction(
      ["backupQueue", "noteContents", "settings"],
      "readonly",
    );
    const [operations, noteContents, versionRecord] = await Promise.all([
      requestResult<BackupOperation[]>(
        transaction.objectStore("backupQueue").index("createdAt").getAll(),
      ),
      requestResult<Array<{ markdown: string; noteId: string }>>(
        transaction.objectStore("noteContents").getAll(),
      ),
      requestResult<SettingRecord<number> | undefined>(
        transaction.objectStore("settings").get(VAULT_VERSION_KEY),
      ),
    ]);
    await transactionDone(transaction);
    return {
      operations,
      noteContents: new Map(noteContents.map((contents) => [contents.noteId, contents.markdown])),
      version: versionRecord?.value ?? 0,
    };
  }

  getVaultVersion(): Promise<number> {
    return this.#getSetting<number>(VAULT_VERSION_KEY).then((version) => version ?? 0);
  }

  async getSearchRecords(noteIds: string[]): Promise<{
    documents: SearchDocument[];
    notes: NoteMetadata[];
  }> {
    const transaction = this.#database.transaction(["searchDocuments", "notes"], "readonly");
    const documents = transaction.objectStore("searchDocuments");
    const notes = transaction.objectStore("notes");
    const [documentRecords, noteRecords] = await Promise.all([
      Promise.all(
        noteIds.map((id) => requestResult<SearchDocument | undefined>(documents.get(id))),
      ),
      Promise.all(noteIds.map((id) => requestResult<NoteMetadata | undefined>(notes.get(id)))),
    ]);
    await transactionDone(transaction);
    return {
      documents: documentRecords.filter((value): value is SearchDocument => value !== undefined),
      notes: noteRecords.filter((value): value is NoteMetadata => value !== undefined),
    };
  }

  async getSearchPostings(term: string): Promise<SearchPosting[]> {
    const transaction = this.#database.transaction("searchPostings", "readonly");
    const range = IDBKeyRange.bound([term], [`${term}\uffff`]);
    const postings = await requestResult<SearchPosting[]>(
      transaction.objectStore("searchPostings").getAll(range),
    );
    await transactionDone(transaction);
    return postings;
  }

  getGithubBackupState(): Promise<GithubBackupState | undefined> {
    return this.#getSetting<GithubBackupState>("githubBackup");
  }

  setGithubBackupState(state: GithubBackupState): Promise<void> {
    return this.#putSetting("githubBackup", state);
  }

  deleteGithubBackupState(): Promise<void> {
    return this.#deleteSetting("githubBackup");
  }

  getNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
    return this.#getSetting<FileSystemDirectoryHandle>(NATIVE_DIRECTORY_HANDLE_KEY);
  }

  setNativeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    return this.#putSetting(NATIVE_DIRECTORY_HANDLE_KEY, handle);
  }

  deleteNativeDirectoryHandle(): Promise<void> {
    return this.#deleteSetting(NATIVE_DIRECTORY_HANDLE_KEY);
  }

  getBackupOperations(): Promise<BackupOperation[]> {
    return this.#getAll<BackupOperation>("backupQueue", "createdAt");
  }

  async removeBackupOperations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const transaction = this.#database.transaction(["backupQueue", "settings"], "readwrite");
    const store = transaction.objectStore("backupQueue");
    for (const id of ids) store.delete(id);
    await advanceVaultVersion(transaction);
    await transactionDone(transaction);
  }

  async replaceVault(
    notes: NoteMetadata[],
    noteContents: Array<{ markdown: string; noteId: string }>,
    attachments: AttachmentMetadata[],
    documents: SearchDocument[],
    postings: SearchPosting[],
    operations: BackupOperation[],
    expectedVersion?: number,
  ): Promise<void> {
    const transaction = this.#database.transaction(
      [
        "notes",
        "noteContents",
        "attachments",
        "searchDocuments",
        "searchPostings",
        "backupQueue",
        "settings",
      ],
      "readwrite",
    );
    const complete = transactionDone(transaction);
    try {
      const versionRecord = await requestResult<SettingRecord<number> | undefined>(
        transaction.objectStore("settings").get(VAULT_VERSION_KEY),
      );
      const actualVersion = versionRecord?.value ?? 0;
      if (expectedVersion !== undefined && actualVersion !== expectedVersion) {
        transaction.abort();
        await complete.catch(() => undefined);
        throw new VaultConflictError("vault", expectedVersion, actualVersion);
      }

      const stores = {
        notes: transaction.objectStore("notes"),
        noteContents: transaction.objectStore("noteContents"),
        attachments: transaction.objectStore("attachments"),
        documents: transaction.objectStore("searchDocuments"),
        postings: transaction.objectStore("searchPostings"),
        operations: transaction.objectStore("backupQueue"),
      };
      for (const store of Object.values(stores)) store.clear();
      for (const note of notes) stores.notes.put(note);
      for (const contents of noteContents) stores.noteContents.put(contents);
      for (const attachment of attachments) stores.attachments.put(attachment);
      for (const document of documents) stores.documents.put(document);
      for (const posting of postings) stores.postings.put(posting);
      for (const operation of operations) stores.operations.put(operation);
      await advanceVaultVersion(transaction);
      await complete;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      await complete.catch(() => undefined);
      throw error;
    }
  }

  async #get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const transaction = this.#database.transaction(storeName, "readonly");
    const value = await requestResult<T | undefined>(transaction.objectStore(storeName).get(key));
    await transactionDone(transaction);
    return value;
  }

  async #getAll<T>(storeName: StoreName, indexName?: string): Promise<T[]> {
    const transaction = this.#database.transaction(storeName, "readonly");
    const source = indexName
      ? transaction.objectStore(storeName).index(indexName)
      : transaction.objectStore(storeName);
    const values = await requestResult<T[]>(source.getAll());
    await transactionDone(transaction);
    return values;
  }

  async #getSetting<T>(key: string): Promise<T | undefined> {
    const record = await this.#get<SettingRecord<T>>("settings", key);
    return record?.value;
  }

  async #deleteSetting(key: string): Promise<void> {
    const transaction = this.#database.transaction("settings", "readwrite");
    transaction.objectStore("settings").delete(key);
    if (key !== VAULT_VERSION_KEY) await advanceVaultVersion(transaction);
    await transactionDone(transaction);
  }

  async #putSetting<T>(key: string, value: T): Promise<void> {
    const transaction = this.#database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({ key, value } satisfies SettingRecord<T>);
    if (key !== VAULT_VERSION_KEY) await advanceVaultVersion(transaction);
    await transactionDone(transaction);
  }
}

async function advanceVaultVersion(transaction: IDBTransaction): Promise<void> {
  const settings = transaction.objectStore("settings");
  const current = await requestResult<SettingRecord<number> | undefined>(
    settings.get(VAULT_VERSION_KEY),
  );
  settings.put({ key: VAULT_VERSION_KEY, value: (current?.value ?? 0) + 1 });
}

export function createSearchPostings(document: SearchDocument): SearchPosting[] {
  const terms = new Map<string, SearchPosting>();
  addTerms(terms, document, tokenize(document.title), "titleMatches");
  addTerms(terms, document, tokenize(document.body), "bodyMatches");
  addTerms(terms, document, document.tags.flatMap(tokenize), "tagMatches");
  return [...terms.values()];
}

function addTerms(
  postings: Map<string, SearchPosting>,
  document: SearchDocument,
  values: string[],
  field: "bodyMatches" | "tagMatches" | "titleMatches",
): void {
  for (const term of values) {
    const posting = postings.get(term) ?? {
      term,
      noteId: document.noteId,
      titleMatches: 0,
      bodyMatches: 0,
      tagMatches: 0,
    };
    posting[field] += 1;
    postings.set(term, posting);
  }
}

function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}
