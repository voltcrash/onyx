import {
  opaqueSourceRanges,
  literalAt,
  parseMarkdownSource,
  visitProse,
  type SourceNode,
} from "./markdown-source.js";
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
  let cursor = 0;
  const parts: string[] = [];
  for (const range of opaqueSourceRanges(markdown)) {
    parts.push(
      markdown.slice(cursor, range.start),
      range.type === "inlineCode"
        ? " "
        : markdown.slice(range.start, range.end).replace(/[^\n]/g, ""),
    );
    cursor = range.end;
  }
  parts.push(markdown.slice(cursor));
  return parts.join("");
}

/** Whether `markdown`, the text of the note at `sourcePath`, links to `target`. */
export function linksToNote<T extends LinkableNote>(
  markdown: string,
  sourcePath: string,
  target: T,
  notes: T[],
): boolean {
  if (!markdown.includes("[[") && !/\]\s*[:(]/.test(markdown)) return false;
  const tree = parseMarkdownSource(markdown);
  const definitions = new Map<string, string>();
  visitProse(tree, (node) => {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node.url);
    }
  });
  const targetPath = noteFilePath(target).toLocaleLowerCase();
  let found = false;
  visitProse(tree, (node: SourceNode) => {
    if (found) return false;
    if (node.type === "text") {
      for (const match of (node.value ?? "").matchAll(WIKI_LINK)) {
        if (
          match[1] ||
          literalAt(node, match.index, 2) ||
          literalAt(node, match.index + match[0].length - 2, 2)
        )
          continue;
        const { name } = splitWikiTarget(match[2]!);
        if (name && resolveWikiLink(notes, name, sourcePath)?.id === target.id) found = true;
      }
    }
    const destination =
      node.type === "link"
        ? node.url
        : node.type === "linkReference"
          ? definitions.get(node.identifier ?? "")
          : undefined;
    if (!destination) return;
    const path = destination.replace(/[?#].*$/, "");
    if (!isMarkdownPath(path) || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(path)) return;
    if (
      resolveRelativePath(parentPath(sourcePath), decodePath(path))?.toLocaleLowerCase() ===
      targetPath
    )
      found = true;
  });
  return found;
}
