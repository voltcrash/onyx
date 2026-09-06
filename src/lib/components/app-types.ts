export type BackupState = "idle" | "backing-up" | "success" | "error";
export type GithubState = "loading" | "connected" | "disconnected" | "error";
export type RestoreState = "idle" | "loading" | "restoring" | "error";
export type SaveState = "loading" | "saved" | "saving" | "unsaved" | "error";
export type TransferState = "idle" | "working" | "error";
export type ViewMode = "edit" | "live" | "split" | "preview";
