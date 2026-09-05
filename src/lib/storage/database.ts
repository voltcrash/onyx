import type {
  AttachmentMetadata,
  BackupOperation,
  GithubBackupState,
  NoteMetadata,
  SearchState,
} from "./types.js";

const DATABASE_VERSION = 1;

export interface SearchDocument {
  noteId: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

interface SettingRecord<T> {
  key: string;
  value: T;
}

export type StoreName = "attachments" | "backupQueue" | "notes" | "searchDocuments" | "settings";

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

    request.onupgradeneeded = () => {
      const database = request.result;
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
    searchDocument: SearchDocument,
    operation: BackupOperation,
  ): Promise<void> {
    const transaction = this.#database.transaction(
      ["notes", "searchDocuments", "backupQueue"],
      "readwrite",
    );
    transaction.objectStore("notes").put(note);
    transaction.objectStore("searchDocuments").put(searchDocument);
    transaction.objectStore("backupQueue").put(operation);
    await transactionDone(transaction);
  }

  async deleteNote(
    id: string,
    attachmentIds: string[],
    operations: BackupOperation[],
  ): Promise<void> {
    const transaction = this.#database.transaction(
      ["notes", "attachments", "searchDocuments", "backupQueue"],
      "readwrite",
    );
    transaction.objectStore("notes").delete(id);
    transaction.objectStore("searchDocuments").delete(id);

    const attachments = transaction.objectStore("attachments");
    for (const attachmentId of attachmentIds) attachments.delete(attachmentId);

    for (const operation of operations) transaction.objectStore("backupQueue").put(operation);
    await transactionDone(transaction);
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

  async putAttachment(attachment: AttachmentMetadata, operation: BackupOperation): Promise<void> {
    const transaction = this.#database.transaction(["attachments", "backupQueue"], "readwrite");
    transaction.objectStore("attachments").put(attachment);
    transaction.objectStore("backupQueue").put(operation);
    await transactionDone(transaction);
  }

  async deleteAttachment(id: string, operation: BackupOperation): Promise<void> {
    const transaction = this.#database.transaction(["attachments", "backupQueue"], "readwrite");
    transaction.objectStore("attachments").delete(id);
    transaction.objectStore("backupQueue").put(operation);
    await transactionDone(transaction);
  }

  getSearchDocuments(): Promise<SearchDocument[]> {
    return this.#getAll<SearchDocument>("searchDocuments");
  }

  getSearchState(): Promise<SearchState | undefined> {
    return this.#getSetting<SearchState>("search");
  }

  setSearchState(state: SearchState): Promise<void> {
    return this.#putSetting("search", state);
  }

  getGithubBackupState(): Promise<GithubBackupState | undefined> {
    return this.#getSetting<GithubBackupState>("githubBackup");
  }

  setGithubBackupState(state: GithubBackupState): Promise<void> {
    return this.#putSetting("githubBackup", state);
  }

  getBackupOperations(): Promise<BackupOperation[]> {
    return this.#getAll<BackupOperation>("backupQueue", "createdAt");
  }

  async removeBackupOperations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const transaction = this.#database.transaction("backupQueue", "readwrite");
    const store = transaction.objectStore("backupQueue");
    for (const id of ids) store.delete(id);
    await transactionDone(transaction);
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

  async #putSetting<T>(key: string, value: T): Promise<void> {
    const transaction = this.#database.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({ key, value } satisfies SettingRecord<T>);
    await transactionDone(transaction);
  }
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
