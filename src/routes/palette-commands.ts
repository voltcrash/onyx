import {
  ArrowDownUp,
  ArrowLeftRight,
  Bold,
  Braces,
  CloudDownload,
  CloudUpload,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FilePlus2,
  FileText,
  FolderInput,
  FolderOutput,
  FolderPen,
  HardDrive,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Keyboard,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  MessageSquareWarning,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Pilcrow,
  Printer,
  Quote,
  Rows2,
  Save,
  Search,
  Settings,
  Sigma,
  Strikethrough,
  Sun,
  Trash2,
  Type,
  type LucideIcon,
} from "@lucide/svelte";
import type {
  GithubState,
  PaneLayout,
  SaveState,
  TransferState,
} from "#lib/components/app-types.ts";
import { noteFormats, type NoteFormat } from "#lib/components/note-formats.ts";
import type { SettingsSection } from "#lib/components/settings-types.ts";
import type { ShortcutAction } from "#lib/keyboard-shortcuts.ts";
import type { ThemePreference } from "#lib/theme.ts";

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  aliases?: string[];
  shortcut?: string;
  icon: LucideIcon;
  disabled?: boolean;
  run: () => void;
}

/** The page state the palette's labels and disabled flags depend on. */
export interface PaletteState {
  activeNoteId: string;
  attachmentFolder: string;
  attachmentsHidden: boolean;
  effectivePaneLayout: PaneLayout;
  fontsAreDefault: boolean;
  githubState: GithubState;
  hasContent: boolean;
  isOnline: boolean;
  renderedPaneVisible: boolean;
  saveState: SaveState;
  scrollSync: boolean;
  shortcutsAreDefault: boolean;
  sidebarCollapsed: boolean;
  sidebarSide: "left" | "right";
  singlePaneMode: boolean;
  sourcePaneVisible: boolean;
  theme: ThemePreference;
  transferState: TransferState;
  trashOpen: boolean;
  trashedCount: number;
}

export interface PaletteActions {
  shortcutLabel: (action: ShortcutAction) => string | undefined;
  createNote: () => Promise<void>;
  saveDraft: () => Promise<boolean>;
  toggleTrash: () => void;
  emptyTrash: () => Promise<void>;
  attachFile: () => void;
  setAttachmentsHidden: (hidden: boolean) => void;
  openSettings: (section: SettingsSection) => Promise<void>;
  openFind: () => void;
  insertSyntax: (before: string, after?: string, placeholder?: string) => void;
  prefixLine: (prefix: string) => void;
  toggleCheckboxAtCaret: () => boolean;
  toggleSourcePane: () => void;
  toggleRenderedPane: () => void;
  swapPanes: () => void;
  togglePaneLayout: () => void;
  toggleScrollSync: () => void;
  toggleSidebar: () => void;
  setSidebarSide: (side: "left" | "right") => void;
  setTheme: (preference: ThemePreference) => void;
  beginBackup: () => Promise<void>;
  openRestore: () => Promise<void>;
  importFolder: () => void;
  importZip: () => void;
  exportFolder: () => Promise<void>;
  exportZip: () => Promise<void>;
  resetFonts: () => void;
  resetShortcuts: () => void;
  ensurePersistentStorage: () => Promise<void>;
  copyNoteAs: (id: string, format: Exclude<NoteFormat, "pdf">) => Promise<void>;
  exportNoteAs: (id: string, format: NoteFormat) => Promise<void>;
}

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

const noteFormatExportIcons: Record<NoteFormat, LucideIcon> = {
  markdown: FileText,
  html: Code2,
  text: Type,
  "rich-text": Pilcrow,
  pdf: Printer,
};

function noteTransferCommands(state: PaletteState, actions: PaletteActions): PaletteCommand[] {
  return noteFormats.flatMap((format) => {
    const name = noteFormatPaletteNames[format.id];
    const keywords = noteFormatPaletteKeywords[format.id];
    const items: PaletteCommand[] = [];
    if (format.id !== "pdf" && format.copyable) {
      const copyFormat = format.id as Exclude<NoteFormat, "pdf">;
      items.push({
        id: `copy-${copyFormat}`,
        group: "Transfer",
        label: `Copy this note as ${name}`,
        icon: Copy,
        keywords: `clipboard ${keywords}`,
        disabled: !state.hasContent,
        run: () => void actions.copyNoteAs(state.activeNoteId, copyFormat),
      });
    }
    items.push({
      id: noteFormatExportIds[format.id],
      group: "Transfer",
      label: noteFormatExportLabels[format.id],
      icon: noteFormatExportIcons[format.id],
      keywords: `export ${keywords} save`,
      disabled: !state.hasContent,
      run: () => void actions.exportNoteAs(state.activeNoteId, format.id),
    });
    return items;
  });
}

