import { parseMarkdownSource, visitProse, type SourceNode } from "./markdown-source.ts";

export interface NoteHeading {
  text: string;
  depth: number;
  start: number;
  end: number;
}
export interface NoteMention {
  start: number;
  end: number;
  text: string;
  excerpt: string;
}

function textOf(node: SourceNode): string {
  return node.value ?? node.children?.map(textOf).join("") ?? "";
}
export function noteOutline(markdown: string): NoteHeading[] {
  if (!/(?:#{1,6}(?:[ \t]|$)|[=-]+[ \t]*(?:\r?\n|$))/m.test(markdown)) return [];
  const headings: NoteHeading[] = [];
  visitProse(parseMarkdownSource(markdown), (node) => {
    if (node.type !== "heading") return;
    const start = node.position?.start.offset,
      end = node.position?.end.offset;
    if (start !== undefined && end !== undefined)
      headings.push({
        text: textOf(node),
        depth: (node as SourceNode & { depth: number }).depth,
        start,
        end,
      });
  });
  return headings;
}

export function findUnlinkedMentions(markdown: string, names: string[]): NoteMention[] {
  const unique = [...new Set(names.filter((name) => name.trim()))].sort(
    (a, b) => b.length - a.length,
  );
  if (!unique.length) return [];
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${unique.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  const mentions: NoteMention[] = [];
  visitProse(parseMarkdownSource(markdown), (node) => {
    if (["link", "linkReference", "image", "imageReference", "definition"].includes(node.type))
      return false;
    if (node.type !== "text") return;
    const start = node.position?.start.offset,
      end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = markdown.slice(start, end);
    const linked = [...raw.matchAll(/!?\[\[[^\n]*?\]\]/g)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
    for (const match of raw.matchAll(pattern)) {
      if (
        linked.some(
          (range) => match.index < range.end && match.index + match[0].length > range.start,
        )
      )
        continue;
      const offset = start + match.index;
      mentions.push({
        start: offset,
        end: offset + match[0].length,
        text: match[0],
        excerpt: markdown
          .slice(Math.max(0, offset - 40), Math.min(markdown.length, offset + match[0].length + 60))
          .replace(/\s+/g, " "),
      });
    }
  });
  return mentions;
}
