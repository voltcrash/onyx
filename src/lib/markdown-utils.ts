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

const TASK_MARKER = /^((?:\s*>)*\s*(?:[-+*]|\d{1,9}[.)])\s+\[)([ xX])(\](?=\s|$))/;

export function toggleTaskAtLine(value: string, lineIndex: number): string {
  const lines = value.split("\n");
  const line = lines[lineIndex];
  const match = line?.match(TASK_MARKER);
  if (!line || !match) return value;
  lines[lineIndex] =
    `${match[1]}${match[2] === " " ? "x" : " "}${line.slice(match[1]!.length + 1)}`;
  return lines.join("\n");
}

// Maps the nth rendered checkbox back to its source line, skipping fenced code.
export function taskLineIndex(value: string, taskIndex: number): number | undefined {
  let fence: string | undefined;
  let seen = 0;
  const lines = value.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const opener = line.match(/^(?:\s*>)*\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = undefined;
      continue;
    }
    if (opener) {
      fence = opener;
      continue;
    }
    if (TASK_MARKER.test(line) && seen++ === taskIndex) return index;
  }
  return undefined;
}
