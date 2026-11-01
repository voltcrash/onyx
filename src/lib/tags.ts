import { parseMarkdownSource, visitProse } from "./markdown-source.js";

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

  visitProse(parseMarkdownSource(lines.slice(index).join("\n")), (parent) => {
    if (parent.type === "link" || parent.type === "linkReference") return;
    for (const [childIndex, child] of (parent.children ?? []).entries()) {
      if (child.type !== "text") continue;
      const previous = parent.children?.[childIndex - 1];
      const value = (child.value ?? "").replace(/!?\[\[[^\]\n]+\]\]/g, " ");
      for (const match of value.matchAll(INLINE_TAG)) {
        if (match.index === 0 && previous?.type === "literal" && !/\s$/.test(previous.value ?? ""))
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
