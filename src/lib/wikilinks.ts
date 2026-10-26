import {
  decodePath,
  encodePath,
  fileStem,
  isMarkdownPath,
  noteFilePath,
  parentPath,
  resolveRelativePath,
} from "./paths.js";

interface LinkableNote {
  id: string;
  title: string;
  sourcePath?: string;
}

const WIKI_LINK = /(!?)\[\[([^\]|\n]+?)(?:\|[^\]\n]+?)?\]\]/g;
const MARKDOWN_LINK = /(!?)\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;

/** Splits `Note#Heading` into the note name and the heading it points at. */
export function splitWikiTarget(target: string): { name: string; fragment: string } {
  const hash = target.indexOf("#");
  return hash === -1
    ? { name: target.trim(), fragment: "" }
    : { name: target.slice(0, hash).trim(), fragment: target.slice(hash + 1).trim() };
}

/** A relative href for a wiki link, so it works as a link outside Onyx too. */
export function wikiLinkHref(target: string): string {
  const { name, fragment } = splitWikiTarget(target);
  const path = name ? `${encodePath(name)}${isMarkdownPath(name) ? "" : ".md"}` : "";
  return fragment ? `${path}#${encodeURIComponent(fragment)}` : path;
}

function withoutExtension(path: string): string {
  return path.replace(/\.(?:md|markdown)$/i, "");
}

/**
 * The note a wiki link names. A bare name matches any note with that file name, and a name with
 * folders matches the end of a note's path. Ties prefer the linking note's folder, then the
 * shortest path.
 */
export function resolveWikiLink<T extends LinkableNote>(
  notes: T[],
  name: string,
  fromPath?: string,
): T | undefined {
  const wanted = withoutExtension(name.trim().replace(/^\.?\/+/, "")).toLocaleLowerCase();
  if (!wanted) return;
  const fromFolder = parentPath(fromPath ?? "").toLocaleLowerCase();
  const candidates = notes
    .map((note) => ({ note, path: withoutExtension(noteFilePath(note)).toLocaleLowerCase() }))
    .filter(({ note, path }) =>
      wanted.includes("/")
        ? path === wanted || path.endsWith(`/${wanted}`)
        : fileStem(noteFilePath(note)).toLocaleLowerCase() === wanted,
    );
  candidates.sort(
    (left, right) =>
      Number(parentPath(right.path) === fromFolder) -
        Number(parentPath(left.path) === fromFolder) ||
      left.path.length - right.path.length ||
      left.path.localeCompare(right.path),
  );
  return candidates[0]?.note;
}

/** The note's text with code blocks and code spans blanked, so links inside code are ignored. */
export function stripCode(markdown: string): string {
  let fence: string | undefined;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(FENCE)?.[1];
      if (marker) {
        if (!fence) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
        return "";
      }
      return fence ? "" : line.replace(INLINE_CODE, " ");
    })
    .join("\n");
}

/** Whether `markdown`, the text of the note at `sourcePath`, links to `target`. */
export function linksToNote<T extends LinkableNote>(
  markdown: string,
  sourcePath: string,
  target: T,
  notes: T[],
): boolean {
  if (!markdown.includes("[[") && !markdown.includes("](")) return false;
  const prose = stripCode(markdown);
  for (const match of prose.matchAll(WIKI_LINK)) {
    if (match[1]) continue;
    const { name } = splitWikiTarget(match[2]!);
    if (name && resolveWikiLink(notes, name, sourcePath)?.id === target.id) return true;
  }
  const targetPath = noteFilePath(target);
  for (const match of prose.matchAll(MARKDOWN_LINK)) {
    if (match[1]) continue;
    const destination = match[2]!.replace(/[?#].*$/, "");
    if (!isMarkdownPath(destination) || /^[a-z][a-z\d+.-]*:/i.test(destination)) continue;
    if (resolveRelativePath(parentPath(sourcePath), decodePath(destination)) === targetPath) {
      return true;
    }
  }
  return false;
}
