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
}

export interface Note extends NoteMetadata {
  markdown: string;
}

export interface SaveNoteInput {
  id?: VaultId;
  title: string;
  markdown: string;
  tags?: string[];
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
}

export interface SearchState {
  query: string;
  tags: string[];
  sort: "created" | "title" | "updated";
  direction: "asc" | "desc";
  updatedAt: string;
}

export interface GithubBackupState {
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

export interface VaultSearchResult {
  note: NoteMetadata;
  excerpt: string;
  score: number;
}

export interface VaultOptions {
  databaseName?: string;
  directoryName?: string;
}
