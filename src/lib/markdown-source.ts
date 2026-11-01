import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
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

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml", "toml"]);
const opaque = new Set(["code", "inlineCode", "html", "math", "inlineMath", "yaml", "toml"]);

/** Escapes and entities are text, never fresh extension delimiters after decoding. */
export function preserveLiteralSyntax(node: SourceNode, source: string): void {
  if (opaque.has(node.type) || !node.children) return;
  node.children = node.children.flatMap((child) => {
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

export function visitProse(node: SourceNode, visit: (node: SourceNode) => void): void {
  if (opaque.has(node.type)) return;
  visit(node);
  if (node.type === "link" || node.type === "linkReference") return;
  for (const child of node.children ?? []) visitProse(child, visit);
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
