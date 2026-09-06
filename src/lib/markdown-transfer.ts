import { BlobReader, BlobWriter, ZipReader, ZipWriter, type Entry } from "@zip.js/zip.js";

import type { Vault } from "./storage/vault.js";

export interface MarkdownTransferFile {
  contents: Blob;
  path: string;
}

export interface MarkdownImportResult {
  attachmentCount: number;
  noteCount: number;
}

export async function readMarkdownZip(file: Blob): Promise<MarkdownTransferFile[]> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    return stripCommonRoot(
      await Promise.all(
        entries
          .filter((entry): entry is Entry & { directory: false } => !entry.directory)
          .map(async (entry) => ({
            contents: await entry.getData(new BlobWriter(contentType(entry.filename))),
            path: entry.filename,
          })),
      ),
    );
  } finally {
    await reader.close();
  }
}

export function readMarkdownFolder(files: FileList | File[]): MarkdownTransferFile[] {
  const entries = [...files].map((file) => ({
    contents: file,
    path: file.webkitRelativePath || file.name,
  }));
  return stripCommonRoot(entries);
}

export async function importMarkdownFiles(
  vault: Vault,
  files: MarkdownTransferFile[],
): Promise<MarkdownImportResult> {
  const entries = normalizeEntries(files);
  const notes = entries.filter((file) => isMarkdownPath(file.path));
  if (notes.length === 0) throw new Error("No Markdown files were found.");

  const attachments = entries.filter((file) => !isMarkdownPath(file.path));
  const markdown = await Promise.all(
    notes.map(async (file) => ({ file, text: await file.contents.text() })),
  );
  const attachmentsByNote = new Map<string, MarkdownTransferFile[]>();
  for (const attachment of attachments) {
    const ownerPath = findAttachmentOwner(attachment.path, markdown).file.path;
    const owned = attachmentsByNote.get(ownerPath) ?? [];
    owned.push(attachment);
    attachmentsByNote.set(ownerPath, owned);
  }

  return vault.importNotes(
    markdown.map((note) => ({
      attachments: (attachmentsByNote.get(note.file.path) ?? []).map((attachment) => ({
        contents: attachment.contents,
        name: basename(attachment.path),
        sourcePath: attachment.path,
      })),
      markdown: note.text,
      sourcePath: note.file.path,
      title: titleFromMarkdown(note.text, note.file.path),
    })),
  );
}

export async function createMarkdownExport(vault: Vault): Promise<MarkdownTransferFile[]> {
  const [notes, attachments] = await Promise.all([vault.listNotes(), vault.listAttachments()]);
  const files: MarkdownTransferFile[] = [];
  const paths = new Set<string>();

  for (const note of notes.toReversed()) {
    const value = await vault.getNote(note.id);
    if (!value) continue;
    const path = uniquePath(
      normalizeExportPath(note.sourcePath, `${safeName(note.title)}.md`),
      paths,
    );
    files.push({
      contents: new Blob([value.markdown], { type: "text/markdown;charset=utf-8" }),
      path,
    });
  }

  for (const metadata of attachments) {
    const attachment = await vault.getAttachment(metadata.id);
    if (!attachment) continue;
    const fallback = `attachments/${safeName(metadata.name)}`;
    const path = uniquePath(normalizeExportPath(metadata.sourcePath, fallback), paths);
    files.push({ contents: attachment.file, path });
  }

  return files;
}

export async function createMarkdownZip(files: MarkdownTransferFile[]): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const file of files) await writer.add(file.path, new BlobReader(file.contents));
  return writer.close();
}

export async function writeMarkdownFolder(
  root: FileSystemDirectoryHandle,
  files: MarkdownTransferFile[],
): Promise<void> {
  const conflicts = (
    await Promise.all(
      files.map(async (file) => ((await exportPathExists(root, file.path)) ? file.path : "")),
    )
  ).filter(Boolean);
  if (conflicts.length > 0) {
    const shown = conflicts.slice(0, 3).join(", ");
    const remaining = conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : "";
    throw new Error(
      `Export stopped because existing files would be overwritten: ${shown}${remaining}. Choose an empty folder.`,
    );
  }

  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop();
    if (!name) continue;
    let directory = root;
    for (const part of parts)
      directory = await directory.getDirectoryHandle(part, { create: true });
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(file.contents);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }
}

