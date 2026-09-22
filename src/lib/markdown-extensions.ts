import type { Plugin } from "unified";

/**
 * Markdown extensions in three layers: GitHub writing extensions (alerts,
 * alternate inline math, fenced diagrams), Onyx note-taking extensions (wiki
 * links, `==highlight==` marks, Onyx-only callout kinds), and shared mdast
 * helpers. GitHub-compatible behavior must not depend on Onyx-only syntax.
 */

export interface MdastNode {
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: MdastNode[];
  };
  lang?: string;
  position?: { start: { line: number }; end: { line: number } };
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

// GitHub has no `~text~`/`^text^` inline marks: tildes follow GFM strikethrough
// and superscript remains available via safe HTML `<sup>`.
const INLINE_MARKS: Array<{ delimiter: string; tagName: string }> = [
  { delimiter: "==", tagName: "mark" },
];

const WIKI_LINK = /(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

const CALLOUT_MARKER = /^\[!([A-Za-z][\w-]*)\][-+]?[ \t]*(.*)$/;

// GitHub documents five alert types; other callout kinds are Onyx-only and kept
// separate from GitHub-compatible alert semantics.
export const GITHUB_ALERT_TYPES = ["caution", "important", "note", "tip", "warning"] as const;
export type GitHubAlertType = (typeof GITHUB_ALERT_TYPES)[number];

const GITHUB_ALERT_TITLES: Record<GitHubAlertType, string> = {
  caution: "Caution",
  important: "Important",
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

// Onyx-only callout titles; GitHub-compatible alerts resolve via GITHUB_ALERT_TITLES.
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

// GitHub's alternate inline math `$`…`$` for equations containing Markdown
// syntax. The parser leaves it as text/code/text, so adjacent `$`-wrapped code
// spans are folded into inline math matching remark-math's node shape.
export const remarkGithubInlineMath: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    const children = parent.children ?? [];
    if (children.length < 3) return;
    const result: MdastNode[] = [];
    let index = 0;
    while (index < children.length) {
      const first = children[index]!;
      const code = children[index + 1];
      const last = children[index + 2];
      if (
        first.type === "text" &&
        (first.value ?? "").endsWith("$") &&
        !(first.value ?? "").endsWith("$$") &&
        code?.type === "inlineCode" &&
        (code.value ?? "") !== "" &&
        last?.type === "text" &&
        (last.value ?? "").startsWith("$") &&
        !(last.value ?? "").startsWith("$$")
      ) {
        const head = first.value!.slice(0, -1);
        if (head) result.push({ type: "text", value: head });
        const value = code.value ?? "";
        result.push({
          type: "inlineMath",
          value,
          data: {
            hName: "code",
            hProperties: { className: ["language-math", "math-inline"] },
            hChildren: [{ type: "text", value }],
          },
        });
        const tail = last.value!.slice(1);
        if (tail) result.push({ type: "text", value: tail });
        index += 3;
      } else {
        result.push(first);
        index += 1;
      }
    }
    parent.children = result;
  });
};

// Fenced diagram languages render client-side from a safe placeholder holding
// the raw source as text. The source is never executed during rendering, and
// failures keep the readable source instead of breaking the note.
function fencedDiagramNode(language: string, source: string): MdastNode {
  return {
    type: "diagram",
    data: {
      hName: "pre",
      hProperties: { className: [`diagram`, `diagram-${language}`] },
    },
    children: [{ type: "text", value: source }],
  };
}

function remarkFencedLanguage(language: string): Plugin<[]> {
  return () => (tree) => {
    visitParents(tree as MdastNode, (parent) => {
      parent.children = (parent.children ?? []).map((child) => {
        if (child.type !== "code" || (child.lang ?? "").toLowerCase() !== language) {
          return child;
        }
        return {
          ...fencedDiagramNode(language, child.value ?? ""),
          position: child.position,
        };
      });
    });
  };
}

// GitHub renders ```mermaid fences as diagrams. Onyx emits a placeholder the
// viewer lazy-loads Mermaid for; without it the source stays readable text.
export const remarkMermaid = remarkFencedLanguage("mermaid");

// GitHub renders ```geojson fences as maps. Onyx has no map viewer, so valid
// documents get a deterministic structural summary above their source.
export function describeGeoJSON(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return;
  const root = value as { features?: unknown; geometry?: { type?: unknown }; type?: unknown };
  if (typeof root.type !== "string") return;
  switch (root.type) {
    case "FeatureCollection": {
      const count = Array.isArray(root.features) ? root.features.length : 0;
      return `GeoJSON FeatureCollection · ${count} feature${count === 1 ? "" : "s"}`;
    }
    case "Feature":
      return `GeoJSON Feature · ${typeof root.geometry?.type === "string" ? root.geometry.type : "unknown geometry"}`;
    case "GeometryCollection": {
      const count = Array.isArray((root as { geometries?: unknown }).geometries)
        ? (root as { geometries: unknown[] }).geometries.length
        : 0;
      return `GeoJSON GeometryCollection · ${count} geometr${count === 1 ? "y" : "ies"}`;
    }
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
    case "Polygon":
    case "MultiPolygon":
      return `GeoJSON ${root.type}`;
    default:
      return;
  }
}

