import {
  ArrowLeftRight,
  Bold,
  Braces,
  Eye,
  EyeOff,
  FolderPen,
  ImagePlus,
  CloudDownload,
  Code2,
  Columns2,
  Copy,
  CloudUpload,
  Download,
  FileArchive,
  FilePlus2,
  FileText,
  FolderInput,
  FolderOutput,
  HardDrive,
  Heading2,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Keyboard,
  Monitor,
  MessageSquareWarning,
  Minus,
  Moon,
  Pilcrow,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  Lock,
  ArrowDownUp,
  PanelRightClose,
  Printer,
  Rows2,
  Save,
  Search,
  Settings,
  Sigma,
  Sun,
  Strikethrough,
  Trash2,
  Type,
  Quote,
} from "@lucide/svelte";
import type {
  BackupState,
  GithubState,
  PaneEdge,
  PaneLayout,
  PaneOrder,
  RestoreState,
  SaveState,
  TransferState,
} from "$lib/components/app-types";
import { noteFormats, type NoteFormat } from "$lib/components/note-formats";
import type { SettingsSection } from "$lib/components/settings-types";
import { renderMarkdownBlocks as renderLiteMarkdownBlocks } from "$lib/markdown-lite";
import {
  attachmentMarkdown,
  DEFAULT_ATTACHMENT_FOLDER,
  normalizeAttachmentFolder,
  resolveLocalAttachmentUrl,
  rewriteLocalLinks,
  titleFromMarkdown,
  type LocalAttachmentUrl,
} from "$lib/markdown-utils";
import {
  browserStorageWarnings,
  detectBrowserStorageSupport,
  persistenceDeniedMessage,
  readLocalStorage,
  writeLocalStorage,
} from "$lib/browser-storage";
import {
  applyFontChoices,
  defaultFontCategories,
  defaultFontChoices,
  fontCategory,
  fontOptionsFor,
  readFontCategories,
  readFontChoices,
  writeFontCategory,
  type FontCategories,
  type FontCategory,
  type FontChoices,
  type FontRole,
} from "$lib/fonts";
import { loadFont } from "$lib/font-loader";
import {
  defaultKeyboardShortcuts,
  detectPrimaryModifier,
  formatShortcut,
  readKeyboardShortcuts,
  shortcutsEqual,
  shortcutMatchesEvent,
  writeKeyboardShortcuts,
  type KeyboardShortcut,
  type KeyboardShortcuts,
  type PrimaryModifier,
  type ShortcutAction,
} from "$lib/keyboard-shortcuts";
import {
  createVaultDescriptor,
  isDefaultVault,
  normalizeVaultName,
  readVaultRegistry,
  suggestedRepositoryName,
  uniqueVaultName,
  vaultOptions,
  Vault,
  writeVaultRegistry,
  type VaultChangeEvent,
  type VaultDescriptor,
  type VaultSearchResult,
} from "$lib/storage/index";
import type { GithubBackupCommit, GithubUser } from "$lib/github";
import type {
  AttachmentMetadata,
  FolderMetadata,
  GithubBackupState,
  NoteMetadata,
} from "$lib/storage/types";
import {
  applyColorTheme,
  applyTheme,
  nextThemePreference,
  readColorTheme,
  readThemePreference,
  watchSystemTheme,
  type ColorTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "$lib/theme";
import { findTextMatches, type FindMatch } from "$lib/find-replace";
import { outputFileName } from "$lib/output-utils";
import type { MarkdownTransferFile } from "$lib/markdown-transfer";
import { onMount, tick } from "svelte";

const NOTE_PAGE_SIZE = 100;
const PREVIEW_DELAY_MS = 120;
const DEFAULT_CONTENT_WIDTH = 700;
const DEFERRED_STARTUP_DELAY_MS = 8_000;
// Matches the single-column breakpoint in the responsive stylesheet.
const NARROW_VIEWPORT = "(max-width: 900px)";
const EDITOR_HISTORY_LIMIT = 200;
const MARKDOWN_EXTENSION = ".md";

const noteFormatPaletteNames: Record<NoteFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "plain text",
  "rich-text": "rich text",
  pdf: "PDF",
};

const noteFormatPaletteKeywords: Record<NoteFormat, string> = {
  markdown: "markdown md source",
  html: "html web page source",
  text: "plain text txt",
  "rich-text": "rtf rich text formatted word document email paste",
  pdf: "pdf paper print",
};

const noteFormatExportLabels: Record<NoteFormat, string> = {
  markdown: "Download this note as Markdown",
  html: "Download this note as HTML",
  text: "Download this note as plain text",
  "rich-text": "Download this note as rich text",
  pdf: "Save this note as a PDF",
};

const noteFormatExportIds: Record<NoteFormat, string> = {
  markdown: "download-markdown",
  html: "download-html",
  text: "download-text",
  "rich-text": "download-rtf",
  pdf: "save-pdf",
};

const noteFormatExportIcons = {
  markdown: FileText,
  html: Code2,
  text: Type,
  "rich-text": Pilcrow,
  pdf: Printer,
};

type GithubModule = typeof import("$lib/github");
type LazyStylesModule = typeof import("$lib/lazy-styles");
type MarkdownModule = typeof import("$lib/markdown");
type MarkdownOutputModule = typeof import("$lib/markdown-output");

let githubModulePromise: Promise<GithubModule> | undefined;
let lazyStylesModulePromise: Promise<LazyStylesModule> | undefined;

function loadGithubModule(): Promise<GithubModule> {
  return (githubModulePromise ??= import("$lib/github"));
}

function loadLazyStylesModule(): Promise<LazyStylesModule> {
  return (lazyStylesModulePromise ??= import("$lib/lazy-styles"));
}

type SidebarState = { collapsed: boolean; open: boolean };
type SidebarSide = "left" | "right";

const SIDEBAR_DRAG_HOLD_MS = 300;
const SIDEBAR_DRAG_SLOP_PX = 6;

interface EditorSelection {
  start: number;
  end: number;
}

interface EditorHistoryEntry {
  markdown: string;
  selection?: EditorSelection;
}

function pathParts(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function parentPath(path: string): string {
  return pathParts(path).slice(0, -1).join("/");
}

function joinPath(parent: string, name: string): string {
  return [...pathParts(parent), name].join("/");
}

function isPathWithin(path: string, parent: string): boolean {
  return !parent || path === parent || path.startsWith(`${parent}/`);
}

function movePath(path: string, from: string, to: string): string {
  const suffix = path.slice(from.length).replace(/^\/+/, "");
  return suffix ? joinPath(to, suffix) : to;
}

function basename(path: string): string {
  return pathParts(path).at(-1) ?? "";
}

function noteFilePath(note: Pick<NoteMetadata, "sourcePath" | "title">): string {
  const sourcePath = note.sourcePath?.trim();
  if (sourcePath) return sourcePath;
  const fallback = (note.title || "Untitled").replace(/[\\/]+/g, "-").trim() || "Untitled";
  return `${fallback}${MARKDOWN_EXTENSION}`;
}

function noteFolderPath(note: Pick<NoteMetadata, "sourcePath" | "title">): string {
  return parentPath(noteFilePath(note));
}

function fileStem(path: string): string {
  return basename(path).replace(/\.(?:md|markdown)$/i, "") || "Untitled";
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return true;
  }
  return false;
}

function normalizeFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new Error("File names cannot be empty or contain slashes.");
  }
  if (hasControlCharacters(trimmed)) {
    throw new Error("File names cannot contain control characters.");
  }
  return /\.(?:md|markdown)$/i.test(trimmed) ? trimmed : `${trimmed}${MARKDOWN_EXTENSION}`;
}

function normalizeFolderName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new Error("Folder names cannot be empty or contain slashes.");
  }
  if (hasControlCharacters(trimmed)) {
    throw new Error("Folder names cannot contain control characters.");
  }
  return trimmed;
}

