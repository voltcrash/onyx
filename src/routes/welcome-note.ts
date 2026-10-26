import type { PrimaryModifier } from "#lib/keyboard-shortcuts.ts";

/** The note shown before the vault has any notes of its own. */
export function createInitialMarkdown(primaryModifier: PrimaryModifier): string {
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
