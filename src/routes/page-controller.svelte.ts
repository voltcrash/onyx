import { FileText } from "@lucide/svelte";
import type {
  BackupState,
  GithubState,
  PaneEdge,
  PaneLayout,
  PaneOrder,
  RestoreState,
  SaveState,
  TransferState,
} from "#lib/components/app-types.ts";
import type { NoteFormat } from "#lib/components/note-formats.ts";
import type { SettingsSection } from "#lib/components/settings-types.ts";
import { renderMarkdownBlocks as renderLiteMarkdownBlocks } from "#lib/markdown-lite.ts";
import {
  attachmentMarkdown,
  continueListOnEnter,
  countLines,
  countWords,
  DEFAULT_ATTACHMENT_FOLDER,
  findNoteIdForPath,
  indentEditorLines,
  wrapSelectionWith,
  normalizeAttachmentFolder,
  parseRelativeNoteLink,
  pasteUrlOverSelection,
  resolveLocalAttachmentUrl,
  rewriteLocalLinks,
  titleFromMarkdown,
  toggleCheckboxes,
  type LocalAttachmentUrl,
} from "#lib/markdown-utils.ts";
import {
  browserStorageWarnings,
  detectBrowserStorageSupport,
  persistenceDeniedMessage,
  readLocalStorage,
  writeLocalStorage,
} from "#lib/browser-storage.ts";
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
} from "#lib/fonts.ts";
import { loadFont } from "#lib/font-loader.ts";
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
} from "#lib/keyboard-shortcuts.ts";
import {
  createVaultDescriptor,
  isDefaultVault,
  listedSearchResult,
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
} from "#lib/storage/index.ts";
import type { GithubBackupCommit, GithubUser } from "#lib/github.ts";
import type {
  AttachmentMetadata,
  FolderMetadata,
  GithubBackupState,
  Note,
  NoteMetadata,
} from "#lib/storage/types.ts";
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
} from "#lib/theme.ts";
import type { FindMatch } from "#lib/find-replace.ts";
import { createFindReplace } from "./find-replace.svelte.ts";
import { createPreviewRenderer } from "./preview-renderer.svelte.ts";
import { createConfirmation } from "./confirmation.svelte.ts";
import { resolveWikiLink, splitWikiTarget } from "#lib/wikilinks.ts";
import { paletteCommands, type PaletteActions, type PaletteCommand } from "./palette-commands.ts";
import type { FolderIcon } from "#lib/folder-icons.ts";
import { createNoteOutput, downloadBlob, type NoteSource } from "#lib/note-output.ts";
import {
  basename,
  decodePath,
  fileStem,
  isPathWithin,
  joinPath,
  movePath,
  normalizeFileName,
  normalizeFolderName,
  noteFilePath,
  noteFolderPath,
  parentPath,
} from "#lib/paths.ts";
import type { MarkdownTransferFile } from "#lib/markdown-transfer.ts";
import { createInitialMarkdown } from "./welcome-note.ts";
import { startSidebarDrag, type SidebarSide } from "#lib/sidebar-drag.ts";
import {
  clampContentWidth,
  clampSidebarWidth,
  clampSplitRatio,
  DEFAULT_CONTENT_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from "#lib/layout.ts";
import { EditorHistory, type EditorSelection } from "#lib/editor-history.ts";
import { onMount, tick, untrack } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";

const NOTE_PAGE_SIZE = 100;
const PREVIEW_SETTLE_MS = 160;
const DEFERRED_STARTUP_DELAY_MS = 8_000;
const AUTO_BACKUP_DELAY_MS = 2 * 60_000;
// Matches the single-column breakpoint in the responsive stylesheet.
const NARROW_VIEWPORT = "(max-width: 900px)";

type GithubModule = typeof import("#lib/github.ts");
type LazyStylesModule = typeof import("#lib/lazy-styles.ts");

let githubModulePromise: Promise<GithubModule> | undefined;
let lazyStylesModulePromise: Promise<LazyStylesModule> | undefined;

function loadGithubModule(): Promise<GithubModule> {
  return (githubModulePromise ??= import("#lib/github.ts"));
}

function loadLazyStylesModule(): Promise<LazyStylesModule> {
  return (lazyStylesModulePromise ??= import("#lib/lazy-styles.ts"));
}

type SidebarState = { collapsed: boolean; open: boolean };

interface ImagePreviewState {
  id: string;
  name: string;
  url: string;
}

export function createPageController() {
  const initialMarkdown = createInitialMarkdown("meta");

  let vault = $state<Vault>();
  let vaults = $state<VaultDescriptor[]>([]);
  let activeVaultId = $state("");
  let activeNoteId = $state("");
  let noteRevision = $state(0);
  let markdown = $state(initialMarkdown);
  let previewMarkdown = $state(initialMarkdown);
  let livePreviewMarkdown = $state(initialMarkdown);
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
  let previewFrame: number | undefined = $state();
  let previewSettleTimer: number | undefined = $state();
  let pendingPreviewMarkdown = initialMarkdown;
  let previewIsLive = $state(false);
  let printing = $state(false);
  let searchSequence = 0;
  let settledSearchSequence = 0;
  let editor: HTMLTextAreaElement | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();
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
  let autoBackupTimer: number | undefined;
  // Set when an automatic backup fails, so it does not retry until the user backs up by hand.
  let autoBackupPaused = $state(false);
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
  let transferMessage = $state("");
  let folderInput: HTMLInputElement | undefined = $state();
  let zipInput: HTMLInputElement | undefined = $state();
  let attachmentInput: HTMLInputElement | undefined = $state();
  let attachmentFolder = $state(DEFAULT_ATTACHMENT_FOLDER);
  let attachmentsHidden = $state(false);
  let vaultAttachments = $state<AttachmentMetadata[]>([]);
  let trashedNotes = $state<NoteMetadata[]>([]);
  let backlinks = $state.raw<NoteMetadata[]>([]);
  let backlinksSequence = 0;
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
  let sidebarWidth = $state(DEFAULT_SIDEBAR_WIDTH);
  let sidebarDropSide = $state<SidebarSide | undefined>();
  let shortcuts = $state<KeyboardShortcuts>(structuredClone(defaultKeyboardShortcuts));
  let primaryModifier = $state<PrimaryModifier>("meta");
  const editorHistory = new EditorHistory();
  let noteList: HTMLElement | undefined = $state();
  let activeNoteSourcePath: string | undefined = $state();
  // Replaced rather than mutated, so a render can be matched to the list it resolved against.
  let localAttachmentUrls = $state.raw<LocalAttachmentUrl[]>([]);
  let imagePreview = $state<ImagePreviewState>();
  let imagePreviewRequest = 0;
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
  const wordCount = $derived(countWords(markdown));
  const readingMinutes = $derived(Math.max(1, Math.ceil(wordCount / 220)));
  const preview = createPreviewRenderer({
    source: () => previewMarkdown,
    attachments: () => localAttachmentUrls,
    noteSourcePath: () => activeNoteSourcePath,
    resolveAttachmentUrl,
  });
  const renderedBlocks = $derived(preview.blocks);
  const liveRenderedBlocks = $derived(
    renderLiteMarkdownBlocks(livePreviewMarkdown, resolveAttachmentUrl),
  );
  const renderedBlockHtml = $derived(
    renderedBlocks.filter((block) => block.element).map((block) => block.html),
  );
  const liveRenderedBlockHtml = $derived(
    liveRenderedBlocks.filter((block) => block.element).map((block) => block.html),
  );
  const displayedRenderedBlocks = $derived(
    previewIsLive ? liveRenderedBlockHtml : renderedBlockHtml,
  );
  const renderedMarkdown = $derived(renderedBlocks.map((block) => block.html).join(""));
  const renderedBlockLines = $derived(
    (previewIsLive ? liveRenderedBlocks : renderedBlocks)
      .filter((block) => block.element)
      .map((block) => block.lines),
  );
  const noteTitle = $derived(titleFromMarkdown(markdown));
  const markdownLineCount = $derived(countLines(markdown));
  const findCanEdit = $derived(saveState !== "loading" && transferState !== "working");
  const find = createFindReplace({
    markdown: () => markdown,
    canEdit: () => findCanEdit,
    editor: () => editor,
    editorSelection: () => getEditorSelection(),
    rememberEditorState,
    updateMarkdown: (value) => updateMarkdown(value),
    revealSource: () => {
      if (singlePaneMode && !sourcePaneVisible) showOnlyPane("source");
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
    results.toSorted(
      (left, right) => Number(right.note.pinned === true) - Number(left.note.pinned === true),
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

  const paletteActions: PaletteActions = {
    shortcutLabel,
    createNote: () => createNote(),
    saveDraft,
    toggleTrash,
    emptyTrash,
    attachFile: () => attachmentInput?.click(),
    setAttachmentsHidden,
    openSettings,
    openFind: () => find.open(),
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
    setTheme,
    beginBackup,
    openRestore,
    importFolder: () => folderInput?.click(),
    importZip: () => zipInput?.click(),
    exportFolder,
    exportZip,
    resetFonts,
    resetShortcuts,
    ensurePersistentStorage,
    copyNoteAs,
    exportNoteAs,
  };

  const paletteItems = $derived<PaletteCommand[]>([
    ...paletteNoteItems,
    ...paletteCommands(
      {
        activeNoteId,
        attachmentFolder,
        attachmentsHidden,
        effectivePaneLayout,
        fontsAreDefault,
        githubState,
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
        theme,
        transferState,
        trashOpen,
        trashedCount: trashedNotes.length,
      },
      paletteActions,
    ),
  ]);

  const noteOutput = createNoteOutput(() => preview.loadMarkdownModule());
  const confirmation = createConfirmation(() => loadDialogStyles());

  function loadDialogStyles(): Promise<void> {
    return (dialogStylesPromise ??= loadLazyStylesModule().then((module) =>
      module.loadDialogStyles(),
    ));
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

  $effect(() => {
    const noteId = page.state.onyxNoteId;
    untrack(() => {
      if (typeof noteId !== "string" || !noteId || noteId === activeNoteId) return;
      void selectNote(noteId);
    });
  });

  onMount(() => {
    revealStartupShell();
    const registry = readVaultRegistry();
    vaults = registry.vaults;
    activeVaultId = registry.activeId;
    primaryModifier = detectPrimaryModifier();
    if (primaryModifier === "control" && markdown === initialMarkdown) {
      markdown = createInitialMarkdown(primaryModifier);
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
    void openVault()
      .then(async () => {
        try {
          await goto("", {
            shallow: true,
            replace: true,
            reset: false,
            state: { onyxNoteId: activeNoteId },
          });
        } catch {
          // History is best-effort; the app works without it.
        }
      })
      .finally(scheduleServiceWorkerRegistration);
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
      if (previewFrame !== undefined) window.cancelAnimationFrame(previewFrame);
      if (previewSettleTimer !== undefined) window.clearTimeout(previewSettleTimer);
      if (serviceWorkerTimer) window.clearTimeout(serviceWorkerTimer);
      if (githubRestoreTimer) window.clearTimeout(githubRestoreTimer);
      window.clearTimeout(autoBackupTimer);
      unsubscribeVault?.();
      preview.dispose();
      releaseLocalAttachmentUrls();
      closeImagePreview();
      vault?.close();
    };
  });

  function registerServiceWorker(): void {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/service-worker.js", { type: "module" })
        .catch(() => undefined);
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
    if (result) {
      try {
        await goto(`${location.pathname}${location.hash}`, {
          shallow: true,
          replace: true,
          reset: false,
          state: { onyxNoteId: page.state.onyxNoteId ?? activeNoteId },
        });
      } catch {
        // History is best-effort; the callback can still be handled.
      }
    }
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
      void openSettings("github").catch(() => undefined);
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
      if (paletteOpen || find.isOpen || settingsOpen) return;
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
      settingsSection = "github";
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
    closeImagePreview();
    markdown = "";
    lastSavedMarkdown = "";
    updatePreviewImmediately("");
    saveState = "saved";
    storageError = "";
    editorHistory.reset();
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

  async function runBackup(
    configuration: GithubBackupState,
    options: { replaceNewerBackup?: boolean; automatic?: boolean } = {},
  ): Promise<void> {
    if (!isOnline || !vault) return;
    const { automatic = false, ...backupOptions } = options;
    backupState = "backing-up";
    if (!automatic) {
      autoBackupPaused = false;
      backupMessage = "Preparing one GitHub commit…";
      backupCommitUrl = "";
    }
    const github = await loadGithubModule();
    try {
      const result = await github.backupVaultToGithub(vault, configuration, backupOptions);
      githubBackup = result.state;
      pendingBackupCount = await vault.countPendingBackupOperations();
      if (automatic) {
        backupState = "idle";
        return;
      }
      backupState = "success";
      backupCommitUrl = result.commitUrl ?? "";
      backupMessage = result.commitUrl
        ? `Backed up ${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} in one commit.`
        : "Your GitHub backup is already up to date.";
    } catch (error) {
      if (automatic) {
        autoBackupPaused = true;
        backupState = "error";
        backupCommitUrl = "";
        backupMessage =
          error instanceof github.GithubBackupConflictError
            ? "Automatic backup paused because GitHub has a newer backup. Restore it from Settings → Backup & sync, or back up now to replace it."
            : `Automatic backup paused: ${error instanceof Error ? error.message : "the GitHub backup failed."} Back up now to try again.`;
        return;
      }
      if (error instanceof github.GithubBackupConflictError) {
        await resolveBackupConflict(configuration);
        return;
      }
      showBackupError(error);
    }
  }

  $effect(() => {
    const due =
      githubBackup?.autoBackup === true &&
      pendingBackupCount > 0 &&
      isOnline &&
      githubState === "connected" &&
      !autoBackupPaused;
    // Each new pending change restarts the wait, so backups run once editing settles.
    void pendingBackupCount;
    untrack(() => scheduleAutoBackup(due));
  });

  function scheduleAutoBackup(due: boolean): void {
    window.clearTimeout(autoBackupTimer);
    autoBackupTimer = due
      ? window.setTimeout(() => void runAutoBackup(), AUTO_BACKUP_DELAY_MS)
      : undefined;
  }

  async function runAutoBackup(): Promise<void> {
    autoBackupTimer = undefined;
    const configuration = githubBackup;
    if (!configuration?.autoBackup || !vault || backupState === "backing-up") return;
    if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
    await runBackup(configuration, { automatic: true });
  }

  async function setAutoBackup(enabled: boolean): Promise<void> {
    if (!vault || !githubBackup) return;
    try {
      await vault.saveGithubBackupState({ ...githubBackup, autoBackup: enabled });
      githubBackup = await vault.getGithubBackupState();
      if (enabled) autoBackupPaused = false;
    } catch (error) {
      showBackupError(error);
    }
  }

  async function resolveBackupConflict(configuration: GithubBackupState): Promise<void> {
    backupState = "idle";
    backupMessage = "";
    const replace = await confirmation.ask({
      eyebrow: "Backup & sync",
      title: "GitHub has a newer backup",
      message: `Another device backed up to ${configuration.owner}/${configuration.repository} after this device last backed up or restored. Restore that backup to bring its notes here, which replaces the notes on this device. Or back up anyway to make this device's notes the latest backup; the other backup stays in the repository history.`,
      confirmLabel: "Back up anyway",
      danger: true,
    });
    if (replace) {
      await runBackup(configuration, { replaceNewerBackup: true });
      return;
    }
    backupState = "error";
    backupMessage =
      "Backup paused because GitHub has a newer backup. Restore it from Settings → Backup & sync, or back up again to replace it.";
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
      pendingBackupCount = await vault.countPendingBackupOperations();
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
      let tree = await vault.listFileTree();
      folders = tree.folders;
      const createFirstNote = tree.notes.length === 0;
      if (createFirstNote) {
        const legacyDraft =
          activeVault && isDefaultVault(activeVault) ? await readLegacyDraft() : "";
        const contents = legacyDraft || createInitialMarkdown(primaryModifier);
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
      [githubBackup, pendingBackupCount] = await Promise.all([
        vault.getGithubBackupState(),
        vault.countPendingBackupOperations(),
      ]);
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
    // Rendering before the switch shows the note fully formatted instead of upgrading it.
    if (sequence === noteLoadSequence) {
      await preview.render(note.markdown, nextUrls, note.sourcePath);
    }
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
    editorHistory.reset();
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
      .catch(() => {
        storageError = "Changes made in another tab could not be loaded. Reload Onyx to see them.";
      });
  }

  async function syncRemoteVault(): Promise<void> {
    while (remoteSyncRequested) {
      remoteSyncRequested = false;
      const changes = remoteChanges.splice(0);
      if (!vault) continue;
      const tree = await vault.listFileTree();
      const notes = tree.notes;
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
      vaultAttachments = tree.attachments;
      trashedNotes = tree.trashedNotes;
      [githubBackup, pendingBackupCount] = await Promise.all([
        vault.getGithubBackupState(),
        vault.countPendingBackupOperations(),
      ]);
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
    editorHistory.reset();
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
    if (id === activeNoteId || transferState === "working") return;
    if (markdown !== lastSavedMarkdown && !(await saveDraft())) return;
    await loadNote(id);
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
    if (confirmed) await createNote(parentPath(name), fileName);
  }

  // Backlinks only supplement the note, so a failed lookup shows none rather than an error.
  async function refreshBacklinks(): Promise<void> {
    const currentVault = vault;
    const noteId = activeNoteId;
    const sequence = ++backlinksSequence;
    let next: NoteMetadata[] = [];
    if (currentVault && noteId) {
      try {
        next = await currentVault.listBacklinks(noteId);
      } catch {
        next = [];
      }
    }
    if (sequence === backlinksSequence) backlinks = next;
  }

  $effect(() => {
    void activeNoteId;
    void paletteNotes;
    untrack(() => void refreshBacklinks());
  });

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
        state: { onyxNoteId: sourceId },
      });
    } catch {
      // History is best-effort; navigation still works without it.
    }
    await selectNote(id);
    if (activeNoteId !== id) return;
    try {
      await goto("", { shallow: true, reset: false, state: { onyxNoteId: id } });
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

  async function setFolderIcon(path: string, icon?: FolderIcon): Promise<void> {
    if (!vault || transferState === "working" || isAttachmentFolderPath(path)) return;
    try {
      const existingFolders = await vault.listFolders();
      const current = existingFolders.find((folder) => folder.path === path);
      if (!current && !icon) return;
      if (current?.icon === icon) return;
      const now = new Date().toISOString();
      const nextFolders = current
        ? existingFolders.map((folder) => {
            if (folder.path !== path) return folder;
            const next = { ...folder, updatedAt: now };
            if (icon) next.icon = icon;
            else delete next.icon;
            return next;
          })
        : [
            ...existingFolders,
            {
              id: crypto.randomUUID(),
              path,
              createdAt: now,
              updatedAt: now,
              icon,
            },
          ];
      await vault.saveFolders(nextFolders);
      folders = nextFolders;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder icon could not be saved.";
    }
  }

  async function setFolderPinned(path: string, pinned: boolean): Promise<void> {
    if (!vault || transferState === "working") return;
    try {
      const existingFolders = await vault.listFolders();
      const current = existingFolders.find((folder) => folder.path === path);
      if (!current && !pinned) return;
      if (current?.pinned === pinned) return;
      const now = new Date().toISOString();
      const nextFolders = current
        ? existingFolders.map((folder) => {
            if (folder.path !== path) return folder;
            const next = { ...folder, updatedAt: now };
            if (pinned) next.pinned = true;
            else delete next.pinned;
            return next;
          })
        : [
            ...existingFolders,
            {
              id: crypto.randomUUID(),
              path,
              createdAt: now,
              updatedAt: now,
              pinned: true,
            },
          ];
      await vault.saveFolders(nextFolders);
      folders = nextFolders;
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder pin could not be saved.";
    }
  }

  async function setNotePinned(noteId: string, pinned: boolean): Promise<void> {
    if (!vault || transferState === "working") return;
    try {
      const changed = await vault.setNotePinned(noteId, pinned);
      if (!changed) return;
      await refreshFileTree();
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file pin could not be saved.";
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
      pendingBackupCount = await vault.countPendingBackupOperations();
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
      pendingBackupCount = await vault.countPendingBackupOperations();
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The folder could not be deleted.";
    }
  }

  async function deleteAttachment(id: string): Promise<void> {
    if (!vault || transferState === "working") return;
    const currentVault = vault;
    try {
      const attachment = await currentVault.deleteAttachment(id);
      if (!attachment) return;
      if (imagePreview?.id === attachment.id) closeImagePreview();
      if (attachment.sourcePath) {
        const retained = localAttachmentUrls.filter(
          (candidate) => candidate.sourcePath !== attachment.sourcePath,
        );
        if (retained.length !== localAttachmentUrls.length) {
          for (const candidate of localAttachmentUrls) {
            if (candidate.sourcePath === attachment.sourcePath) URL.revokeObjectURL(candidate.url);
          }
          localAttachmentUrls = retained;
          preview.invalidate();
        }
      }
      await refreshFileTree();
      pendingBackupCount = await currentVault.countPendingBackupOperations();
      storageError = "";
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "The attachment could not be deleted.";
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
      pendingBackupCount = await vault.countPendingBackupOperations();
      storageError = "";
    } catch (error) {
      storageError = error instanceof Error ? error.message : "The file could not be restored.";
    }
  }

  async function purgeFile(noteId: string): Promise<void> {
    if (!vault || transferState === "working") return;
    const note = await vault.getNote(noteId);
    if (!note) return;
    const confirmed = await confirmation.ask({
      eyebrow: "Trash",
      title: "Delete forever?",
      message: `“${fileStem(noteFilePath(note))}” and its attachments will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!confirmed) return;
    if (!(await settleDraft())) return;
    try {
      await vault.purgeNote(noteId);
      await refreshFileTree();
      if (activeNoteId === noteId) {
        const notes = await vault.listNotes();
        if (notes[0]) await loadNote(notes[0].id);
        else resetActiveNote();
      }
      pendingBackupCount = await vault.countPendingBackupOperations();
      storageError = "";
    } catch (error) {
      storageError =
        error instanceof Error ? error.message : "The file could not be permanently deleted.";
    }
  }

  async function emptyTrash(): Promise<void> {
    if (!vault || transferState === "working" || trashedNotes.length === 0) return;
    const count = trashedNotes.length;
    const confirmed = await confirmation.ask({
      eyebrow: "Trash",
      title: "Empty trash?",
      message: `${count} ${count === 1 ? "note" : "notes"} in Trash will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Empty trash",
      danger: true,
    });
    if (!confirmed) return;
    if (!(await settleDraft())) return;
    try {
      await vault.emptyTrash();
      await refreshFileTree();
      pendingBackupCount = await vault.countPendingBackupOperations();
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
    if (!vault || transferState === "working") return;
    transferState = "working";
    transferMessage = "";
    if (!(await settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { importMarkdownFiles } = await import("#lib/markdown-transfer.ts");
      await importMarkdownFiles(vault, files);
      searchQuery = "";
      const notes = await vault.listNotes();
      await loadNote(notes[0].id);
      await runSearch("");
      pendingBackupCount = await vault.countPendingBackupOperations();
      transferState = "idle";
    } catch (error) {
      showTransferError(error, "The notes could not be imported.");
    }
  }

  // Browsers save PDFs through their own print dialog, which the print stylesheet feeds.
  async function savePdf(): Promise<void> {
    await import("./styles/print.css");
    updatePreviewImmediately(markdown);
    await preview.render(markdown);
    printing = true;
    try {
      await tick();
      window.print();
    } finally {
      printing = false;
    }
  }

  async function noteSource(id: string): Promise<NoteSource | undefined> {
    if (id === activeNoteId) return { markdown, title: noteTitle };
    const note = await vault?.getNote(id);
    return note && { markdown: note.markdown, title: titleFromMarkdown(note.markdown) };
  }

  async function copyToClipboard(write: () => Promise<void>): Promise<void> {
    if (transferState === "working") return;
    try {
      await write();
      transferState = "idle";
    } catch (error) {
      showTransferError(error, "The clipboard could not be written.");
    }
  }

  async function copyNoteAs(id: string, format: Exclude<NoteFormat, "pdf">): Promise<void> {
    await copyToClipboard(async () => {
      const source = await noteSource(id);
      if (source) await noteOutput.copy(source, format);
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
    if (source) await noteOutput.download(source, format);
  }

  async function exportZip(): Promise<void> {
    if (!vault || transferState === "working") return;
    transferState = "working";
    transferMessage = "";
    if (!(await settleDraft())) {
      transferState = "idle";
      return;
    }
    try {
      const { createMarkdownExport, createMarkdownZip } = await import("#lib/markdown-transfer.ts");
      const files = await createMarkdownExport(vault);
      const archive = await createMarkdownZip(files);
      downloadBlob(archive, `onyx-markdown-${new Date().toISOString().slice(0, 10)}.zip`);
      transferState = "idle";
    } catch (error) {
      showTransferError(error, "The ZIP archive could not be created.");
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
      if (!(await settleDraft())) {
        transferState = "idle";
        return;
      }
      const { createMarkdownExport, writeMarkdownFolder } =
        await import("#lib/markdown-transfer.ts");
      const files = await createMarkdownExport(vault);
      await writeMarkdownFolder(directory, files);
      transferState = "idle";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showTransferError(error, "The notes could not be exported to that folder.");
    }
  }

  function showTransferError(error: unknown, fallback: string): void {
    transferState = "error";
    transferMessage = error instanceof Error && error.message ? error.message : fallback;
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
        await refreshResultsAfterSave(savedNote);
        pendingBackupCount = await vault.countPendingBackupOperations();
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
      editorHistory.clearPending();
      return;
    }
    if (options.recordHistory === false) editorHistory.clearPending();
    else editorHistory.record({ markdown, selection: getEditorSelection() });
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
      previewIsLive = false;
    }, PREVIEW_SETTLE_MS);
    if (previewFrame !== undefined) return;
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = undefined;
      livePreviewMarkdown = pendingPreviewMarkdown;
      previewIsLive = true;
    });
  }

  function updatePreviewImmediately(value: string): void {
    if (previewFrame !== undefined) window.cancelAnimationFrame(previewFrame);
    if (previewSettleTimer !== undefined) window.clearTimeout(previewSettleTimer);
    previewFrame = undefined;
    previewSettleTimer = undefined;
    pendingPreviewMarkdown = value;
    livePreviewMarkdown = value;
    previewMarkdown = value;
    previewIsLive = false;
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

  function captureEditorState(): void {
    const selection = getEditorSelection();
    if (selection) editorHistory.capture({ markdown, selection });
  }

  function handleEditorBeforeInput(event: InputEvent): void {
    captureEditorState();
    if (event.isComposing) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (event.inputType === "insertText" && typeof event.data === "string") {
      if (target.selectionStart === target.selectionEnd) return;
      const wrapped = wrapSelectionWith(
        target.value,
        target.selectionStart,
        target.selectionEnd,
        event.data,
      );
      if (!wrapped) return;
      event.preventDefault();
      // Placed synchronously so no deferred caret restore can race later input.
      target.value = wrapped.value;
      target.setSelectionRange(wrapped.start, wrapped.end);
      updateMarkdown(wrapped.value);
      return;
    }
    if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
    if (target.selectionStart !== target.selectionEnd) return;
    const continued = continueListOnEnter(target.value, target.selectionStart);
    if (!continued) return;
    event.preventDefault();
    // Placed synchronously so no deferred caret restore can race later input.
    target.value = continued.value;
    target.setSelectionRange(continued.caret, continued.caret);
    updateMarkdown(continued.value);
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
    if (selection) editorHistory.remember({ markdown, selection });
  }

  function undo(): boolean {
    const entry = editorHistory.undo({ markdown, selection: getEditorSelection() });
    if (!entry) return false;
    updateMarkdown(entry.markdown, { recordHistory: false });
    if (entry.selection) restoreEditorSelection(entry.selection);
    return true;
  }

  function redo(): boolean {
    const entry = editorHistory.redo({ markdown, selection: getEditorSelection() });
    if (!entry) return false;
    updateMarkdown(entry.markdown, { recordHistory: false });
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

  function runEditorIndent(target: EventTarget | null, outdent: boolean): boolean {
    if (!(target instanceof HTMLTextAreaElement)) return false;
    const edit = indentEditorLines(
      target.value,
      target.selectionStart,
      target.selectionEnd,
      outdent ? -1 : 1,
    );
    captureEditorState();
    // Placed synchronously so no deferred caret restore can race later input.
    target.value = edit.value;
    target.setSelectionRange(edit.start, edit.end);
    updateMarkdown(edit.value);
    return true;
  }

  function toggleCheckboxAtCaret(): boolean {
    if (!editor) return false;
    const edit = toggleCheckboxes(editor.value, editor.selectionStart, editor.selectionEnd);
    if (!edit) return false;
    captureEditorState();
    // Placed synchronously so no deferred caret restore can race later input.
    editor.value = edit.value;
    editor.setSelectionRange(edit.start, edit.end);
    updateMarkdown(edit.value);
    return true;
  }

  function writeEditorClipboard(text: string): boolean {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return false;
    void Promise.resolve(clipboard.writeText(text)).catch((error: unknown) => {
      showTransferError(error, "The clipboard could not be written.");
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
      pendingBackupCount = await currentVault.countPendingBackupOperations();
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
    if (request !== imagePreviewRequest) return;
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
    searchPending = false;
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
      settledSearchSequence = sequence;
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

  function handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (
      find.isOpen &&
      !event.altKey &&
      (event.key === "F3" ||
        (event.key.toLowerCase() === "g" &&
          (primaryModifier === "meta" ? event.metaKey : event.ctrlKey)))
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
    const action = (Object.keys(shortcuts) as ShortcutAction[]).find((candidate) =>
      shortcutMatchesEvent(shortcuts[candidate], event, primaryModifier),
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
    else if (action === "findInNote") find.toggle();
    else if (action === "saveNote" && transferState !== "working") void saveDraft();
    else if (action === "newNote" && transferState !== "working") void createNote();
    else if (action === "searchNotes" || action === "focusSearch") focusSearch();
    else if (action === "cycleTheme") setTheme(nextThemePreference(theme));
    else if (action === "toggleSidebar") toggleSidebar();
    else if (action === "openTrash" && transferState !== "working") toggleTrash();
    else if (action === "bold") insertSyntax("**", "**", "bold text");
    else if (action === "italic") insertSyntax("_", "_", "italic text");
    else if (action === "togglePreview") toggleRenderedPane();
    else if (action === "openShortcuts") void openSettings("shortcuts").catch(() => undefined);
    else if (action === "closePanel") {
      if (imagePreview) closeImagePreview();
      else if (restoreModalOpen && restoreState !== "restoring") restoreModalOpen = false;
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

  function setSidebarWidth(value: number): void {
    sidebarWidth = clampSidebarWidth(value);
  }

  function saveSidebarWidth(): void {
    writeLocalStorage("onyx:sidebar-width", String(sidebarWidth));
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
      return printing;
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
    get imagePreview() {
      return imagePreview;
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
    openFind: find.open,
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
    connectGitHub,
    disconnectGitHub,
    moveNoteFocus,
    selectNote,
    openNoteLink,
    openWikiLink,
    openTag,
    get backlinks() {
      return backlinks;
    },
    openBacklink: (id: string) => navigateToNote(id),
    createFile: createNote,
    createFolder,
    renameFile,
    renameFolder,
    setFolderIcon,
    setFolderPinned,
    setNotePinned,
    moveFile,
    moveFolder,
    deleteFile,
    deleteFolder,
    deleteAttachment,
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
    setSidebarWidth,
    saveSidebarWidth,
    startSidebarDrag: (event: PointerEvent) =>
      startSidebarDrag(event, {
        side: () => sidebarSide,
        setDropSide: (side) => (sidebarDropSide = side),
        dock: setSidebarSide,
      }),
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
    previewAttachment,
    openAttachmentInNewTab,
    closeImagePreview,
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
    setAutoBackup,
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
    get confirmation() {
      return confirmation.request;
    },
    confirmAction: confirmation.confirm,
    cancelAction: confirmation.cancel,
    get transferMessage() {
      return transferMessage;
    },
    dismissTransferMessage() {
      transferMessage = "";
    },
  };
}
