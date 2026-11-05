import { frontmatterBounds } from "./markdown-source.js";
import { literalAt, parseMarkdownSource, visitProse } from "./markdown-source.js";

// A tag starts after whitespace or at a line start, so URL fragments, entities and heading markers
// are not tags. It needs one non-digit, which keeps issue references like #42 as plain text.
export const INLINE_TAG = /(?<=^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const FRONTMATTER_TAGS = /^tags?:\s*(.*)$/i;

/** Normalizes a tag for storage and matching: lower case, no leading `#` or trailing `/`. */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^#+/, "")
    .replace(/\/+$/, "")
    .toLocaleLowerCase();
}

/** The tags a note declares in its front matter `tags:` field and as inline `#tags`. */
export function extractTags(markdown: string): string[] {
  const tags = new Set<string>();
  const add = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (normalized) tags.add(normalized);
  };

  const lines = markdown.split(/\r?\n/);
  const frontmatter = frontmatterBounds(markdown);
  if (frontmatter?.marker === "---") {
    const end = frontmatter.closingLine;
    for (let lineIndex = 1; lineIndex < end; lineIndex += 1) {
      const match = lines[lineIndex]!.match(FRONTMATTER_TAGS);
      if (!match) continue;
      const inline = match[1]!.trim().replace(/^\[|\]$/g, "");
      if (inline) {
        for (const tag of inline.split(/[,\s]+/)) add(tag);
        continue;
      }
      for (let item = lineIndex + 1; item < end; item += 1) {
        const listItem = lines[item]!.match(/^\s*-\s+(.+)$/);
        if (!listItem) break;
        add(listItem[1]!);
      }
    }
  }

  const prose = markdown.slice(frontmatter?.bodyStart ?? 0);
  if (!/#\S/u.test(prose)) return [...tags].sort();
  visitProse(parseMarkdownSource(prose), (parent) => {
    if (parent.type === "link" || parent.type === "linkReference") return;
    for (const child of parent.children ?? []) {
      if (child.type !== "text") continue;
      const value = child.value ?? "";
      const wikiRanges = [...value.matchAll(/!?\[\[[^\]\n]+\]\]/g)].filter(
        (wiki) =>
          !literalAt(child, wiki.index + (wiki[0].startsWith("!") ? 1 : 0), 2) &&
          !literalAt(child, wiki.index + wiki[0].length - 2, 2),
      );
      for (const match of value.matchAll(INLINE_TAG)) {
        if (
          literalAt(child, match.index) ||
          wikiRanges.some(
            (wiki) => match.index >= wiki.index && match.index < wiki.index + wiki[0].length,
          )
        )
          continue;
        add(match[1]!);
      }
    }
  });
  return [...tags].sort();
}

/** Splits a search query into its free text and the `#tags` every result must carry. */
export function parseSearchQuery(query: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = query
    .split(/\s+/)
    .filter((word) => {
      if (!/^#[\p{L}\p{N}_/-]+$/u.test(word)) return true;
      const tag = normalizeTag(word);
      if (tag) tags.push(tag);
      return !tag;
    })
    .join(" ")
    .trim();
  return { text, tags };
}
