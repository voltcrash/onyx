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
