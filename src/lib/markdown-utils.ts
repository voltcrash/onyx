export interface LocalAttachmentUrl {
  name: string;
  sourcePath?: string;
  url: string;
}

export function titleFromMarkdown(value: string, fallback = "Untitled"): string {
  const firstLine =
    stripFrontmatter(value)
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "";
  const title = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`~[\]]/g, "")
    .trim();
  return title.slice(0, 80) || fallback;
}

function stripFrontmatter(value: string): string {
  const lines = value.split(/\r?\n/);
  let firstContentLine = 0;
  while (firstContentLine < lines.length && !lines[firstContentLine]!.trim()) firstContentLine += 1;
  const opening = lines[firstContentLine]?.trim();
  if (opening !== "---" && opening !== "+++") return value;

  for (let index = firstContentLine + 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line === opening || (opening === "---" && line === "...")) {
      return lines.slice(index + 1).join("\n");
    }
  }
  return value;
}

export interface RelativeNoteLink {
  /** Vault-relative path of the destination note, e.g. `folder/other.md`. */
  path: string;
  /** Raw fragment after `#`, without the leading `#`; empty when absent. */
  fragment: string;
}

/**
 * Resolves a rendered Markdown link destination to a vault note, after Markdown has
 * already determined the destination. Returns undefined for anything that is not a
 * relative `.md` note link: external URLs, `mailto:`, absolute paths, fragment-only
 * links, and non-Markdown files are left to their default handling.
 */
export function parseRelativeNoteLink(
  destination: string,
  noteSourcePath: string | undefined,
): RelativeNoteLink | undefined {
  const trimmed = destination.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("#")) return;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return;
  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) return;
  const hashIndex = trimmed.indexOf("#");
  const fragment = hashIndex === -1 ? "" : trimmed.slice(hashIndex + 1);
  const beforeHash = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  const pathPart = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  if (!pathPart || !/\.(?:md|markdown)$/i.test(pathPart)) return;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathPart);
  } catch {
    decodedPath = pathPart;
  }
  const resolved = resolveRelativePath(dirname(noteSourcePath ?? ""), decodedPath);
  if (!resolved) return;
  return { path: resolved, fragment };
}

export interface NotePathCandidate {
  id: string;
  sourcePath?: string;
  title?: string;
}

/**
 * Finds the note matching a vault-relative path from `parseRelativeNoteLink`,
 * comparing case-insensitively like the rest of the vault. Returns undefined when
 * the destination note does not exist, so callers can fail gracefully.
 */
export function findNoteIdForPath(notes: NotePathCandidate[], path: string): string | undefined {
  const key = path.toLocaleLowerCase();
  return notes.find((note) => {
    const sourcePath = note.sourcePath?.trim();
    if (sourcePath) return sourcePath.toLocaleLowerCase() === key;
    const fallback = (note.title || "Untitled").replace(/[\\/]+/g, "-").trim() || "Untitled";
    return `${fallback}.md`.toLocaleLowerCase() === key;
  })?.id;
}

export function resolveLocalAttachmentUrl(
  destination: string,
  noteSourcePath: string | undefined,
  attachments: LocalAttachmentUrl[],
): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|#|[\\/])/i.test(destination)) return;
  const suffixIndex = destination.search(/[?#]/);
  const path = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    decodedPath = path;
  }
  const resolvedPath = resolveRelativePath(dirname(noteSourcePath ?? ""), decodedPath);
  if (!resolvedPath) return;
  const attachment =
    attachments.find(
      (candidate) =>
        candidate.sourcePath !== undefined && normalizePath(candidate.sourcePath) === resolvedPath,
    ) ??
    attachments.find(
      (candidate) => candidate.sourcePath === undefined && candidate.name === basename(decodedPath),
    );
  return attachment ? `${attachment.url}${suffix}` : undefined;
}