/** Every command-palette action other than opening a note. */
export function paletteCommands(state: PaletteState, actions: PaletteActions): PaletteCommand[] {
  return [
    {
      id: "new-note",
      group: "Actions",
      label: "New note",
      shortcut: actions.shortcutLabel("newNote"),
      icon: FilePlus2,
      keywords: "create add page",
      aliases: ["create note", "quick note"],
      disabled: state.transferState === "working",
      run: () => void actions.createNote(),
    },
    {
      id: "save",
      group: "Actions",
      label: "Save note",
      shortcut: actions.shortcutLabel("saveNote"),
      icon: Save,
      keywords: "write store",
      disabled: state.saveState === "saving" || state.transferState === "working",
      run: () => void actions.saveDraft(),
    },
    {
      id: "open-trash",
      group: "View",
      label: state.trashOpen ? "Close trash" : "Open trash",
      shortcut: actions.shortcutLabel("openTrash"),
      hint: state.trashedCount ? `${state.trashedCount}` : undefined,
      icon: Trash2,
      keywords: "trash deleted restore bin",
      disabled: state.transferState === "working",
      run: () => actions.toggleTrash(),
    },
    {
      id: "empty-trash",
      group: "Actions",
      label: "Empty trash",
      hint: state.trashedCount ? `${state.trashedCount}` : undefined,
      icon: Trash2,
      keywords: "trash deleted restore purge permanent delete",
      disabled: state.transferState === "working" || state.trashedCount === 0,
      run: () => void actions.emptyTrash(),
    },
    {
      id: "attach-file",
      group: "Actions",
      label: "Add image or file",
      icon: ImagePlus,
      keywords: "attach attachment photo picture image upload insert file",
      aliases: ["insert image", "add photo"],
      disabled: state.transferState === "working" || !state.activeNoteId,
      run: () => actions.attachFile(),
    },
    {
      id: "toggle-attachments-folder",
      group: "View",
      label: state.attachmentsHidden ? "Show attachments folder" : "Hide attachments folder",
      hint: state.attachmentFolder,
      icon: state.attachmentsHidden ? Eye : EyeOff,
      keywords: "attachments images files folder sidebar hide show toggle",
      run: () => actions.setAttachmentsHidden(!state.attachmentsHidden),
    },
    {
      id: "rename-attachments-folder",
      group: "Actions",
      label: "Rename attachments folder",
      hint: state.attachmentFolder,
      icon: FolderPen,
      keywords: "attachments images files folder rename move settings",
      run: () => void actions.openSettings("editor"),
    },
    {
      id: "find-in-note",
      group: "Actions",
      label: "Find in note",
      shortcut: actions.shortcutLabel("findInNote"),
      icon: Search,
      keywords: "find replace current note text",
      run: () => actions.openFind(),
    },
    {
      id: "bold",
      group: "Formatting",
      label: "Bold",
      shortcut: actions.shortcutLabel("bold"),
      icon: Bold,
      keywords: "strong emphasis format",
      run: () => actions.insertSyntax("**", "**", "bold text"),
    },
    {
      id: "italic",
      group: "Formatting",
      label: "Italic",
      shortcut: actions.shortcutLabel("italic"),
      icon: Italic,
      keywords: "emphasis slant format",
      run: () => actions.insertSyntax("_", "_", "italic text"),
    },
    {
      id: "strikethrough",
      group: "Formatting",
      label: "Strikethrough",
      icon: Strikethrough,
      keywords: "strike delete format",
      run: () => actions.insertSyntax("~~", "~~", "struck text"),
    },
    {
      id: "highlight",
      group: "Formatting",
      label: "Highlight",
      icon: Highlighter,
      keywords: "mark emphasize format",
      run: () => actions.insertSyntax("==", "==", "highlighted text"),
    },
    {
      id: "heading",
      group: "Formatting",
      label: "Heading",
      icon: Heading2,
      keywords: "title header format",
      run: () => actions.prefixLine("## "),
    },
    {
      id: "bulleted-list",
      group: "Formatting",
      label: "Bulleted list",
      icon: List,
      keywords: "unordered list format",
      run: () => actions.prefixLine("- "),
    },
    {
      id: "numbered-list",
      group: "Formatting",
      label: "Numbered list",
      icon: ListOrdered,
      keywords: "ordered list format",
      run: () => actions.prefixLine("1. "),
    },
    {
      id: "task-list",
      group: "Formatting",
      label: "Task list",
      icon: ListChecks,
      keywords: "checklist todo checkbox format",
      run: () => actions.prefixLine("- [ ] "),
    },
    {
      id: "toggle-checkbox",
      group: "Formatting",
      label: "Toggle checkbox",
      shortcut: actions.shortcutLabel("toggleCheckbox"),
      icon: ListChecks,
      keywords: "checklist todo checkbox check uncheck toggle",
      run: () => actions.toggleCheckboxAtCaret(),
    },
    {
      id: "quote",
      group: "Formatting",
      label: "Quote",
      icon: Quote,
      keywords: "blockquote format",
      run: () => actions.prefixLine("> "),
    },
    {
      id: "callout",
      group: "Formatting",
      label: "Callout",
      icon: MessageSquareWarning,
      keywords: "note admonition alert format",
      run: () => actions.prefixLine("> [!NOTE]\n> "),
    },
    {
      id: "inline-code",
      group: "Formatting",
      label: "Inline code",
      icon: Code2,
      keywords: "code format",
      run: () => actions.insertSyntax("`", "`", "code"),
    },
    {
      id: "code-block",
      group: "Formatting",
      label: "Code block",
      icon: Braces,
      keywords: "fenced code format",
      run: () => actions.insertSyntax("```\n", "\n```", "code block"),
    },
    {
      id: "link",
      group: "Formatting",
      label: "Link",
      icon: Link,
      keywords: "url hyperlink format",
      run: () => actions.insertSyntax("[", "](https://)", "link text"),
    },
    {
      id: "divider",
      group: "Formatting",
      label: "Divider",
      icon: Minus,
      keywords: "horizontal rule separator format",
      run: () => actions.prefixLine("---\n"),
    },
    {
      id: "math",
      group: "Formatting",
      label: "Math",
      icon: Sigma,
      keywords: "equation latex formula format",
      run: () => actions.insertSyntax("$$\n", "\n$$", "equation"),
    },
    {
      id: "toggle-source-pane",
      group: "View",
      label: state.sourcePaneVisible ? "Hide source pane" : "Show source pane",
      icon: PanelLeftClose,
      keywords: "write markdown source left pane",
      disabled: !state.singlePaneMode && state.sourcePaneVisible && !state.renderedPaneVisible,
      run: () => actions.toggleSourcePane(),
    },
    {
      id: "toggle-rendered-pane",
      group: "View",
      label: state.renderedPaneVisible ? "Hide rendered pane" : "Show rendered pane",
      shortcut: actions.shortcutLabel("togglePreview"),
      icon: PanelRightClose,
      keywords: "rendered preview right pane",
      disabled: !state.singlePaneMode && state.renderedPaneVisible && !state.sourcePaneVisible,
      run: () => actions.toggleRenderedPane(),
    },
    {
      id: "swap-panes",
      group: "View",
      label: "Swap the pane positions",
      icon: ArrowLeftRight,
      keywords: "move switch sides order panes",
      disabled: state.singlePaneMode,
      run: () => actions.swapPanes(),
    },
    {
      id: "toggle-pane-layout",
      group: "View",
      label:
        state.effectivePaneLayout === "rows" ? "Place the panes side by side" : "Stack the panes",
      icon: state.effectivePaneLayout === "rows" ? Columns2 : Rows2,
      keywords: "split horizontal vertical stack columns rows layout",
      disabled: state.singlePaneMode,
      run: () => actions.togglePaneLayout(),
    },
    {
      id: "toggle-scroll-sync",
      group: "View",
      label: state.scrollSync ? "Turn off synced scrolling" : "Turn on synced scrolling",
      icon: ArrowDownUp,
      keywords: "auto scroll sync link panes follow source rendered",
      disabled: state.singlePaneMode,
      run: () => actions.toggleScrollSync(),
    },
    {
      id: "toggle-sidebar",
      group: "View",
      label: state.sidebarCollapsed ? "Show the notes sidebar" : "Hide the notes sidebar",
      shortcut: actions.shortcutLabel("toggleSidebar"),
      icon: PanelLeft,
      keywords: "panel files list",
      run: () => actions.toggleSidebar(),
    },
    {
      id: "sidebar-left",
      group: "View",
      label: "Sidebar position: Left",
      icon: PanelLeft,
      keywords: "panel side position dock move",
      disabled: state.sidebarSide === "left",
      run: () => actions.setSidebarSide("left"),
    },
    {
      id: "sidebar-right",
      group: "View",
      label: "Sidebar position: Right",
      icon: PanelRight,
      keywords: "panel side position dock move",
      disabled: state.sidebarSide === "right",
      run: () => actions.setSidebarSide("right"),
    },
    {
      id: "theme-light",
      group: "Themes",
      label: "Use light mode",
      icon: Sun,
      keywords: "bright day colour color theme",
      disabled: state.theme === "light",
      run: () => actions.setTheme("light"),
    },
    {
      id: "theme-dark",
      group: "Themes",
      label: "Use dark mode",
      icon: Moon,
      keywords: "night colour color theme",
      disabled: state.theme === "dark",
      run: () => actions.setTheme("dark"),
    },
    {
      id: "theme-system",
      group: "Themes",
      label: "Use system mode",
      icon: Monitor,
      keywords: "automatic os operating system colour color theme",
      disabled: state.theme === "system",
      run: () => actions.setTheme("system"),
    },
    {
      id: "backup",
      group: "Backup & sync",
      label: "Back up for cross-device sync",
      icon: CloudUpload,
      keywords: "commit push sync",
      disabled: !state.isOnline || state.githubState !== "connected",
      run: () => void actions.beginBackup(),
    },
    {
      id: "restore",
      group: "Backup & sync",
      label: "Restore from a GitHub commit",
      icon: CloudDownload,
      keywords: "download history rollback",
      disabled: !state.isOnline || state.githubState !== "connected",
      run: () => void actions.openRestore(),
    },
    {
      id: "import-folder",
      group: "Transfer",
      label: "Import a Markdown folder",
      icon: FolderInput,
      keywords: "open files load",
      run: () => actions.importFolder(),
    },
    {
      id: "import-zip",
      group: "Transfer",
      label: "Import a ZIP archive",
      icon: FileArchive,
      keywords: "open files load",
      run: () => actions.importZip(),
    },
    {
      id: "export-folder",
      group: "Transfer",
      label: "Export to a folder",
      icon: FolderOutput,
      keywords: "save files write",
      run: () => void actions.exportFolder(),
    },
    ...noteTransferCommands(state, actions),
    {
      id: "export-zip",
      group: "Transfer",
      label: "Export a ZIP archive",
      icon: Download,
      keywords: "save download backup",
      run: () => void actions.exportZip(),
    },
    {
      id: "settings",
      group: "Settings",
      label: "Editor settings",
      icon: Settings,
      keywords: "preferences options writing fonts typeface editor",
      aliases: ["preferences", "configuration"],
      run: () => actions.openSettings("editor"),
    },
    {
      id: "reset-fonts",
      group: "Settings",
      label: "Restore default fonts",
      icon: Type,
      keywords: "editor typography reset appearance",
      disabled: state.fontsAreDefault,
      run: actions.resetFonts,
    },
    {
      id: "settings-themes",
      group: "Settings",
      label: "Theme settings",
      icon: Sun,
      keywords: "appearance color mode light dark system",
      aliases: ["appearance", "color scheme"],
      run: () => actions.openSettings("themes"),
    },
    {
      id: "shortcuts",
      group: "Settings",
      label: "Keyboard shortcuts",
      shortcut: actions.shortcutLabel("openShortcuts"),
      icon: Keyboard,
      keywords: "help keys reference",
      run: () => actions.openSettings("shortcuts"),
    },
    {
      id: "reset-shortcuts",
      group: "Settings",
      label: "Restore default keyboard shortcuts",
      icon: Keyboard,
      keywords: "keys reset defaults customize",
      disabled: state.shortcutsAreDefault,
      run: actions.resetShortcuts,
    },
    {
      id: "settings-github",
      group: "Settings",
      label: "GitHub backup & sync settings",
      icon: CloudUpload,
      keywords:
        "account sign in backup cross device repository branch directory remote status history commit pending changes",
      run: () => actions.openSettings("github"),
    },
    {
      id: "storage",
      group: "Settings",
      label: "Storage choices",
      icon: HardDrive,
      keywords: "space quota usage persistent folder opfs",
      run: () => actions.openSettings("storage"),
    },
    {
      id: "request-persistent-storage",
      group: "Settings",
      label: "Request persistent storage",
      icon: HardDrive,
      keywords: "storage browser keep notes safe durable",
      run: () => void actions.ensurePersistentStorage(),
    },
    {
      id: "settings-transfer",
      group: "Settings",
      label: "Import & export settings",
      icon: ArrowLeftRight,
      keywords: "markdown zip folder transfer files",
      run: () => actions.openSettings("transfer"),
    },
    {
      id: "settings-vault",
      group: "Settings",
      label: "Vault settings",
      icon: Lock,
      keywords: "delete clear notes vault data",
      run: () => actions.openSettings("vault"),
    },
  ];
}