// GitHub renders ```topojson fences as maps from Topology objects.
export function describeTopoJSON(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return;
  const root = value as { objects?: unknown; type?: unknown };
  if (root.type !== "Topology" || typeof root.objects !== "object" || root.objects === null) {
    return;
  }
  const names = Object.keys(root.objects);
  return `TopoJSON Topology · ${names.length} object${names.length === 1 ? "" : "s"}`;
}

export const remarkTopoJSON: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    parent.children = (parent.children ?? []).map((child) => {
      if (child.type !== "code" || (child.lang ?? "").toLowerCase() !== "topojson") {
        return child;
      }
      const source = child.value ?? "";
      let summary: string | undefined;
      try {
        summary = describeTopoJSON(JSON.parse(source));
      } catch {
        summary = undefined;
      }
      const node =
        summary === undefined
          ? {
              ...fencedDiagramNode("topojson", `Invalid TopoJSON\n${source}`),
              data: {
                hName: "pre",
                hProperties: { className: ["diagram", "diagram-topojson", "diagram-error"] },
              },
            }
          : fencedDiagramNode("topojson", `${summary}\n${source}`);
      return { ...node, position: child.position };
    });
  });
};

// GitHub renders ```stl fences (ASCII STL) as 3D models. Onyx has no 3D
// viewer, so valid solids get a facet summary above their source.
export function describeSTL(source: string): string | undefined {
  const normalized = source.trim();
  if (!/^solid(\s|$)/i.test(normalized) || !/endsolid/i.test(normalized)) return;
  const facets = normalized.match(/facet\s+normal/gi)?.length ?? 0;
  return `STL model · ${facets} facet${facets === 1 ? "" : "s"}`;
}

export const remarkSTL: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    parent.children = (parent.children ?? []).map((child) => {
      if (child.type !== "code" || (child.lang ?? "").toLowerCase() !== "stl") {
        return child;
      }
      const source = child.value ?? "";
      const summary = describeSTL(source);
      const node =
        summary === undefined
          ? {
              ...fencedDiagramNode("stl", `Invalid STL\n${source}`),
              data: {
                hName: "pre",
                hProperties: { className: ["diagram", "diagram-stl", "diagram-error"] },
              },
            }
          : fencedDiagramNode("stl", `${summary}\n${source}`);
      return { ...node, position: child.position };
    });
  });
};

export const remarkGeoJSON: Plugin<[]> = () => (tree) => {
  visitParents(tree as MdastNode, (parent) => {
    parent.children = (parent.children ?? []).map((child) => {
      if (child.type !== "code" || (child.lang ?? "").toLowerCase() !== "geojson") {
        return child;
      }
      const source = child.value ?? "";
      let summary: string | undefined;
      try {
        summary = describeGeoJSON(JSON.parse(source));
      } catch {
        summary = undefined;
      }
      const node =
        summary === undefined
          ? {
              ...fencedDiagramNode("geojson", `Invalid GeoJSON\n${source}`),
              data: {
                hName: "pre",
                hProperties: { className: ["diagram", "diagram-geojson", "diagram-error"] },
              },
            }
          : fencedDiagramNode("geojson", `${summary}\n${source}`);
      return { ...node, position: child.position };
    });
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
    // GitHub alerts cannot nest; a blockquote inside another blockquote stays plain.
    const nested = parent.type === "blockquote";
    for (const node of parent.children ?? []) {
      if (node.type !== "blockquote") continue;
      const paragraph = node.children?.[0];
      const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
      if (first?.type !== "text") continue;
      const [line, ...rest] = (first.value ?? "").split("\n");
      const marker = line?.match(CALLOUT_MARKER);
      if (!marker) continue;
      const kind = marker[1]!.toLowerCase();
      const githubAlert = (GITHUB_ALERT_TYPES as readonly string[]).includes(kind);
      if (githubAlert && nested) continue;
      const trailing = marker[2]?.trim() ?? "";
      // GitHub has no custom alert titles: trailing marker-line text folds into
      // the body. Onyx-only callouts keep their custom-title behavior.
      const title = githubAlert
        ? GITHUB_ALERT_TITLES[kind as GitHubAlertType]
        : trailing || (CALLOUT_TITLES[kind] ?? capitalize(kind));
      first.value = githubAlert && trailing ? [trailing, ...rest].join("\n") : rest.join("\n");
      if (!first.value && paragraph!.children!.length === 1) paragraph!.children = [];
      node.data = {
        // Onyx-only callouts keep an extra marker class so GitHub-compatible
        // alerts stay identifiable by `callout` + `callout-<type>` alone.
        hProperties: {
          className: githubAlert
            ? ["callout", `callout-${kind}`]
            : ["callout", `callout-${kind}`, "onyx-callout"],
        },
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
