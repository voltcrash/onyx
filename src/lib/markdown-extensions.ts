import type { Plugin } from "unified";

/**
 * Markdown extensions shared by the editors that other platforms treat as standard:
 * Obsidian highlights and wiki links, Pandoc sub/superscript, and GitHub alerts.
 */

export interface MdastNode {
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  type: string;
  value?: string;
}

const OPAQUE_PARENTS = new Set([
  "code",
  "inlineCode",
  "html",
  "math",
  "inlineMath",
  "yaml",
  "toml",
]);

const INLINE_MARKS: Array<{ delimiter: string; tagName: string }> = [
  { delimiter: "==", tagName: "mark" },
  { delimiter: "^", tagName: "sup" },
  { delimiter: "~", tagName: "sub" },
];

const WIKI_LINK = /(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

const CALLOUT_MARKER = /^\[!([A-Za-z][\w-]*)\][-+]?[ \t]*(.*)$/;

// GitHub renders five alert types; Obsidian adds the rest and aliases the overlap.
const CALLOUT_TITLES: Record<string, string> = {
  abstract: "Abstract",
  bug: "Bug",
  caution: "Caution",
  danger: "Danger",
  example: "Example",
  failure: "Failure",
  important: "Important",
  info: "Info",
  note: "Note",
  question: "Question",
  quote: "Quote",
  success: "Success",
  summary: "Summary",
  tip: "Tip",
  todo: "Todo",
  warning: "Warning",
};

export const remarkInlineMarks: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    for (const { delimiter, tagName } of INLINE_MARKS) {
      parent.children = wrapDelimited(parent.children ?? [], delimiter, tagName);
    }
  });
};

export const remarkWikiLinks: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    parent.children = (parent.children ?? []).flatMap((child) =>
      child.type === "text" ? splitWikiLinks(child.value ?? "") : [child],
    );
  });
};

export const remarkCallouts: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    for (const node of parent.children ?? []) {
      if (node.type !== "blockquote") continue;
      const paragraph = node.children?.[0];
      const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
      if (first?.type !== "text") continue;
      const [line, ...rest] = (first.value ?? "").split("\n");
      const marker = line?.match(CALLOUT_MARKER);
      if (!marker) continue;
      const kind = marker[1]!.toLowerCase();
      const title = marker[2]?.trim() || (CALLOUT_TITLES[kind] ?? capitalize(kind));
      first.value = rest.join("\n");
      if (!first.value && paragraph!.children!.length === 1) paragraph!.children = [];
      node.data = {
        hProperties: { className: ["callout", `callout-${kind}`] },
      };
      node.children = [
        {
          type: "paragraph",
          data: { hProperties: { className: ["callout-title"] } },
          children: [{ type: "text", value: title }],
        },
        ...(paragraph!.children!.length === 0 ? node.children!.slice(1) : node.children!),
      ];
    }
  });
};

function visitParents(node: MdastNode, callback: (node: MdastNode) => void): void {
  if (OPAQUE_PARENTS.has(node.type) || !node.children) return;
  callback(node);
  for (const child of node.children) visitParents(child, callback);
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function splitWikiLinks(value: string): MdastNode[] {
  const nodes: MdastNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(WIKI_LINK)) {
    const [raw, embed, target, label] = match;
    const start = match.index;
    if (start > cursor) nodes.push({ type: "text", value: value.slice(cursor, start) });
    cursor = start + raw.length;
    nodes.push({
      type: "wikiLink",
      data: {
        hName: "a",
        hProperties: {
          className: embed ? ["wikilink", "wikilink-embed"] : ["wikilink"],
          dataWikilink: target!.trim(),
        },
      },
      children: [{ type: "text", value: (label ?? target)!.trim() }],
    });
  }
  if (cursor === 0) return [{ type: "text", value }];
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

type Token =
  | { kind: "delimiter"; canClose: boolean; canOpen: boolean }
  | { kind: "node"; node: MdastNode }
  | { kind: "text"; value: string };

/**
 * Pairs a delimiter across siblings so `==**bold**==` wraps the parsed strong node too.
 * An opener needs non-space to its right and a closer non-space to its left, which keeps
 * prose like `a ~ b` and arithmetic like `2 ^ 3` untouched.
 */
function wrapDelimited(children: MdastNode[], delimiter: string, tagName: string): MdastNode[] {
  if (!children.some((child) => child.type === "text" && child.value?.includes(delimiter))) {
    return children;
  }
  const tokens: Token[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      tokens.push({ kind: "node", node: child });
      continue;
    }
    const value = child.value ?? "";
    let cursor = 0;
    for (
      let index = value.indexOf(delimiter);
      index !== -1;
      index = value.indexOf(delimiter, cursor)
    ) {
      if (index > cursor) tokens.push({ kind: "text", value: value.slice(cursor, index) });
      cursor = index + delimiter.length;
      const before = index === 0 ? "" : value[index - 1]!;
      const after = value[cursor] ?? "";
      tokens.push({
        kind: "delimiter",
        canOpen: after === "" || !/\s/.test(after),
        canClose: before === "" || !/\s/.test(before),
      });
    }
    if (cursor < value.length) tokens.push({ kind: "text", value: value.slice(cursor) });
  }

  const result: Token[] = [];
  let openAt = -1;
  for (const token of tokens) {
    if (token.kind !== "delimiter") {
      result.push(token);
      continue;
    }
    if (openAt !== -1 && token.canClose && result.length > openAt + 1) {
      const inner = result.splice(openAt + 1).map((entry) => toNode(entry, delimiter));
      result.pop();
      result.push({
        kind: "node",
        node: { type: "inlineMark", data: { hName: tagName }, children: inner },
      });
      openAt = -1;
      continue;
    }
    if (token.canOpen) {
      openAt = result.length;
      result.push(token);
      continue;
    }
    result.push(token);
  }
  return mergeText(result.map((entry) => toNode(entry, delimiter)));
}

function toNode(token: Token, delimiter: string): MdastNode {
  if (token.kind === "node") return token.node;
  return { type: "text", value: token.kind === "text" ? token.value : delimiter };
}

function mergeText(nodes: MdastNode[]): MdastNode[] {
  const merged: MdastNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (node.type === "text" && previous?.type === "text") {
      previous.value = `${previous.value ?? ""}${node.value ?? ""}`;
    } else {
      merged.push(node);
    }
  }
  return merged;
}
