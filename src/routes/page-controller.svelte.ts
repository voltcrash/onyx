import { compareSidebarNotes } from "#lib/sidebar-sort.ts";
import { createNoteCreationController } from "./note-creation-controller.svelte.ts";
import { noteOutline, type NoteMention, type NoteHeading } from "#lib/note-insights.ts";
import { createHistoryController } from "./history-controller.svelte.ts";
import { createFileTreeController } from "./file-tree-controller.svelte.ts";
import { createPreferencesController } from "./preferences-controller.svelte.ts";
import { createTransferController } from "./transfer-controller.svelte.ts";
import { createGithubController } from "./github-controller.svelte.ts";
import { createLazyResource } from "#lib/lazy-resource.ts";
import { FileText } from "@lucide/svelte";
import type { PaneEdge, PaneLayout, PaneOrder, SaveState } from "#lib/components/app-types.ts";

import type { SettingsSection } from "#lib/components/settings-types.ts";
import {
  attachmentMarkdown,
  countLines,
  countWords,
  DEFAULT_ATTACHMENT_FOLDER,
  findNoteIdForPath,
  indentEditorLines,
  normalizeAttachmentFolder,
  parseRelativeNoteLink,
  pasteUrlOverSelection,
  resolveLocalAttachmentUrl,
  titleFromMarkdown,
  toggleCheckboxes,
  toggleInlineSyntax,
  type LocalAttachmentUrl,
} from "#lib/markdown-utils.ts";
import {
  browserStorageWarnings,
  subscribePreferenceWriteFailures,
  detectBrowserStorageSupport,
  persistenceDeniedMessage,
  readLocalStorage,
  writeLocalStorage,
} from "#lib/browser-storage.ts";
import { defaultFontChoices, type FontRole } from "#lib/fonts.ts";

import {
  defaultKeyboardShortcuts,
  detectPrimaryModifier,
  readKeyboardShortcuts,
  shortcutsEqual,
  shortcutMatchesEvent,
  type ShortcutAction,
} from "#lib/keyboard-shortcuts.ts";
import {
  createVaultDescriptor,
  isDefaultVault,
  listedSearchResult,
  normalizeVaultName,
  loadVaultRegistry,
  uniqueVaultName,
  vaultOptions,
  Vault,
  VaultConflictError,
  writeVaultRegistry,
  type VaultChangeEvent,
  type VaultDescriptor,
  type VaultSearchResult,
} from "#lib/storage/index.ts";

import type { AttachmentMetadata, FolderMetadata, Note, NoteMetadata } from "#lib/storage/types.ts";
import {
  applyColorTheme,
  applyTheme,
  nextThemePreference,
  readColorTheme,
  readThemePreference,
  watchSystemTheme,
} from "#lib/theme.ts";
import type { FindMatch } from "#lib/find-replace.ts";
import { createFindReplace } from "./find-replace.svelte.ts";
import { createPreviewRenderer } from "./preview-renderer.svelte.ts";
import { createConfirmation } from "./confirmation.svelte.ts";
import { resolveWikiLink, splitWikiTarget } from "#lib/wikilinks.ts";
import { paletteCommands, type PaletteActions, type PaletteCommand } from "./palette-commands.ts";

import { createNoteOutput } from "#lib/note-output.ts";
import {
  basename,
  decodePath,
  fileStem,
  isPathWithin,
  normalizeFileName,
  noteFilePath,
  parentPath,
} from "#lib/paths.ts";

