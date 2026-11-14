import type { ImagePreviewState } from "./page-controller.svelte.ts";
import type { SaveState } from "#lib/components/app-types.ts";
import { type LocalAttachmentUrl } from "#lib/markdown-utils.ts";
import { Vault } from "#lib/storage/index.ts";
import type { FolderMetadata, NoteMetadata } from "#lib/storage/types.ts";
import type { FindMatch } from "#lib/find-replace.ts";
import type { FolderIcon } from "#lib/folder-icons.ts";
import {
  basename,
  fileStem,
  isPathWithin,
  joinPath,
  normalizeFileName,
  normalizeFolderName,
  noteFilePath,
  noteFolderPath,
  parentPath,
} from "#lib/paths.ts";
import type { MarkdownEditor } from "#lib/markdown-editor.ts";
interface ControllerHost {
  vault: Vault | undefined;
  transferController: {
    importFolder: (files: FileList | null) => Promise<void>;
    importZip: (files: FileList | null) => Promise<void>;
    runImport: (
      files: import("../lib/markdown-transfer.ts").MarkdownTransferFile[],
    ) => Promise<void>;
    savePdf: () => Promise<void>;
    noteSource: (id: string) => Promise<import("#lib/note-output.ts").NoteSource | undefined>;
    copyToClipboard: (write: () => Promise<void>) => Promise<void>;
    copyNoteAs: (
      id: string,
      format: Exclude<import("../lib/components/note-formats.ts").NoteFormat, "pdf">,
    ) => Promise<void>;
    exportNoteAs: (
      id: string,
      format: import("../lib/components/note-formats.ts").NoteFormat,
    ) => Promise<void>;
    exportZip: () => Promise<void>;
    exportFolder: () => Promise<void>;
    showTransferError: (error: unknown, fallback: string) => void;
    transferState: import("#lib/components/app-types.ts").TransferState;
    transferMessage: string;
    folderInput: HTMLInputElement | undefined;
    zipInput: HTMLInputElement | undefined;
    printing: boolean;
    printHtml: string;
  };
  settleDraft: () => Promise<boolean>;
  saveState: SaveState;
  searchQuery: string;
  loadNote: (id: string) => Promise<void>;
  refreshFileTree: () => Promise<NoteMetadata[]>;
  editor: MarkdownEditor | undefined;
  storageError: string;
  markdown: string;
  lastSavedMarkdown: string;
  folders: FolderMetadata[];
  pendingBackupCount: number;
  attachmentFolder: string;
  activeNoteId: string;
  renameAttachmentFolder: (requested: string) => Promise<boolean>;
  resetActiveNote: () => void;
  imagePreview: ImagePreviewState | undefined;
  closeImagePreview: () => void;
  localAttachmentUrls: LocalAttachmentUrl[];
  preview: {
    readonly blocks: import("../lib/markdown-lite.ts").RenderedBlock[];
    render: (
      source: string,
      context?: { attachments: LocalAttachmentUrl[]; noteSourcePath: string | undefined },
    ) => Promise<void>;
    loadMarkdownModule: () => Promise<typeof import("../lib/markdown.ts")>;
    ensureFullParser(): void;
    invalidate(): void;
    dispose(): void;
  };
  selectNote: (id: string) => Promise<void>;
  confirmation: {
    readonly request: import("./confirmation.svelte.ts").ConfirmationRequest | undefined;
    ask: (options: import("./confirmation.svelte.ts").ConfirmationOptions) => Promise<boolean>;
    confirm: () => void;
    cancel: () => void;
    dispose: () => void;
  };
  trashedNotes: NoteMetadata[];
  paletteOpen: boolean;
  closePalette: () => void;
  find: {
    readonly isOpen: boolean;
    readonly query: string;
    readonly replacement: string;
    readonly matchCase: boolean;
    readonly wholeWord: boolean;
    readonly matches: FindMatch[];
    readonly activeMatch: number;
    input: HTMLInputElement | undefined;
    replaceInput: HTMLInputElement | undefined;
    open: () => void;
    close: () => void;
    dispose: () => void;
    toggle: () => void;
    setQuery: (value: string) => void;
    setReplacement: (value: string) => void;
    setMatchCase: (value: boolean) => void;
    setWholeWord: (value: boolean) => void;
    previous: () => void;
    next: () => void;
    replace: () => void;
    replaceAll: () => void;
  };
}
export function createFileTreeController(host: ControllerHost) {
  let trashOpen = $state(false);

  async function createNote(parent = "", requestedName = ""): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    if (!(await host.settleDraft())) throw new Error("Save or recover the current draft first.");
    host.saveState = "loading";
    try {
      const name = normalizeFileName(requestedName || "Untitled");
      const path = joinPath(parent, name);
      const notes = await host.vault.listNotes();
      if (
        notes.some((note) => noteFilePath(note).toLocaleLowerCase() === path.toLocaleLowerCase())
      ) {
        throw new Error(`A file named “${name}” already exists here.`);
      }
      const note = await host.vault.saveNote({
        title: fileStem(name),
        markdown: "",
        sourcePath: path,
      });
      host.searchQuery = "";
      await host.loadNote(note.id);
      await host.refreshFileTree();
      requestAnimationFrame(() => host.editor?.focus());
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "A new note could not be created.";
      host.saveState = host.markdown === host.lastSavedMarkdown ? "saved" : "error";
      throw error;
    }
  }

  async function createFolder(parent = "", requestedName = ""): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    const name = normalizeFolderName(requestedName || "New folder");
    const path = joinPath(parent, name);
    host.folders = await host.vault.updateFolders((existing, notes) => {
      if (
        [
          ...existing.map((folder) => folder.path),
          ...notes.map((note) => noteFolderPath(note)),
        ].some((candidate) => isPathWithin(candidate.toLocaleLowerCase(), path.toLocaleLowerCase()))
      )
        throw new Error(`A folder named “${name}” already exists here.`);
      const now = new Date().toISOString();
      return [...existing, { id: crypto.randomUUID(), path, createdAt: now, updatedAt: now }];
    });
    host.searchQuery = "";
    await host.refreshFileTree();
    host.pendingBackupCount = await host.vault.countPendingBackupOperations();
    host.storageError = "";
  }

  async function renameFile(noteId: string, requestedName: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    if (!(await host.settleDraft())) throw new Error("Save or recover the current draft first.");
    try {
      const note = await host.vault.getNote(noteId);
      if (!note) return;
      const name = normalizeFileName(requestedName);
      const path = joinPath(noteFolderPath(note), name);
      const notes = await host.vault.listNotes();
      if (
        notes.some(
          (candidate) =>
            candidate.id !== noteId &&
            noteFilePath(candidate).toLocaleLowerCase() === path.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`A file named “${name}” already exists here.`);
      }
      await host.vault.moveNote(note.id, path, host.attachmentFolder);
      if (host.activeNoteId) await host.loadNote(host.activeNoteId);
      host.storageError = "";
      await host.refreshFileTree();
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
    } catch (error) {
      host.storageError = error instanceof Error ? error.message : "The file could not be renamed.";
      throw error;
    }
  }

  function isAttachmentFolderPath(path: string): boolean {
    return path === host.attachmentFolder || path.startsWith(`${host.attachmentFolder}/`);
  }

  async function renameFolder(path: string, requestedName: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    if (!(await host.settleDraft())) throw new Error("Save or recover the current draft first.");
    if (path === host.attachmentFolder) {
      if (!(await host.renameAttachmentFolder(requestedName)))
        throw new Error(host.storageError || "The folder could not be renamed.");
      return;
    }
    try {
      await relocateFolder(path, joinPath(parentPath(path), normalizeFolderName(requestedName)));
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The folder could not be renamed.";
      throw error;
    }
  }

  async function updateFolderAppearance(
    path: string,
    changes: Pick<Partial<FolderMetadata>, "icon" | "pinned">,
  ): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    host.folders = await host.vault.updateFolders((existing) => {
      const current = existing.find((folder) => folder.path === path);
      if (!current && !changes.icon && !changes.pinned) return existing;
      const now = new Date().toISOString();
      const next: FolderMetadata = {
        ...(current ?? { id: crypto.randomUUID(), path, createdAt: now }),
        ...changes,
        updatedAt: now,
      };
      if (!next.icon) delete next.icon;
      if (!next.pinned) delete next.pinned;
      return current
        ? existing.map((folder) => (folder.path === path ? next : folder))
        : [...existing, next];
    });
    host.pendingBackupCount = await host.vault.countPendingBackupOperations();
    host.storageError = "";
  }

  async function setFolderIcon(path: string, icon?: FolderIcon): Promise<void> {
    if (isAttachmentFolderPath(path)) return;
    await updateFolderAppearance(path, { icon });
  }

  async function setFolderPinned(path: string, pinned: boolean): Promise<void> {
    await updateFolderAppearance(path, { pinned });
  }

  async function setNotePinned(noteId: string, pinned: boolean): Promise<void> {
    if (
      !host.vault ||
      host.transferController.transferState === "working" ||
      !(await host.settleDraft())
    )
      return;
    try {
      const changed = await host.vault.setNotePinned(noteId, pinned);
      if (!changed) return;
      if (host.activeNoteId) await host.loadNote(host.activeNoteId);
      await host.refreshFileTree();
      host.storageError = "";
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The file pin could not be saved.";
    }
  }

  async function moveFile(noteId: string, targetFolder: string): Promise<void> {
    if (
      !host.vault ||
      host.transferController.transferState === "working" ||
      !(await host.settleDraft())
    )
      return;
    try {
      const note = await host.vault.getNote(noteId);
      if (!note) return;
      await host.vault.moveNote(
        noteId,
        joinPath(targetFolder, basename(noteFilePath(note))),
        host.attachmentFolder,
      );
      if (host.activeNoteId) await host.loadNote(host.activeNoteId);
      await host.refreshFileTree();
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
    } catch (error) {
      host.storageError = error instanceof Error ? error.message : "The file could not be moved.";
    }
  }

  async function relocateFolder(path: string, nextPath: string): Promise<void> {
    if (!host.vault || path === nextPath) return;
    await host.vault.moveFolder(
      path,
      nextPath,
      host.attachmentFolder,
      isAttachmentFolderPath(path),
    );
    if (host.activeNoteId) await host.loadNote(host.activeNoteId);
    await host.refreshFileTree();
    host.pendingBackupCount = await host.vault.countPendingBackupOperations();
    host.storageError = "";
  }

  async function moveFolder(path: string, targetParent: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    if (isPathWithin(targetParent, path)) {
      host.storageError = "A folder cannot be moved into itself or one of its children.";
      return;
    }
    if (!(await host.settleDraft())) return;
    try {
      await relocateFolder(path, joinPath(targetParent, basename(path)));
    } catch (error) {
      host.storageError = error instanceof Error ? error.message : "The folder could not be moved.";
    }
  }

  async function deleteFile(noteId: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    const note = await host.vault.getNote(noteId);
    if (!note || note.deletedAt) return;
    if (!(await host.settleDraft())) return;
    try {
      await host.vault.trashNote(noteId);
      const notes = await host.refreshFileTree();
      if (host.activeNoteId === noteId) {
        if (notes[0]) await host.loadNote(notes[0].id);
        else host.resetActiveNote();
      }
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError = error instanceof Error ? error.message : "The file could not be deleted.";
    }
  }

  async function deleteFolder(path: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    const notes = await host.vault.listNotes();
    const affectedNotes = notes.filter((note) => {
      const folder = noteFolderPath(note);
      return folder === path || folder.startsWith(`${path}/`);
    });
    const attached = isAttachmentFolderPath(path)
      ? (await host.vault.listAttachments()).filter(
          (attachment) =>
            attachment.sourcePath &&
            (attachment.sourcePath === path || attachment.sourcePath.startsWith(`${path}/`)),
        )
      : [];
    if (!(await host.settleDraft())) return;
    try {
      await host.vault.updateFileTree((tree) => {
        const now = new Date().toISOString();
        for (const note of tree.notes)
          if (!note.deletedAt && isPathWithin(noteFolderPath(note), path)) note.deletedAt = now;
        if (attached.length)
          tree.attachments = tree.attachments.filter(
            (attachment) => !attachment.sourcePath || !isPathWithin(attachment.sourcePath, path),
          );
        tree.folders = tree.folders.filter((folder) => !isPathWithin(folder.path, path));
      });
      const remaining = await host.refreshFileTree();
      if (host.activeNoteId && affectedNotes.some((note) => note.id === host.activeNoteId)) {
        if (remaining[0]) await host.loadNote(remaining[0].id);
        else host.resetActiveNote();
      } else if (host.activeNoteId) {
        await host.loadNote(host.activeNoteId);
      }
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The folder could not be deleted.";
    }
  }

  async function deleteAttachment(id: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    const currentVault = host.vault;
    try {
      const attachment = await currentVault.deleteAttachment(id);
      if (!attachment) return;
      if (host.imagePreview?.id === attachment.id) host.closeImagePreview();
      if (attachment.sourcePath) {
        const retained = host.localAttachmentUrls.filter(
          (candidate) => candidate.sourcePath !== attachment.sourcePath,
        );
        if (retained.length !== host.localAttachmentUrls.length) {
          for (const candidate of host.localAttachmentUrls) {
            if (candidate.sourcePath === attachment.sourcePath) URL.revokeObjectURL(candidate.url);
          }
          host.localAttachmentUrls = retained;
          host.preview.invalidate();
        }
      }
      await host.refreshFileTree();
      host.pendingBackupCount = await currentVault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The attachment could not be deleted.";
    }
  }

  async function restoreFile(noteId: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    if (!(await host.settleDraft())) return;
    try {
      const restored = await host.vault.restoreNote(noteId);
      if (!restored) return;
      await host.refreshFileTree();
      trashOpen = false;
      await host.selectNote(noteId);
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The file could not be restored.";
    }
  }

  async function purgeFile(noteId: string): Promise<void> {
    if (!host.vault || host.transferController.transferState === "working") return;
    const note = await host.vault.getNote(noteId);
    if (!note?.deletedAt) return;
    const confirmed = await host.confirmation.ask({
      eyebrow: "Trash",
      title: "Delete forever?",
      message: `“${fileStem(noteFilePath(note))}” and its attachments will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!confirmed) return;
    if (!(await host.settleDraft())) return;
    try {
      await host.vault.purgeNote(noteId, note.deletedAt);
      await host.refreshFileTree();
      if (host.activeNoteId === noteId) {
        const notes = await host.vault.listNotes();
        if (notes[0]) await host.loadNote(notes[0].id);
        else host.resetActiveNote();
      }
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError =
        error instanceof Error ? error.message : "The file could not be permanently deleted.";
    }
  }

  async function emptyTrash(): Promise<void> {
    if (
      !host.vault ||
      host.transferController.transferState === "working" ||
      host.trashedNotes.length === 0
    )
      return;
    const count = host.trashedNotes.length;
    const confirmed = await host.confirmation.ask({
      eyebrow: "Trash",
      title: "Empty trash?",
      message: `${count} ${count === 1 ? "note" : "notes"} in Trash will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Empty trash",
      danger: true,
    });
    if (!confirmed) return;
    if (!(await host.settleDraft())) return;
    try {
      await host.vault.emptyTrash();
      await host.refreshFileTree();
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      host.storageError = "";
    } catch (error) {
      host.storageError = error instanceof Error ? error.message : "Trash could not be emptied.";
    }
  }

  function toggleTrash(): void {
    if (!trashOpen) {
      if (host.paletteOpen) host.closePalette();
      host.find.close();
    }
    trashOpen = !trashOpen;
  }

  async function copyFilePath(path: string): Promise<void> {
    await host.transferController.copyToClipboard(() => navigator.clipboard.writeText(path));
  }
  return {
    createNote,
    createFolder,
    renameFile,
    isAttachmentFolderPath,
    renameFolder,
    updateFolderAppearance,
    setFolderIcon,
    setFolderPinned,
    setNotePinned,
    moveFile,
    relocateFolder,
    moveFolder,
    deleteFile,
    deleteFolder,
    deleteAttachment,
    restoreFile,
    purgeFile,
    emptyTrash,
    toggleTrash,
    copyFilePath,
    get trashOpen() {
      return trashOpen;
    },
    set trashOpen(value) {
      trashOpen = value;
    },
  };
}