async function exportPathExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  const parts = path.split("/");
  const name = parts.pop();
  if (!name) return true;
  let directory = root;
  try {
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
  } catch (error) {
    if (isMissingEntry(error)) return false;
    if (isTypeMismatch(error)) return true;
    throw error;
  }

  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (!isMissingEntry(error) && !isTypeMismatch(error)) throw error;
  }
  try {
    await directory.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (isMissingEntry(error) || isTypeMismatch(error)) return false;
    throw error;
  }
}

function isMissingEntry(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function isTypeMismatch(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TypeMismatchError";
}

function normalizeEntries(files: MarkdownTransferFile[]): MarkdownTransferFile[] {
  const paths = new Set<string>();
  return files.flatMap((file) => {
    const path = normalizePath(file.path);
    if (!path || path.startsWith("__MACOSX/") || paths.has(path)) return [];
    paths.add(path);
    return [{ ...file, path }];
  });
}

function stripCommonRoot(files: MarkdownTransferFile[]): MarkdownTransferFile[] {
  const paths = files.map((file) => file.path.replaceAll("\\", "/").replace(/^\/+/, ""));
  const root = paths[0]?.split("/")[0];
  if (!root || !paths.every((path) => path.startsWith(`${root}/`))) {
    return files.map((file, index) => ({ ...file, path: paths[index] }));
  }
  return files.map((file, index) => ({ ...file, path: paths[index].slice(root.length + 1) }));
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return "";
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function findAttachmentOwner(
  path: string,
  notes: Array<{ file: MarkdownTransferFile; text: string }>,
): { file: MarkdownTransferFile; text: string } {
  const linked = notes.find((note) => referencedPaths(note.text, note.file.path).has(path));
  if (linked) return linked;
  return notes.toSorted(
    (left, right) =>
      commonDirectoryDepth(path, right.file.path) - commonDirectoryDepth(path, left.file.path),
  )[0];
}

function referencedPaths(markdown: string, notePath: string): Set<string> {
  const references = new Set<string>();
  const directory = dirname(notePath);
  const destinations = [
    ...markdown.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g),
    ...markdown.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g),
  ];
  for (const match of destinations) {
    const destination = match[1] ?? match[2];
    if (!destination || /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(destination)) continue;
    const withoutSuffix = destination.split(/[?#]/, 1)[0];
    try {
      references.add(normalizePath(`${directory}/${decodeURIComponent(withoutSuffix)}`));
    } catch {
      references.add(normalizePath(`${directory}/${withoutSuffix}`));
    }
  }
  return references;
}

function normalizeExportPath(sourcePath: string | undefined, fallback: string): string {
  return normalizePath(sourcePath ?? fallback) || fallback;
}

function uniquePath(path: string, paths: Set<string>): string {
  if (!paths.has(path)) {
    paths.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const base = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  const extension = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  let index = 2;
  while (paths.has(`${base}-${index}${extension}`)) index += 1;
  const result = `${base}-${index}${extension}`;
  paths.add(result);
  return result;
}

function commonDirectoryDepth(left: string, right: string): number {
  const leftParts = dirname(left).split("/");
  const rightParts = dirname(right).split("/");
  let depth = 0;
  while (leftParts[depth] && leftParts[depth] === rightParts[depth]) depth += 1;
  return depth;
}

function titleFromMarkdown(markdown: string, path: string): string {
  const firstLine =
    markdown
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "";
  const title = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`~[\]]/g, "")
    .trim();
  return title.slice(0, 80) || basename(path).replace(/\.(?:md|markdown)$/i, "") || "Untitled";
}

function dirname(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function safeName(value: string): string {
  let withoutControlCharacters = "";
  for (const character of value) {
    withoutControlCharacters += character.charCodeAt(0) < 32 ? "-" : character;
  }
  return (
    withoutControlCharacters
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/[. ]+$/g, "")
      .trim() || "Untitled"
  );
}

function contentType(path: string): string {
  if (isMarkdownPath(path)) return "text/markdown;charset=utf-8";
  const extension = path.slice(path.lastIndexOf(".") + 1).toLocaleLowerCase();
  return (
    {
      gif: "image/gif",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      pdf: "application/pdf",
      png: "image/png",
      svg: "image/svg+xml",
      webp: "image/webp",
    }[extension] ?? "application/octet-stream"
  );
}

function isMarkdownPath(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path);
}
