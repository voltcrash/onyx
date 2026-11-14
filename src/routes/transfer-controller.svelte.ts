import type { TransferState } from "#lib/components/app-types.ts";
import type { NoteFormat } from "#lib/components/note-formats.ts";
import {
  resolveLocalAttachmentUrl,
  titleFromMarkdown,
  type LocalAttachmentUrl,
} from "#lib/markdown-utils.ts";
import { Vault } from "#lib/storage/index.ts";
import type { NoteMetadata } from "#lib/storage/types.ts";
import { downloadBlob, type NoteSource } from "#lib/note-output.ts";
import type { MarkdownTransferFile } from "#lib/markdown-transfer.ts";
import { tick } from "svelte";
interface ControllerHost {
  vault: Vault | undefined;
  settleDraft: () => Promise<boolean>;
  searchQuery: string;
  loadNote: (id: string) => Promise<void>;
  resetActiveNote: () => void;
  refreshFileTree: () => Promise<NoteMetadata[]>;
  pendingBackupCount: number;
  markdown: string;
  localAttachmentUrls: LocalAttachmentUrl[];
  activeNoteSourcePath: string | undefined;
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
  activeNoteId: string;
  noteTitle: string;
  noteOutput: {
    copy: (
      source: NoteSource,
      format: import("#lib/note-output.ts").CopyableNoteFormat,
    ) => Promise<void>;
    download: (
      source: NoteSource,
      format: import("#lib/note-output.ts").CopyableNoteFormat,
    ) => void | Promise<void>;
  };
  selectNote: (id: string) => Promise<void>;
}
export function createTransferController(host: ControllerHost) {
  let printing = $state(false);

  let printHtml = $state("");

  let transferState = $state<TransferState>("idle");

  let transferMessage = $state("");

  let folderInput: HTMLInputElement | undefined = $state();

  let zipInput: HTMLInputElement | undefined = $state();

  async function importFolder(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    try {
      const { readMarkdownFolder } = await import("#lib/markdown-transfer.ts");
      await runImport(readMarkdownFolder(files));
    } catch (error) {
      showTransferError(error, "The folder could not be imported.");
    } finally {
      if (folderInput) folderInput.value = "";
    }
  }

  async function importZip(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    transferState = "working";
    transferMessage = "";
    try {
      const { readMarkdownZip } = await import("#lib/markdown-transfer.ts");
      const entries = await readMarkdownZip(file);
      transferState = "idle";
      await runImport(entries);
    } catch (error) {
      showTransferError(error, "The ZIP archive could not be imported.");
    } finally {
      if (zipInput) zipInput.value = "";
    }
  }

  async function runImport(files: MarkdownTransferFile[]): Promise<void> {
    if (!host.vault || transferState === "working") return;
    transferState = "working";
    transferMessage = "";
    if (!(await host.settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { importMarkdownFiles } = await import("#lib/markdown-transfer.ts");
      await importMarkdownFiles(host.vault, files);
      host.searchQuery = "";
      const notes = await host.vault.listNotes();
      if (notes[0]) await host.loadNote(notes[0].id);
      else host.resetActiveNote();
      await host.refreshFileTree();
      host.pendingBackupCount = await host.vault.countPendingBackupOperations();
      transferState = "idle";
    } catch (error) {
      showTransferError(error, "The notes could not be imported.");
    }
  }

  async function savePdf(): Promise<void> {
    const source = host.markdown;
    const attachments = host.localAttachmentUrls;
    const path = host.activeNoteSourcePath;
    await import("./styles/print.css");
    const renderer = await host.preview.loadMarkdownModule();
    printHtml = renderer.renderMarkdown(source, (destination) =>
      resolveLocalAttachmentUrl(destination, path, attachments),
    );
    printing = true;
    try {
      await tick();
      window.print();
    } finally {
      printing = false;
      printHtml = "";
    }
  }

  async function noteSource(id: string): Promise<NoteSource | undefined> {
    if (id === host.activeNoteId) return { markdown: host.markdown, title: host.noteTitle };
    const note = await host.vault?.getNote(id);
    return note && { markdown: note.markdown, title: titleFromMarkdown(note.markdown) };
  }

  async function copyToClipboard(write: () => Promise<void>): Promise<void> {
    if (transferState === "working") return;
    try {
      await write();
    } catch (error) {
      transferMessage =
        error instanceof Error ? error.message : "The clipboard could not be written.";
    }
  }

  async function copyNoteAs(id: string, format: Exclude<NoteFormat, "pdf">): Promise<void> {
    await copyToClipboard(async () => {
      const source = await noteSource(id);
      if (source) await host.noteOutput.copy(source, format);
    });
  }

  async function exportNoteAs(id: string, format: NoteFormat): Promise<void> {
    try {
      if (format === "pdf") {
        if (id !== host.activeNoteId) await host.selectNote(id);
        if (id === host.activeNoteId) await savePdf();
        return;
      }
      const source = await noteSource(id);
      if (source) await host.noteOutput.download(source, format);
    } catch (error) {
      showTransferError(error, "The note could not be exported.");
    }
  }

  async function exportZip(): Promise<void> {
    if (!host.vault || transferState === "working") return;
    transferState = "working";
    transferMessage = "";
    if (!(await host.settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { createMarkdownExport, createMarkdownZip } = await import("#lib/markdown-transfer.ts");
      const files = await createMarkdownExport(host.vault);
      const archive = await createMarkdownZip(files);
      downloadBlob(archive, `onyx-markdown-${new Date().toISOString().slice(0, 10)}.zip`);
      transferState = "idle";
    } catch (error) {
      showTransferError(error, "The ZIP archive could not be created.");
    }
  }

  async function exportFolder(): Promise<void> {
    if (!host.vault || transferState === "working") return;
    const picker = (
      window as Window & {
        showDirectoryPicker?: (options?: {
          mode: "readwrite";
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      showTransferError(
        undefined,
        "This browser cannot export to a folder. Export a ZIP archive instead.",
      );
      return;
    }
    try {
      const directory = await picker.call(window, { mode: "readwrite" });
      transferState = "working";
      transferMessage = "";
      if (!(await host.settleDraft())) {
        transferState = "idle";
        return;
      }
      const { createMarkdownExport, writeMarkdownFolder } =
        await import("#lib/markdown-transfer.ts");
      const files = await createMarkdownExport(host.vault);
      await writeMarkdownFolder(directory, files);
      transferState = "idle";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showTransferError(error, "The notes could not be exported to that folder.");
    } finally {
      if (transferState === "working") transferState = "idle";
    }
  }

  function showTransferError(error: unknown, fallback: string): void {
    transferState = "error";
    transferMessage = error instanceof Error && error.message ? error.message : fallback;
  }
  return {
    importFolder,
    importZip,
    runImport,
    savePdf,
    noteSource,
    copyToClipboard,
    copyNoteAs,
    exportNoteAs,
    exportZip,
    exportFolder,
    showTransferError,
    get transferState() {
      return transferState;
    },
    set transferState(value) {
      transferState = value;
    },
    get transferMessage() {
      return transferMessage;
    },
    set transferMessage(value) {
      transferMessage = value;
    },
    get folderInput() {
      return folderInput;
    },
    set folderInput(value) {
      folderInput = value;
    },
    get zipInput() {
      return zipInput;
    },
    set zipInput(value) {
      zipInput = value;
    },
    get printing() {
      return printing;
    },
    set printing(value) {
      printing = value;
    },
    get printHtml() {
      return printHtml;
    },
    set printHtml(value) {
      printHtml = value;
    },
  };
}