import { createInitialMarkdown } from "./welcome-note.ts";
import { startSidebarDrag, type SidebarSide } from "#lib/sidebar-drag.ts";
import {
  clampContentWidth,
  clampSidebarWidth,
  clampSplitRatio,
  DEFAULT_CONTENT_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from "#lib/layout.ts";
import type { EditorSelection } from "#lib/markdown-editor.ts";
import type { MarkdownEditor } from "#lib/markdown-editor.ts";
import { onMount, tick, untrack } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";

const NOTE_PAGE_SIZE = 100;
const PREVIEW_SETTLE_MS = 160;
const DEFERRED_STARTUP_DELAY_MS = 8_000;
const AUTO_BACKUP_DELAY_MS = 2 * 60_000;
// Matches the single-column breakpoint in the responsive stylesheet.
const NARROW_VIEWPORT = "(max-width: 900px)";

const githubResource = createLazyResource(() => import("#lib/github.ts"));
const stylesResource = createLazyResource(() => import("#lib/lazy-styles.ts"));
const loadGithubModule = () => githubResource.load();
const loadLazyStylesModule = () => stylesResource.load();

type SidebarState = { collapsed: boolean; open: boolean };

export interface ImagePreviewState {
  id: string;
  name: string;
  url: string;
}

export function createPageController() {
  const fileTreeController = createFileTreeController({
    get vault() {
      return vault;
    },
    set vault(value) {
      vault = value;
    },
    get transferController() {
      return transferController;
    },
    get settleDraft() {
      return settleDraft;
    },
    get saveState() {
      return saveState;
    },
    set saveState(value) {
      saveState = value;
    },
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(value) {
      searchQuery = value;
    },
    get loadNote() {
      return loadNote;
    },
    get refreshFileTree() {
      return refreshFileTree;
    },
    get editor() {
      return editor;
    },
    set editor(value) {
      editor = value;
    },
    get storageError() {
      return storageError;
    },
    set storageError(value) {
      storageError = value;
    },
    get markdown() {
      return markdown;
    },
    set markdown(value) {
      editor?.resetHistory();
      markdown = value;
    },
    get lastSavedMarkdown() {
      return lastSavedMarkdown;
    },
    set lastSavedMarkdown(value) {
      lastSavedMarkdown = value;
    },
    get folders() {
      return folders;
    },
    set folders(value) {
      folders = value;
    },
    get pendingBackupCount() {
      return pendingBackupCount;
    },
    set pendingBackupCount(value) {
      pendingBackupCount = value;
    },
    get attachmentFolder() {
      return attachmentFolder;
    },
    set attachmentFolder(value) {
      attachmentFolder = value;
    },
    get activeNoteId() {
      return activeNoteId;
    },
    set activeNoteId(value) {
      activeNoteId = value;
    },
    get renameAttachmentFolder() {
      return renameAttachmentFolder;
    },
    get resetActiveNote() {
      return resetActiveNote;
    },
    get imagePreview() {
      return imagePreview;
    },
    set imagePreview(value) {
      imagePreview = value;
    },
    get closeImagePreview() {
      return closeImagePreview;
    },
    get localAttachmentUrls() {
      return localAttachmentUrls;
    },
    set localAttachmentUrls(value) {
      localAttachmentUrls = value;
    },
    get preview() {
      return preview;
    },
    get selectNote() {
      return selectNote;
    },
    get confirmation() {
      return confirmation;
    },
    get trashedNotes() {
      return trashedNotes;
    },
    set trashedNotes(value) {
      trashedNotes = value;
    },
    get paletteOpen() {
      return paletteOpen;
    },
    set paletteOpen(value) {
      paletteOpen = value;
    },
    get closePalette() {
      return closePalette;
    },
    get find() {
      return find;
    },
  });

  const preferencesController = createPreferencesController();

  const transferController = createTransferController({
    get vault() {
      return vault;
    },
    set vault(value) {
      vault = value;
    },
    get settleDraft() {
      return settleDraft;
    },
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(value) {
      searchQuery = value;
    },
    get loadNote() {
      return loadNote;
    },
    get resetActiveNote() {
      return resetActiveNote;
    },
    get refreshFileTree() {
      return refreshFileTree;
    },
    get pendingBackupCount() {
      return pendingBackupCount;
    },
    set pendingBackupCount(value) {
      pendingBackupCount = value;
    },
    get markdown() {
      return markdown;
    },
    set markdown(value) {
      editor?.resetHistory();
      markdown = value;
    },
    get localAttachmentUrls() {
      return localAttachmentUrls;
    },
    set localAttachmentUrls(value) {
      localAttachmentUrls = value;
    },
    get activeNoteSourcePath() {
      return activeNoteSourcePath;
    },
    set activeNoteSourcePath(value) {
      activeNoteSourcePath = value;
    },
    get preview() {
      return preview;
    },
    get activeNoteId() {
      return activeNoteId;
    },
    set activeNoteId(value) {
      activeNoteId = value;
    },
    get noteTitle() {
      return noteTitle;
    },
    get noteOutput() {
      return noteOutput;
    },
    get selectNote() {
      return selectNote;
    },
  });

  const githubController = createGithubController({
    get disposed() {
      return disposed;
    },
    set disposed(value) {
      disposed = value;
    },
    get authenticationRequest() {
      return authenticationRequest;
    },
    set authenticationRequest(value) {
      authenticationRequest = value;
    },
    get githubRestoreTimer() {
      return githubRestoreTimer;
    },
    set githubRestoreTimer(value) {
      githubRestoreTimer = value;
    },
    get activeVaultId() {
      return activeVaultId;
    },
    set activeVaultId(value) {
      activeVaultId = value;
    },
    get activeNoteId() {
      return activeNoteId;
    },
    set activeNoteId(value) {
      activeNoteId = value;
    },
    get isOnline() {
      return isOnline;
    },
    set isOnline(value) {
      isOnline = value;
    },
    get loadGithubModule() {
      return loadGithubModule;
    },
    get authenticationCleanup() {
      return authenticationCleanup;
    },
    set authenticationCleanup(value) {
      authenticationCleanup = value;
    },
    get vault() {
      return vault;
    },
    set vault(value) {
      vault = value;
    },
    get settleDraft() {
      return settleDraft;
    },
    get openSettings() {
      return openSettings;
    },
    get settingsSection() {
      return settingsSection;
    },
    set settingsSection(value) {
      settingsSection = value;
    },
    get settingsOpen() {
      return settingsOpen;
    },
    set settingsOpen(value) {
      settingsOpen = value;
    },
    get pendingBackupCount() {
      return pendingBackupCount;
    },
    set pendingBackupCount(value) {
      pendingBackupCount = value;
    },
    get AUTO_BACKUP_DELAY_MS() {
      return AUTO_BACKUP_DELAY_MS;
    },
    get workspaceOperation() {
      return workspaceOperation;
    },
    set workspaceOperation(value) {
      workspaceOperation = value;
    },
    get confirmation() {
      return confirmation;
    },
    get markdown() {
      return markdown;
    },
    set markdown(value) {
      editor?.resetHistory();
      markdown = value;
    },
    get lastSavedMarkdown() {
      return lastSavedMarkdown;
    },
    set lastSavedMarkdown(value) {
      lastSavedMarkdown = value;
    },
    get saveDraft() {
      return saveDraft;
    },
    get activeVault() {
      return activeVault;
    },
    get loadDialogStyles() {
      return loadDialogStyles;
    },
    get saveState() {
      return saveState;
    },
    set saveState(value) {
      saveState = value;
    },
    get saveTimer() {
      return saveTimer;
    },
    set saveTimer(value) {
      saveTimer = value;
    },
    get searchTimer() {
      return searchTimer;
    },
    set searchTimer(value) {
      searchTimer = value;
    },
    get searchSequence() {
      return searchSequence;
    },
    set searchSequence(value) {
      searchSequence = value;
    },
    get folders() {
      return folders;
    },
    set folders(value) {
      folders = value;
    },
    get searchQuery() {
      return searchQuery;
    },
    set searchQuery(value) {
      searchQuery = value;
    },
    get loadNote() {
      return loadNote;
    },
    get resetActiveNote() {
      return resetActiveNote;
    },
    get vaultAttachments() {
      return vaultAttachments;
    },
    set vaultAttachments(value) {
      vaultAttachments = value;
    },
    get runSearch() {
      return runSearch;
    },
  });

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
  let saveFailure = $state<"conflict" | "storage">();
  let observedVaultVersion = 0;
  let notesLoaded = $state(false);
  let saveTimer: number | undefined = $state();
  let saveRun: Promise<boolean> | undefined;
  let saveRequested = false;
  let searchTimer: number | undefined = $state();
  let searchState = $state<
    | { status: "idle" }
    | { status: "pending" | "ready"; query: string }
    | { status: "failed"; query: string; message: string }
  >({ status: "idle" });
  const searchPending = $derived(
    searchState.status === "pending" && Boolean(searchState.query.trim()),
  );
  const searchError = $derived(searchState.status === "failed" ? searchState.message : "");
  let previewFrame: number | undefined = $state();
  let previewSettleTimer: number | undefined = $state();
  let pendingPreviewMarkdown = initialMarkdown;
  let searchSequence = 0;
  let settledSearchSequence = 0;
  let editor: MarkdownEditor | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();
  let sidebarOpen = $state(false);
  let storageError = $state("");
  let storageNotice = $state("");
  let isOnline = $state(true);
  let settingsOpen = $state(false);
  let settingsSection = $state<SettingsSection>("editor");
  let pendingBackupCount = $state(0);
  let attachmentInput: HTMLInputElement | undefined = $state();
  let attachmentFolder = $state(DEFAULT_ATTACHMENT_FOLDER);
  let attachmentsHidden = $state(false);
  let vaultAttachments = $state<AttachmentMetadata[]>([]);
  let trashedNotes = $state<NoteMetadata[]>([]);
  let backlinks = $state.raw<NoteMetadata[]>([]);
  let unlinkedMentions = $state.raw<Array<NoteMention & { noteId: string; title: string }>>([]);
  const outline = $derived(noteOutline(markdown));
  let backlinksSequence = 0;
  let paletteOpen = $state(false);
  let paletteNotes = $state<NoteMetadata[]>([]);
  let recentNoteIds = $state<string[]>([]);
  let sidebarCollapsed = $state(false);
  let sidebarSide = $state<SidebarSide>("left");
  let sidebarWidth = $state(DEFAULT_SIDEBAR_WIDTH);
  let sidebarDropSide = $state<SidebarSide | undefined>();
  let noteList: HTMLElement | undefined = $state();
  let activeNoteSourcePath: string | undefined = $state();
  // Replaced rather than mutated, so a render can be matched to the list it resolved against.
  let localAttachmentUrls = $state.raw<LocalAttachmentUrl[]>([]);
  let imagePreview = $state<ImagePreviewState>();
  let imagePreviewRequest = 0;
  const dialogStyles = createLazyResource(() =>
    loadLazyStylesModule().then((module) => module.loadDialogStyles()),
  );
  let serviceWorkerTimer: number | undefined;
  let githubRestoreTimer: number | undefined;
  let settingsOpener: HTMLElement | undefined;
  let settingsRequest = 0;
  let sidebarDragCleanup: (() => void) | undefined;
  const startupDeadline = Date.now() + 5_000;
  let paletteOpener: HTMLElement | undefined;
  let paletteSidebarState: SidebarState | undefined;
  let unsubscribeVault: (() => void) | undefined;
  let remoteSyncRun: Promise<void> | undefined;
  let remoteSyncRequested = false;
  const remoteChanges: VaultChangeEvent[] = [];
  let noteLoadSequence = 0;
  let clearingVault = false;
  let disposed = false;
  let vaultGeneration = 0;
  let draftVersion = 0;
  let workspaceOperation = $state<string>();
  let pendingNavigation: (() => Promise<void>) | undefined;
  let vaultPhase = $state<"closed" | "opening" | "ready" | "failed" | "closing">("closed");
  let startupFrame: number | undefined;
  let authenticationCleanup: (() => void) | undefined;
  let authenticationRequest = 0;

  function workspaceCommand<Args extends unknown[]>(
    action: (...args: Args) => Promise<void>,
    kind: "navigation" | "mutation" = "mutation",
    propagate = false,
  ): (...args: Args) => Promise<void> {
    return async (...args) => {
      if (disposed) return;
      if (workspaceOperation) {
        if (kind === "navigation")
          pendingNavigation = () => workspaceCommand(action, kind)(...args);
        if (propagate) throw new Error("Another workspace operation is still running. Try again.");
        return;
      }
      workspaceOperation = kind;
      try {
        if (remoteSyncRun) await remoteSyncRun;
        await action(...args);
        if (vault && vaultPhase === "ready")
          observedVaultVersion = await vault.getVersion().catch(() => observedVaultVersion);
      } catch (error) {
        storageError =
          error instanceof Error ? error.message : "The operation could not be completed.";
        if (propagate) throw error;
      } finally {
        workspaceOperation = undefined;
        const next = pendingNavigation;
        pendingNavigation = undefined;
        if (next && !disposed) void next();
        else startRemoteSync();
      }
    };
  }

  const editorBlocked = $derived(
    workspaceOperation !== undefined ||
      (vaultPhase !== "ready" && vaultPhase !== "failed") ||
      (vaultPhase === "ready" && !activeNoteId) ||
      saveState === "loading" ||
      clearingVault,
  );

  const activeVault = $derived(
    vaults.find((candidate) => candidate.id === activeVaultId) ?? vaults[0],
  );
  const wordCount = $derived(countWords(markdown));
  const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
  const preview = createPreviewRenderer({
    source: () => previewMarkdown,
    attachments: () => localAttachmentUrls,
    noteSourcePath: () => activeNoteSourcePath,
    resolveAttachmentUrl,
  });
  const renderedBlocks = $derived(preview.blocks);
  const renderedBlockHtml = $derived(
    renderedBlocks.filter((block) => block.element).map((block) => block.html),
  );
  const displayedRenderedBlocks = $derived(renderedBlockHtml);
  const renderedMarkdown = $derived(renderedBlocks.map((block) => block.html).join(""));
  const renderedBlockLines = $derived(
    renderedBlocks.filter((block) => block.element).map((block) => block.lines),
  );
  const noteTitle = $derived(titleFromMarkdown(markdown));
  const markdownLineCount = $derived(countLines(markdown));
  const findCanEdit = $derived(!editorBlocked && transferController.transferState !== "working");
  const find = createFindReplace({
    markdown: () => markdown,
    canEdit: () => findCanEdit,
    editor: () => editor,
    editorSelection: () => getEditorSelection(),
    revealSource: () => {
      if (!sourcePaneVisible) {
        if (singlePaneMode) showOnlyPane("source");
        else toggleSourcePane();
      }
    },
    openSidebar: () => {
      const previous = { collapsed: sidebarCollapsed, open: sidebarOpen };
      sidebarCollapsed = false;
      if (window.innerWidth <= 900) sidebarOpen = true;
      return () => {
        sidebarCollapsed = previous.collapsed;
        sidebarOpen = previous.open;
      };
    },
    restoreFocus: restoreModalFocus,
  });
  const notePageCount = $derived(Math.max(1, Math.ceil(results.length / NOTE_PAGE_SIZE)));
  const orderedResults = $derived(
    results.toSorted((left, right) =>
      compareSidebarNotes(left.note, right.note, preferencesController.sidebarSort),
    ),
  );
  const visibleResults = $derived(
    orderedResults.slice(notePage * NOTE_PAGE_SIZE, (notePage + 1) * NOTE_PAGE_SIZE),
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
      (role) => preferencesController.fonts[role] === defaultFontChoices[role],
    ),
  );
  const shortcutsAreDefault = $derived(
    (Object.keys(defaultKeyboardShortcuts) as ShortcutAction[]).every((action) =>
      shortcutsEqual(preferencesController.shortcuts[action], defaultKeyboardShortcuts[action]),
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
      run: () => void workspaceCommand(selectNote, "navigation")(note.id),
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

  const paletteActions: PaletteActions = {
    shortcutLabel: preferencesController.shortcutLabel,
    createNote: workspaceCommand(fileTreeController.createNote),
    saveDraft,
    toggleTrash: fileTreeController.toggleTrash,
    emptyTrash: workspaceCommand(fileTreeController.emptyTrash),
    attachFile: () => attachmentInput?.click(),
    setAttachmentsHidden,
    openSettings,
    openFind,
    insertSyntax,
    prefixLine,
    toggleCheckboxAtCaret,
    toggleSourcePane,
    toggleRenderedPane,
    swapPanes,
    togglePaneLayout,
    toggleScrollSync,
    toggleSidebar,
    setSidebarSide,
    setTheme: preferencesController.setTheme,
    beginBackup: workspaceCommand(githubController.beginBackup),
    openRestore: workspaceCommand(githubController.openRestore),
    importFolder: () => transferController.folderInput?.click(),
    importZip: () => transferController.zipInput?.click(),
    exportFolder: workspaceCommand(transferController.exportFolder),
    exportZip: workspaceCommand(transferController.exportZip),
    resetFonts: preferencesController.resetFonts,
    resetShortcuts: preferencesController.resetShortcuts,
    ensurePersistentStorage,
    copyNoteAs: transferController.copyNoteAs,
    exportNoteAs: workspaceCommand(transferController.exportNoteAs),
  };

  const paletteItems = $derived<PaletteCommand[]>([
    {
      id: "note-history",
      group: "Notes",
      label: "Show note history",
      keywords: "versions snapshots restore",
      icon: FileText,
      disabled: !activeNoteId,
      run: () => void history.show(),
    },
    {
      id: "note-from-template",
      group: "Notes",
      label: "New note from template",
      icon: FileText,
      keywords: "template create variables",
      run: () => void workspaceCommand(creation.showTemplates)(),
    },
    {
      id: "daily-note",
      group: "Notes",
      label: "Open today's daily note",
      icon: FileText,
      shortcut: preferencesController.shortcutLabel("dailyNote"),
      keywords: "today journal diary",
      run: () => void workspaceCommand(creation.openDailyNote)(),
    },
    ...paletteNoteItems,
    ...paletteCommands(
      {
        activeNoteId,
        attachmentFolder,
        attachmentsHidden,
        effectivePaneLayout,
        fontsAreDefault,
        githubState: githubController.githubState,
        hasContent,
        isOnline,
        renderedPaneVisible,
        saveState,
        scrollSync,
        shortcutsAreDefault,
        sidebarCollapsed,
        sidebarSide,
        singlePaneMode,
        sourcePaneVisible,
        theme: preferencesController.theme,
        transferState: transferController.transferState,
        trashOpen: fileTreeController.trashOpen,
        trashedCount: trashedNotes.length,
      },
      paletteActions,
    ),
  ]);

  const creation = createNoteCreationController({
    vault: () => vault,
    vaultId: () => activeVaultId || "default",
    settle: settleDraft,
    prepare: loadDialogStyles,
    open: (id) => navigateToNote(id),
    refresh: async () => {
      await refreshFileTree();
      pendingBackupCount = await vault!.countPendingBackupOperations();
    },
    showError: (message) => {
      storageError = message;
    },
  });

  const history = createHistoryController({
    vault: () => vault,
    noteId: () => activeNoteId,
    settle: settleDraft,
    prepare: loadDialogStyles,
    reload: async () => {
      await loadNote(activeNoteId);
      await refreshFileTree();
      pendingBackupCount = await vault!.countPendingBackupOperations();
    },
  });

  const noteOutput = createNoteOutput(() => preview.loadMarkdownModule());
  const confirmation = createConfirmation(() => loadDialogStyles());

  function loadDialogStyles(): Promise<void> {
    return dialogStyles.load();
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

    if ((!appReady || !sidebarReady || !editorReady) && Date.now() < startupDeadline) {
      startupFrame = window.requestAnimationFrame(() => {
        if (!disposed) revealStartupShell();
      });
      return;
    }

    startupShell.remove();
  }

  $effect(() => {
    const noteId = page.state.onyxNoteId;
    untrack(() => {
      const vaultId = page.state.onyxVaultId;
      if (
        typeof noteId !== "string" ||
        !noteId ||
        (noteId === activeNoteId && (!vaultId || vaultId === activeVaultId))
      )
        return;
      void workspaceCommand(async () => {
        if (vaultId && vaultId !== activeVaultId) await selectVault(vaultId);
        await selectNote(noteId);
      }, "navigation")();
    });
  });

  onMount(() => {
    revealStartupShell();
    preferencesController.primaryModifier = detectPrimaryModifier();
    if (preferencesController.primaryModifier === "control" && markdown === initialMarkdown) {
      markdown = createInitialMarkdown(preferencesController.primaryModifier);
      updatePreviewImmediately(markdown);
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
    const storedSidebarWidth = Number(readLocalStorage("onyx:sidebar-width"));
    if (Number.isFinite(storedSidebarWidth)) sidebarWidth = clampSidebarWidth(storedSidebarWidth);
    const storedSplit = Number(readLocalStorage("onyx:split-ratio"));
    if (Number.isFinite(storedSplit)) splitRatio = clampSplitRatio(storedSplit);
    const storedContentWidth = Number(readLocalStorage("onyx:content-width"));
    if (Number.isFinite(storedContentWidth)) contentWidth = clampContentWidth(storedContentWidth);
    preferencesController.shortcuts = readKeyboardShortcuts();
    preferencesController.theme = readThemePreference();
    preferencesController.resolvedTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    if (document.documentElement.dataset.themePreference !== preferencesController.theme) {
      preferencesController.resolvedTheme = applyTheme(preferencesController.theme);
    }
    preferencesController.colorTheme = readColorTheme();
    if (document.documentElement.dataset.colorTheme !== preferencesController.colorTheme) {
      applyColorTheme(preferencesController.colorTheme);
    }
    preferencesController.loadSidebarSort();
    preferencesController.applyStoredFontChoices();
    const stopPreferenceWarnings = subscribePreferenceWriteFailures(() => {
      appendStorageNotice(
        "Browser preferences could not be saved. Changes apply to this tab until it closes.",
      );
    });
    const onPreferenceChange = (event: StorageEvent) => {
      if (event.key === null || event.key === "onyx-theme") {
        preferencesController.theme = readThemePreference();
        preferencesController.resolvedTheme = applyTheme(preferencesController.theme);
      }
      if (event.key === null || event.key === "onyx-color-theme") {
        preferencesController.colorTheme = readColorTheme();
        applyColorTheme(preferencesController.colorTheme);
      }
      if (event.key === null || event.key.startsWith("onyx:font-"))
        preferencesController.applyStoredFontChoices();
      if (event.key === null || event.key === "onyx:keyboard-shortcuts")
        preferencesController.shortcuts = readKeyboardShortcuts();
    };
    window.addEventListener("storage", onPreferenceChange);
    const stopThemeWatch = watchSystemTheme(() => {
      if (preferencesController.theme === "system")
        preferencesController.resolvedTheme = applyTheme(preferencesController.theme);
    });
    void loadVaultRegistry()
      .then(async (registry) => {
        if (disposed) return;
        vaults = registry.vaults;
        activeVaultId = registry.activeId;
        await workspaceCommand(openVault)();
      })
      .catch((error) => {
        storageError =
          error instanceof Error ? error.message : "The vault registry could not be opened.";
        saveState = "error";
        vaultPhase = "failed";
      })
      .then(async () => {
        try {
          await goto("", {
            shallow: true,
            replace: true,
            reset: false,
            state: { onyxVaultId: activeVaultId, onyxNoteId: activeNoteId },
          });
        } catch {
          // History is best-effort; the app works without it.
        }
      })
      .finally(scheduleServiceWorkerRegistration);
    if (isOnline) scheduleGithubRestore();
    else githubController.githubState = "disconnected";
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
      if (githubController.restoreState !== "restoring") githubController.restoreModalOpen = false;
      if (githubRestoreTimer !== undefined) {
        window.clearTimeout(githubRestoreTimer);
        githubRestoreTimer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && markdown !== lastSavedMarkdown) void saveDraft();
      if (document.visibilityState === "visible") {
        const opened = vault;
        if (opened)
          void opened
            .getVersion()
            .then((version) => {
              if (!disposed && opened === vault && version !== observedVaultVersion)
                queueRemoteVaultSync({
                  kind: "vault",
                  occurredAt: new Date().toISOString(),
                  sourceId: "resume",
                });
            })
            .catch(() =>
              appendStorageNotice(
                "The vault could not be refreshed. Reload Onyx to reconnect storage.",
              ),
            );
        void loadVaultRegistry()
          .then((registry) => {
            if (!disposed) vaults = registry.vaults;
          })
          .catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      vaultGeneration += 1;
      noteLoadSequence += 1;
      searchSequence += 1;
      authenticationRequest += 1;
      authenticationCleanup?.();
      confirmation.dispose();
      find.dispose();
      sidebarDragCleanup?.();
      if (startupFrame !== undefined) cancelAnimationFrame(startupFrame);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      narrowQuery?.removeEventListener("change", onViewportChange);
      stopThemeWatch();
      stopPreferenceWarnings();
      window.removeEventListener("storage", onPreferenceChange);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (searchTimer) window.clearTimeout(searchTimer);
      if (previewFrame !== undefined) window.cancelAnimationFrame(previewFrame);
      if (previewSettleTimer !== undefined) window.clearTimeout(previewSettleTimer);
      if (serviceWorkerTimer) window.clearTimeout(serviceWorkerTimer);
      if (githubRestoreTimer) window.clearTimeout(githubRestoreTimer);
      window.clearTimeout(githubController.autoBackupTimer);
      unsubscribeVault?.();
      preview.dispose();
      releaseLocalAttachmentUrls();
      closeImagePreview();
      void vault?.close();
    };
  });

  function registerServiceWorker(): void {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/service-worker.js", { type: "module" }).catch(() => {
        if (!disposed)
          appendStorageNotice("Offline support could not be initialized. Reload to try again.");
      });
    }
  }

  function scheduleServiceWorkerRegistration(): void {
    if (disposed || serviceWorkerTimer !== undefined) return;
    serviceWorkerTimer = window.setTimeout(() => {
      serviceWorkerTimer = undefined;
      registerServiceWorker();
    }, DEFERRED_STARTUP_DELAY_MS);
  }

  function scheduleGithubRestore(): void {
    if (disposed || githubController.githubState === "loading" || githubRestoreTimer !== undefined)
      return;
    const hasGithubCallback = new URLSearchParams(location.search).has("github");
    if (hasGithubCallback) {
      void githubController.restoreGitHub();
      return;
    }
    githubRestoreTimer = window.setTimeout(() => {
      githubRestoreTimer = undefined;
      void githubController.restoreGitHub();
    }, DEFERRED_STARTUP_DELAY_MS);
  }

  async function openSettings(target: SettingsSection = "editor"): Promise<void> {
    if (!settingsOpen && document.activeElement instanceof HTMLElement) {
      settingsOpener = document.activeElement;
    }
    const request = ++settingsRequest;
    settingsSection = target;
    await loadDialogStyles();
    if (!disposed && request === settingsRequest) settingsOpen = true;
  }

  function closeSettings(): void {
    settingsRequest += 1;
    settingsOpen = false;
    const opener = settingsOpener;
    settingsOpener = undefined;
    restoreModalFocus(opener);
  }

  function restoreModalFocus(opener: HTMLElement | undefined): void {
    if (!opener) return;
    requestAnimationFrame(() => {
      if (
        disposed ||
        paletteOpen ||
        find.isOpen ||
        settingsOpen ||
        githubController.restoreModalOpen ||
        imagePreview ||
        confirmation.request
      )
        return;
      if (opener.isConnected) opener.focus();
    });
  }

  async function clearVault(expectedVersion?: number): Promise<void> {
    if (!vault || clearingVault) return;
    clearingVault = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    const pendingSave = saveRun;
    try {
      if (pendingSave) await pendingSave;
      await vault.clear(expectedVersion);
      resetEditorAfterVaultClear();
      await runSearch("");
      pendingBackupCount = await vault.countPendingBackupOperations();
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
    searchState = { status: "idle" };
    notePage = 0;
    results = [];
    folders = [];
    vaultAttachments = [];
    trashedNotes = [];
    fileTreeController.trashOpen = false;
    paletteNotes = [];
    activeNoteId = "";
    noteRevision = 0;
    activeNoteSourcePath = undefined;
    releaseLocalAttachmentUrls();
    closeImagePreview();
    markdown = "";
    lastSavedMarkdown = "";
    updatePreviewImmediately("");
    saveState = "saved";
    storageError = "";
    editor?.resetHistory();
  }

  $effect(() => {
    const due =
      githubController.githubBackup?.autoBackup === true &&
      pendingBackupCount > 0 &&
      isOnline &&
      githubController.githubState === "connected" &&
      !githubController.autoBackupPaused &&
      githubController.backupState !== "backing-up" &&
      workspaceOperation === undefined &&
      vaultPhase === "ready" &&
      saveState === "saved" &&
      !githubController.restoreModalOpen &&
      !confirmation.request;
    // Each new pending change restarts the wait, so backups run once editing settles.
    void pendingBackupCount;
    untrack(() => githubController.scheduleAutoBackup(due));
  });

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
    const generation = ++vaultGeneration;
    vaultPhase = "opening";
    storageError = "";
    saveState = "loading";
    notesLoaded = false;
    try {
      if (vaults.length === 0) {
        const registry = await loadVaultRegistry();
        vaults = registry.vaults;
        activeVaultId = registry.activeId;
      }
      readAttachmentPreferences();
      const opened = await Vault.open(activeVault ? vaultOptions(activeVault) : {});
      if (disposed || generation !== vaultGeneration) {
        await opened.close();
        return;
      }
      vault = opened;
      appendNativeDirectoryNotice();
      unsubscribeVault?.();
      unsubscribeVault = vault.subscribe(queueRemoteVaultSync);
      let tree = await vault.listFileTree();
      folders = tree.folders;
      const createFirstNote = tree.notes.length === 0;
      if (createFirstNote) {
        const legacyDraft =
          activeVault && isDefaultVault(activeVault) ? await readLegacyDraft() : "";
        const contents =
          legacyDraft || createInitialMarkdown(preferencesController.primaryModifier);
        await vault.saveNote({
          title: titleFromMarkdown(contents),
          markdown: contents,
        });
      }
      const purged = await vault.purgeExpiredTrash().catch(() => []);
      if (createFirstNote || purged.length > 0) tree = await vault.listFileTree();
      await loadNote(tree.notes[0]!.id);
      vaultAttachments = tree.attachments;
      trashedNotes = tree.trashedNotes;
      await runSearch("");
      if (searchQuery.trim()) await runSearch(searchQuery);
      [githubController.githubBackup, pendingBackupCount] = await Promise.all([
        vault.getGithubBackupState(),
        vault.countPendingBackupOperations(),
      ]);
      observedVaultVersion = await vault.getVersion();
      vaultPhase = "ready";
      if (detectBrowserStorageSupport().persistentStorage) void ensurePersistentStorage();
    } catch (error) {
      if (generation !== vaultGeneration || disposed) return;
      const failed = vault;
      vault = undefined;
      await failed?.close();
      vaultPhase = "failed";
      storageError = error instanceof Error ? error.message : "Your notes could not be opened.";
      saveState = "error";
    }
  }

  async function selectVault(id: string): Promise<void> {
    if (id === activeVaultId || transferController.transferState === "working") return;
    if (!vaults.some((candidate) => candidate.id === id) || !(await settleDraft())) return;
    try {
      const registry = await writeVaultRegistry({ activeId: id, vaults });
      vaults = registry.vaults;
      activeVaultId = id;
      await reopenVault();
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The vault could not be selected.";
    }
  }

  async function createVault(name = "Notes"): Promise<void> {
    if (transferController.transferState === "working" || !(await settleDraft())) return;
    try {
      const descriptor = createVaultDescriptor(name, vaults);
      const registry = await writeVaultRegistry({
        activeId: descriptor.id,
        vaults: [...vaults, descriptor],
      });
      vaults = registry.vaults;
      activeVaultId = descriptor.id;
      await reopenVault();
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The vault could not be created.";
    }
  }

  async function renameVault(id: string, name: string): Promise<void> {
    const target = vaults.find((candidate) => candidate.id === id);
    const trimmed = normalizeVaultName(name);
    if (!target || !trimmed || trimmed === target.name) return;
    const unique = uniqueVaultName(
      trimmed,
      vaults.filter((candidate) => candidate.id !== id),
    );
    try {
      const registry = await writeVaultRegistry(
        {
          activeId: activeVaultId,
          vaults: vaults.map((candidate) =>
            candidate.id === id ? { ...candidate, name: unique } : candidate,
          ),
        },
        id,
      );
      vaults = registry.vaults;
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The vault name could not be saved.";
      throw error;
    }
  }

  async function reopenVault(): Promise<void> {
    unsubscribeVault?.();
    unsubscribeVault = undefined;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    remoteChanges.length = 0;
    remoteSyncRequested = false;
    vaultPhase = "closing";
    vaultGeneration += 1;
    const previousVault = vault;
    vault = undefined;
    await previousVault?.close();
    resetEditorAfterVaultClear();
    githubController.githubBackup = undefined;
    githubController.autoBackupPaused = false;
    recentNoteIds = [];
    paletteOpen = false;
    find.close();
    pendingBackupCount = 0;
    githubController.backupState = "idle";
    githubController.backupMessage = "";
    githubController.backupCommitUrl = "";
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
    if (status?.pendingNoteFiles)
      appendStorageNotice(
        "Some note files need repair because storage is full. The latest text is saved in the browser database; export a ZIP or back up to GitHub.",
      );
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
    const version = draftVersion;
    const note = await currentVault.getNote(id);
    if (!note || note.deletedAt) return;
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
    // Prepare previews when switching notes; with no active note, show the editor immediately.
    if (activeNoteId && sequence === noteLoadSequence) {
      await preview.render(note.markdown, {
        attachments: nextUrls,
        noteSourcePath: note.sourcePath,
      });
    }
    if (
      disposed ||
      currentVault !== vault ||
      sequence !== noteLoadSequence ||
      version !== draftVersion
    ) {
      for (const attachment of nextUrls) URL.revokeObjectURL(attachment.url);
      return;
    }
    releaseLocalAttachmentUrls();
    localAttachmentUrls = nextUrls;
    activeNoteSourcePath = note.sourcePath;
    activeNoteId = note.id;
    noteRevision = note.revision;
    draftVersion += 1;
    markdown = note.markdown;
    updatePreviewImmediately(note.markdown);
    lastSavedMarkdown = note.markdown;
    editor?.resetHistory();
    saveState = "saved";
    saveFailure = undefined;
    storageError = "";
    sidebarOpen = false;
  }

  function queueRemoteVaultSync(change: VaultChangeEvent): void {
    remoteChanges.push(change);
    remoteSyncRequested = true;
    startRemoteSync();
  }

  function startRemoteSync(): void {
    if (disposed || workspaceOperation || remoteSyncRun || !remoteSyncRequested) return;
    const run = syncRemoteVault();
    remoteSyncRun = run;
    void run
      .finally(() => {
        if (remoteSyncRun === run) remoteSyncRun = undefined;
      })
      .catch(() => {
        storageError = "Changes made in another tab could not be loaded. Reload Onyx to see them.";
      });
  }

  async function syncRemoteVault(): Promise<void> {
    while (remoteSyncRequested) {
      remoteSyncRequested = false;
      const changes = remoteChanges.splice(0);
      const opened = vault;
      if (!opened || disposed) continue;
      const tree = await opened.listFileTree();
      if (opened !== vault || disposed) return;
      const notes = tree.notes;
      const activeChanged = changes.some(
        (change) => change.kind === "vault" || change.noteId === activeNoteId,
      );
      const hasUnsavedDraft = markdown !== lastSavedMarkdown;
      const changedRevision =
        tree.notes.find((note) => note.id === activeNoteId)?.revision !== noteRevision;
      if (activeChanged && hasUnsavedDraft && changedRevision) {
        storageError = "This note changed in another tab. Reload it before saving.";
        saveState = "error";
        saveFailure = "conflict";
      } else if (activeChanged && activeNoteId && !hasUnsavedDraft) {
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
      vaultAttachments = tree.attachments;
      trashedNotes = tree.trashedNotes;
      const backup = await Promise.all([
        opened.getGithubBackupState(),
        opened.countPendingBackupOperations(),
      ]);
      if (opened === vault && !disposed) {
        [githubController.githubBackup, pendingBackupCount] = backup;
        observedVaultVersion = await opened.getVersion();
      }
    }
  }

  function resetActiveNote(): void {
    noteLoadSequence += 1;
    releaseLocalAttachmentUrls();
    activeNoteSourcePath = undefined;
    activeNoteId = "";
    noteRevision = 0;
    markdown = "";
    updatePreviewImmediately("");
    lastSavedMarkdown = "";
    editor?.resetHistory();
    saveState = "saved";
  }

  function resolveAttachmentUrl(destination: string): string | undefined {
    return resolveLocalAttachmentUrl(destination, activeNoteSourcePath, localAttachmentUrls);
  }

  function releaseLocalAttachmentUrls(): void {
    for (const attachment of localAttachmentUrls) URL.revokeObjectURL(attachment.url);
    localAttachmentUrls = [];
  }

  function closeImagePreview(): void {
    imagePreviewRequest += 1;
    const preview = imagePreview;
    imagePreview = undefined;
    if (preview) URL.revokeObjectURL(preview.url);
  }

  async function selectNote(id: string): Promise<void> {
    if (id === activeNoteId || transferController.transferState === "working") return;
    if (!(await settleDraft())) return;
    await loadNote(id);
    if (activeNoteId !== id) return;
    recentNoteIds = [id, ...recentNoteIds.filter((recentId) => recentId !== id)].slice(0, 8);
  }

  async function scrollToNoteFragment(fragment: string): Promise<void> {
    if (!fragment) return;
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const decoded = decodePath(fragment);
    const renderedPane = document.querySelector<HTMLElement>(".rendered-pane");
    const elementsWithIds = renderedPane?.querySelectorAll<HTMLElement>("[id]");
    for (const candidate of [
      decoded,
      `user-content-${decoded}`,
      fragment,
      `user-content-${fragment}`,
    ]) {
      if (!candidate) continue;
      const element =
        [...(elementsWithIds ?? [])].find(
          (candidateElement) => candidateElement.id === candidate,
        ) ?? (renderedPane ? undefined : document.getElementById(candidate));
      if (element) {
        element.scrollIntoView();
        return;
      }
    }
    const normalizedFragment = decoded.trim().toLocaleLowerCase();
    const heading = [
      ...(renderedPane?.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6") ?? []),
    ].find((candidate) => candidate.textContent?.trim().toLocaleLowerCase() === normalizedFragment);
    heading?.scrollIntoView();
  }

  /**
   * Opens a relative Markdown link (`other.md`, `./other.md`, `../other.md`,
   * `other.md#heading`) as its Onyx note. The rendered click handler already
   * prevented the browser navigation, so missing notes fail gracefully by doing
   * nothing instead of hitting a SvelteKit 404.
   */
  async function openNoteLink(href: string): Promise<void> {
    const parsed = parseRelativeNoteLink(href, activeNoteSourcePath);
    if (!parsed) return;
    const notes = await listNotesForLinks();
    const id = findNoteIdForPath(notes, parsed.path);
    if (id) await navigateToNote(id, parsed.fragment);
  }

  async function listNotesForLinks(): Promise<NoteMetadata[]> {
    try {
      return vault ? await vault.listNotes() : paletteNotes;
    } catch {
      return paletteNotes;
    }
  }

  /** Follows a [[wiki link]], offering to create the note when none has that name. */
  async function openWikiLink(target: string): Promise<void> {
    const { name, fragment } = splitWikiTarget(target);
    if (!name) {
      await navigateToNote(activeNoteId, fragment);
      return;
    }
    const note = resolveWikiLink(await listNotesForLinks(), name, activeNoteSourcePath);
    if (note) {
      await navigateToNote(note.id, fragment);
      return;
    }
    const fileName = basename(name);
    const confirmed = await confirmation.ask({
      eyebrow: "Wiki link",
      title: `Create “${fileStem(fileName)}”?`,
      message: `No note is named “${name}” yet. Onyx can create it${parentPath(name) ? ` in ${parentPath(name)}` : ""} and open it.`,
      confirmLabel: "Create note",
    });
    if (confirmed) await fileTreeController.createNote(parentPath(name), fileName);
  }

  // Backlinks only supplement the note, so a failed lookup shows none rather than an error.
  async function refreshBacklinks(): Promise<void> {
    const currentVault = vault;
    const noteId = activeNoteId;
    const sequence = ++backlinksSequence;
    let next: NoteMetadata[] = [];
    let mentions: typeof unlinkedMentions = [];
    if (currentVault && noteId) {
      try {
        ({ backlinks: next, mentions } = await currentVault.listNoteConnections(noteId));
      } catch {
        next = [];
      }
    }
    if (sequence === backlinksSequence) {
      backlinks = next;
      unlinkedMentions = mentions;
    }
  }

  $effect(() => {
    void activeNoteId;
    void paletteNotes;
    untrack(() => void refreshBacklinks());
  });

  async function linkUnlinkedMention(mention: (typeof unlinkedMentions)[number]): Promise<void> {
    if (!vault || !(await settleDraft())) return;
    try {
      await vault.linkMention(mention.noteId, activeNoteId, mention.start, mention.end);
      await refreshFileTree();
      await refreshBacklinks();
      pendingBackupCount = await vault.countPendingBackupOperations();
    } catch (cause) {
      storageError = cause instanceof Error ? cause.message : "The mention could not be linked.";
    }
  }

  async function navigateOutline(heading: NoteHeading, index: number): Promise<void> {
    editor?.revealRange(heading.start, heading.end);
    await tick();
    const element = document.querySelectorAll<HTMLElement>(
      ".rendered-pane article :is(h1,h2,h3,h4,h5,h6)",
    )[index];
    if (element?.id) await scrollToNoteFragment(element.id);
    else element?.scrollIntoView();
  }

  function openTag(tag: string): void {
    openPalette();
    queueSearch(`#${tag}`);
  }

  // Records the jump in browser history so Back returns to the note the link was in.
  async function navigateToNote(id: string, fragment = ""): Promise<void> {
    if (id === activeNoteId) {
      if (fragment) {
        await preview.render(previewMarkdown);
        await scrollToNoteFragment(fragment);
      }
      return;
    }
    const sourceId = activeNoteId;
    try {
      await goto("", {
        shallow: true,
        replace: true,
        reset: false,
        state: { onyxVaultId: activeVaultId, onyxNoteId: sourceId },
      });
    } catch {
      // History is best-effort; navigation still works without it.
    }
    await selectNote(id);
    if (activeNoteId !== id) return;
    try {
      await goto("", {
        shallow: true,
        reset: false,
        state: { onyxVaultId: activeVaultId, onyxNoteId: id },
      });
    } catch {
      // Ignore history failures after a successful navigation.
    }
    if (fragment) await scrollToNoteFragment(fragment);
  }

  async function refreshFileTree(): Promise<NoteMetadata[]> {
    if (!vault) return [];
    const tree = await vault.listFileTree();
    folders = tree.folders;
    vaultAttachments = tree.attachments;
    trashedNotes = tree.trashedNotes;
    paletteNotes = tree.notes;
    await runSearch(searchQuery);
    return tree.notes;
  }

  async function settleDraft(): Promise<boolean> {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = undefined;
    while (saveRun || markdown !== lastSavedMarkdown) {
      if (!(await saveDraft())) return false;
    }
    return true;
  }

  function queueSave(): void {
    if (clearingVault) return;
    saveState = "unsaved";
    if (saveRun) saveRequested = true;
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
      const currentVault = vault;
      const generation = vaultGeneration;
      const noteId = activeNoteId;
      const contents = markdown;
      const expectedRevision = noteRevision;
      saveState = "saving";
      try {
        const savedNote = await currentVault.saveNote({
          id: noteId,
          title: titleFromMarkdown(contents),
          markdown: contents,
          expectedRevision,
        });
        if (disposed || currentVault !== vault || generation !== vaultGeneration) return false;
        if (activeNoteId === noteId) {
          noteRevision = savedNote.revision;
          lastSavedMarkdown = contents;
          saveState = markdown === contents ? "saved" : "unsaved";
          if (markdown !== contents) saveRequested = true;
          storageError = "";
          saveFailure = undefined;
        }
        appendNativeDirectoryNotice();
        try {
          await refreshResultsAfterSave(savedNote);
          const pending = await currentVault.countPendingBackupOperations();
          if (currentVault === vault && !disposed) pendingBackupCount = pending;
        } catch {
          appendStorageNotice(
            "Your edit was saved, but the note list could not be refreshed. Reload to refresh it.",
          );
        }
      } catch (error) {
        saveRequested = false;
        if (activeNoteId === noteId) {
          storageError = error instanceof Error ? error.message : "Autosave failed.";
          saveState = "error";
          saveFailure = error instanceof VaultConflictError ? "conflict" : "storage";
        }
        return false;
      }
    }
    return true;
  }

  async function saveConflictCopy(): Promise<void> {
    const opened = vault;
    if (!opened || saveFailure !== "conflict") return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    const contents = markdown;
    const base = `${titleFromMarkdown(contents).replace(/[\\/]/g, "-")} (conflict copy)`;
    const taken = new Set(
      (await opened.listNotes()).map((note) => noteFilePath(note).toLocaleLowerCase()),
    );
    let name = normalizeFileName(base);
    for (let index = 2; taken.has(name.toLocaleLowerCase()); index += 1)
      name = normalizeFileName(`${base} ${index}`);
    const copy = await opened.saveNote({ title: base, markdown: contents, sourcePath: name });
    await loadNote(copy.id);
    await refreshFileTree();
    pendingBackupCount = await opened.countPendingBackupOperations();
  }

  function updateMarkdown(value: string): void {
    if (value === markdown) return;
    draftVersion += 1;
    markdown = value;
    preview.ensureFullParser();
    queuePreview(value);
    queueSave();
  }

  // Coalesce bursts of input without waiting for the editor to become idle.
  function queuePreview(value: string): void {
    pendingPreviewMarkdown = value;
    if (previewSettleTimer !== undefined) window.clearTimeout(previewSettleTimer);
    previewSettleTimer = window.setTimeout(() => {
      previewSettleTimer = undefined;
      if (previewFrame !== undefined) window.cancelAnimationFrame(previewFrame);
      previewFrame = undefined;
      previewMarkdown = pendingPreviewMarkdown;
    }, PREVIEW_SETTLE_MS);
    if (previewFrame !== undefined) return;
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = undefined;
      previewMarkdown = pendingPreviewMarkdown;
    });
  }

  function updatePreviewImmediately(value: string): void {
    if (previewFrame !== undefined) window.cancelAnimationFrame(previewFrame);
    if (previewSettleTimer !== undefined) window.clearTimeout(previewSettleTimer);
    previewFrame = undefined;
    previewSettleTimer = undefined;
    pendingPreviewMarkdown = value;
    previewMarkdown = value;
  }

  function setSplitRatio(value: number): void {
    splitRatio = clampSplitRatio(value);
  }

  function saveSplitRatio(): void {
    writeLocalStorage("onyx:split-ratio", splitRatio.toFixed(1));
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

  function handleEditorChange(value: string): void {
    updateMarkdown(value);
  }

  function isEditorTarget(target: EventTarget | null): boolean {
    if (!editor) return false;
    if (target === null) return editor.hasFocus;
    return target instanceof Node && editor.contains(target);
  }

  function getEditorSelection(
    target: EventTarget | null = document.activeElement,
  ): EditorSelection | undefined {
    if (!editor || !isEditorTarget(target)) return;
    return { start: editor.selectionStart, end: editor.selectionEnd };
  }

  function undo(): boolean {
    return editor?.undo() ?? false;
  }

  function redo(): boolean {
    return editor?.redo() ?? false;
  }

  function replaceEditorSelection(selection: EditorSelection, replacement: string): boolean {
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    if (start === end && replacement.length === 0) return false;
    if (!editor) return false;
    editor.setSelectionRange(start, end);
    editor.edit(`${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`, {
      start: start + replacement.length,
      end: start + replacement.length,
    });
    editor.focus();
    return true;
  }

  function runEditorIndent(target: EventTarget | null, outdent: boolean): boolean {
    if (editorBlocked) return false;
    if (!editor || !isEditorTarget(target)) return false;
    const edit = indentEditorLines(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
      outdent ? -1 : 1,
    );
    editor.edit(edit.value, edit);
    return true;
  }

  function toggleCheckboxAtCaret(): boolean {
    if (editorBlocked) return false;
    if (!editor) return false;
    const edit = toggleCheckboxes(editor.value, editor.selectionStart, editor.selectionEnd);
    if (!edit) return false;
    editor.edit(edit.value, edit);
    return true;
  }

  function writeEditorClipboard(text: string): boolean {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return false;
    void Promise.resolve(clipboard.writeText(text)).catch((error: unknown) => {
      transferController.showTransferError(error, "The clipboard could not be written.");
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

  function handleEditorPaste(event: ClipboardEvent): void {
    if (!isEditorTarget(event.currentTarget)) return;
    const files = transferFiles(event.clipboardData);
    if (files.length) {
      const selection = getEditorSelection(event.currentTarget);
      if (!selection) return;
      event.preventDefault();
      void workspaceCommand(attachFiles)(files, selection);
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text === undefined) return;
    const selection = getEditorSelection(event.currentTarget);
    if (!selection) return;
    event.preventDefault();
    const from = Math.min(selection.start, selection.end);
    const to = Math.max(selection.start, selection.end);
    replaceEditorSelection(
      selection,
      pasteUrlOverSelection(markdown.slice(from, to), text) ?? text,
    );
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
    if (selection) void workspaceCommand(attachFiles)(files, selection);
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
    const position = editor?.positionAt(event.clientX, event.clientY);
    return position === undefined ? undefined : { start: position, end: position };
  }

  async function attachFiles(files: File[], selection?: EditorSelection): Promise<void> {
    if (
      !vault ||
      !activeNoteId ||
      files.length === 0 ||
      transferController.transferState === "working"
    )
      return;
    const currentVault = vault;
    const noteId = activeNoteId;
    const target = selection ??
      getEditorSelection() ?? {
        start: markdown.length,
        end: markdown.length,
      };
    const urls: LocalAttachmentUrl[] = [];
    const sourcePath = activeNoteSourcePath;
    const folder = attachmentFolder;
    const version = draftVersion;
    let adopted = false;
    try {
      const snippets: string[] = [];
      for (const file of files) {
        const attachment = await currentVault.addAttachment({
          contents: file,
          folder,
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
            sourcePath,
            attachment.type,
          ),
        );
      }
      if (
        disposed ||
        currentVault !== vault ||
        activeNoteId !== noteId ||
        version !== draftVersion
      ) {
        appendStorageNotice(
          "The attachments were saved, but their links were not inserted because the note changed.",
        );
        return;
      }
      localAttachmentUrls = [...localAttachmentUrls, ...urls];
      adopted = true;
      const start = Math.min(target.start, target.end, markdown.length);
      const before = markdown.slice(0, start);
      const separator = before && !before.endsWith("\n") && snippets.length > 1 ? "\n" : "";
      replaceEditorSelection(
        { ...target, start, end: Math.min(Math.max(target.start, target.end), markdown.length) },
        `${separator}${snippets.join("\n")}`,
      );
      vaultAttachments = await currentVault.listAttachments();
      pendingBackupCount = await currentVault.countPendingBackupOperations();
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be attached.";
      if (currentVault === vault && !disposed) await refreshFileTree().catch(() => undefined);
    } finally {
      if (!adopted) for (const url of urls) URL.revokeObjectURL(url.url);
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
    creation.loadPreferences();
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
    if (transferController.transferState === "working" || !(await settleDraft())) return false;
    const currentVault = vault;
    try {
      if (folders.some((folder) => isPathWithin(folder.path, next)))
        throw new Error("Choose an unused attachment folder");
      await currentVault.moveFolder(previous, next, previous, true);
      attachmentFolder = next;
      writeLocalStorage(attachmentPreferenceKey("attachment-folder"), next);
      if (activeNoteId) await loadNote(activeNoteId);
      await refreshFileTree();
      pendingBackupCount = await currentVault.countPendingBackupOperations();
      storageError = "";
      return true;
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "The attachments folder could not be renamed.";
      return false;
    }
  }

  async function previewAttachment(id: string): Promise<void> {
    const currentVault = vault;
    if (!currentVault) return;
    const request = ++imagePreviewRequest;
    const attachment = await currentVault.getAttachment(id);
    if (!attachment) return;
    if (disposed || currentVault !== vault || request !== imagePreviewRequest) return;
    if (!attachment.metadata.type.startsWith("image/")) {
      openAttachmentInNewTabData(attachment);
      return;
    }
    const previous = imagePreview;
    imagePreview = {
      id: attachment.metadata.id,
      name: attachment.metadata.name,
      url: URL.createObjectURL(safeAttachmentBlob(attachment.file, attachment.metadata.type)),
    };
    if (previous) URL.revokeObjectURL(previous.url);
  }

  async function openAttachmentInNewTab(id: string): Promise<void> {
    const attachment = await vault?.getAttachment(id);
    if (!attachment) return;
    openAttachmentInNewTabData(attachment);
  }

  function openAttachmentInNewTabData(attachment: {
    metadata: AttachmentMetadata;
    file: File;
  }): void {
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

  function queueSearch(value: string): void {
    searchQuery = value;
    searchSequence += 1;
    searchState = { status: "pending", query: value };
    notePage = 0;
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = undefined;
      void runSearch(value);
    }, 120);
  }

  // Without a query only the saved note's entry changes, so it is replaced rather than
  // re-reading every indexed note.
  async function refreshResultsAfterSave(saved: Note): Promise<void> {
    const searchInFlight = settledSearchSequence !== searchSequence;
    if (searchQuery.trim() || !notesLoaded || searchTimer !== undefined || searchInFlight) {
      await runSearch(searchQuery);
      return;
    }
    const { markdown: contents, ...note } = saved;
    const others = results.filter((result) => result.note.id !== note.id);
    results = note.deletedAt
      ? others
      : [listedSearchResult(note, contents), ...others].sort((left, right) =>
          left.note.updatedAt < right.note.updatedAt
            ? 1
            : left.note.updatedAt > right.note.updatedAt
              ? -1
              : 0,
        );
    notePage = 0;
    searchState = { status: "idle" };
  }

  async function runSearch(query: string): Promise<void> {
    const opened = vault;
    if (!opened || disposed) return;
    const sequence = ++searchSequence;
    searchState = { status: "pending", query };
    try {
      const nextResults = await opened.search(query);
      if (disposed || opened !== vault || sequence !== searchSequence || query !== searchQuery)
        return;
      results = nextResults;
      notePage = 0;
      notesLoaded = true;
      searchState = { status: "ready", query };
      settledSearchSequence = sequence;
    } catch (error) {
      if (disposed || opened !== vault || sequence !== searchSequence || query !== searchQuery)
        return;
      results = [];
      searchState = {
        status: "failed",
        query,
        message:
          error instanceof Error ? error.message : "Search is unavailable. Try another query.",
      };
      settledSearchSequence = sequence;
    }
  }

  function changeNotePage(page: number): void {
    notePage = Math.min(Math.max(page, 0), notePageCount - 1);
    noteList?.scrollTo({ top: 0 });
  }

  function insertSyntax(before: string, after = before, placeholder = "text"): void {
    const target = editor;
    if (!target || editorBlocked) return;
    const edit = toggleInlineSyntax(
      markdown,
      target.selectionStart,
      target.selectionEnd,
      before,
      after,
      placeholder,
    );
    target.edit(edit.value, edit);
    target.focus();
  }

  function prefixLine(prefix: string): void {
    const target = editor;
    if (!target || editorBlocked) return;
    const relativeCursor = target.selectionStart;
    const start = markdown.lastIndexOf("\n", relativeCursor - 1) + 1;
    const nextCursor = relativeCursor + prefix.length;
    target.edit(`${markdown.slice(0, start)}${prefix}${markdown.slice(start)}`, {
      start: nextCursor,
      end: nextCursor,
    });
    target.focus();
  }

  function handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (
      history.open ||
      creation.open ||
      confirmation.request ||
      settingsOpen ||
      githubController.restoreModalOpen ||
      imagePreview
    )
      return;
    if (
      workspaceOperation &&
      shortcutMatchesEvent(
        preferencesController.shortcuts.newNote,
        event,
        preferencesController.primaryModifier,
      )
    ) {
      event.preventDefault();
      return;
    }
    if (
      find.isOpen &&
      !event.altKey &&
      (event.key === "F3" ||
        (event.key.toLowerCase() === "g" &&
          (preferencesController.primaryModifier === "meta" ? event.metaKey : event.ctrlKey)))
    ) {
      event.preventDefault();
      if (event.shiftKey) find.previous();
      else find.next();
      return;
    }
    // Tab indents code and lists instead of leaving the editor.
    if (event.key === "Tab" && !event.isComposing && isEditorTarget(event.target)) {
      if (runEditorIndent(event.target, event.shiftKey)) event.preventDefault();
      return;
    }
    const action = (Object.keys(preferencesController.shortcuts) as ShortcutAction[]).find(
      (candidate) =>
        shortcutMatchesEvent(
          preferencesController.shortcuts[candidate],
          event,
          preferencesController.primaryModifier,
        ),
    );

    // Paste carries files in its ClipboardEvent, which the keydown cannot see.
    // Let the browser fire the native paste so images land on the first press.
    if (action === "paste" && isEditorTarget(event.target)) return;

    if (action === "toggleCheckbox") {
      if (!isEditorTarget(event.target)) return;
      if (toggleCheckboxAtCaret()) event.preventDefault();
      return;
    }

    if (action && isEditorShortcutAction(action)) {
      if (editorBlocked && action !== "copySelection" && action !== "selectAll") return;
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
    const shortcut = preferencesController.shortcuts[action];
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
    else if (action === "findInNote") {
      if (find.isOpen) find.close();
      else openFind();
    } else if (
      action === "saveNote" &&
      transferController.transferState !== "working" &&
      !workspaceOperation
    )
      void saveDraft();
    else if (action === "dailyNote") void workspaceCommand(creation.openDailyNote)();
    else if (action === "newNote" && transferController.transferState !== "working")
      void workspaceCommand(fileTreeController.createNote)();
    else if (action === "searchNotes" || action === "focusSearch") focusSearch();
    else if (action === "cycleTheme")
      preferencesController.setTheme(nextThemePreference(preferencesController.theme));
    else if (action === "toggleSidebar") toggleSidebar();
    else if (action === "openTrash" && transferController.transferState !== "working")
      fileTreeController.toggleTrash();
    else if (action === "bold") insertSyntax("**", "**", "bold text");
    else if (action === "italic") insertSyntax("_", "_", "italic text");
    else if (action === "togglePreview") toggleRenderedPane();
    else if (action === "openShortcuts") void openSettings("shortcuts").catch(() => undefined);
    else if (action === "closePanel") {
      if (imagePreview) closeImagePreview();
      else if (githubController.restoreModalOpen && githubController.restoreState !== "restoring")
        githubController.restoreModalOpen = false;
      else if (settingsOpen) closeSettings();
      else if (paletteOpen) closePalette();
      else if (find.isOpen) find.close();
      else if (sidebarOpen) sidebarOpen = false;
      else if (searchQuery) resetPaletteSearch();
    }
  }

  function isEditorShortcutAction(action: ShortcutAction): boolean {
    return ["cutSelection", "copySelection", "undo", "redo", "selectAll"].includes(action);
  }

  function editorShortcutAlias(event: KeyboardEvent): ShortcutAction | undefined {
    const primaryPressed =
      preferencesController.primaryModifier === "meta" ? event.metaKey : event.ctrlKey;
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

  function setSidebarWidth(value: number): void {
    sidebarWidth = clampSidebarWidth(value);
  }

  function saveSidebarWidth(): void {
    writeLocalStorage("onyx:sidebar-width", String(sidebarWidth));
  }

  function togglePalette(): void {
    if (paletteOpen) closePalette();
    else openPalette();
  }

  function openFind(): void {
    if (paletteOpen) closePalette();
    fileTreeController.trashOpen = false;
    find.open();
  }

  function openPalette(): void {
    if (find.isOpen) find.close();
    fileTreeController.trashOpen = false;
    if (paletteOpen) {
      focusSearch();
      return;
    }
    if (!paletteOpen && document.activeElement instanceof HTMLElement) {
      paletteOpener = document.activeElement;
      paletteOpener.blur();
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
    const previous = paletteSidebarState;
    paletteSidebarState = undefined;
    if (previous) {
      sidebarCollapsed = previous.collapsed;
      sidebarOpen = previous.open;
    }
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
    searchState = { status: "idle" };
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
    get sidebarSort() {
      return preferencesController.sidebarSort;
    },
    setSidebarSort: preferencesController.setSidebarSort,
    creation,
    get outline() {
      return outline;
    },
    get unlinkedMentions() {
      return unlinkedMentions;
    },
    navigateOutline,
    linkUnlinkedMention: workspaceCommand(linkUnlinkedMention),
    configureEncryption: githubController.configureEncryption,
    get restorePassphrase() {
      return githubController.restorePassphrase;
    },
    set restorePassphrase(value: string) {
      githubController.restorePassphrase = value;
    },
    history,
    get printHtml() {
      return transferController.printHtml;
    },
    get saveConflict() {
      return saveFailure === "conflict";
    },
    saveConflictCopy: workspaceCommand(saveConflictCopy),
    get editorBlocked() {
      return editorBlocked;
    },
    get vaults() {
      return vaults;
    },
    get activeVaultId() {
      return activeVaultId;
    },
    get vaultName() {
      return activeVault?.name ?? "Notes";
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
    get searchError() {
      return searchError;
    },
    get searchPending() {
      return searchPending;
    },
    get findOpen() {
      return find.isOpen;
    },
    get findQuery() {
      return find.query;
    },
    get findReplacement() {
      return find.replacement;
    },
    get findMatchCase() {
      return find.matchCase;
    },
    get findWholeWord() {
      return find.wholeWord;
    },
    get findMatchCount() {
      return find.matches.length;
    },
    get activeFindMatch() {
      return find.activeMatch;
    },
    get findMatches(): FindMatch[] {
      return find.matches;
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
      return transferController.transferState;
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
      return githubController.githubState;
    },
    get githubUser() {
      return githubController.githubUser;
    },
    get githubMessage() {
      return githubController.githubMessage;
    },
    get githubBackup() {
      return githubController.githubBackup;
    },
    get backupState() {
      return githubController.backupState;
    },
    get backupMessage() {
      return githubController.backupMessage;
    },
    set backupMessage(value: string) {
      githubController.backupMessage = value;
    },
    get backupCommitUrl() {
      return githubController.backupCommitUrl;
    },
    get settingsOpen() {
      return settingsOpen;
    },
    set settingsOpen(value: boolean) {
      if (value) void openSettings(settingsSection);
      else closeSettings();
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
      return githubController.restoreModalOpen;
    },
    set restoreModalOpen(value: boolean) {
      if (githubController.restoreState === "restoring") return;
      githubController.restoreModalOpen = value;
      if (!value) githubController.invalidateRestoreSource();
    },
    get restoreState() {
      return githubController.restoreState;
    },
    get restoreMessage() {
      return githubController.restoreMessage;
    },
    get restoreCommits() {
      return githubController.restoreCommits;
    },
    get selectedRestoreSha() {
      return githubController.selectedRestoreSha;
    },
    set selectedRestoreSha(value: string) {
      if (githubController.restoreState === "restoring") return;
      githubController.selectedRestoreSha = value;
    },
    get restoreOwner() {
      return githubController.restoreOwner;
    },
    set restoreOwner(value: string) {
      if (githubController.restoreState === "restoring" || value === githubController.restoreOwner)
        return;
      githubController.restoreOwner = value;
      githubController.invalidateRestoreSource();
    },
    get restoreRepository() {
      return githubController.restoreRepository;
    },
    set restoreRepository(value: string) {
      if (
        githubController.restoreState === "restoring" ||
        value === githubController.restoreRepository
      )
        return;
      githubController.restoreRepository = value;
      githubController.invalidateRestoreSource();
    },
    get restoreBranch() {
      return githubController.restoreBranch;
    },
    set restoreBranch(value: string) {
      if (githubController.restoreState === "restoring" || value === githubController.restoreBranch)
        return;
      githubController.restoreBranch = value;
      githubController.invalidateRestoreSource();
    },
    get restoreDirectory() {
      return githubController.restoreDirectory;
    },
    set restoreDirectory(value: string) {
      if (
        githubController.restoreState === "restoring" ||
        value === githubController.restoreDirectory
      )
        return;
      githubController.restoreDirectory = value;
      githubController.invalidateRestoreSource();
    },
    get theme() {
      return preferencesController.theme;
    },
    get resolvedTheme() {
      return preferencesController.resolvedTheme;
    },
    get colorTheme() {
      return preferencesController.colorTheme;
    },
    get fonts() {
      return preferencesController.fonts;
    },
    get fontCategories() {
      return preferencesController.fontCategories;
    },
    get shortcuts() {
      return preferencesController.shortcuts;
    },
    get primaryModifier() {
      return preferencesController.primaryModifier;
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
    get markdownLineCount() {
      return markdownLineCount;
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
    get renderedBlocks() {
      return renderedBlockHtml;
    },
    get displayedRenderedBlocks() {
      return displayedRenderedBlocks;
    },
    get renderedBlockLines() {
      return renderedBlockLines;
    },
    get printing() {
      return transferController.printing;
    },
    get paletteItems() {
      return paletteItems;
    },
    get paletteOpen() {
      return paletteOpen;
    },
    set paletteOpen(value: boolean) {
      if (value) openPalette();
      else closePalette();
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
    get sidebarWidth() {
      return sidebarWidth;
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
    set editor(value: MarkdownEditor | undefined) {
      editor = value;
    },
    get searchInput() {
      return searchInput;
    },
    set searchInput(value: HTMLInputElement | undefined) {
      searchInput = value;
    },
    get findInput() {
      return find.input;
    },
    set findInput(value: HTMLInputElement | undefined) {
      find.input = value;
    },
    get findReplaceInput() {
      return find.replaceInput;
    },
    set findReplaceInput(value: HTMLInputElement | undefined) {
      find.replaceInput = value;
    },
    get noteList() {
      return noteList;
    },
    set noteList(value: HTMLElement | undefined) {
      noteList = value;
    },
    get folderInput() {
      return transferController.folderInput;
    },
    set folderInput(value: HTMLInputElement | undefined) {
      transferController.folderInput = value;
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
    get imagePreview() {
      return imagePreview;
    },
    get trashedNotes() {
      return trashedNotes;
    },
    get trashOpen() {
      return fileTreeController.trashOpen;
    },
    set trashOpen(value: boolean) {
      if (value !== fileTreeController.trashOpen) fileTreeController.toggleTrash();
    },
    get zipInput() {
      return transferController.zipInput;
    },
    set zipInput(value: HTMLInputElement | undefined) {
      transferController.zipInput = value;
    },
    selectVault: workspaceCommand(selectVault, "navigation"),
    createVault: workspaceCommand(createVault),
    renameVault: workspaceCommand(renameVault, "mutation", true),
    createNote: workspaceCommand(fileTreeController.createNote),
    queueSearch,
    openFind,
    closeFind: find.close,
    setFindQuery: find.setQuery,
    setFindReplacement: find.setReplacement,
    setFindMatchCase: find.setMatchCase,
    setFindWholeWord: find.setWholeWord,
    previousFindMatch: find.previous,
    nextFindMatch: find.next,
    replaceFind: find.replace,
    replaceAllFind: find.replaceAll,
    openPalette,
    closePalette,
    openSettings,
    closeSettings,
    connectGitHub: githubController.connectGitHub,
    disconnectGitHub: githubController.disconnectGitHub,
    moveNoteFocus,
    selectNote: workspaceCommand(selectNote, "navigation"),
    openNoteLink: workspaceCommand(openNoteLink, "navigation"),
    openWikiLink: workspaceCommand(openWikiLink, "navigation"),
    openTag,
    get backlinks() {
      return backlinks;
    },
    openBacklink: workspaceCommand((id: string) => navigateToNote(id), "navigation"),
    createFile: workspaceCommand(fileTreeController.createNote, "mutation", true),
    createFolder: workspaceCommand(fileTreeController.createFolder, "mutation", true),
    renameFile: workspaceCommand(fileTreeController.renameFile, "mutation", true),
    renameFolder: workspaceCommand(fileTreeController.renameFolder, "mutation", true),
    setFolderIcon: workspaceCommand(fileTreeController.setFolderIcon),
    setFolderPinned: workspaceCommand(fileTreeController.setFolderPinned),
    setNotePinned: workspaceCommand(fileTreeController.setNotePinned),
    moveFile: workspaceCommand(fileTreeController.moveFile),
    moveFolder: workspaceCommand(fileTreeController.moveFolder),
    deleteFile: workspaceCommand(fileTreeController.deleteFile),
    deleteFolder: workspaceCommand(fileTreeController.deleteFolder),
    deleteAttachment: workspaceCommand(fileTreeController.deleteAttachment),
    restoreFile: workspaceCommand(fileTreeController.restoreFile),
    purgeFile: workspaceCommand(fileTreeController.purgeFile),
    emptyTrash: workspaceCommand(fileTreeController.emptyTrash),
    toggleTrash: fileTreeController.toggleTrash,
    copyFilePath: fileTreeController.copyFilePath,
    changeNotePage,
    saveDraft,
    openVault: workspaceCommand(openVault),
    dismissStorageNotice,
    toggleSidebar,
    setSidebarSide,
    setSidebarWidth,
    saveSidebarWidth,
    startSidebarDrag: (event: PointerEvent) => {
      sidebarDragCleanup?.();
      sidebarDragCleanup = startSidebarDrag(event, {
        side: () => sidebarSide,
        setDropSide: (side) => (sidebarDropSide = side),
        dock: setSidebarSide,
      });
    },
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
    copyNoteAs: transferController.copyNoteAs,
    exportNoteAs: workspaceCommand(transferController.exportNoteAs),
    toggleScrollSync,
    handleEditorChange,
    handleEditorPaste,
    handleEditorDragOver,
    handleEditorDrop,
    attachSelectedFiles: workspaceCommand(attachSelectedFiles),
    setAttachmentsHidden,
    renameAttachmentFolder: async (name: string) => {
      let result = false;
      await workspaceCommand(async () => {
        result = await renameAttachmentFolder(name);
      })();
      return result;
    },
    previewAttachment,
    openAttachmentInNewTab,
    closeImagePreview,
    updateMarkdown,
    setTheme: preferencesController.setTheme,
    setColorTheme: preferencesController.setColorTheme,
    setFont: preferencesController.setFont,
    setFontCategory: preferencesController.setFontCategory,
    resetFonts: preferencesController.resetFonts,
    setShortcut: preferencesController.setShortcut,
    resetShortcuts: preferencesController.resetShortcuts,
    selectBackupRepository: workspaceCommand(githubController.selectBackupRepository),
    forgetBackupRepository: workspaceCommand(githubController.forgetBackupRepository),
    setAutoBackup: githubController.setAutoBackup,
    beginBackup: workspaceCommand(githubController.beginBackup),
    openRestore: workspaceCommand(githubController.openRestore),
    importFolder: workspaceCommand(transferController.importFolder),
    importZip: workspaceCommand(transferController.importZip),
    exportFolder: workspaceCommand(transferController.exportFolder),
    exportZip: workspaceCommand(transferController.exportZip),
    prepareVaultDeletion,
    clearVault: workspaceCommand(clearVault, "mutation", true),
    loadRestoreCommits: githubController.loadRestoreCommits,
    get mergeUnlock() {
      return githubController.mergeUnlock;
    },
    submitMergeUnlock: githubController.submitMergeUnlock,
    restoreSelectedCommit: workspaceCommand(githubController.restoreSelectedCommit),
    formatCommitDate,
    dismissBackupMessage() {
      githubController.backupMessage = "";
    },
    get confirmation() {
      return confirmation.request;
    },
    confirmAction: confirmation.confirm,
    cancelAction: confirmation.cancel,
    get transferMessage() {
      return transferController.transferMessage;
    },
    dismissTransferMessage() {
      transferController.transferMessage = "";
    },
  };
}
