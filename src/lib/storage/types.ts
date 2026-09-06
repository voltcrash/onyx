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