function resolveRelativePath(directory: string, destination: string): string | undefined {
  if (!destination || destination.includes("\\")) return;
  const parts: string[] = [];
  for (const part of `${directory}/${destination}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/") || undefined;
}

function normalizePath(path: string): string | undefined {
  return resolveRelativePath("", path);
}

function dirname(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

export const DEFAULT_ATTACHMENT_FOLDER = "attachments";

/** A vault folder path for attachments, or undefined when the value cannot be one. */
export function normalizeAttachmentFolder(value: string): string | undefined {
  const parts = value
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim());
  const segments = parts.filter(Boolean);
  const folder = segments.join("/");
  if (!folder || parts.some((part) => part === "." || part === "..")) return;
  if (/[<>:"|?*#%\p{Cc}]/u.test(folder)) return;
  if (
    segments.some(
      (part) => /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(part),
    )
  )
    return;
  return folder;
}

/** The markdown GitHub writes for an uploaded file: an image embed, or a link to anything else. */
export function attachmentMarkdown(
  name: string,
  attachmentPath: string,
  noteSourcePath: string | undefined,
  type: string,
): string {
  const destination = encodeLinkPath(relativePath(dirname(noteSourcePath ?? ""), attachmentPath));
  const label = name.replace(/[[\]\\]/g, "\\$&");
  return type.startsWith("image/") ? `![${label}](${destination})` : `[${label}](${destination})`;
}

/**
 * Re-points relative links after a note or the files it links to move. `mapPath` receives each
 * link's vault path as it was and returns where that file lives now, or undefined to leave it.
 */
export function rewriteLocalLinks(
  markdown: string,
  previousNotePath: string | undefined,
  nextNotePath: string | undefined,
  mapPath: (path: string) => string | undefined,
): string {
  const previousDirectory = dirname(previousNotePath ?? "");
  const nextDirectory = dirname(nextNotePath ?? "");
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
      if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
        fence = fence ? undefined : marker;
        return line;
      }
      if (fence) return line;
      return line.replace(
        /(\]\()(<[^>\n]*>|[^)\s]+)/g,
        (match, opening: string, rawDestination: string) => {
          const bracketed = rawDestination.startsWith("<");
          const destination = bracketed ? rawDestination.slice(1, -1) : rawDestination;
          if (/^(?:[a-z][a-z\d+.-]*:|#|[\\/])/i.test(destination)) return match;
          const suffixIndex = destination.search(/[?#]/);
          const path = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
          const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
          let decoded: string;
          try {
            decoded = decodeURIComponent(path);
          } catch {
            decoded = path;
          }
          const resolved = resolveRelativePath(previousDirectory, decoded);
          const target = resolved ? mapPath(resolved) : undefined;
          if (!target) return match;
          const relative = relativePath(nextDirectory, target);
          return bracketed
            ? `${opening}<${relative}${suffix}>`
            : `${opening}${encodeLinkPath(relative)}${suffix}`;
        },
      );
    })
    .join("\n");
}

function relativePath(fromDirectory: string, to: string): string {
  const from = fromDirectory.split("/").filter(Boolean);
  const target = to.split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < target.length - 1 && from[shared] === target[shared]) {
    shared += 1;
  }
  return [...from.slice(shared).map(() => ".."), ...target.slice(shared)].join("/");
}

function encodeLinkPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export interface ListEnterResult {
  value: string;
  caret: number;
}

/**
 * Continues a bullet, ordered, or task list when Enter is pressed with the caret on one of
 * its items. Returns the replacement text and caret, or undefined to leave the key alone.
 */
export function continueListOnEnter(value: string, caret: number): ListEnterResult | undefined {
  const cursor = Math.max(0, Math.min(caret, value.length));
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const lineBreak = value.indexOf("\n", cursor);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(/^(\s*)([-+*]|\d+[.)])(\s+)(.*)$/);
  if (!match) return;
  const [, indent, marker, gap, rest] = match as [string, string, string, string, string];
  const task = rest.match(/^\[([ xX])\](\s+|$)([\s\S]*)$/);
  const ordered = marker.match(/^(\d+)([.)])$/);
  const prefixLength =
    indent.length +
    marker.length +
    gap.length +
    (task ? task[1]!.length + 2 + (task[2] ? task[2]!.length : 0) : 0);
  const content = line.slice(prefixLength);
  if (!content.trim()) {
    return { value: value.slice(0, lineStart) + value.slice(lineEnd), caret: lineStart };
  }
  if (cursor < lineStart + prefixLength) return;
  let continuation: string;
  if (task) {
    continuation = ordered
      ? `${indent}${Number(ordered[1]) + 1}${ordered[2]} [ ] `
      : `${indent}${marker} [ ] `;
  } else if (ordered) {
    continuation = `${indent}${Number(ordered[1]) + 1}${ordered[2]} `;
  } else {
    continuation = `${indent}${marker} `;
  }
  const inserted = `${value.slice(0, cursor)}\n${continuation}${value.slice(cursor)}`;
  const nextCaret = cursor + 1 + continuation.length;
  if (!ordered) return { value: inserted, caret: nextCaret };
  return {
    value: renumberFollowingItems(inserted, nextCaret, indent, ordered[2]!),
    caret: nextCaret,
  };
}

/**
 * Shifts the numbers of the ordered items following an insertion, so `1, 2` with a new
 * item between them reads `1, 2, 3`. Nested items keep their numbers; anything outside
 * the list stops the pass.
 */
function renumberFollowingItems(
  value: string,
  from: number,
  indent: string,
  delimiter: string,
): string {
  const lineBreak = value.indexOf("\n", from);
  if (lineBreak === -1) return value;
  const head = value.slice(0, lineBreak + 1);
  const lines: string[] = [];
  let active = true;
  for (const line of value.slice(lineBreak + 1).split("\n")) {
    if (!active || !line.trim()) {
      lines.push(line);
      continue;
    }
    const match = line.match(/^(\s*)(\d+)([.)])(\s[\s\S]*)?$/);
    if (!match) {
      active = false;
    } else if (match[1] !== indent) {
      // A deeper item belongs to a nested list; anything else ends this one.
      if (!(match[1]!.startsWith(indent) && match[1]!.length > indent.length)) active = false;
    } else if (match[3] !== delimiter) {
      active = false;
    } else {
      lines.push(`${match[1]}${Number(match[2]) + 1}${match[3]}${match[4] ?? ""}`);
      continue;
    }
    lines.push(line);
  }
  return head + lines.join("\n");
}

export interface IndentEdit {
  value: string;
  start: number;
  end: number;
}

interface TouchedLines {
  head: string;
  tail: string;
  lines: string[];
  starts: number[];
  first: number;
  last: number;
  collapsed: boolean;
}

/** The full lines a caret or selection touches; a trailing line start belongs to the line above. */
function touchedLines(value: string, start: number, end: number): TouchedLines {
  const clamp = (point: number): number => Math.min(Math.max(point, 0), value.length);
  const anchor = clamp(start);
  const focus = clamp(end);
  const [first, last] = anchor <= focus ? [anchor, focus] : [focus, anchor];
  const lastContent = last > first && last > 0 && value[last - 1] === "\n" ? last - 1 : last;
  const firstLineStart = value.lastIndexOf("\n", first - 1) + 1;
  const lineBreak = value.indexOf("\n", lastContent);
  const lastLineEnd = lineBreak === -1 ? value.length : lineBreak;
  const lines = value.slice(firstLineStart, lastLineEnd).split("\n");
  let offset = firstLineStart;
  const starts = lines.map((line) => {
    const lineStart = offset;
    offset += line.length + 1;
    return lineStart;
  });
  return {
    head: value.slice(0, firstLineStart),
    tail: value.slice(lastLineEnd),
    lines,
    starts,
    first,
    last,
    collapsed: first === last,
  };
}

/** Moves a document offset through per-line edits, keeping it on the same text. */
function remapPosition(
  touched: Pick<TouchedLines, "lines" | "starts">,
  deltas: number[],
  position: number,
): number {
  let index = 0;
  for (let i = 0; i < touched.starts.length; i++) {
    if (touched.starts[i]! <= position) index = i;
    else break;
  }
  let shift = 0;
  for (let i = 0; i < index; i++) shift += deltas[i]!;
  const delta = deltas[index]!;
  const lineStart = touched.starts[index]!;
  if (position >= lineStart + touched.lines[index]!.length) return position + shift + delta;
  if (delta >= 0) return position + shift + delta;
  return lineStart + shift + Math.max(0, position - lineStart + delta);
}

/**
 * Indents or outdents the touched lines by two spaces, keeping the selection on the same
 * text. Blank lines in a range are left alone so no trailing whitespace is added.
 */
export function indentEditorLines(
  value: string,
  start: number,
  end: number,
  direction: 1 | -1,
): IndentEdit {
  const touched = touchedLines(value, start, end);
  const edits = touched.lines.map((line) => {
    if (!line.trim() && !touched.collapsed) return { text: line, delta: 0 };
    if (direction === 1) return { text: `  ${line}`, delta: 2 };
    const unit = line.match(/^ {1,2}/)?.[0] ?? (line.startsWith("\t") ? "\t" : "");
    return { text: line.slice(unit.length), delta: -unit.length };
  });
  const deltas = edits.map((edit) => edit.delta);
  return {
    value: touched.head + edits.map((edit) => edit.text).join("\n") + touched.tail,
    start: remapPosition(touched, deltas, touched.first),
    end: remapPosition(touched, deltas, touched.last),
  };
}

export interface WrapSelectionEdit {
  value: string;
  start: number;
  end: number;
}

const WRAP_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
  "*": "*",
};

/**
 * Surrounds the selected text with a brackety pair instead of replacing it, keeping the
 * inner text selected. Returns undefined for anything but a single wrapping key over a range.
 */
export function wrapSelectionWith(
  value: string,
  start: number,
  end: number,
  key: string,
): WrapSelectionEdit | undefined {
  const closer = WRAP_PAIRS[key];
  if (!closer || key.length !== 1) return;
  const clamp = (point: number): number => Math.min(Math.max(point, 0), value.length);
  const anchor = clamp(start);
  const focus = clamp(end);
  const [first, last] = anchor <= focus ? [anchor, focus] : [focus, anchor];
  if (first === last) return;
  return {
    value: `${value.slice(0, first)}${key}${value.slice(first, last)}${closer}${value.slice(last)}`,
    start: first + 1,
    end: last + 1,
  };
}

/**
 * The link markup replacing selected text when a bare URL is pasted over it, or undefined
 * for anything else. Surrounding whitespace on the clipboard is ignored.
 */
export function pasteUrlOverSelection(selected: string, clipboard: string): string | undefined {
  if (!selected) return;
  const destination = clipboard.trim();
  if (!/^https?:\/\/\S+$/i.test(destination)) return;
  return `[${selected}](${destination})`;
}

export interface ToggleCheckboxesEdit {
  value: string;
  start: number;
  end: number;
}

/**
 * Flips the checkboxes on the touched list items, turning plain bullets into unchecked
 * tasks. Returns undefined when no touched line is a list item.
 */
export function toggleCheckboxes(
  value: string,
  start: number,
  end: number,
): ToggleCheckboxesEdit | undefined {
  const touched = touchedLines(value, start, end);
  let changed = false;
  const edits = touched.lines.map((line) => {
    const match = line.match(/^(\s*)([-+*]|\d+[.)])(\s+)(.*)$/);
    if (!match) return { text: line, delta: 0 };
    const [, indent, marker, , rest] = match as [string, string, string, string, string];
    const task = rest.match(/^\[([ xX])\](\s+|$)([\s\S]*)$/);
    let text: string;
    if (task) {
      const checked = task[1] === " ";
      text = `${indent}${marker} [${checked ? "x" : " "}]${task[2]}${task[3]}`;
    } else {
      text = `${indent}${marker} [ ] ${rest}`;
    }
    changed = true;
    return { text, delta: text.length - line.length };
  });
  if (!changed) return;
  const deltas = edits.map((edit) => edit.delta);
  return {
    value: touched.head + edits.map((edit) => edit.text).join("\n") + touched.tail,
    start: remapPosition(touched, deltas, touched.first),
    end: remapPosition(touched, deltas, touched.last),
  };
}
