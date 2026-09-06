import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";

export interface LocalAttachmentUrl {
  name: string;
  sourcePath?: string;
  url: string;
}

type HtmlNode = {
  children?: HtmlNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
};

type LocalUrlResolver = (destination: string) => string | undefined;

const markdownSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked", true],
      ["disabled", true],
    ],
    li: [...(defaultSchema.attributes?.li ?? []), ["className", "task-list-item"]],
    ul: [...(defaultSchema.attributes?.ul ?? []), ["className", "contains-task-list"]],
  },
};

export function renderMarkdown(source: string, resolveLocalUrl?: LocalUrlResolver): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, markdownSchema);
  if (resolveLocalUrl) processor.use(resolveMarkdownUrls, resolveLocalUrl);
  return String(processor.use(rehypeStringify).processSync(source));
}

export function resolveLocalAttachmentUrl(
  destination: string,
  noteSourcePath: string | undefined,
  attachments: LocalAttachmentUrl[],
): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(destination)) return;
  const suffixIndex = destination.search(/[?#]/);
  const path = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    decodedPath = path;
  }
  const resolvedPath = normalizePath(`${dirname(noteSourcePath ?? "")}/${decodedPath}`);
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

const resolveMarkdownUrls: Plugin<[LocalUrlResolver]> = (resolve) => {
  return (tree) => {
    const root = tree as HtmlNode;
    visit(root, (node) => {
      const property = node.tagName === "img" ? "src" : node.tagName === "a" ? "href" : undefined;
      if (!property || typeof node.properties?.[property] !== "string") return;
      const resolved = resolve(node.properties[property]);
      if (resolved) node.properties[property] = resolved;
    });
  };
};

function visit(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node);
  for (const child of node.children ?? []) visit(child, callback);
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
