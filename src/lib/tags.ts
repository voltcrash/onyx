import { stripCode } from "./wikilinks.js";

// A tag starts after whitespace or at a line start, so URL fragments, entities and heading markers
// are not tags. It needs one non-digit, which keeps issue references like #42 as plain text.
const INLINE_TAG = /(?<=^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
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
  let index = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex(
      (line, lineIndex) => lineIndex > 0 && /^(?:---|\.\.\.)\s*$/.test(line),
    );
    if (end > 0) {
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
      index = end + 1;
    }
  }

  for (const match of stripCode(lines.slice(index).join("\n")).matchAll(INLINE_TAG)) {
    add(match[1]!);
  }
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
