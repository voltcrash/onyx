export interface FindMatch {
  start: number;
  end: number;
}

export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
}

const wordCharacter = /[\p{L}\p{N}_]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordCharacter(value: string | undefined): boolean {
  return Boolean(value && wordCharacter.test(value));
}

function isHighSurrogate(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff;
}

// Reads one code point beside the match rather than copying the text around it.
function hasWordCharacterBefore(value: string, index: number): boolean {
  if (index <= 0) return false;
  const start =
    isLowSurrogate(value, index - 1) && isHighSurrogate(value, index - 2) ? index - 2 : index - 1;
  const codePoint = value.codePointAt(start);
  return codePoint !== undefined && isWordCharacter(String.fromCodePoint(codePoint));
}

function hasWordCharacterAfter(value: string, index: number): boolean {
  const codePoint = value.codePointAt(index);
  return codePoint !== undefined && isWordCharacter(String.fromCodePoint(codePoint));
}

function isWholeWord(value: string, start: number, end: number): boolean {
  return !hasWordCharacterBefore(value, start) && !hasWordCharacterAfter(value, end);
}

export function findTextMatches(
  value: string,
  query: string,
  { matchCase, wholeWord }: FindOptions,
): FindMatch[] {
  if (!query) return [];

  const matches: FindMatch[] = [];
  if (matchCase) {
    let start = value.indexOf(query);
    while (start >= 0) {
      const end = start + query.length;
      if (!wholeWord || isWholeWord(value, start, end)) matches.push({ start, end });
      start = value.indexOf(query, end);
    }
    return matches;
  }

  const pattern = new RegExp(escapeRegExp(query), "giu");
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + match[0].length;
    if (!wholeWord || isWholeWord(value, start, end)) matches.push({ start, end });
  }
  return matches;
}

export function escapeFindText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function highlightFindMatches(
  value: string,
  matches: FindMatch[],
  activeIndex: number,
): string {
  if (matches.length === 0) return escapeFindText(value);
  let output = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    output += escapeFindText(value.slice(cursor, match.start));
    output += `<mark class="find-match${index === activeIndex ? " find-match-current" : ""}">${escapeFindText(value.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  });
  return `${output}${escapeFindText(value.slice(cursor))}`;
}
