export type VaultId = string;

export interface NoteMetadata {
  id: VaultId;
  title: string;
  path: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  size: number;
  sourcePath?: string;
}

export interface Note extends NoteMetadata {
  markdown: string;
}

export interface SaveNoteInput {
  id?: VaultId;
  expectedRevision?: number;
  title: string;
  markdown: string;
  tags?: string[];
  sourcePath?: string;
}

export interface ImportAttachmentInput {
  contents: Blob;
  name: string;
  sourcePath: string;
}

export interface ImportNoteInput {
  attachments: ImportAttachmentInput[];
  markdown: string;
  sourcePath: string;
  title: string;
}

export interface AttachmentMetadata {
  id: VaultId;
  noteId: VaultId;
  name: string;
  path: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  sourcePath?: string;
}

export interface GithubBackupState {
  githubAccountId: number;
  githubAccountLogin: string;
  owner: string;
  repository: string;
  branch: string;
  directory: string;
  lastCommitSha?: string;
  lastBackedUpAt?: string;
  updatedAt: string;
}

export type BackupOperationKind =
  | "attachment:delete"
  | "attachment:upsert"
  | "note:delete"
  | "note:upsert";

export interface BackupOperation {
  id: VaultId;
  kind: BackupOperationKind;
  entityId: VaultId;
  noteId: VaultId;
  path: string;
  revision: number;
  createdAt: string;
}

export interface VaultBackupChange {
  contents: Blob | null;
  path: string;
}

export interface VaultBackupSnapshot {
  changes: VaultBackupChange[];
  operationIds: string[];
}

export type VaultChangeKind = "backup" | "note" | "vault";

export interface VaultChangeEvent {
  kind: VaultChangeKind;
  noteId?: VaultId;
  occurredAt: string;
  sourceId: string;
}

export interface VaultOperationContext {
  readonly id: string;
}

export interface VaultOperationOptions {
  context?: VaultOperationContext;
}

export interface VaultBackupManifest {
  version: 1;
  notes: NoteMetadata[];
  attachments: AttachmentMetadata[];
}

export interface VaultRestoreFile {
  contents: Blob;
  path: string;
}

export interface VaultRestoreResult {
  attachmentCount: number;
  noteCount: number;
}

export interface VaultStorageUsage {
  attachmentBytes: number;
  attachmentCount: number;
  noteBytes: number;
  noteCount: number;
  persistent: boolean;
  persistentStorageAvailable: boolean;
  quota?: number;
  usage?: number;
}

export interface VaultSearchResult {
  note: NoteMetadata;
  excerpt: string;
  score: number;
}

export interface VaultOptions {
  databaseName?: string;
  directoryName?: string;
}

export class VaultConflictError extends Error {
  constructor(
    readonly entityId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      entityId === "vault"
        ? "The vault changed in another tab. Reload and try again."
        : "This note changed in another tab. Reload it before saving.",
    );
    this.name = "VaultConflictError";
  }
}
