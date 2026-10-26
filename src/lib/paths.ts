/** Helpers for the slash-separated, root-relative paths Onyx uses for notes and attachments. */

export const MARKDOWN_EXTENSION = ".md";
const MARKDOWN_PATH = /\.(?:md|markdown)$/i;

export function pathParts(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function parentPath(path: string): string {
  return pathParts(path).slice(0, -1).join("/");
}

export function joinPath(parent: string, name: string): string {
  return [...pathParts(parent), name].join("/");
}

/** The last path segment. Backslashes also separate segments, as in links pasted from Windows. */
export function basename(path: string): string {
  return pathParts(path.replaceAll("\\", "/")).at(-1) ?? "";
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_PATH.test(path);
}

export function fileStem(path: string): string {
  return basename(path).replace(MARKDOWN_PATH, "") || "Untitled";
}

/** Whether `path` is `parent` or inside it. Every path is within the root, `""`. */
export function isPathWithin(path: string, parent: string): boolean {
  return !parent || path === parent || path.startsWith(`${parent}/`);
}

/** Rebases `path` from inside `from` to inside `to`. */
export function movePath(path: string, from: string, to: string): string {
  const suffix = path.slice(from.length).replace(/^\/+/, "");
  return suffix ? joinPath(to, suffix) : to;
}

/**
 * Resolves `destination` against `directory`, or returns undefined when it is empty, uses
 * backslashes, or climbs above the root.
 */
export function resolveRelativePath(directory: string, destination: string): string | undefined {
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

/** The path from `fromDirectory` to the file at `to`. */
export function relativePath(fromDirectory: string, to: string): string {
  const from = pathParts(fromDirectory);
  const target = pathParts(to);
  let shared = 0;
  while (shared < from.length && shared < target.length - 1 && from[shared] === target[shared]) {
    shared += 1;
  }
  return [...from.slice(shared).map(() => ".."), ...target.slice(shared)].join("/");
}

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function noteFilePath(note: { sourcePath?: string; title: string }): string {
  const sourcePath = note.sourcePath?.trim();
  if (sourcePath) return sourcePath;
  const fallback = (note.title || "Untitled").replace(/[\\/]+/g, "-").trim() || "Untitled";
  return `${fallback}${MARKDOWN_EXTENSION}`;
}

export function noteFolderPath(note: { sourcePath?: string; title: string }): string {
  return parentPath(noteFilePath(note));
}

function assertValidName(value: string, kind: "File" | "Folder"): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new Error(`${kind} names cannot be empty or contain slashes.`);
  }
  if (hasControlCharacters(trimmed)) {
    throw new Error(`${kind} names cannot contain control characters.`);
  }
  return trimmed;
}

/** A single-segment note file name, with `.md` added when it has no Markdown extension. */
export function normalizeFileName(value: string): string {
  const name = assertValidName(value, "File");
  return isMarkdownPath(name) ? name : `${name}${MARKDOWN_EXTENSION}`;
}

export function normalizeFolderName(value: string): string {
  return assertValidName(value, "Folder");
}
