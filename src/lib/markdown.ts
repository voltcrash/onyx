import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";

import { remarkCallouts, remarkInlineMarks, remarkWikiLinks } from "./markdown-extensions.js";

export interface LocalAttachmentUrl {
  name: string;
  sourcePath?: string;
  url: string;
}

type HtmlNode = {
  children?: HtmlNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type?: string;
  value?: string;
};

type LocalUrlResolver = (destination: string) => string | undefined;

export type RemoteImagePolicy = "block" | "allow";

export interface MarkdownRenderOptions {
  remoteImages?: RemoteImagePolicy;
}

// Sanitizing strips generated ids of their prefix-free form, so anchors are re-pointed after.
const ID_PREFIX = "user-content-";

const markdownSchema: Options = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
  attributes: {
    ...defaultSchema.attributes,
    a: allowClasses("a", [/^wikilink/], "dataWikilink"),
    blockquote: allowClasses("blockquote", [/^callout/]),
    code: allowClasses("code", ["math-inline", "math-display"]),
    div: allowClasses("div", ["math", "math-display"]),
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked", true],
      ["disabled", true],
    ],
    li: allowClasses("li", ["task-list-item"]),
    p: allowClasses("p", ["callout-title"]),
    pre: allowClasses("pre", ["math", "math-display"]),
    span: allowClasses("span", ["math", "math-inline"]),
    ul: allowClasses("ul", ["contains-task-list"]),
  },
};

/**
 * Sanitizing honours only the first `className` rule per tag, so added classes have to be
 * folded into the default rule rather than appended beside it.
 */
function allowClasses(
  tagName: string,
  classes: Array<string | RegExp>,
  ...extras: string[]
): Array<string | [string, ...Array<string | RegExp | boolean>]> {
  const defaults = (defaultSchema.attributes?.[tagName] ?? []) as Array<
    string | [string, ...Array<string | RegExp | boolean>]
  >;
  const inherited = defaults.flatMap((entry) =>
    Array.isArray(entry) && entry[0] === "className" ? entry.slice(1) : [],
  );
  return [
    ...defaults.filter((entry) => !(Array.isArray(entry) && entry[0] === "className")),
    ["className", ...inherited, ...classes] as [string, ...Array<string | RegExp | boolean>],
    ...extras,
  ];
}

export function renderMarkdown(
  source: string,
  resolveLocalUrl?: LocalUrlResolver,
  options: MarkdownRenderOptions = {},
): string {
  const remoteImagePolicy = options.remoteImages ?? "block";
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml", "toml"])
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkGemoji)
    .use(remarkCallouts)
    .use(remarkWikiLinks)
    .use(remarkInlineMarks)
    // Front matter is metadata, not prose, so it is dropped rather than printed.
    .use(remarkRehype, { clobberPrefix: "", handlers: { toml: noHandler, yaml: noHandler } })
    .use(rehypeSlug)
    .use(rehypeSanitize, markdownSchema)
    // KaTeX runs after sanitizing, as its output is generated rather than authored.
    .use(rehypeKatex, { output: "mathml" })
    .use(prefixInternalLinks);
  if (resolveLocalUrl || remoteImagePolicy === "block") {
    processor.use(resolveMarkdownUrls, resolveLocalUrl, remoteImagePolicy);
  }
  return String(processor.use(rehypeStringify).processSync(source));
}

function noHandler(): undefined {
  return undefined;
}

// Sanitizing rewrites every id to avoid DOM clobbering; hash links have to follow it.
const prefixInternalLinks: Plugin<[]> = () => (tree) => {
  visit(tree as HtmlNode, (node) => {
    const href = node.tagName === "a" ? node.properties?.href : undefined;
    if (typeof href === "string" && href.startsWith("#") && !href.startsWith(`#${ID_PREFIX}`)) {
      node.properties!.href = `#${ID_PREFIX}${href.slice(1)}`;
    }
  });
};

export function resolveLocalAttachmentUrl(
  destination: string,
  noteSourcePath: string | undefined,
  attachments: LocalAttachmentUrl[],
): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|#|[\\/])/i.test(destination)) return;
  const suffixIndex = destination.search(/[?#]/);
  const path = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    decodedPath = path;
  }
  const resolvedPath = resolveRelativePath(dirname(noteSourcePath ?? ""), decodedPath);
  if (!resolvedPath) return;
  const attachment =
    attachments.find(
      (candidate) =>
        candidate.sourcePath !== undefined && normalizePath(candidate.sourcePath) === resolvedPath,
    ) ??
    attachments.find(
      (candidate) => candidate.sourcePath === undefined && candidate.name === basename(decodedPath),
    );
  return attachment ? `${attachment.url}${suffix}` : undefined;
}

const resolveMarkdownUrls: Plugin<[LocalUrlResolver | undefined, RemoteImagePolicy]> = (
  resolve,
  remoteImagePolicy,
) => {
  return (tree) => {
    const root = tree as HtmlNode;
    visit(root, (node) => {
      const property = node.tagName === "img" ? "src" : node.tagName === "a" ? "href" : undefined;
      if (!property || typeof node.properties?.[property] !== "string") return;
      const destination = node.properties[property];
      const resolved = resolve?.(destination);
      if (resolved) node.properties[property] = resolved;
      if (
        property === "src" &&
        remoteImagePolicy === "block" &&
        isRemoteImageUrl(destination) &&
        !resolved
      ) {
        node.tagName = "span";
        node.type = "element";
        node.properties = {
          className: ["remote-image-blocked"],
          role: "img",
          "aria-label": "Remote image blocked by privacy settings",
        };
        node.children = [{ type: "text", value: "Remote image blocked" }];
      }
    });
  };
};

function isRemoteImageUrl(destination: string): boolean {
  return /^(?:https?:)?\/\//i.test(destination);
}

function visit(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node);
  for (const child of node.children ?? []) visit(child, callback);
}

function resolveRelativePath(directory: string, destination: string): string | undefined {
  if (!destination || destination.includes("\\")) return;
  const parts: string[] = [];
  for (const part of `${directory}/${destination}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/") || undefined;
}

function normalizePath(path: string): string | undefined {
  return resolveRelativePath("", path);
}

function dirname(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
