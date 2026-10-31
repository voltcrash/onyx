import {
  defaultKeyboardShortcuts,
  formatShortcut,
  type PrimaryModifier,
} from "#lib/keyboard-shortcuts.ts";

/** The note shown before the vault has any notes of its own. */
export function createInitialMarkdown(primaryModifier: PrimaryModifier): string {
  const key = (action: keyof typeof defaultKeyboardShortcuts) =>
    `\`${formatShortcut(defaultKeyboardShortcuts[action], primaryModifier)}\``;
  return `# Welcome to Onyx

Onyx is a quiet place to think in Markdown. It is a local-first notes app that runs in your browser: write with a live preview, search everything instantly, and keep working offline. There is no account to create. Your work stays on this device and saves automatically as you write.

> Good tools disappear into the work.

This note is yours to edit or delete. Everything you need to know about Onyx is on this page.

## Start writing

- [x] Open Onyx
- [ ] Create a note with ${key("newNote")} or the **New file** button in the sidebar
- [ ] Capture the next idea
- [ ] Shape it into something useful

Write Markdown in the source pane and see it rendered alongside. Press ${key("togglePreview")} to show or hide the rendered pane, or drag a pane by its grip to place it on any side. On narrow screens, Onyx shows one pane at a time.

Notes save on their own a moment after you stop typing. Press ${key("saveNote")} to save immediately.

## Markdown you can use

Onyx renders Markdown much like GitHub does:

- **Text:** headings, **bold**, *italic*, ~~strikethrough~~, ==highlights==, \`inline code\` and footnotes
- **Structure:** bulleted, numbered and task lists, quotes, tables and dividers
- **Code:** fenced code blocks with syntax highlighting
- **Math:** \`$inline$\` equations, and display equations between lines of \`$$\`
- **Callouts:** GitHub alerts such as \`> [!NOTE]\`, \`> [!TIP]\` and \`> [!WARNING]\`
- **Diagrams:** \`mermaid\` code blocks
- **Images and files:** paste or drop them into the editor and Onyx stores them with your notes

Not sure of the syntax? Open the command palette and choose a formatting command such as *Heading*, *Task list*, *Callout* or *Math*.

## Connect and organize your notes

- **Wiki links:** type \`[[Note name]]\` to link to another note. Use \`[[Note name#Heading]]\` to jump to a section and \`[[Note name|label]]\` to change the link text. Each note lists the notes that link back to it at the bottom of the preview.
- **Tags:** add \`#ideas\` anywhere in a note, or \`tags\` in front matter. Click a tag in the preview to see every note that uses it.
- **Folders:** drag notes and folders to move them. Right-click, or long-press on touch screens, to rename, pin, set a folder icon, copy a path or export.
- **Vaults:** keep separate collections, such as work and personal, as separate vaults. Switch between them from the top of the sidebar.
- **Trash:** deleted notes stay in the trash for 30 days. Press ${key("openTrash")} to restore them.

## Find anything quickly

Search checks every title and every word, and the index stays on this device. Press ${key("searchNotes")} or \`/\` to search all notes, and add a \`#tag\` to narrow the results. Press ${key("findInNote")} to find and replace within the open note.

The command palette, ${key("commandPalette")}, is the fastest way to do anything: open a note, format text, change the layout, switch themes, import, export or back up.

## Work offline

Once Onyx has loaded online, it keeps working without a connection in the same browser. Your notes and search stay available offline. Only the first visit and GitHub backup and restore need the internet.

## Where your notes live

Notes are stored privately in this browser on this device. Nothing is published and no account is needed. Onyx uses the browser's IndexedDB and its private file system (OPFS) to hold your notes, attachments and search index.

In browsers that support choosing folders, you can mirror this vault to a folder on your computer from **Settings → Storage choices**.

> **Keep a backup.** The browser can clear its storage, for example when you clear site data, use private browsing or run low on disk space. Export your vault or turn on GitHub backup for anything you can't afford to lose.

## Import and export

- **Bring notes in:** import a folder of Markdown files or a ZIP archive, along with the images and files they reference.
- **Take notes out:** export the whole vault as Markdown files and attachments, to a folder or a ZIP archive.
- **Share a single note:** copy or export it as plain text, rich text or HTML. Print a note to save it as a PDF.

Your notes are always plain Markdown, so they work in any other editor.

## Back up and sync with GitHub

GitHub backup is optional. It keeps an off-device copy of your vault in a private GitHub repository and lets you restore it on another device.

1. Open **Settings → Backup & sync** and connect your GitHub account.
2. Create a new private repository or choose an existing one.
3. Back up whenever you like, or turn on automatic backup to save two minutes after you stop editing.
4. On another device, open Onyx, connect GitHub, and restore the vault from any backup.

Your browser sends notes directly to GitHub; they do not pass through an Onyx server. Restoring replaces the notes on that device. If another device backed up newer changes, a manual backup asks whether to restore them first or back up anyway. An automatic backup that fails or finds newer changes pauses until you back up manually. Earlier backups remain in the repository's history.

## Make it yours

Open **Settings** to choose light, dark or system mode, a color theme and fonts. Set the content width from the command palette, and drag the sidebar to either side of the window. Press ${key("toggleSidebar")} to hide the sidebar and ${key("cycleTheme")} to switch between light, dark and system mode.

## Keyboard shortcuts

- ${key("commandPalette")} Command palette
- ${key("newNote")} New note
- ${key("searchNotes")} Search all notes
- ${key("findInNote")} Find in note
- ${key("togglePreview")} Show or hide the rendered pane
- ${key("toggleSidebar")} Show or hide the sidebar
- ${key("toggleCheckbox")} Toggle a checkbox

Press \`?\` to see every shortcut and change any of them in **Settings → Keyboard shortcuts**.

## Good to know

- Onyx is built for personal vaults. It does not offer real-time collaboration or automatic merging of edits from several devices.
- Notes are not end-to-end encrypted. A private GitHub repository is private, not encrypted.
- The source code is at https://github.com/voltcrash/onyx.

Happy writing.`;
}
