import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { unified, type Plugin } from "unified";

export interface SourceNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  identifier?: string;
  literal?: number[];
  children?: SourceNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

const proseParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"]);
const parser = proseParser().use(remarkMath);
const opaque = new Set(["code", "inlineCode", "html", "math", "inlineMath", "yaml", "toml"]);

/** Escapes and entities are text, never fresh extension delimiters after decoding. */
export function preserveLiteralSyntax(node: SourceNode, source: string): void {
  if (opaque.has(node.type) || !node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "inlineMath") {
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      const raw = start === undefined || end === undefined ? "" : source.slice(start, end);
      if (
        raw.startsWith("$") &&
        !raw.startsWith("$$") &&
        !(raw.startsWith("$`") && raw.endsWith("`$")) &&
        (/^\s|\s$/.test(raw.slice(1, -1)) || /\d/.test(source[end ?? source.length] ?? ""))
      ) {
        const content = raw.slice(1, -1);
        const value = child.value ?? "";
        const padded =
          /^[ \r\n]/.test(content) && /[ \r\n]$/.test(content) && /[^ \r\n]/.test(value);
        const text = padded
          ? `$${content.match(/^(?:\r\n|[ \r\n])/)![0]}${value}${content.match(/(?:\r\n|[ \r\n])$/)![0]}$`
          : `$${value}$`;
        const prose = proseParser.parse(text) as SourceNode;
        preserveLiteralSyntax(prose, text);
        return prose.children?.[0]?.children ?? [child];
      }
    }
    if (child.type !== "text") {
      preserveLiteralSyntax(child, source);
      return [child];
    }
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined) return [child];
    const raw = source.slice(start, end);
    const literal: number[] = [];
    const value = child.value ?? "";
    let decodedOffset = 0;
    let rawOffset = 0;
    for (const match of raw.matchAll(
      /\\[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]+);/g,
    )) {
      // Container prefixes between source lines are absent from mdast text values.
      while (rawOffset < match.index) {
        if (raw[rawOffset] === value[decodedOffset]) decodedOffset += 1;
        rawOffset += 1;
      }
      const decoded = match[0].startsWith("\\")
        ? match[0].slice(1)
        : plainText(parser.parse(match[0]) as SourceNode);
      for (let index = 0; index < decoded.length; index++) literal.push(decodedOffset + index);
      decodedOffset += decoded.length;
      rawOffset = match.index + match[0].length;
    }
    if (literal.length) child.literal = literal;
    return [child];
  });
}

export const remarkLiteralSyntax: Plugin<[]> = () => (tree, file) => {
  preserveLiteralSyntax(tree as SourceNode, String(file));
};

export function parseMarkdownSource(source: string): SourceNode {
  const tree = parser.parse(source) as SourceNode;
  preserveLiteralSyntax(tree, source);
  return tree;
}

export function visitProse(node: SourceNode, visit: (node: SourceNode) => void | boolean): boolean {
  if (opaque.has(node.type)) return true;
  if (visit(node) === false) return false;
  if (node.type === "link" || node.type === "linkReference") return true;
  for (const child of node.children ?? []) {
    if (!visitProse(child, visit)) return false;
  }
  return true;
}

export function plainText(node: SourceNode): string {
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  return node.value ?? node.children?.map(plainText).join("") ?? "";
}

export function literalAt(node: SourceNode, start: number, length = 1): boolean {
  return node.literal?.some((offset) => offset >= start && offset < start + length) ?? false;
}

export function sliceText(
  node: SourceNode,
  start: number,
  end = node.value?.length ?? 0,
): Pick<SourceNode, "type" | "value" | "literal"> {
  return {
    type: "text",
    value: node.value?.slice(start, end) ?? "",
    literal: node.literal
      ?.filter((offset) => offset >= start && offset < end)
      .map((offset) => offset - start),
  };
}

export function opaqueSourceRanges(
  source: string,
): Array<{ start: number; end: number; type: string }> {
  const ranges: Array<{ start: number; end: number; type: string }> = [];
  function visit(node: SourceNode): void {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (opaque.has(node.type) && start !== undefined && end !== undefined) {
      ranges.push({ start, end, type: node.type });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(parseMarkdownSource(source));
  return ranges.sort((a, b) => a.start - b.start);
}

export function mapMarkdownProse(source: string, transform: (prose: string) => string): string {
  let cursor = 0;
  const parts: string[] = [];
  for (const range of opaqueSourceRanges(source)) {
    parts.push(transform(source.slice(cursor, range.start)), source.slice(range.start, range.end));
    cursor = range.end;
  }
  parts.push(transform(source.slice(cursor)));
  return parts.join("");
}

export function frontmatterBounds(
  source: string,
): { marker: "---" | "+++"; closingLine: number; bodyStart: number } | undefined {
  const firstBreak = source.indexOf("\n");
  if (firstBreak === -1) return;
  const marker = source.slice(0, firstBreak).replace(/\r$/, "");
  if (marker !== "---" && marker !== "+++") return;
  let start = firstBreak + 1;
  let lineNumber = 1;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline === -1 ? source.length : newline;
    const line = source.slice(start, end).replace(/[\t \r]+$/, "");
    if (line === marker || (marker === "---" && line === "..."))
      return { marker, closingLine: lineNumber, bodyStart: newline === -1 ? end : end + 1 };
    start = end + 1;
    lineNumber += 1;
  }
}