export function createPageController() {
  function createInitialMarkdown(primaryModifier: PrimaryModifier): string {
    const commandPaletteShortcut = primaryModifier === "meta" ? "⌘ K" : "Ctrl + K";
    const saveShortcut = primaryModifier === "meta" ? "⌘ S" : "Ctrl + S";
    const previewShortcut = primaryModifier === "meta" ? "⌘ ⇧ P" : "Ctrl + Shift + P";
    return `# Welcome to Onyx

Onyx is a quiet place to think in Markdown. Your work stays on this device and saves automatically as you write.

## Find anything quickly

Create as many notes as you need. Search checks every title and every word, while the index stays on this device.

> Good tools disappear into the work.

### Today’s notes

- [x] Open a fresh page
- [ ] Capture the next idea
- [ ] Shape it into something useful

Onyx starts in private browser storage (OPFS) without an account. In browsers that support choosing persistent folders, you can mirror this vault to one from **Settings → Storage choices**. GitHub sign-in is optional and only enables backup and cross-device restore.

Press \`${commandPaletteShortcut}\` for the command palette, \`${saveShortcut}\` to save now, or \`${previewShortcut}\` to toggle the rendered pane. Press \`?\` for every shortcut.`;
  }

  const initialMarkdown = createInitialMarkdown("meta");

  let vault = $state<Vault>();
  let vaults = $state<VaultDescriptor[]>([]);
  let activeVaultId = $state("");
  let activeNoteId = $state("");
  let noteRevision = $state(0);
  let markdown = $state(initialMarkdown);
  let previewMarkdown = $state(initialMarkdown);
  let lastSavedMarkdown = $state(initialMarkdown);
  let results = $state<VaultSearchResult[]>([]);
  let folders = $state<FolderMetadata[]>([]);
  let notePage = $state(0);
  let searchQuery = $state("");
  let singlePaneMode = $state(false);
  let sourcePaneVisible = $state(true);
  let renderedPaneVisible = $state(true);
  let scrollSync = $state(true);
  let paneLayout = $state<PaneLayout>("columns");
  let paneOrder = $state<PaneOrder>("source-first");
  let splitRatio = $state(50);
  let contentWidth = $state(DEFAULT_CONTENT_WIDTH);
  let saveState = $state<SaveState>("loading");
  let notesLoaded = $state(false);
  let saveTimer: number | undefined = $state();
  let saveRun: Promise<boolean> | undefined;
  let saveRequested = false;
  let searchTimer: number | undefined = $state();
  let searchPending = $state(false);
  let previewTimer: number | undefined = $state();
  let searchSequence = 0;
  let editor: HTMLTextAreaElement | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();
  let findOpen = $state(false);
  let findQuery = $state("");
  let findReplacement = $state("");
  let findMatchCase = $state(false);
  let findWholeWord = $state(false);
  let findMatchIndex = $state(-1);
  let findInput: HTMLInputElement | undefined = $state();
  let findReplaceInput: HTMLInputElement | undefined = $state();
  let findOpener: HTMLElement | undefined = $state();
  let findSidebarState: SidebarState | undefined;
  let findNavigationSequence = 0;
  let sidebarOpen = $state(false);
  let storageError = $state("");
  let storageNotice = $state("");
  let isOnline = $state(true);
  let githubUser = $state<GithubUser>();
  let githubState = $state<GithubState>("disconnected");
  let githubMessage = $state("");
  let githubBackup = $state<GithubBackupState>();
  let backupState = $state<BackupState>("idle");
  let backupMessage = $state("");
  let backupCommitUrl = $state("");
  let settingsOpen = $state(false);
  let settingsSection = $state<SettingsSection>("editor");
  let pendingBackupCount = $state(0);
  let restoreModalOpen = $state(false);
  let restoreState = $state<RestoreState>("idle");
  let restoreMessage = $state("");
  let restoreCommits = $state<GithubBackupCommit[]>([]);
  let selectedRestoreSha = $state("");
  let restoreOwner = $state("");
  let restoreRepository = $state("onyx-vault");
  let restoreBranch = $state("main");
  let restoreDirectory = $state("vault");
  let transferState = $state<TransferState>("idle");
  let folderInput: HTMLInputElement | undefined = $state();
  let zipInput: HTMLInputElement | undefined = $state();
  let attachmentInput: HTMLInputElement | undefined = $state();
  let attachmentFolder = $state(DEFAULT_ATTACHMENT_FOLDER);
  let attachmentsHidden = $state(false);
  let vaultAttachments = $state<AttachmentMetadata[]>([]);
  let trashedNotes = $state<NoteMetadata[]>([]);
  let trashOpen = $state(false);
  let theme = $state<ThemePreference>("system");
  let resolvedTheme = $state<ResolvedTheme>("light");
  let colorTheme = $state<ColorTheme>("ember");
  let fonts = $state<FontChoices>({ ...defaultFontChoices });
  let fontCategories = $state<FontCategories>({ ...defaultFontCategories });
  let paletteOpen = $state(false);
  let paletteNotes = $state<NoteMetadata[]>([]);
  let recentNoteIds = $state<string[]>([]);
  let sidebarCollapsed = $state(false);
  let sidebarSide = $state<SidebarSide>("left");
  let sidebarDropSide = $state<SidebarSide | undefined>();
  let shortcuts = $state<KeyboardShortcuts>(structuredClone(defaultKeyboardShortcuts));
  let primaryModifier = $state<PrimaryModifier>("meta");
  let undoStack: EditorHistoryEntry[] = [];
  let redoStack: EditorHistoryEntry[] = [];
  let pendingEditorState: EditorHistoryEntry | undefined;
  let applyingEditorHistory = false;
  let noteList: HTMLElement | undefined = $state();
  let activeNoteSourcePath: string | undefined = $state();
  let localAttachmentUrls = $state<LocalAttachmentUrl[]>([]);
  let markdownModule: MarkdownModule | undefined;
  let markdownModulePromise: Promise<MarkdownModule> | undefined;
  let markdownModuleRevision = $state(0);
  let markdownOutputModulePromise: Promise<MarkdownOutputModule> | undefined;
  let dialogStylesPromise: Promise<void> | undefined;
  let serviceWorkerTimer: number | undefined;
  let githubRestoreTimer: number | undefined;
  let settingsOpener: HTMLElement | undefined;
  let paletteOpener: HTMLElement | undefined;
  let paletteSidebarState: SidebarState | undefined;
  let unsubscribeVault: (() => void) | undefined;
  let remoteSyncRun: Promise<void> | undefined;
  let remoteSyncRequested = false;
  const remoteChanges: VaultChangeEvent[] = [];
  let noteLoadSequence = 0;
  let fontRevision = 0;
  let clearingVault = false;

  const activeVault = $derived(
    vaults.find((candidate) => candidate.id === activeVaultId) ?? vaults[0],
  );
  const wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
  const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
  const renderedBlocks = $derived.by(() => {
    void markdownModuleRevision;
    return renderMarkdownBlocksForPage(previewMarkdown, resolveAttachmentUrl);
  });
  const renderedMarkdown = $derived(renderedBlocks.map((block) => block.html).join(""));
  const renderedBlockLines = $derived(
    renderedBlocks.filter((block) => block.element).map((block) => block.lines),
  );
  const noteTitle = $derived(titleFromMarkdown(markdown));
  const markdownLines = $derived(markdown.split("\n"));
  const findMatches = $derived.by(() =>
    findTextMatches(markdown, findQuery, {
      matchCase: findMatchCase,
      wholeWord: findWholeWord,
    }),
  );
  const activeFindMatch = $derived(
    findMatches.length > 0 ? Math.min(Math.max(findMatchIndex, 0), findMatches.length - 1) : -1,
  );
  const findCanEdit = $derived(saveState !== "loading" && transferState !== "working");
  const notePageCount = $derived(Math.max(1, Math.ceil(results.length / NOTE_PAGE_SIZE)));
  const visibleResults = $derived(
    results.slice(notePage * NOTE_PAGE_SIZE, (notePage + 1) * NOTE_PAGE_SIZE),
  );
  const hasContent = $derived(markdown.trim().length > 0);
  // Narrow viewports show one pane at a time, where neither arrangement is visible.
  const effectivePaneLayout = $derived<PaneLayout>(singlePaneMode ? "columns" : paneLayout);

  const recentNotes = $derived(
    recentNoteIds
      .map((id) => paletteNotes.find((note) => note.id === id))
      .filter((note): note is NoteMetadata => Boolean(note)),
  );
  const fontsAreDefault = $derived(
    (Object.keys(defaultFontChoices) as FontRole[]).every(
      (role) => fonts[role] === defaultFontChoices[role],
    ),
  );
  const shortcutsAreDefault = $derived(
    (Object.keys(defaultKeyboardShortcuts) as ShortcutAction[]).every((action) =>
      shortcutsEqual(shortcuts[action], defaultKeyboardShortcuts[action]),
    ),
  );
  function paletteNoteItem(
    note: NoteMetadata,
    id: string,
    group: string,
    hint: string,
    keywords: string,
  ) {
    return {
      id,
      group,
      label: note.title || "Untitled",
      hint,
      icon: FileText,
      keywords,
      run: () => void selectNote(note.id),
    };
  }

  const paletteNoteItems = $derived.by(() => {
    if (searchQuery.trim()) {
      if (searchPending) return [];
      return results.map((result) =>
        paletteNoteItem(
          result.note,
          `search-note-${result.note.id}`,
          "Notes",
          result.excerpt || "Title match",
          `${searchQuery} note open jump ${result.note.sourcePath ?? ""} ${result.excerpt}`,
        ),
      );
    }

    return [
      ...recentNotes.map((note) =>
        paletteNoteItem(
          note,
          `recent-note-${note.id}`,
          "Recent",
          note.id === activeNoteId ? "Open note" : formatNoteDate(note.updatedAt),
          "recent note open jump",
        ),
      ),
      ...paletteNotes.map((note) =>
        paletteNoteItem(
          note,
          `note-${note.id}`,
          "Notes",
          note.id === activeNoteId ? "Open note" : formatNoteDate(note.updatedAt),
          "note open jump",
        ),
      ),
    ];
  });

  function noteTransferPaletteItems() {
    return noteFormats.flatMap((format) => {
      const name = noteFormatPaletteNames[format.id];
      const keywords = noteFormatPaletteKeywords[format.id];
      const items = [];
      if (format.id !== "pdf" && format.copyable) {
        const copyFormat = format.id as Exclude<NoteFormat, "pdf">;
        items.push({
          id: `copy-${copyFormat}`,
          group: "Transfer",
          label: `Copy this note as ${name}`,
          icon: Copy,
          keywords: `clipboard ${keywords}`,
          disabled: !hasContent,
          run: () => void copyNoteAs(activeNoteId, copyFormat),
        });
      }
      items.push({
        id: noteFormatExportIds[format.id],
        group: "Transfer",
        label: noteFormatExportLabels[format.id],
        icon: noteFormatExportIcons[format.id],
        keywords: `export ${keywords} save`,
        disabled: !hasContent,
        run: () => void exportNoteAs(activeNoteId, format.id),
      });
      return items;
    });
  }

  const paletteItems = $derived([
    ...paletteNoteItems,
    {
      id: "new-note",
      group: "Actions",
      label: "New note",
      shortcut: shortcutLabel("newNote"),
      icon: FilePlus2,
      keywords: "create add page",
      aliases: ["create note", "quick note"],
      disabled: transferState === "working",
      run: () => void createNote(),
    },
    {
      id: "save",
      group: "Actions",
      label: "Save note",
      shortcut: shortcutLabel("saveNote"),
      icon: Save,
      keywords: "write store",
      disabled: saveState === "saving" || transferState === "working",
      run: () => void saveDraft(),
    },
    {
      id: "open-trash",
      group: "View",
      label: trashOpen ? "Close trash" : "Open trash",
      hint: trashedNotes.length ? `${trashedNotes.length}` : undefined,
      icon: Trash2,
      keywords: "trash deleted restore bin",
      disabled: transferState === "working",
      run: () => toggleTrash(),
    },
    {
      id: "empty-trash",
      group: "Actions",
      label: "Empty trash",
      hint: trashedNotes.length ? `${trashedNotes.length}` : undefined,
      icon: Trash2,
      keywords: "trash deleted restore purge permanent delete",
      disabled: transferState === "working" || trashedNotes.length === 0,
      run: () => void emptyTrash(),
    },
    {
      id: "attach-file",
      group: "Actions",
      label: "Add image or file",
      icon: ImagePlus,
      keywords: "attach attachment photo picture image upload insert file",
      aliases: ["insert image", "add photo"],
      disabled: transferState === "working" || !activeNoteId,
      run: () => attachmentInput?.click(),
    },
    {
      id: "toggle-attachments-folder",
      group: "View",
      label: attachmentsHidden ? "Show attachments folder" : "Hide attachments folder",
      hint: attachmentFolder,
      icon: attachmentsHidden ? Eye : EyeOff,
      keywords: "attachments images files folder sidebar hide show toggle",
      run: () => setAttachmentsHidden(!attachmentsHidden),
    },
    {
      id: "rename-attachments-folder",
      group: "Actions",
      label: "Rename attachments folder",
      hint: attachmentFolder,
      icon: FolderPen,
      keywords: "attachments images files folder rename move settings",
      run: () => void openSettings("editor"),
    },
    {
      id: "find-in-note",
      group: "Actions",
      label: "Find in note",
      shortcut: shortcutLabel("findInNote"),
      icon: Search,
      keywords: "find replace current note text",
      run: () => openFind(),
    },
    {
      id: "bold",
      group: "Formatting",
      label: "Bold",
      shortcut: shortcutLabel("bold"),
      icon: Bold,
      keywords: "strong emphasis format",
      run: () => insertSyntax("**", "**", "bold text"),
    },
    {
      id: "italic",
      group: "Formatting",
      label: "Italic",
      shortcut: shortcutLabel("italic"),
      icon: Italic,
      keywords: "emphasis slant format",
      run: () => insertSyntax("_", "_", "italic text"),
    },
    {
      id: "strikethrough",
      group: "Formatting",
      label: "Strikethrough",
      icon: Strikethrough,
      keywords: "strike delete format",
      run: () => insertSyntax("~~", "~~", "struck text"),
    },
    {
      id: "highlight",
      group: "Formatting",
      label: "Highlight",
      icon: Highlighter,
      keywords: "mark emphasize format",
      run: () => insertSyntax("==", "==", "highlighted text"),
    },
    {
      id: "heading",
      group: "Formatting",
      label: "Heading",
      icon: Heading2,
      keywords: "title header format",
      run: () => prefixLine("## "),
    },
    {
      id: "bulleted-list",
      group: "Formatting",
      label: "Bulleted list",
      icon: List,
      keywords: "unordered list format",
      run: () => prefixLine("- "),
    },
    {
      id: "numbered-list",
      group: "Formatting",
      label: "Numbered list",
      icon: ListOrdered,
      keywords: "ordered list format",
      run: () => prefixLine("1. "),
    },
    {
      id: "task-list",
      group: "Formatting",
      label: "Task list",
      icon: ListChecks,
      keywords: "checklist todo checkbox format",
      run: () => prefixLine("- [ ] "),
    },
    {
      id: "quote",
      group: "Formatting",
      label: "Quote",
      icon: Quote,
      keywords: "blockquote format",
      run: () => prefixLine("> "),
    },
    {
      id: "callout",
      group: "Formatting",
      label: "Callout",
      icon: MessageSquareWarning,
      keywords: "note admonition alert format",
      run: () => prefixLine("> [!NOTE]\n> "),
    },
    {
      id: "inline-code",
      group: "Formatting",
      label: "Inline code",
      icon: Code2,
      keywords: "code format",
      run: () => insertSyntax("`", "`", "code"),
    },
    {
      id: "code-block",
      group: "Formatting",
      label: "Code block",
      icon: Braces,
      keywords: "fenced code format",
      run: () => insertSyntax("```\n", "\n```", "code block"),
    },
    {
      id: "link",
      group: "Formatting",
      label: "Link",
      icon: Link,
      keywords: "url hyperlink format",
      run: () => insertSyntax("[", "](https://)", "link text"),
    },
    {
      id: "divider",
      group: "Formatting",
      label: "Divider",
      icon: Minus,
      keywords: "horizontal rule separator format",
      run: () => prefixLine("---\n"),
    },
    {
      id: "math",
      group: "Formatting",
      label: "Math",
      icon: Sigma,
      keywords: "equation latex formula format",
      run: () => insertSyntax("$$\n", "\n$$", "equation"),
    },
    {
      id: "toggle-source-pane",
      group: "View",
      label: sourcePaneVisible ? "Hide source pane" : "Show source pane",
      icon: PanelLeftClose,
      keywords: "write markdown source left pane",
      disabled: !singlePaneMode && sourcePaneVisible && !renderedPaneVisible,
      run: () => toggleSourcePane(),
    },
    {
      id: "toggle-rendered-pane",
      group: "View",
      label: renderedPaneVisible ? "Hide rendered pane" : "Show rendered pane",
      shortcut: shortcutLabel("togglePreview"),
      icon: PanelRightClose,
      keywords: "rendered preview right pane",
      disabled: !singlePaneMode && renderedPaneVisible && !sourcePaneVisible,
      run: () => toggleRenderedPane(),
    },
    {
      id: "swap-panes",
      group: "View",
      label: "Swap the pane positions",
      icon: ArrowLeftRight,
      keywords: "move switch sides order panes",
      disabled: singlePaneMode,
      run: () => swapPanes(),
    },
    {
      id: "toggle-pane-layout",
      group: "View",
      label: effectivePaneLayout === "rows" ? "Place the panes side by side" : "Stack the panes",
      icon: effectivePaneLayout === "rows" ? Columns2 : Rows2,
      keywords: "split horizontal vertical stack columns rows layout",
      disabled: singlePaneMode,
      run: () => togglePaneLayout(),
    },
    {
      id: "toggle-scroll-sync",
      group: "View",
      label: scrollSync ? "Turn off synced scrolling" : "Turn on synced scrolling",
      icon: ArrowDownUp,
      keywords: "auto scroll sync link panes follow source rendered",
      disabled: singlePaneMode,
      run: () => toggleScrollSync(),
    },
    {
      id: "toggle-sidebar",
      group: "View",
      label: sidebarCollapsed ? "Show the notes sidebar" : "Hide the notes sidebar",
      shortcut: shortcutLabel("toggleSidebar"),
      icon: PanelLeft,
      keywords: "panel files list",
      run: () => toggleSidebar(),
    },
    {
      id: "sidebar-left",
      group: "View",
      label: "Sidebar position: Left",
      icon: PanelLeft,
      keywords: "panel side position dock move",
      disabled: sidebarSide === "left",
      run: () => setSidebarSide("left"),
    },
    {
      id: "sidebar-right",
      group: "View",
      label: "Sidebar position: Right",
      icon: PanelRight,
      keywords: "panel side position dock move",
      disabled: sidebarSide === "right",
      run: () => setSidebarSide("right"),
    },
    {
      id: "theme-light",
      group: "Themes",
      label: "Use light mode",
      icon: Sun,
      keywords: "bright day colour color theme",
      disabled: theme === "light",
      run: () => setTheme("light"),
    },
    {
      id: "theme-dark",
      group: "Themes",
      label: "Use dark mode",
      icon: Moon,
      keywords: "night colour color theme",
      disabled: theme === "dark",
      run: () => setTheme("dark"),
    },
    {
      id: "theme-system",
      group: "Themes",
      label: "Use system mode",
      icon: Monitor,
      keywords: "automatic os operating system colour color theme",
      disabled: theme === "system",
      run: () => setTheme("system"),
    },
    {
      id: "backup",
      group: "Backup & sync",
      label: "Back up for cross-device sync",
      icon: CloudUpload,
      keywords: "commit push sync",
      disabled: !isOnline || githubState !== "connected",
      run: () => void beginBackup(),
    },
    {
      id: "restore",
      group: "Backup & sync",
      label: "Restore from a GitHub commit",
      icon: CloudDownload,
      keywords: "download history rollback",
      disabled: !isOnline || githubState !== "connected",
      run: () => void openRestore(),
    },
    {
      id: "import-folder",
      group: "Transfer",
      label: "Import a Markdown folder",
      icon: FolderInput,
      keywords: "open files load",
      run: () => folderInput?.click(),
    },
    {
      id: "import-zip",
      group: "Transfer",
      label: "Import a ZIP archive",
      icon: FileArchive,
      keywords: "open files load",
      run: () => zipInput?.click(),
    },
    {
      id: "export-folder",
      group: "Transfer",
      label: "Export to a folder",
      icon: FolderOutput,
      keywords: "save files write",
      run: () => void exportFolder(),
    },
    ...noteTransferPaletteItems(),
    {
      id: "export-zip",
      group: "Transfer",
      label: "Export a ZIP archive",
      icon: Download,
      keywords: "save download backup",
      run: () => void exportZip(),
    },
    {
      id: "settings",
      group: "Settings",
      label: "Editor settings",
      icon: Settings,
      keywords: "preferences options writing fonts typeface editor",
      aliases: ["preferences", "configuration"],
      run: () => openSettings("editor"),
    },
    {
      id: "reset-fonts",
      group: "Settings",
      label: "Restore default fonts",
      icon: Type,
      keywords: "editor typography reset appearance",
      disabled: fontsAreDefault,
      run: resetFonts,
    },
    {
      id: "settings-themes",
      group: "Settings",
      label: "Theme settings",
      icon: Sun,
      keywords: "appearance color mode light dark system",
      aliases: ["appearance", "color scheme"],
      run: () => openSettings("themes"),
    },
    {
      id: "shortcuts",
      group: "Settings",
      label: "Keyboard shortcuts",
      shortcut: shortcutLabel("openShortcuts"),
      icon: Keyboard,
      keywords: "help keys reference",
      run: () => openSettings("shortcuts"),
    },
    {
      id: "reset-shortcuts",
      group: "Settings",
      label: "Restore default keyboard shortcuts",
      icon: Keyboard,
      keywords: "keys reset defaults customize",
      disabled: shortcutsAreDefault,
      run: resetShortcuts,
    },
    {
      id: "settings-github",
      group: "Settings",
      label: "GitHub backup & sync settings",
      icon: CloudUpload,
      keywords: "account sign in backup cross device",
      run: () => openSettings("github"),
    },
    {
      id: "settings-repository",
      group: "Settings",
      label: "Sync repository settings",
      icon: FolderOutput,
      keywords: "github repository branch directory remote",
      run: () => openSettings("repository"),
    },
    {
      id: "settings-backup",
      group: "Settings",
      label: "Sync status settings",
      icon: CloudDownload,
      keywords: "backup history commit pending changes",
      run: () => openSettings("backup"),
    },
    {
      id: "storage",
      group: "Settings",
      label: "Storage choices",
      icon: HardDrive,
      keywords: "space quota usage persistent folder opfs",
      run: () => openSettings("storage"),
    },
    {
      id: "request-persistent-storage",
      group: "Settings",
      label: "Request persistent storage",
      icon: HardDrive,
      keywords: "storage browser keep notes safe durable",
      run: () => void ensurePersistentStorage(),
    },
    {
      id: "settings-transfer",
      group: "Settings",
      label: "Import & export settings",
      icon: ArrowLeftRight,
      keywords: "markdown zip folder transfer files",
      run: () => openSettings("transfer"),
    },
    {
      id: "settings-vault",
      group: "Settings",
      label: "Vault settings",
      icon: Lock,
      keywords: "delete clear notes vault data",
      run: () => openSettings("vault"),
    },
  ]);

  function loadMarkdownModule(): Promise<MarkdownModule> {
    return (markdownModulePromise ??= import("$lib/markdown").then((module) => {
      markdownModule = module;
      markdownModuleRevision += 1;
      return module;
    }));
  }

  function loadMarkdownOutputModule(): Promise<MarkdownOutputModule> {
    return (markdownOutputModulePromise ??= import("$lib/markdown-output").then((module) => {
      void loadMarkdownModule().catch(() => undefined);
      return module;
    }));
  }

  function loadDialogStyles(): Promise<void> {
    return (dialogStylesPromise ??= loadLazyStylesModule().then((module) =>
      module.loadDialogStyles(),
    ));
  }

  function renderMarkdownBlocksForPage(
    source: string,
    resolveLocalUrl: (destination: string) => string | undefined,
  ) {
    return (
      markdownModule?.renderMarkdownBlocks(source, resolveLocalUrl) ??
      renderLiteMarkdownBlocks(source, resolveLocalUrl)
    );
  }

  function needsFullMarkdownParser(source: string): boolean {
    return (
      /(^|\n)\s*(?:---\s*$|`{3,}|~{3,}|\|.+\||>\s*\[![A-Z]+\]|<\/?[a-z])/im.test(source) ||
      /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/.test(source) ||
      /\[\^[^\]]+\](?::|\s)/.test(source)
    );
  }

  function maybeLoadFullMarkdownParser(source: string): void {
    if (!markdownModule && needsFullMarkdownParser(source)) {
      void loadMarkdownModule().catch(() => undefined);
    }
  }

  function applyStoredFontChoices(): void {
    const storedFonts = readFontChoices();
    fontRevision += 1;
    const revision = fontRevision;
    fonts = storedFonts;
    fontCategories = readFontCategories(storedFonts);
    const customRoles = (Object.keys(storedFonts) as FontRole[]).filter(
      (role) => storedFonts[role] !== defaultFontChoices[role],
    );
    if (customRoles.length === 0) return;

    applyFontChoices(storedFonts);
    void Promise.all(customRoles.map((role) => loadFont(storedFonts[role]))).then(
      () => {
        if (fontRevision === revision) applyFontChoices(storedFonts);
      },
      () => {
        if (fontRevision === revision) applyFontChoices(storedFonts);
      },
    );
  }

  function revealStartupShell(): void {
    const startupShell = document.getElementById("startup-shell");
    if (!startupShell) return;

    const app = document.querySelector<HTMLElement>(".app");
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const editorShell = document.querySelector<HTMLElement>(".editor-shell");
    const appReady = app && getComputedStyle(app).display === "grid";
    const sidebarDisplay = sidebar ? getComputedStyle(sidebar).display : "";
    const sidebarReady = sidebarDisplay === "flex" || sidebarDisplay === "none";
    const editorReady = editorShell && getComputedStyle(editorShell).display === "grid";

    if (!appReady || !sidebarReady || !editorReady) {
      window.requestAnimationFrame(revealStartupShell);
      return;
    }

    startupShell.remove();
  }

  onMount(() => {
    revealStartupShell();
    const registry = readVaultRegistry();
    vaults = registry.vaults;
    activeVaultId = registry.activeId;
    primaryModifier = detectPrimaryModifier();
    if (primaryModifier === "control" && markdown === initialMarkdown) {
      markdown = createInitialMarkdown(primaryModifier);
      previewMarkdown = markdown;
      lastSavedMarkdown = markdown;
    }
    isOnline = navigator.onLine;
    const storageSupport = detectBrowserStorageSupport();
    storageNotice = browserStorageWarnings(storageSupport).join(" ");
    const narrowQuery = globalThis.matchMedia?.(NARROW_VIEWPORT);
    singlePaneMode = narrowQuery?.matches === true;
    applyPanePreferences();
    const onViewportChange = (event: MediaQueryListEvent) => {
      singlePaneMode = event.matches;
      applyPanePreferences();
    };
    narrowQuery?.addEventListener("change", onViewportChange);
    sidebarSide = readLocalStorage("onyx:sidebar-side") === "right" ? "right" : "left";
    const storedSplit = Number(readLocalStorage("onyx:split-ratio"));
    if (Number.isFinite(storedSplit)) splitRatio = clampSplitRatio(storedSplit);
    const storedContentWidth = Number(readLocalStorage("onyx:content-width"));
    if (Number.isFinite(storedContentWidth)) contentWidth = clampContentWidth(storedContentWidth);
    shortcuts = readKeyboardShortcuts();
    theme = readThemePreference();
    resolvedTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    if (document.documentElement.dataset.themePreference !== theme) {
      resolvedTheme = applyTheme(theme);
    }
    colorTheme = readColorTheme();
    if (document.documentElement.dataset.colorTheme !== colorTheme) {
      applyColorTheme(colorTheme);
    }
    applyStoredFontChoices();
    const stopThemeWatch = watchSystemTheme(() => {
      if (theme === "system") resolvedTheme = applyTheme(theme);
    });
    void openVault().finally(scheduleServiceWorkerRegistration);
    if (isOnline) scheduleGithubRestore();
    else githubState = "disconnected";
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (markdown === lastSavedMarkdown) return;
      event.preventDefault();
    };
    const onKeydown = (event: KeyboardEvent) => handleShortcut(event);
    const onOnline = () => {
      isOnline = true;
      scheduleGithubRestore();
    };
    const onOffline = () => {
      isOnline = false;
      restoreModalOpen = false;
      if (githubRestoreTimer !== undefined) {
        window.clearTimeout(githubRestoreTimer);
        githubRestoreTimer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && markdown !== lastSavedMarkdown) void saveDraft();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      narrowQuery?.removeEventListener("change", onViewportChange);
      stopThemeWatch();
      if (saveTimer) window.clearTimeout(saveTimer);
      if (searchTimer) window.clearTimeout(searchTimer);
      if (previewTimer) window.clearTimeout(previewTimer);
      if (serviceWorkerTimer) window.clearTimeout(serviceWorkerTimer);
      if (githubRestoreTimer) window.clearTimeout(githubRestoreTimer);
      unsubscribeVault?.();
      releaseLocalAttachmentUrls();
      vault?.close();
    };
  });

  function registerServiceWorker(): void {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    }
  }

  function scheduleServiceWorkerRegistration(): void {
    if (serviceWorkerTimer !== undefined) return;
    serviceWorkerTimer = window.setTimeout(() => {
      serviceWorkerTimer = undefined;
      registerServiceWorker();
    }, DEFERRED_STARTUP_DELAY_MS);
  }

  function scheduleGithubRestore(): void {
    if (githubState === "loading" || githubRestoreTimer !== undefined) return;
    const hasGithubCallback = new URLSearchParams(location.search).has("github");
    if (hasGithubCallback) {
      void restoreGitHub();
      return;
    }
    githubRestoreTimer = window.setTimeout(() => {
      githubRestoreTimer = undefined;
      void restoreGitHub();
    }, DEFERRED_STARTUP_DELAY_MS);
  }

  async function restoreGitHub(): Promise<void> {
    if (githubState === "loading") return;
    if (githubRestoreTimer !== undefined) {
      window.clearTimeout(githubRestoreTimer);
      githubRestoreTimer = undefined;
    }
    const result = new URLSearchParams(location.search).get("github");
    if (result) history.replaceState(history.state, "", location.pathname + location.hash);
    if (result && result !== "connected") {
      githubMessage =
        result === "configuration"
          ? "GitHub authentication has not been configured for this deployment."
          : result === "denied"
            ? "GitHub authorization was cancelled."
            : result === "invalid"
              ? "The GitHub authorization response could not be verified. Please try again."
              : "GitHub authentication failed. Please try again.";
    }
    if (!isOnline) {
      githubState = githubUser ? "connected" : "disconnected";
      return;
    }
    githubState = "loading";
    try {
      githubUser = await (await loadGithubModule()).restoreGithubSession();
      githubState = githubUser ? "connected" : githubMessage ? "error" : "disconnected";
    } catch (error) {
      githubState = "error";
      githubMessage = error instanceof Error ? error.message : "GitHub authentication failed.";
    }
  }

  async function disconnectGitHub(): Promise<void> {
    if (!isOnline) return;
    try {
      await (await loadGithubModule()).disconnectGithub();
      githubUser = undefined;
      githubState = "disconnected";
      githubMessage = "";
    } catch (error) {
      githubState = "error";
      githubMessage = error instanceof Error ? error.message : "GitHub could not be disconnected.";
    }
  }

  async function connectGitHub(): Promise<void> {
    if (!isOnline || githubState === "loading") return;
    githubState = "loading";
    githubMessage = "";
    try {
      await (await loadGithubModule()).connectGithub();
    } catch (error) {
      githubState = "error";
      githubMessage =
        error instanceof Error ? error.message : "GitHub sign-in could not be started.";
    }
  }

  async function beginBackup(): Promise<void> {
    if (!isOnline || !vault || backupState === "backing-up") return;
    if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
    if (!githubBackup) {
      void openSettings("repository").catch(() => undefined);
      return;
    }
    await runBackup(githubBackup);
  }

  async function openSettings(target: SettingsSection = "editor"): Promise<void> {
    if (!settingsOpen && document.activeElement instanceof HTMLElement) {
      settingsOpener = document.activeElement;
    }
    settingsSection = target;
    await loadDialogStyles();
    settingsOpen = true;
  }

  function closeSettings(): void {
    settingsOpen = false;
    const opener = settingsOpener;
    settingsOpener = undefined;
    restoreModalFocus(opener);
  }

  function restoreModalFocus(opener: HTMLElement | undefined): void {
    if (!opener) return;
    requestAnimationFrame(() => {
      if (paletteOpen || findOpen || settingsOpen) return;
      if (opener.isConnected) opener.focus();
    });
  }

  async function selectBackupRepository(
    state: Omit<GithubBackupState, "updatedAt">,
  ): Promise<void> {
    if (!vault) return;
    try {
      await (
        await loadGithubModule()
      ).validateGithubBackupRepository({
        ...state,
        updatedAt: new Date().toISOString(),
      });
      await vault.saveGithubBackupState(state);
      githubBackup = await vault.getGithubBackupState();
      backupState = "idle";
      backupCommitUrl = "";
      backupMessage = `Backups now target ${state.owner}/${state.repository}.`;
      settingsSection = "backup";
    } catch (error) {
      showBackupError(error);
    }
  }

  async function forgetBackupRepository(): Promise<void> {
    if (!vault) return;
    try {
      await vault.clearGithubBackupState();
      githubBackup = undefined;
      backupCommitUrl = "";
      backupState = "idle";
      backupMessage = "Onyx is no longer backing up to a repository.";
    } catch (error) {
      showBackupError(error);
    }
  }

  async function clearVault(): Promise<void> {
    if (!vault || clearingVault) return;
    clearingVault = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    const pendingSave = saveRun;
    try {
      if (pendingSave) await pendingSave;
      await vault.clear();
      resetEditorAfterVaultClear();
      await runSearch("");
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
    } finally {
      clearingVault = false;
    }
  }

  async function prepareVaultDeletion(): Promise<boolean> {
    return settleDraft();
  }

  function resetEditorAfterVaultClear(): void {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = undefined;
    searchSequence += 1;
    noteLoadSequence += 1;
    searchQuery = "";
    searchPending = false;
    notePage = 0;
    results = [];
    folders = [];
    vaultAttachments = [];
    trashedNotes = [];
    trashOpen = false;
    paletteNotes = [];
    activeNoteId = "";
    noteRevision = 0;
    activeNoteSourcePath = undefined;
    releaseLocalAttachmentUrls();
    markdown = "";
    lastSavedMarkdown = "";
    updatePreviewImmediately("");
    saveState = "saved";
    storageError = "";
    resetEditorHistory();
  }

  async function createBackupRepository(name: string): Promise<void> {
    if (!isOnline || !vault || !name.trim()) return;
    backupState = "backing-up";
    backupMessage = "Creating your private repository…";
    settingsOpen = false;
    try {
      const configuration = await (await loadGithubModule()).createPrivateGithubRepository(name);
      await vault.saveGithubBackupState(configuration);
      githubBackup = configuration;
      await runBackup(configuration);
    } catch (error) {
      showBackupError(error);
    }
  }

  async function runBackup(configuration: GithubBackupState): Promise<void> {
    if (!isOnline || !vault) return;
    backupState = "backing-up";
    backupMessage = "Preparing one GitHub commit…";
    backupCommitUrl = "";
    try {
      const result = await (await loadGithubModule()).backupVaultToGithub(vault, configuration);
      githubBackup = result.state;
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      backupState = "success";
      backupCommitUrl = result.commitUrl ?? "";
      backupMessage = result.commitUrl
        ? `Backed up ${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} in one commit.`
        : "Your GitHub backup is already up to date.";
    } catch (error) {
      showBackupError(error);
    }
  }

  function showBackupError(error: unknown): void {
    backupState = "error";
    backupMessage = isGithubStatus(error, 422)
      ? "GitHub could not create that repository or update its branch. Check the name and try again."
      : error instanceof Error
        ? error.message
        : "The GitHub backup failed.";
  }

  function isGithubStatus(error: unknown, status: number): boolean {
    return (
      error instanceof Error &&
      "status" in error &&
      (error as Error & { status?: unknown }).status === status
    );
  }

  async function openRestore(): Promise<void> {
    if (!isOnline || !githubUser || restoreState === "restoring") return;
    if (!(await settleDraft())) return;
    restoreOwner = githubBackup?.owner ?? githubUser.login;
    restoreRepository = githubBackup?.repository ?? suggestedRepositoryName(activeVault);
    restoreBranch = githubBackup?.branch ?? "main";
    restoreDirectory = githubBackup?.directory ?? "vault";
    restoreCommits = [];
    selectedRestoreSha = "";
    restoreMessage = "";
    await loadDialogStyles();
    restoreModalOpen = true;
    await loadRestoreCommits();
  }

  function restoreConfiguration(): GithubBackupState {
    if (!githubUser) throw new Error("Sign in with GitHub before restoring a backup");
    return {
      githubAccountId: githubUser.id,
      githubAccountLogin: githubUser.login,
      owner: restoreOwner.trim(),
      repository: restoreRepository.trim(),
      branch: restoreBranch.trim(),
      directory: restoreDirectory.trim().replace(/^\/+|\/+$/g, ""),
      updatedAt: new Date().toISOString(),
    };
  }

  async function loadRestoreCommits(): Promise<void> {
    if (!isOnline || !restoreOwner.trim() || !restoreRepository.trim() || !restoreBranch.trim())
      return;
    restoreState = "loading";
    restoreMessage = "";
    selectedRestoreSha = "";
    try {
      restoreCommits = await (
        await loadGithubModule()
      ).listGithubBackupCommits(restoreConfiguration());
      selectedRestoreSha = restoreCommits[0]?.sha ?? "";
      restoreMessage =
        restoreCommits.length === 0
          ? "No backup commits were found in this repository and directory."
          : "";
      restoreState = "idle";
    } catch (error) {
      restoreCommits = [];
      restoreState = "error";
      restoreMessage =
        error instanceof Error ? error.message : "GitHub backups could not be loaded.";
    }
  }

  async function restoreSelectedCommit(): Promise<void> {
    if (!isOnline || !vault || !selectedRestoreSha || restoreState === "restoring") return;
    if (!(await settleDraft())) return;
    const previousSaveState = saveState;
    if (saveTimer) window.clearTimeout(saveTimer);
    if (searchTimer) window.clearTimeout(searchTimer);
    saveTimer = undefined;
    searchTimer = undefined;
    searchSequence += 1;
    saveState = "loading";
    restoreState = "restoring";
    restoreMessage = "Downloading and rebuilding your local vault…";
    try {
      const result = await (
        await loadGithubModule()
      ).restoreVaultFromGithub(vault, restoreConfiguration(), selectedRestoreSha);
      githubBackup = result.state;
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      const notes = await vault.listNotes();
      folders = await vault.listFolders();
      searchQuery = "";
      await loadNote(notes[0].id);
      vaultAttachments = await vault.listAttachments();
      await runSearch("");
      restoreModalOpen = false;
      restoreState = "idle";
      backupState = "success";
      backupMessage = `Restored ${result.noteCount} ${result.noteCount === 1 ? "note" : "notes"} and ${result.attachmentCount} ${result.attachmentCount === 1 ? "attachment" : "attachments"} from GitHub.`;
      backupCommitUrl =
        restoreCommits.find((commit) => commit.sha === selectedRestoreSha)?.url ?? "";
    } catch (error) {
      saveState = previousSaveState;
      restoreState = "error";
      restoreMessage =
        error instanceof Error ? error.message : "The GitHub backup could not be restored.";
    }
  }

  function formatNoteDate(value: string): string {
    if (!value) return "";
    return `Edited ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))}`;
  }

  function formatCommitDate(value: string): string {
    if (!value) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  }

  async function openVault(): Promise<void> {
    storageError = "";
    saveState = "loading";
    notesLoaded = false;
    try {
      readAttachmentPreferences();
      vault = await Vault.open(activeVault ? vaultOptions(activeVault) : {});
      appendNativeDirectoryNotice();
      unsubscribeVault?.();
      unsubscribeVault = vault.subscribe(queueRemoteVaultSync);
      let notes = await vault.listNotes();
      folders = await vault.listFolders();
      if (notes.length === 0) {
        const legacyDraft =
          activeVault && isDefaultVault(activeVault) ? await readLegacyDraft() : "";
        const contents = legacyDraft || createInitialMarkdown(primaryModifier);
        const firstNote = await vault.saveNote({
          title: titleFromMarkdown(contents),
          markdown: contents,
        });
        notes = [firstNote];
      }
      await vault.purgeExpiredTrash().catch(() => []);
      notes = await vault.listNotes();
      await loadNote(notes[0].id);
      vaultAttachments = await vault.listAttachments();
      trashedNotes = await vault.listTrashedNotes();
      await runSearch("");
      if (searchQuery.trim()) await runSearch(searchQuery);
      githubBackup = await vault.getGithubBackupState();
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      if (detectBrowserStorageSupport().persistentStorage) void ensurePersistentStorage();
    } catch (error) {
      storageError = error instanceof Error ? error.message : "Your notes could not be opened.";
      saveState = "error";
    }
  }

  function persistVaultRegistry(): void {
    writeVaultRegistry({ activeId: activeVaultId, vaults });
  }

  async function selectVault(id: string): Promise<void> {
    if (id === activeVaultId || transferState === "working") return;
    if (!vaults.some((candidate) => candidate.id === id)) return;
    if (!(await settleDraft())) return;
    activeVaultId = id;
    persistVaultRegistry();
    await reopenVault();
  }

  async function createVault(name = "Notes"): Promise<void> {
    if (transferState === "working") return;
    if (!(await settleDraft())) return;
    const descriptor = createVaultDescriptor(name, vaults);
    vaults = [...vaults, descriptor];
    activeVaultId = descriptor.id;
    persistVaultRegistry();
    await reopenVault();
  }

  function renameVault(id: string, name: string): void {
    const target = vaults.find((candidate) => candidate.id === id);
    const trimmed = normalizeVaultName(name);
    if (!target || !trimmed || trimmed === target.name) return;
    const unique = uniqueVaultName(
      trimmed,
      vaults.filter((candidate) => candidate.id !== id),
    );
    vaults = vaults.map((candidate) =>
      candidate.id === id ? { ...candidate, name: unique } : candidate,
    );
    persistVaultRegistry();
  }

  async function reopenVault(): Promise<void> {
    unsubscribeVault?.();
    unsubscribeVault = undefined;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    remoteChanges.length = 0;
    remoteSyncRequested = false;
    vault?.close();
    vault = undefined;
    resetEditorAfterVaultClear();
    githubBackup = undefined;
    pendingBackupCount = 0;
    backupState = "idle";
    backupMessage = "";
    backupCommitUrl = "";
    sidebarOpen = false;
    await openVault();
  }

  async function ensurePersistentStorage(): Promise<void> {
    if (!vault || (await vault.isStoragePersistent())) return;
    if (await vault.requestPersistentStorage()) return;
    appendStorageNotice(persistenceDeniedMessage());
  }

  // Not persisted, so the warning returns on the next load if storage is still not durable.
  function dismissStorageNotice(): void {
    storageNotice = "";
  }

  function appendStorageNotice(message: string): void {
    if (storageNotice.includes(message)) return;
    storageNotice = storageNotice ? `${storageNotice} ${message}` : message;
  }

  function appendNativeDirectoryNotice(): void {
    const status = vault?.getFileStorageStatus();
    if (!status?.nativeDirectoryName || status.nativeDirectoryPermission === "granted") return;
    appendStorageNotice(
      status.nativeDirectoryPermission === "error"
        ? `${status.nativeDirectoryName} could not be updated. Onyx is using OPFS until you reconnect the folder in Settings → Storage.`
        : `Access to ${status.nativeDirectoryName} expired or was revoked. Onyx is using OPFS until you reconnect the folder in Settings → Storage.`,
    );
  }

  async function readLegacyDraft(): Promise<string> {
    try {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("onyx");
      const handle = await directory.getFileHandle("welcome-to-onyx.md");
      return await (await handle.getFile()).text();
    } catch {
      return "";
    }
  }

  async function loadNote(id: string): Promise<void> {
    if (!vault) return;
    const currentVault = vault;
    const sequence = ++noteLoadSequence;
    const note = await currentVault.getNote(id);
    if (!note || note.deletedAt) return;
    const fullMarkdownParser =
      !markdownModule && needsFullMarkdownParser(note.markdown)
        ? loadMarkdownModule().catch(() => undefined)
        : undefined;
    const folder = attachmentFolder;
    const attachments = await Promise.all(
      (await currentVault.listAttachments())
        .filter(
          (attachment) =>
            attachment.noteId === note.id ||
            (attachment.sourcePath !== undefined && isPathWithin(attachment.sourcePath, folder)),
        )
        .map((attachment) => currentVault.getAttachment(attachment.id)),
    );
    if (fullMarkdownParser) await fullMarkdownParser;
    const nextUrls = attachments.flatMap((attachment): LocalAttachmentUrl[] =>
      attachment
        ? [
            {
              name: attachment.metadata.name,
              sourcePath: attachment.metadata.sourcePath,
              url: URL.createObjectURL(
                safeAttachmentBlob(attachment.file, attachment.metadata.type),
              ),
            },
          ]
        : [],
    );
    if (sequence !== noteLoadSequence) {
      for (const attachment of nextUrls) URL.revokeObjectURL(attachment.url);
      return;
    }
    releaseLocalAttachmentUrls();
    localAttachmentUrls = nextUrls;
    activeNoteSourcePath = note.sourcePath;
    activeNoteId = note.id;
    noteRevision = note.revision;
    markdown = note.markdown;
    updatePreviewImmediately(note.markdown);
    lastSavedMarkdown = note.markdown;
    resetEditorHistory();
    saveState = "saved";
    storageError = "";
    sidebarOpen = false;
  }

  function queueRemoteVaultSync(change: VaultChangeEvent): void {
    remoteChanges.push(change);
    remoteSyncRequested = true;
    if (remoteSyncRun) return;
    const run = syncRemoteVault();
    remoteSyncRun = run;
    void run
      .finally(() => {
        if (remoteSyncRun === run) remoteSyncRun = undefined;
      })
      .catch(() => undefined);
  }

  async function syncRemoteVault(): Promise<void> {
    while (remoteSyncRequested) {
      remoteSyncRequested = false;
      const changes = remoteChanges.splice(0);
      if (!vault) continue;
      const notes = await vault.listNotes();
      const activeChanged = changes.some(
        (change) => change.kind === "vault" || change.noteId === activeNoteId,
      );
      const hasUnsavedDraft = markdown !== lastSavedMarkdown;
      if (activeChanged && hasUnsavedDraft) {
        storageError = "This note changed in another tab. Reload it before saving.";
        saveState = "error";
      } else if (activeChanged && activeNoteId) {
        const activeNote = notes.find((note) => note.id === activeNoteId);
        if (activeNote) await loadNote(activeNote.id);
        else resetActiveNote();
      } else if (!activeNoteId && notes[0]) {
        await loadNote(notes[0].id);
      } else if (!notes.length && !hasUnsavedDraft) {
        resetActiveNote();
      }
      await runSearch(searchQuery);
      paletteNotes = notes;
      vaultAttachments = await vault.listAttachments();
      trashedNotes = await vault.listTrashedNotes();
      githubBackup = await vault.getGithubBackupState();
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
    }
  }

  function resetActiveNote(): void {
    noteLoadSequence += 1;
    releaseLocalAttachmentUrls();
    activeNoteSourcePath = undefined;
    activeNoteId = "";
    noteRevision = 0;
    markdown = "";
    previewMarkdown = "";
    lastSavedMarkdown = "";
    resetEditorHistory();
    saveState = "saved";
  }

  function resolveAttachmentUrl(destination: string): string | undefined {
    return resolveLocalAttachmentUrl(destination, activeNoteSourcePath, localAttachmentUrls);
  }

  function releaseLocalAttachmentUrls(): void {
    for (const attachment of localAttachmentUrls) URL.revokeObjectURL(attachment.url);
    localAttachmentUrls = [];
  }

  async function selectNote(id: string): Promise<void> {
    if (id === activeNoteId || transferState === "working") return;
    if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
    await loadNote(id);
    recentNoteIds = [id, ...recentNoteIds.filter((recentId) => recentId !== id)].slice(0, 8);
  }

  async function refreshFileTree(): Promise<NoteMetadata[]> {
    if (!vault) return [];
    const notes = await vault.listNotes();
    folders = await vault.listFolders();
    vaultAttachments = await vault.listAttachments();
    trashedNotes = await vault.listTrashedNotes();
    paletteNotes = notes;
    await runSearch(searchQuery);
    return notes;
  }

  async function createNote(parent = "", requestedName = ""): Promise<void> {
    if (!vault || transferState === "working") return;
    saveState = "loading";
    if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
    try {
      const name = normalizeFileName(requestedName || "Untitled");
      const path = joinPath(parent, name);
      const notes = await vault.listNotes();
      if (
        notes.some((note) => noteFilePath(note).toLocaleLowerCase() === path.toLocaleLowerCase())
      ) {
        throw new Error(`A file named “${name}” already exists here.`);
      }
      const note = await vault.saveNote({
        title: fileStem(name),
        markdown: "",
        sourcePath: path,
      });
      searchQuery = "";
      await loadNote(note.id);
      await refreshFileTree();
      requestAnimationFrame(() => editor?.focus());
    } catch (error) {
      storageError = error instanceof Error ? error.message : "A new note could not be created.";
      saveState = "error";
    }
  }

  async function createFolder(parent = "", requestedName = ""): Promise<void> {
    if (!vault || transferState === "working") return;
    try {
      const name = normalizeFolderName(requestedName || "New folder");
      const path = joinPath(parent, name);
      const notes = await vault.listNotes();
      const existingFolders = await vault.listFolders();
      const noteFolders = notes.flatMap((note) => {
        const folder = noteFolderPath(note);
        return folder ? [folder] : [];
      });
      if (
        [...existingFolders.map((folder) => folder.path), ...noteFolders].some(
          (candidate) => candidate.toLocaleLowerCase() === path.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`A folder named “${name}” already exists here.`);
      }
      const now = new Date().toISOString();
      const folder: FolderMetadata = {
        id: crypto.randomUUID(),
        path,
        createdAt: now,
        updatedAt: now,
      };
      await vault.saveFolders([...existingFolders, folder]);
      searchQuery = "";
      await refreshFileTree();
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "A new folder could not be created.";
    }
  }

  async function renameFile(noteId: string, requestedName: string): Promise<void> {
    if (!vault || transferState === "working") return;
    if (!(await settleDraft())) return;
    try {
      const note = await vault.getNote(noteId);
      if (!note) return;
      const name = normalizeFileName(requestedName);
      const path = joinPath(noteFolderPath(note), name);
      const notes = await vault.listNotes();
      if (
        notes.some(
          (candidate) =>
            candidate.id !== noteId &&
            noteFilePath(candidate).toLocaleLowerCase() === path.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`A file named “${name}” already exists here.`);
      }
      const saved = await vault.saveNote({
        id: note.id,
        title: note.title,
        markdown: note.markdown,
        sourcePath: path,
        expectedRevision: note.revision,
      });
      if (activeNoteId === noteId) await loadNote(saved.id);
      storageError = "";
      await refreshFileTree();
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be renamed.";
    }
  }

  function isAttachmentFolderPath(path: string): boolean {
    return path === attachmentFolder || path.startsWith(`${attachmentFolder}/`);
  }

  async function renameFolder(path: string, requestedName: string): Promise<void> {
    if (!vault || transferState === "working") return;
    if (isAttachmentFolderPath(path)) {
      if (path === attachmentFolder) {
        await renameAttachmentFolder(requestedName);
        return;
      }
      if (!(await settleDraft())) return;
      try {
        const name = normalizeFolderName(requestedName);
        const nextPath = joinPath(parentPath(path), name);
        if (nextPath.toLocaleLowerCase() === path.toLocaleLowerCase()) return;
        const moved = await vault.moveAttachmentFolder(path, nextPath);
        const movedPaths = new Map(
          moved.map((attachment) => [
            movePath(attachment.sourcePath ?? "", nextPath, path),
            attachment.sourcePath ?? "",
          ]),
        );
        if (movedPaths.size) {
          const notes = await vault.listNotes();
          for (const metadata of notes) {
            const note = await vault.getNote(metadata.id);
            if (!note) continue;
            const notePath = noteFilePath(note);
            const fixed = rewriteLocalLinks(note.markdown, notePath, notePath, (target) =>
              movedPaths.get(target),
            );
            if (fixed === note.markdown) continue;
            await vault.saveNote({
              id: note.id,
              title: note.title,
              markdown: fixed,
              expectedRevision: note.revision,
            });
          }
        }
        await relocateFolder(path, nextPath);
        storageError = "";
        await refreshFileTree();
      } catch (error) {
        storageError = error instanceof Error ? error.message : "The folder could not be renamed.";
      }
      return;
    }
    if (!(await settleDraft())) return;
    try {
      const name = normalizeFolderName(requestedName);
      const nextPath = joinPath(parentPath(path), name);
      await relocateFolder(path, nextPath);
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder could not be renamed.";
    }
  }

  async function moveFile(noteId: string, targetFolder: string): Promise<void> {
    if (!vault || transferState === "working") return;
    if (!(await settleDraft())) return;
    try {
      const note = await vault.getNote(noteId);
      if (!note) return;
      const currentPath = noteFilePath(note);
      const nextPath = joinPath(targetFolder, basename(currentPath));
      if (nextPath.toLocaleLowerCase() === currentPath.toLocaleLowerCase()) return;
      const notes = await vault.listNotes();
      if (
        notes.some(
          (candidate) =>
            candidate.id !== noteId &&
            noteFilePath(candidate).toLocaleLowerCase() === nextPath.toLocaleLowerCase(),
        )
      ) {
        throw new Error(`A file named “${basename(nextPath)}” already exists here.`);
      }
      const saved = await vault.saveNote({
        id: note.id,
        title: note.title,
        markdown: rewriteLocalLinks(note.markdown, currentPath, nextPath, pinnedAttachmentLinks),
        sourcePath: nextPath,
        expectedRevision: note.revision,
      });
      await vault.moveAttachmentSourcePaths(
        note.id,
        parentPath(currentPath),
        parentPath(nextPath),
        attachmentFolder,
      );
      if (activeNoteId === noteId) await loadNote(saved.id);
      storageError = "";
      await refreshFileTree();
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be moved.";
    }
  }

  async function relocateFolder(path: string, nextPath: string): Promise<void> {
    if (!vault || nextPath.toLocaleLowerCase() === path.toLocaleLowerCase()) return;
    const notes = await vault.listNotes();
    const existingFolders = await vault.listFolders();
    const affectedNotes = notes.filter((note) => isPathWithin(noteFolderPath(note), path));
    const affectedNoteIds = new Set(affectedNotes.map((note) => note.id));
    const nextFolders = existingFolders.map((folder) =>
      isPathWithin(folder.path, path)
        ? {
            ...folder,
            path: movePath(folder.path, path, nextPath),
            updatedAt: new Date().toISOString(),
          }
        : folder,
    );

    const currentFolderPaths = new Set([
      ...existingFolders.map((folder) => folder.path),
      ...notes.map((note) => noteFolderPath(note)).filter(Boolean),
    ]);
    const nextFolderPaths = new Set<string>();
    for (const currentFolderPath of currentFolderPaths) {
      const candidate = isPathWithin(currentFolderPath, path)
        ? movePath(currentFolderPath, path, nextPath)
        : currentFolderPath;
      const key = candidate.toLocaleLowerCase();
      if (nextFolderPaths.has(key)) {
        throw new Error(`A folder named “${basename(nextPath)}” already exists here.`);
      }
      nextFolderPaths.add(key);
    }

    const movedNotePaths = new Set<string>();
    for (const note of affectedNotes) {
      const sourcePath = noteFilePath(note);
      const nextSourcePath = movePath(sourcePath, path, nextPath);
      const key = nextSourcePath.toLocaleLowerCase();
      if (
        movedNotePaths.has(key) ||
        notes.some(
          (candidate) =>
            !affectedNoteIds.has(candidate.id) &&
            noteFilePath(candidate).toLocaleLowerCase() === key,
        )
      ) {
        throw new Error(`A file named “${basename(nextSourcePath)}” already exists here.`);
      }
      movedNotePaths.add(key);
    }

    const fullNotes = await Promise.all(
      affectedNotes.map(async (note) => {
        const fullNote = await vault!.getNote(note.id);
        if (!fullNote)
          throw new Error(`The file “${basename(noteFilePath(note))}” could not be moved.`);
        return { note, markdown: fullNote.markdown };
      }),
    );
    for (const { note, markdown: noteMarkdown } of fullNotes) {
      const sourcePath = noteFilePath(note);
      const nextSourcePath = movePath(sourcePath, path, nextPath);
      await vault.saveNote({
        id: note.id,
        title: note.title,
        markdown: rewriteLocalLinks(
          noteMarkdown,
          sourcePath,
          nextSourcePath,
          pinnedAttachmentLinks,
        ),
        sourcePath: nextSourcePath,
        expectedRevision: note.revision,
      });
      await vault.moveAttachmentSourcePaths(note.id, path, nextPath, attachmentFolder);
    }
    await vault.saveFolders(nextFolders);
    folders = nextFolders;
    if (activeNoteId && affectedNoteIds.has(activeNoteId)) await loadNote(activeNoteId);
    storageError = "";
    await refreshFileTree();
  }

  async function moveFolder(path: string, targetParent: string): Promise<void> {
    if (!vault || transferState === "working") return;
    if (isPathWithin(targetParent, path)) {
      storageError = "A folder cannot be moved into itself or one of its children.";
      return;
    }
    if (!(await settleDraft())) return;
    try {
      await relocateFolder(path, joinPath(targetParent, basename(path)));
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder could not be moved.";
    }
  }

  async function deleteFile(noteId: string): Promise<void> {
    if (!vault || transferState === "working") return;
    const note = await vault.getNote(noteId);
    if (!note || note.deletedAt) return;
    if (!(await settleDraft())) return;
    try {
      await vault.trashNote(noteId);
      const notes = await refreshFileTree();
      if (activeNoteId === noteId) {
        if (notes[0]) await loadNote(notes[0].id);
        else resetActiveNote();
      }
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be deleted.";
    }
  }

  async function deleteFolder(path: string): Promise<void> {
    if (!vault || transferState === "working") return;
    const notes = await vault.listNotes();
    const affectedNotes = notes.filter((note) => {
      const folder = noteFolderPath(note);
      return folder === path || folder.startsWith(`${path}/`);
    });
    const attached = isAttachmentFolderPath(path)
      ? (await vault.listAttachments()).filter(
          (attachment) =>
            attachment.sourcePath &&
            (attachment.sourcePath === path || attachment.sourcePath.startsWith(`${path}/`)),
        )
      : [];
    if (!(await settleDraft())) return;
    try {
      for (const note of affectedNotes) await vault.trashNote(note.id);
      if (attached.length) await vault.deleteAttachmentFolder(path);
      const existingFolders = await vault.listFolders();
      const nextFolders = existingFolders.filter(
        (folder) => folder.path !== path && !folder.path.startsWith(`${path}/`),
      );
      await vault.saveFolders(nextFolders);
      folders = nextFolders;
      const remaining = await refreshFileTree();
      if (activeNoteId && affectedNotes.some((note) => note.id === activeNoteId)) {
        if (remaining[0]) await loadNote(remaining[0].id);
        else resetActiveNote();
      } else if (activeNoteId) {
        await loadNote(activeNoteId);
      }
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder could not be deleted.";
    }
  }

  async function restoreFile(noteId: string): Promise<void> {
    if (!vault || transferState === "working") return;
    if (!(await settleDraft())) return;
    try {
      const restored = await vault.restoreNote(noteId);
      if (!restored) return;
      await refreshFileTree();
      trashOpen = false;
      await selectNote(noteId);
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be restored.";
    }
  }

  async function purgeFile(noteId: string): Promise<void> {
    if (!vault || transferState === "working") return;
    const note = await vault.getNote(noteId);
    if (!note) return;
    if (
      !window.confirm(
        `Permanently delete “${fileStem(noteFilePath(note))}”? This cannot be undone.`,
      )
    )
      return;
    if (!(await settleDraft())) return;
    try {
      await vault.purgeNote(noteId);
      await refreshFileTree();
      if (activeNoteId === noteId) {
        const notes = await vault.listNotes();
        if (notes[0]) await loadNote(notes[0].id);
        else resetActiveNote();
      }
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "The file could not be permanently deleted.";
    }
  }

  async function emptyTrash(): Promise<void> {
    if (!vault || transferState === "working" || trashedNotes.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${trashedNotes.length} ${trashedNotes.length === 1 ? "note" : "notes"} in Trash? This cannot be undone.`,
      )
    )
      return;
    if (!(await settleDraft())) return;
    try {
      await vault.emptyTrash();
      await refreshFileTree();
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "Trash could not be emptied.";
    }
  }

  function toggleTrash(): void {
    trashOpen = !trashOpen;
  }

  async function copyFilePath(path: string): Promise<void> {
    await copyToClipboard(() => navigator.clipboard.writeText(path));
  }

  async function importFolder(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const { readMarkdownFolder } = await import("$lib/markdown-transfer");
    await runImport(readMarkdownFolder(files));
    if (folderInput) folderInput.value = "";
  }

  async function importZip(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    transferState = "working";
    try {
      const { readMarkdownZip } = await import("$lib/markdown-transfer");
      const entries = await readMarkdownZip(file);
      transferState = "idle";
      await runImport(entries);
    } catch {
      showTransferError();
    } finally {
      if (zipInput) zipInput.value = "";
    }
  }

  async function runImport(files: MarkdownTransferFile[]): Promise<void> {
    if (!vault || transferState === "working") return;
    transferState = "working";
    if (!(await settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { importMarkdownFiles } = await import("$lib/markdown-transfer");
      await importMarkdownFiles(vault, files);
      searchQuery = "";
      const notes = await vault.listNotes();
      await loadNote(notes[0].id);
      await runSearch("");
      pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      transferState = "idle";
    } catch {
      showTransferError();
    }
  }

  function downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // Browsers save PDFs through their own print dialog, which the print stylesheet feeds.
  async function savePdf(): Promise<void> {
    await import("./styles/print.css");
    window.print();
  }

  type NoteSource = { markdown: string; title: string };

  function activeNoteSource(): NoteSource {
    return { markdown, title: noteTitle };
  }

  async function noteSource(id: string): Promise<NoteSource | undefined> {
    if (id === activeNoteId) return activeNoteSource();
    const note = await vault?.getNote(id);
    return note && { markdown: note.markdown, title: titleFromMarkdown(note.markdown) };
  }

  async function copyMarkdown(source = activeNoteSource()): Promise<void> {
    await navigator.clipboard.writeText(source.markdown);
  }

  function downloadMarkdown(source = activeNoteSource()): void {
    downloadBlob(
      new Blob([source.markdown.endsWith("\n") ? source.markdown : `${source.markdown}\n`], {
        type: "text/markdown",
      }),
      outputFileName(source.title, "md"),
    );
  }

  async function copyText(source = activeNoteSource()): Promise<void> {
    const output = await loadMarkdownOutputModule();
    await navigator.clipboard.writeText(output.markdownToPlainText(source.markdown));
  }

  async function downloadText(source = activeNoteSource()): Promise<void> {
    const output = await loadMarkdownOutputModule();
    downloadBlob(
      new Blob([`${output.markdownToPlainText(source.markdown)}\n`], { type: "text/plain" }),
      outputFileName(source.title, "txt"),
    );
  }

  async function copyRichText(source = activeNoteSource()): Promise<void> {
    const [html, output] = await Promise.all([
      exportedHtml(source.markdown),
      loadMarkdownOutputModule(),
    ]);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([output.markdownToPlainText(source.markdown)], {
          type: "text/plain",
        }),
      }),
    ]);
  }

  async function downloadRtf(source = activeNoteSource()): Promise<void> {
    const output = await loadMarkdownOutputModule();
    downloadBlob(
      new Blob([output.markdownToRtf(source.markdown)], { type: "application/rtf" }),
      outputFileName(source.title, "rtf"),
    );
  }

  // Exports keep the note's own attachment paths, because in-app blob URLs die with the tab.
  async function exportedHtml(source: string): Promise<string> {
    const markdownModule = await loadMarkdownModule();
    return markdownModule.renderMarkdown(source, undefined, { remoteImages: "allow" });
  }

  async function copyToClipboard(write: () => Promise<void>): Promise<void> {
    if (transferState === "working") return;
    try {
      await write();
      transferState = "idle";
    } catch {
      transferState = "error";
    }
  }

  async function copyHtml(source = activeNoteSource()): Promise<void> {
    const [html, output] = await Promise.all([
      exportedHtml(source.markdown),
      loadMarkdownOutputModule(),
    ]);
    await navigator.clipboard.writeText(output.formatHtmlSource(html));
  }

  async function downloadHtml(source = activeNoteSource()): Promise<void> {
    const [body, output] = await Promise.all([
      exportedHtml(source.markdown),
      loadMarkdownOutputModule(),
    ]);
    const html = output.createHtmlDocument({
      title: source.title,
      body: output.formatHtmlSource(body),
    });
    downloadBlob(new Blob([html], { type: "text/html" }), outputFileName(source.title, "html"));
  }

  const noteCopiers: Record<Exclude<NoteFormat, "pdf">, (source: NoteSource) => Promise<void>> = {
    markdown: copyMarkdown,
    text: copyText,
    "rich-text": copyRichText,
    html: copyHtml,
  };
  const noteExporters: Record<
    Exclude<NoteFormat, "pdf">,
    (source: NoteSource) => void | Promise<void>
  > = {
    markdown: downloadMarkdown,
    text: downloadText,
    "rich-text": downloadRtf,
    html: downloadHtml,
  };

  async function copyNoteAs(id: string, format: Exclude<NoteFormat, "pdf">): Promise<void> {
    await copyToClipboard(async () => {
      const source = await noteSource(id);
      if (source) await noteCopiers[format](source);
    });
  }

  // Printing works from the rendered page, so another note is opened first.
  async function exportNoteAs(id: string, format: NoteFormat): Promise<void> {
    if (format === "pdf") {
      if (id !== activeNoteId) await selectNote(id);
      if (id === activeNoteId) await savePdf();
      return;
    }
    const source = await noteSource(id);
    if (source) await noteExporters[format](source);
  }

  async function exportZip(): Promise<void> {
    if (!vault || transferState === "working") return;
    transferState = "working";
    if (!(await settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { createMarkdownExport, createMarkdownZip } = await import("$lib/markdown-transfer");
      const files = await createMarkdownExport(vault);
      const archive = await createMarkdownZip(files);
      downloadBlob(archive, `onyx-markdown-${new Date().toISOString().slice(0, 10)}.zip`);
      transferState = "idle";
    } catch {
      showTransferError();
    }
  }

  async function exportFolder(): Promise<void> {
    if (!vault || transferState === "working") return;
    const picker = (
      window as Window & {
        showDirectoryPicker?: (options?: {
          mode: "readwrite";
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      transferState = "error";
      return;
    }
    try {
      const directory = await picker.call(window, { mode: "readwrite" });
      transferState = "working";
      if (!(await settleDraft())) {
        transferState = "idle";
        return;
      }
      const { createMarkdownExport, writeMarkdownFolder } = await import("$lib/markdown-transfer");
      const files = await createMarkdownExport(vault);
      await writeMarkdownFolder(directory, files);
      transferState = "idle";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showTransferError();
    }
  }

  function showTransferError(): void {
    transferState = "error";
  }

  async function settleDraft(): Promise<boolean> {
    if (markdown !== lastSavedMarkdown) return saveDraft();
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    return saveRun ? await saveRun : true;
  }

  function queueSave(): void {
    if (clearingVault) return;
    saveState = "unsaved";
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveDraft(), 700);
  }

  async function saveDraft(): Promise<boolean> {
    if (clearingVault || !vault || !activeNoteId) return false;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = true;
    if (saveRun) return saveRun;
    const run = flushDrafts();
    saveRun = run;
    try {
      return await run;
    } finally {
      if (saveRun === run) saveRun = undefined;
    }
  }

  async function flushDrafts(): Promise<boolean> {
    while (saveRequested) {
      if (clearingVault) {
        saveRequested = false;
        return true;
      }
      saveRequested = false;
      if (!vault || !activeNoteId) return false;
      const noteId = activeNoteId;
      const contents = markdown;
      const expectedRevision = noteRevision;
      saveState = "saving";
      try {
        const savedNote = await vault.saveNote({
          id: noteId,
          title: titleFromMarkdown(contents),
          markdown: contents,
          expectedRevision,
        });
        if (activeNoteId === noteId) {
          noteRevision = savedNote.revision;
          lastSavedMarkdown = contents;
          saveState = markdown === contents ? "saved" : "unsaved";
          storageError = "";
        }
        appendNativeDirectoryNotice();
        await runSearch(searchQuery);
        pendingBackupCount = (await vault.getPendingBackupOperations()).length;
      } catch (error) {
        saveRequested = false;
        if (activeNoteId === noteId) {
          storageError = error instanceof Error ? error.message : "Autosave failed.";
          saveState = "error";
        }
        return false;
      }
    }
    return true;
  }

  function updateMarkdown(value: string, options: { recordHistory?: boolean } = {}): void {
    if (value === markdown) {
      pendingEditorState = undefined;
      return;
    }
    if (options.recordHistory !== false && !applyingEditorHistory) {
      pushUndo(
        pendingEditorState?.markdown === markdown
          ? pendingEditorState
          : { markdown, selection: getEditorSelection() },
      );
    }
    pendingEditorState = undefined;
    markdown = value;
    maybeLoadFullMarkdownParser(value);
    queuePreview(value);
    queueSave();
  }

  function queuePreview(value: string): void {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      previewTimer = undefined;
      previewMarkdown = value;
    }, PREVIEW_DELAY_MS);
  }

  function updatePreviewImmediately(value: string): void {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = undefined;
    previewMarkdown = value;
  }

  function clampSplitRatio(value: number): number {
    return Math.min(80, Math.max(20, value));
  }

  function setSplitRatio(value: number): void {
    splitRatio = clampSplitRatio(value);
  }

  function saveSplitRatio(): void {
    writeLocalStorage("onyx:split-ratio", splitRatio.toFixed(1));
  }

  function clampContentWidth(value: number): number {
    return Math.min(1_200, Math.max(480, Math.round(value / 20) * 20));
  }

  function setContentWidth(value: number): void {
    contentWidth = clampContentWidth(value);
    writeLocalStorage("onyx:content-width", String(contentWidth));
  }

  // A single-pane viewport switches views instead of splitting, and leaves the stored split alone.
  function showOnlyPane(pane: "source" | "rendered"): void {
    sourcePaneVisible = pane === "source";
    renderedPaneVisible = pane === "rendered";
  }

  function swapPanes(): void {
    if (singlePaneMode) return;
    paneOrder = paneOrder === "source-first" ? "rendered-first" : "source-first";
    // The panes trade places, so the stored split has to follow them to keep their sizes.
    splitRatio = clampSplitRatio(100 - splitRatio);
    writeLocalStorage("onyx:pane-order", paneOrder);
    saveSplitRatio();
  }

  function togglePaneLayout(): void {
    if (singlePaneMode) return;
    paneLayout = paneLayout === "columns" ? "rows" : "columns";
    writeLocalStorage("onyx:pane-layout", paneLayout);
  }

  function placePane(pane: "source" | "rendered", edge: PaneEdge): void {
    if (singlePaneMode) return;
    const layout: PaneLayout = edge === "left" || edge === "right" ? "columns" : "rows";
    const leads = edge === "left" || edge === "top";
    const order: PaneOrder = (pane === "rendered") === leads ? "rendered-first" : "source-first";
    if (order !== paneOrder) swapPanes();
    if (layout !== paneLayout) togglePaneLayout();
  }

  function applyPanePreferences(): void {
    paneLayout = readLocalStorage("onyx:pane-layout") === "rows" ? "rows" : "columns";
    paneOrder =
      readLocalStorage("onyx:pane-order") === "rendered-first" ? "rendered-first" : "source-first";
    const storedSourcePane = readLocalStorage("onyx:output-pane-visible");
    const storedRenderedPane = readLocalStorage("onyx:rendered-pane-visible");
    scrollSync = readLocalStorage("onyx:scroll-sync") !== "false";
    if (singlePaneMode) {
      showOnlyPane(
        storedRenderedPane === undefined || storedRenderedPane === "false" ? "source" : "rendered",
      );
      return;
    }
    sourcePaneVisible = storedSourcePane !== "false";
    renderedPaneVisible = storedRenderedPane !== "false";
    if (!sourcePaneVisible && !renderedPaneVisible) sourcePaneVisible = true;
  }

  function toggleSourcePane(): void {
    if (singlePaneMode) {
      showOnlyPane(sourcePaneVisible ? "rendered" : "source");
      return;
    }
    if (sourcePaneVisible && !renderedPaneVisible) return;
    sourcePaneVisible = !sourcePaneVisible;
    writeLocalStorage("onyx:output-pane-visible", String(sourcePaneVisible));
  }

  function toggleRenderedPane(): void {
    if (singlePaneMode) {
      showOnlyPane(renderedPaneVisible ? "source" : "rendered");
      return;
    }
    if (renderedPaneVisible && !sourcePaneVisible) return;
    renderedPaneVisible = !renderedPaneVisible;
    writeLocalStorage("onyx:rendered-pane-visible", String(renderedPaneVisible));
  }

  function toggleScrollSync(): void {
    scrollSync = !scrollSync;
    writeLocalStorage("onyx:scroll-sync", String(scrollSync));
  }

  function resetEditorHistory(): void {
    undoStack = [];
    redoStack = [];
    pendingEditorState = undefined;
  }

  function captureEditorState(): void {
    const selection = getEditorSelection();
    if (!selection || pendingEditorState?.markdown === markdown) return;
    pendingEditorState = { markdown, selection };
  }

  function handleEditorBeforeInput(event: InputEvent): void {
    void event;
    captureEditorState();
  }

  function isEditorTarget(target: EventTarget | null): boolean {
    if (!editor) return false;
    if (target === null) return editor === document.activeElement;
    return target === editor || (target instanceof Node && editor.contains(target));
  }

  function getEditorSelection(
    target: EventTarget | null = document.activeElement,
  ): EditorSelection | undefined {
    if (!editor || !isEditorTarget(target)) return;
    return { start: editor.selectionStart, end: editor.selectionEnd };
  }

  function restoreEditorSelection(selection: EditorSelection): void {
    if (!editor) return;
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(
        Math.min(selection.start, markdown.length),
        Math.min(selection.end, markdown.length),
      );
    });
  }

  function rememberEditorState(selection = getEditorSelection()): void {
    if (selection) pendingEditorState = { markdown, selection };
  }

  function pushUndo(entry: EditorHistoryEntry): void {
    undoStack.push(entry);
    if (undoStack.length > EDITOR_HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }

  function undo(): boolean {
    const entry = undoStack.pop();
    if (!entry) return false;
    redoStack.push({ markdown, selection: getEditorSelection() });
    applyingEditorHistory = true;
    updateMarkdown(entry.markdown, { recordHistory: false });
    applyingEditorHistory = false;
    if (entry.selection) restoreEditorSelection(entry.selection);
    return true;
  }

  function redo(): boolean {
    const entry = redoStack.pop();
    if (!entry) return false;
    undoStack.push({ markdown, selection: getEditorSelection() });
    applyingEditorHistory = true;
    updateMarkdown(entry.markdown, { recordHistory: false });
    applyingEditorHistory = false;
    if (entry.selection) restoreEditorSelection(entry.selection);
    return true;
  }

  function replaceEditorSelection(selection: EditorSelection, replacement: string): boolean {
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    if (start === end && replacement.length === 0) return false;
    rememberEditorState(selection);
    updateMarkdown(`${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`);
    restoreEditorSelection({ start: start + replacement.length, end: start + replacement.length });
    return true;
  }

  function writeEditorClipboard(text: string): boolean {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return false;
    void Promise.resolve(clipboard.writeText(text)).catch(() => {
      transferState = "error";
    });
    return true;
  }

  function copyEditorSelection(target: EventTarget | null = document.activeElement): boolean {
    const selection = getEditorSelection(target);
    if (!selection || selection.start === selection.end) return false;
    return writeEditorClipboard(markdown.slice(selection.start, selection.end));
  }

  function cutEditorSelection(target: EventTarget | null = document.activeElement): boolean {
    const selection = getEditorSelection(target);
    if (!selection || selection.start === selection.end) return false;
    if (!writeEditorClipboard(markdown.slice(selection.start, selection.end))) return false;
    return replaceEditorSelection(selection, "");
  }

  function selectAllEditorContent(target: EventTarget | null = document.activeElement): boolean {
    if (!editor || !isEditorTarget(target)) return false;
    editor.focus();
    editor.select();
    return true;
  }

  function handleEditorCopy(event: ClipboardEvent): void {
    const selection = getEditorSelection(event.currentTarget);
    if (!selection || selection.start === selection.end) return;
    const text = markdown.slice(selection.start, selection.end);
    if (event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    } else {
      writeEditorClipboard(text);
    }
  }

  function handleEditorCut(event: ClipboardEvent): void {
    const selection = getEditorSelection(event.currentTarget);
    if (!selection || selection.start === selection.end) return;
    const text = markdown.slice(selection.start, selection.end);
    if (event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    } else if (!writeEditorClipboard(text)) {
      return;
    }
    replaceEditorSelection(selection, "");
  }

  function handleEditorPaste(event: ClipboardEvent): void {
    if (!isEditorTarget(event.currentTarget)) return;
    const files = transferFiles(event.clipboardData);
    if (files.length) {
      const selection = getEditorSelection(event.currentTarget);
      if (!selection) return;
      event.preventDefault();
      void attachFiles(files, selection);
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text === undefined) return;
    const selection = getEditorSelection(event.currentTarget);
    if (!selection) return;
    event.preventDefault();
    replaceEditorSelection(selection, text);
  }

  function handleEditorDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes("Files") || !activeNoteId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleEditorDrop(event: DragEvent): void {
    const files = transferFiles(event.dataTransfer);
    if (!files.length || !isEditorTarget(event.currentTarget)) return;
    event.preventDefault();
    const selection = dropSelection(event) ?? getEditorSelection(event.currentTarget);
    if (selection) void attachFiles(files, selection);
  }

  function transferFiles(transfer: DataTransfer | null | undefined): File[] {
    if (!transfer) return [];
    if (transfer.files.length) return [...transfer.files];
    return [...transfer.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  }

  function dropSelection(event: DragEvent): EditorSelection | undefined {
    if (!(event.currentTarget instanceof HTMLTextAreaElement) || !editor) return;
    // Textareas expose no caret-from-point API, so drops land at the current selection.
    return { start: editor.selectionStart, end: editor.selectionEnd };
  }

  async function attachFiles(files: File[], selection?: EditorSelection): Promise<void> {
    if (!vault || !activeNoteId || files.length === 0 || transferState === "working") return;
    const currentVault = vault;
    const noteId = activeNoteId;
    const target = selection ??
      getEditorSelection() ?? {
        start: markdown.length,
        end: markdown.length,
      };
    try {
      const snippets: string[] = [];
      const urls: LocalAttachmentUrl[] = [];
      for (const file of files) {
        const attachment = await currentVault.addAttachment({
          contents: file,
          folder: attachmentFolder,
          name: attachmentFileName(file),
          noteId,
        });
        urls.push({
          name: attachment.name,
          sourcePath: attachment.sourcePath,
          url: URL.createObjectURL(safeAttachmentBlob(file, attachment.type)),
        });
        snippets.push(
          attachmentMarkdown(
            attachment.name,
            attachment.sourcePath ?? attachment.name,
            activeNoteSourcePath,
            attachment.type,
          ),
        );
      }
      if (activeNoteId !== noteId) {
        for (const url of urls) URL.revokeObjectURL(url.url);
        return;
      }
      localAttachmentUrls = [...localAttachmentUrls, ...urls];
      const start = Math.min(target.start, target.end, markdown.length);
      const before = markdown.slice(0, start);
      const separator = before && !before.endsWith("\n") && snippets.length > 1 ? "\n" : "";
      replaceEditorSelection(
        { ...target, start, end: Math.min(Math.max(target.start, target.end), markdown.length) },
        `${separator}${snippets.join("\n")}`,
      );
      vaultAttachments = await currentVault.listAttachments();
      pendingBackupCount = (await currentVault.getPendingBackupOperations()).length;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be attached.";
    }
  }

  function attachmentFileName(file: File): string {
    if (file.name && file.name !== "image.png") return file.name;
    const extension = file.type.split("/")[1]?.replace(/\+.*$/, "") || "png";
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    return `${file.type.startsWith("image/") ? "image" : "file"}-${stamp}.${extension}`;
  }

  async function attachSelectedFiles(list: FileList | null): Promise<void> {
    const files = [...(list ?? [])];
    if (attachmentInput) attachmentInput.value = "";
    await attachFiles(files);
  }

  function attachmentPreferenceKey(name: string): string {
    return `onyx:${name}:${activeVaultId || "default"}`;
  }

  function readAttachmentPreferences(): void {
    attachmentFolder =
      normalizeAttachmentFolder(
        readLocalStorage(attachmentPreferenceKey("attachment-folder")) ?? "",
      ) ?? DEFAULT_ATTACHMENT_FOLDER;
    attachmentsHidden = readLocalStorage(attachmentPreferenceKey("attachments-hidden")) === "true";
  }

  function setAttachmentsHidden(hidden: boolean): void {
    attachmentsHidden = hidden;
    writeLocalStorage(attachmentPreferenceKey("attachments-hidden"), String(hidden));
  }

  async function renameAttachmentFolder(requested: string): Promise<boolean> {
    const next = normalizeAttachmentFolder(requested);
    if (!next) {
      storageError =
        'Choose a folder name without . or .. segments or the characters < > : " | ? * # %.';
      return false;
    }
    const previous = attachmentFolder;
    if (next === previous) return true;
    if (!vault) return false;
    if (transferState === "working" || !(await settleDraft())) return false;
    const currentVault = vault;
    try {
      const notes = await currentVault.listNotes();
      if (
        notes.some((note) => isPathWithin(noteFilePath(note), next)) ||
        folders.some((folder) => isPathWithin(folder.path, next))
      ) {
        throw new Error(`“${next}” already holds notes. Choose another name for attachments.`);
      }
      const moved = await currentVault.moveAttachmentFolder(previous, next);
      const movedPaths = new Map(
        moved.map((attachment) => [
          movePath(attachment.sourcePath ?? "", next, previous),
          attachment.sourcePath ?? "",
        ]),
      );
      if (movedPaths.size) {
        for (const metadata of notes) {
          const note = await currentVault.getNote(metadata.id);
          if (!note) continue;
          const path = noteFilePath(note);
          const rewritten = rewriteLocalLinks(note.markdown, path, path, (target) =>
            movedPaths.get(target),
          );
          if (rewritten === note.markdown) continue;
          await currentVault.saveNote({
            id: note.id,
            title: note.title,
            markdown: rewritten,
            expectedRevision: note.revision,
          });
        }
      }
      attachmentFolder = next;
      writeLocalStorage(attachmentPreferenceKey("attachment-folder"), next);
      if (activeNoteId) await loadNote(activeNoteId);
      await refreshFileTree();
      pendingBackupCount = (await currentVault.getPendingBackupOperations()).length;
      storageError = "";
      return true;
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "The attachments folder could not be renamed.";
      return false;
    }
  }

  async function openAttachment(id: string): Promise<void> {
    const attachment = await vault?.getAttachment(id);
    if (!attachment) return;
    const url = URL.createObjectURL(safeAttachmentBlob(attachment.file, attachment.metadata.type));
    if (
      attachment.metadata.type.startsWith("image/") &&
      attachment.metadata.type !== "image/svg+xml"
    ) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.metadata.name;
      link.rel = "noopener";
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function safeAttachmentBlob(file: File, type: string): Blob {
    return type.startsWith("image/")
      ? new Blob([file], { type })
      : new Blob([file], { type: "application/octet-stream" });
  }

  function pinnedAttachmentLinks(path: string): string | undefined {
    return isPathWithin(path, attachmentFolder) ? path : undefined;
  }

  function setFont(role: FontRole, id: string): void {
    fontRevision += 1;
    const revision = fontRevision;
    const nextFonts = { ...fonts, [role]: id };
    fonts = nextFonts;
    const nextCategories = { ...fontCategories, [role]: fontCategory(role, id) };
    fontCategories = nextCategories;
    writeFontCategory(role, nextCategories[role]!);
    applyFontChoices(nextFonts);
    if (id === defaultFontChoices[role]) {
      return;
    }
    void loadFont(id).then(
      () => {
        if (fontRevision === revision) applyFontChoices(nextFonts);
      },
      () => {
        if (fontRevision === revision) applyFontChoices(nextFonts);
      },
    );
  }

  function resetFonts(): void {
    fontRevision += 1;
    fonts = { ...defaultFontChoices };
    fontCategories = { ...defaultFontCategories };
    for (const role of Object.keys(fontCategories) as FontRole[]) {
      writeFontCategory(role, fontCategories[role]!);
    }
    applyFontChoices(fonts);
  }

  function setFontCategory(role: FontRole, category: FontCategory): void {
    if (fontCategories[role] === category) return;
    fontRevision += 1;
    fontCategories = { ...fontCategories, [role]: category };
    writeFontCategory(role, category);
    const candidates = fontOptionsFor(role, category);
    const current = fonts[role]!;
    const nextId = candidates.some((option) => option.id === current)
      ? current
      : (candidates[0]?.id ?? current);
    if (nextId !== current) setFont(role, nextId);
  }

  function shortcutLabel(action: ShortcutAction): string | undefined {
    const shortcut = shortcuts[action];
    return shortcut ? formatShortcut(shortcut, primaryModifier) : undefined;
  }

  function setShortcut(action: ShortcutAction, shortcut: KeyboardShortcut | null): void {
    shortcuts = { ...shortcuts, [action]: shortcut };
    writeKeyboardShortcuts(shortcuts);
  }

  function resetShortcuts(): void {
    shortcuts = structuredClone(defaultKeyboardShortcuts);
    writeKeyboardShortcuts(shortcuts);
  }

  function queueSearch(value: string): void {
    searchQuery = value;
    searchPending = Boolean(value.trim());
    notePage = 0;
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = undefined;
      void runSearch(value);
    }, 120);
  }

  async function runSearch(query: string): Promise<void> {
    if (!vault) return;
    searchPending = Boolean(query.trim());
    const sequence = ++searchSequence;
    const nextResults = await vault.search(query);
    if (sequence === searchSequence) {
      results = nextResults;
      notePage = 0;
      notesLoaded = true;
      searchPending = false;
    }
  }

  function changeNotePage(page: number): void {
    notePage = Math.min(Math.max(page, 0), notePageCount - 1);
    noteList?.scrollTo({ top: 0 });
  }

  function insertSyntax(before: string, after = before, placeholder = "text"): void {
    const target = editor;
    if (!target) return;
    const relativeStart = target.selectionStart;
    const selectionEnd = target.selectionEnd;
    const selection = markdown.slice(relativeStart, selectionEnd) || placeholder;
    updateMarkdown(
      `${markdown.slice(0, relativeStart)}${before}${selection}${after}${markdown.slice(selectionEnd)}`,
    );
    requestAnimationFrame(() => {
      target.focus();
      const selectionStart = relativeStart + before.length;
      target.setSelectionRange(selectionStart, selectionStart + selection.length);
    });
  }

  function prefixLine(prefix: string): void {
    const target = editor;
    if (!target) return;
    const relativeCursor = target.selectionStart;
    const start = markdown.lastIndexOf("\n", relativeCursor - 1) + 1;
    updateMarkdown(`${markdown.slice(0, start)}${prefix}${markdown.slice(start)}`);
    requestAnimationFrame(() => {
      target.focus();
      const nextCursor = relativeCursor + prefix.length;
      target.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function keepFindInputFocused(): void {
    requestAnimationFrame(() => {
      if (findOpen && findInput && document.activeElement !== findInput) findInput.focus();
    });
  }

  function focusFindMatch(index: number, sequence = findNavigationSequence): void {
    if (!findOpen || sequence !== findNavigationSequence) return;
    const match = findMatches[index];
    if (!match) return;

    if (singlePaneMode && !sourcePaneVisible) showOnlyPane("source");
    if (!editor) {
      void tick().then(() => focusFindMatch(index, sequence));
      return;
    }

    const target = editor;
    target.focus({ preventScroll: true });
    target.setSelectionRange(match.start, match.end);
    const line = markdown.slice(0, match.start).split("\n").length - 1;
    const lineHeight = Number.parseFloat(getComputedStyle(target).lineHeight) || 24;
    const paddingTop = Number.parseFloat(getComputedStyle(target).paddingTop) || 0;
    const targetTop = paddingTop + line * lineHeight;
    if (target.scrollHeight > target.clientHeight) {
      target.scrollTop = Math.max(
        0,
        Math.min(target.scrollHeight - target.clientHeight, targetTop - target.clientHeight / 2),
      );
    } else {
      // On touch layouts the textarea grows with its text and the page scrolls instead.
      const top = target.getBoundingClientRect().top + window.scrollY + targetTop;
      window.scrollTo({ top: Math.max(0, top - window.innerHeight / 2) });
    }
    keepFindInputFocused();
  }

  function queueFindNavigation(): void {
    const sequence = ++findNavigationSequence;
    void tick().then(() => {
      if (sequence !== findNavigationSequence || !findOpen || activeFindMatch < 0) return;
      focusFindMatch(activeFindMatch, sequence);
    });
  }

  function setFindQuery(value: string): void {
    findQuery = value;
    findMatchIndex = value ? 0 : -1;
    queueFindNavigation();
  }

  function setFindReplacement(value: string): void {
    findReplacement = value;
  }

  function setFindMatchCase(value: boolean): void {
    findMatchCase = value;
    findMatchIndex = findQuery ? 0 : -1;
    queueFindNavigation();
  }

  function setFindWholeWord(value: boolean): void {
    findWholeWord = value;
    findMatchIndex = findQuery ? 0 : -1;
    queueFindNavigation();
  }

  function moveFindMatch(direction: 1 | -1): void {
    if (findMatches.length === 0) return;
    const current = activeFindMatch < 0 ? (direction > 0 ? -1 : 0) : activeFindMatch;
    findMatchIndex = (current + direction + findMatches.length) % findMatches.length;
    queueFindNavigation();
  }

  function toggleFind(): void {
    if (findOpen) {
      closeFind();
      return;
    }
    openFind();
  }

  function openFind(): void {
    if (findOpen) {
      requestAnimationFrame(() => {
        findInput?.focus();
        findInput?.select();
      });
      return;
    }
    findOpener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const selection = getEditorSelection();
    if (selection && selection.start !== selection.end) {
      findQuery = markdown.slice(selection.start, selection.end);
    }
    findMatchIndex = findQuery ? 0 : -1;
    findSidebarState = { collapsed: sidebarCollapsed, open: sidebarOpen };
    sidebarCollapsed = false;
    if (window.innerWidth <= 900) sidebarOpen = true;
    findOpen = true;
    const sequence = ++findNavigationSequence;
    void tick().then(() => {
      if (sequence !== findNavigationSequence || !findOpen) return;
      findInput?.focus();
      findInput?.select();
      if (activeFindMatch >= 0) focusFindMatch(activeFindMatch, sequence);
    });
  }

  function closeFind(): void {
    if (!findOpen) return;
    const previousSidebarState = findSidebarState;
    findSidebarState = undefined;
    findOpen = false;
    findNavigationSequence += 1;
    if (previousSidebarState) {
      sidebarCollapsed = previousSidebarState.collapsed;
      sidebarOpen = previousSidebarState.open;
    }
    const opener = findOpener;
    findOpener = undefined;
    restoreModalFocus(opener);
  }

  function replaceFind(): void {
    const match = findMatches[activeFindMatch];
    if (!match || !findCanEdit) return;
    rememberEditorState({ start: match.start, end: match.end });
    const nextValue = markdown.slice(0, match.start) + findReplacement + markdown.slice(match.end);
    const nextMatches = findTextMatches(nextValue, findQuery, {
      matchCase: findMatchCase,
      wholeWord: findWholeWord,
    });
    const nextIndex = nextMatches.findIndex(
      (candidate) => candidate.start >= match.start + findReplacement.length,
    );
    updateMarkdown(nextValue);
    findMatchIndex = nextMatches.length === 0 ? -1 : nextIndex >= 0 ? nextIndex : 0;
    queueFindNavigation();
  }

  function replaceAllFind(): void {
    if (findMatches.length === 0 || !findCanEdit) return;
    const matches = findMatches;
    rememberEditorState({
      start: matches[0]!.start,
      end: matches.at(-1)!.end,
    });
    let nextValue = markdown;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index]!;
      nextValue = `${nextValue.slice(0, match.start)}${findReplacement}${nextValue.slice(match.end)}`;
    }
    const nextMatches = findTextMatches(nextValue, findQuery, {
      matchCase: findMatchCase,
      wholeWord: findWholeWord,
    });
    updateMarkdown(nextValue);
    findMatchIndex = nextMatches.length > 0 ? 0 : -1;
    queueFindNavigation();
  }

  function handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (
      findOpen &&
      !event.altKey &&
      (event.key === "F3" ||
        (event.key.toLowerCase() === "g" &&
          (primaryModifier === "meta" ? event.metaKey : event.ctrlKey)))
    ) {
      event.preventDefault();
      moveFindMatch(event.shiftKey ? -1 : 1);
      return;
    }
    const action = (Object.keys(shortcuts) as ShortcutAction[]).find((candidate) =>
      shortcutMatchesEvent(shortcuts[candidate], event, primaryModifier),
    );

    // Paste carries files in its ClipboardEvent, which the keydown cannot see.
    // Let the browser fire the native paste so images land on the first press.
    if (action === "paste" && isEditorTarget(event.target)) return;

    if (action && isEditorShortcutAction(action)) {
      if (!isEditorTarget(event.target)) return;
      if (runEditorShortcut(action, event.target)) event.preventDefault();
      return;
    }

    if (!action && isEditorTarget(event.target)) {
      const implicitAction = editorShortcutAlias(event);
      if (implicitAction && runEditorShortcut(implicitAction, event.target)) {
        event.preventDefault();
        return;
      }
    }

    if (!action) return;
    const shortcut = shortcuts[action];
    if (
      isTypingTarget(event.target) &&
      action !== "closePanel" &&
      !shortcut?.primary &&
      !shortcut?.alt
    )
      return;
    if (paletteOpen && action !== "commandPalette" && action !== "closePanel") {
      event.preventDefault();
      return;
    }
    event.preventDefault();

    if (action === "commandPalette") togglePalette();
    else if (action === "findInNote") toggleFind();
    else if (action === "saveNote" && transferState !== "working") void saveDraft();
    else if (action === "newNote" && transferState !== "working") void createNote();
    else if (action === "searchNotes" || action === "focusSearch") focusSearch();
    else if (action === "cycleTheme") setTheme(nextThemePreference(theme));
    else if (action === "toggleSidebar") toggleSidebar();
    else if (action === "bold") insertSyntax("**", "**", "bold text");
    else if (action === "italic") insertSyntax("_", "_", "italic text");
    else if (action === "togglePreview") toggleRenderedPane();
    else if (action === "openShortcuts") void openSettings("shortcuts").catch(() => undefined);
    else if (action === "closePanel") {
      if (restoreModalOpen && restoreState !== "restoring") restoreModalOpen = false;
      else if (settingsOpen) closeSettings();
      else if (paletteOpen) closePalette();
      else if (findOpen) closeFind();
      else if (sidebarOpen) sidebarOpen = false;
      else if (searchQuery) resetPaletteSearch();
    }
  }

  function isEditorShortcutAction(action: ShortcutAction): boolean {
    return ["cutSelection", "copySelection", "undo", "redo", "selectAll"].includes(action);
  }

  function editorShortcutAlias(event: KeyboardEvent): ShortcutAction | undefined {
    const primaryPressed = primaryModifier === "meta" ? event.metaKey : event.ctrlKey;
    if (!primaryPressed || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "x" && !event.shiftKey) return "cutSelection";
    if (key === "c" && !event.shiftKey) return "copySelection";
    if (key === "a" && !event.shiftKey) return "selectAll";
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && !event.shiftKey) return "redo";
  }

  function runEditorShortcut(action: ShortcutAction, target: EventTarget | null): boolean {
    if (action === "cutSelection") return cutEditorSelection(target);
    if (action === "copySelection") return copyEditorSelection(target);
    if (action === "undo") return undo() || isEditorTarget(target);
    if (action === "redo") return redo() || isEditorTarget(target);
    if (action === "selectAll") return selectAllEditorContent(target);
    return false;
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  function focusSearch(): void {
    if (paletteOpen) {
      requestAnimationFrame(() => {
        searchInput?.focus();
        searchInput?.select();
      });
      return;
    }
    openPalette();
  }

  function toggleSidebar(): void {
    if (window.innerWidth <= 900) sidebarOpen = !sidebarOpen;
    else sidebarCollapsed = !sidebarCollapsed;
  }

  function setSidebarSide(side: SidebarSide): void {
    sidebarSide = side;
    writeLocalStorage("onyx:sidebar-side", side);
  }

  /** Holding a sidebar toggle picks it up; releasing it over either half of the window docks the sidebar there. */
  function startSidebarDrag(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const holdTimer = window.setTimeout(() => {
      dragging = true;
      sidebarDropSide = sidebarSide;
    }, SIDEBAR_DRAG_HOLD_MS);
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      if (dragging) {
        moveEvent.preventDefault();
        sidebarDropSide = moveEvent.clientX > window.innerWidth / 2 ? "right" : "left";
      } else if (
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > SIDEBAR_DRAG_SLOP_PX
      ) {
        finish();
      }
    };
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      if (dragging && sidebarDropSide) {
        setSidebarSide(sidebarDropSide);
        // The release would otherwise land as a click and toggle the sidebar.
        window.addEventListener("click", swallowClick, { capture: true, once: true });
        window.setTimeout(
          () => window.removeEventListener("click", swallowClick, { capture: true }),
          0,
        );
      }
      finish();
    };
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === event.pointerId) finish();
    };
    const onContextMenu = (menuEvent: Event) => {
      if (dragging) menuEvent.preventDefault();
    };
    function swallowClick(clickEvent: Event): void {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
    }
    function finish(): void {
      window.clearTimeout(holdTimer);
      sidebarDropSide = undefined;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("contextmenu", onContextMenu);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("contextmenu", onContextMenu);
  }

  function setTheme(preference: ThemePreference): void {
    theme = preference;
    resolvedTheme = applyTheme(preference);
  }

  function setColorTheme(nextTheme: ColorTheme): void {
    colorTheme = nextTheme;
    applyColorTheme(nextTheme);
  }

  function togglePalette(): void {
    if (paletteOpen) {
      const previousSidebarState = paletteSidebarState;
      closePalette();
      if (previousSidebarState) {
        sidebarCollapsed = previousSidebarState.collapsed;
        sidebarOpen = previousSidebarState.open;
      }
      return;
    }
    openPalette();
  }

  function openPalette(): void {
    if (paletteOpen) {
      focusSearch();
      return;
    }
    if (!paletteOpen && document.activeElement instanceof HTMLElement) {
      paletteOpener = document.activeElement;
    }
    paletteSidebarState = { collapsed: sidebarCollapsed, open: sidebarOpen };
    sidebarCollapsed = false;
    if (window.innerWidth <= 900) sidebarOpen = true;
    paletteOpen = true;
    void refreshPaletteNotes();
  }

  async function refreshPaletteNotes(): Promise<void> {
    const openedVault = vault;
    const notes = openedVault ? await openedVault.listNotes() : [];
    if (openedVault === vault) paletteNotes = notes;
  }

  function closePalette(): void {
    paletteOpen = false;
    paletteSidebarState = undefined;
    resetPaletteSearch();
    const opener = paletteOpener;
    paletteOpener = undefined;
    if (opener?.isConnected) {
      restoreModalFocus(opener);
      return;
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-label="Open the command palette"]')?.focus();
    });
  }

  function resetPaletteSearch(): void {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = undefined;
    searchSequence += 1;
    searchQuery = "";
    searchPending = false;
    notePage = 0;
    void runSearch("");
  }

  function moveNoteFocus(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const files = [...(noteList?.querySelectorAll<HTMLButtonElement>(".file") ?? [])];
    const current = files.indexOf(document.activeElement as HTMLButtonElement);
    if (files.length === 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? current + 1 : current - 1;
    files[(next + files.length) % files.length]?.focus();
  }

  return {
    get vaults() {
      return vaults;
    },
    get activeVaultId() {
      return activeVaultId;
    },
    get vaultName() {
      return activeVault?.name ?? "Notes";
    },
    get suggestedRepositoryName() {
      return suggestedRepositoryName(activeVault);
    },
    get activeNoteId() {
      return activeNoteId;
    },
    get results() {
      return results;
    },
    get visibleResults() {
      return visibleResults;
    },
    get folders() {
      return folders;
    },
    get searchQuery() {
      return searchQuery;
    },
    get searchPending() {
      return searchPending;
    },
    get findOpen() {
      return findOpen;
    },
    set findOpen(value: boolean) {
      findOpen = value;
    },
    get findQuery() {
      return findQuery;
    },
    get findReplacement() {
      return findReplacement;
    },
    get findMatchCase() {
      return findMatchCase;
    },
    get findWholeWord() {
      return findWholeWord;
    },
    get findMatchCount() {
      return findMatches.length;
    },
    get activeFindMatch() {
      return activeFindMatch;
    },
    get findMatches(): FindMatch[] {
      return findMatches;
    },
    get findCanEdit() {
      return findCanEdit;
    },
    get notePage() {
      return notePage;
    },
    get notePageCount() {
      return notePageCount;
    },
    get notesLoaded() {
      return notesLoaded;
    },
    get saveState() {
      return saveState;
    },
    get transferState() {
      return transferState;
    },
    get storageError() {
      return storageError;
    },
    get storageNotice() {
      return storageNotice;
    },
    get isOnline() {
      return isOnline;
    },
    get githubState() {
      return githubState;
    },
    get githubUser() {
      return githubUser;
    },
    get githubMessage() {
      return githubMessage;
    },
    get githubBackup() {
      return githubBackup;
    },
    get backupState() {
      return backupState;
    },
    get backupMessage() {
      return backupMessage;
    },
    set backupMessage(value: string) {
      backupMessage = value;
    },
    get backupCommitUrl() {
      return backupCommitUrl;
    },
    get settingsOpen() {
      return settingsOpen;
    },
    set settingsOpen(value: boolean) {
      settingsOpen = value;
    },
    get settingsSection() {
      return settingsSection;
    },
    set settingsSection(value: SettingsSection) {
      settingsSection = value;
    },
    get pendingBackupCount() {
      return pendingBackupCount;
    },
    get restoreModalOpen() {
      return restoreModalOpen;
    },
    set restoreModalOpen(value: boolean) {
      restoreModalOpen = value;
    },
    get restoreState() {
      return restoreState;
    },
    get restoreMessage() {
      return restoreMessage;
    },
    get restoreCommits() {
      return restoreCommits;
    },
    get selectedRestoreSha() {
      return selectedRestoreSha;
    },
    set selectedRestoreSha(value: string) {
      selectedRestoreSha = value;
    },
    get restoreOwner() {
      return restoreOwner;
    },
    set restoreOwner(value: string) {
      restoreOwner = value;
    },
    get restoreRepository() {
      return restoreRepository;
    },
    set restoreRepository(value: string) {
      restoreRepository = value;
    },
    get restoreBranch() {
      return restoreBranch;
    },
    set restoreBranch(value: string) {
      restoreBranch = value;
    },
    get restoreDirectory() {
      return restoreDirectory;
    },
    set restoreDirectory(value: string) {
      restoreDirectory = value;
    },
    get theme() {
      return theme;
    },
    get resolvedTheme() {
      return resolvedTheme;
    },
    get colorTheme() {
      return colorTheme;
    },
    get fonts() {
      return fonts;
    },
    get fontCategories() {
      return fontCategories;
    },
    get shortcuts() {
      return shortcuts;
    },
    get primaryModifier() {
      return primaryModifier;
    },
    get sourcePaneVisible() {
      return sourcePaneVisible;
    },
    get renderedPaneVisible() {
      return renderedPaneVisible;
    },
    get scrollSync() {
      return scrollSync;
    },
    get paneLayout() {
      return effectivePaneLayout;
    },
    get paneOrder() {
      return paneOrder;
    },
    get singlePaneMode() {
      return singlePaneMode;
    },
    get splitRatio() {
      return splitRatio;
    },
    get contentWidth() {
      return contentWidth;
    },
    get markdown() {
      return markdown;
    },
    get markdownLines() {
      return markdownLines;
    },
    get wordCount() {
      return wordCount;
    },
    get readingMinutes() {
      return readingMinutes;
    },
    get hasContent() {
      return hasContent;
    },
    get renderedMarkdown() {
      return renderedMarkdown;
    },
    get renderedBlockLines() {
      return renderedBlockLines;
    },
    get paletteItems() {
      return paletteItems;
    },
    get paletteOpen() {
      return paletteOpen;
    },
    set paletteOpen(value: boolean) {
      paletteOpen = value;
    },
    get sidebarOpen() {
      return sidebarOpen;
    },
    set sidebarOpen(value: boolean) {
      sidebarOpen = value;
    },
    get sidebarCollapsed() {
      return sidebarCollapsed;
    },
    set sidebarCollapsed(value: boolean) {
      sidebarCollapsed = value;
    },
    get sidebarSide() {
      return sidebarSide;
    },
    get sidebarDropSide() {
      return sidebarDropSide;
    },
    get vault() {
      return vault;
    },
    get editor() {
      return editor;
    },
    set editor(value: HTMLTextAreaElement | undefined) {
      editor = value;
    },
    get searchInput() {
      return searchInput;
    },
    set searchInput(value: HTMLInputElement | undefined) {
      searchInput = value;
    },
    get findInput() {
      return findInput;
    },
    set findInput(value: HTMLInputElement | undefined) {
      findInput = value;
    },
    get findReplaceInput() {
      return findReplaceInput;
    },
    set findReplaceInput(value: HTMLInputElement | undefined) {
      findReplaceInput = value;
    },
    get noteList() {
      return noteList;
    },
    set noteList(value: HTMLElement | undefined) {
      noteList = value;
    },
    get folderInput() {
      return folderInput;
    },
    set folderInput(value: HTMLInputElement | undefined) {
      folderInput = value;
    },
    get attachmentInput() {
      return attachmentInput;
    },
    set attachmentInput(value: HTMLInputElement | undefined) {
      attachmentInput = value;
    },
    get attachmentFolder() {
      return attachmentFolder;
    },
    get attachmentsHidden() {
      return attachmentsHidden;
    },
    get vaultAttachments() {
      return vaultAttachments;
    },
    get trashedNotes() {
      return trashedNotes;
    },
    get trashOpen() {
      return trashOpen;
    },
    set trashOpen(value: boolean) {
      trashOpen = value;
    },
    get zipInput() {
      return zipInput;
    },
    set zipInput(value: HTMLInputElement | undefined) {
      zipInput = value;
    },
    selectVault,
    createVault,
    renameVault,
    createNote,
    queueSearch,
    openFind,
    closeFind,
    setFindQuery,
    setFindReplacement,
    setFindMatchCase,
    setFindWholeWord,
    previousFindMatch: () => moveFindMatch(-1),
    nextFindMatch: () => moveFindMatch(1),
    replaceFind,
    replaceAllFind,
    openPalette,
    closePalette,
    openSettings,
    closeSettings,
    connectGitHub,
    disconnectGitHub,
    moveNoteFocus,
    selectNote,
    createFile: createNote,
    createFolder,
    renameFile,
    renameFolder,
    moveFile,
    moveFolder,
    deleteFile,
    deleteFolder,
    restoreFile,
    purgeFile,
    emptyTrash,
    toggleTrash,
    copyFilePath,
    changeNotePage,
    saveDraft,
    openVault,
    dismissStorageNotice,
    toggleSidebar,
    setSidebarSide,
    startSidebarDrag,
    insertSyntax,
    prefixLine,
    setSplitRatio,
    saveSplitRatio,
    setContentWidth,
    toggleSourcePane,
    toggleRenderedPane,
    swapPanes,
    togglePaneLayout,
    placePane,
    copyNoteAs,
    exportNoteAs,
    toggleScrollSync,
    handleEditorBeforeInput,
    handleEditorCopy,
    handleEditorCut,
    handleEditorPaste,
    handleEditorDragOver,
    handleEditorDrop,
    attachSelectedFiles,
    setAttachmentsHidden,
    renameAttachmentFolder,
    openAttachment,
    updateMarkdown,
    setTheme,
    setColorTheme,
    setFont,
    setFontCategory,
    resetFonts,
    setShortcut,
    resetShortcuts,
    createBackupRepository,
    selectBackupRepository,
    forgetBackupRepository,
    beginBackup,
    openRestore,
    importFolder,
    importZip,
    exportFolder,
    exportZip,
    prepareVaultDeletion,
    clearVault,
    loadRestoreCommits,
    restoreSelectedCommit,
    formatCommitDate,
    dismissBackupMessage() {
      backupMessage = "";
    },
  };
}
