export interface SourceLines {
  start: number;
  end: number;
}

export interface RenderedBlock {
  html: string;
  element: boolean;
  lines?: SourceLines;
}

type LocalUrlResolver = (destination: string) => string | undefined;
const TOKEN_START = "\uE000";
const TOKEN_END = "\uE001";

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  bash: "SH",
  css: "CSS",
  html: "HTML",
  javascript: "JS",
  js: "JS",
  json: "JSON",
  markdown: "MD",
  md: "MD",
  python: "PY",
  py: "PY",
  rust: "RS",
  shell: "SH",
  sql: "SQL",
  svelte: "SVELTE",
  ts: "TS",
  typescript: "TS",
  tsx: "TSX",
  txt: "TXT",
  yaml: "YAML",
  yml: "YAML",
};

export function renderMarkdown(source: string, resolveLocalUrl?: LocalUrlResolver): string {
  return renderMarkdownBlocks(source, resolveLocalUrl)
    .map((block) => block.html)
    .join("");
}

export function renderMarkdownBlocks(
  source: string,
  resolveLocalUrl?: LocalUrlResolver,
): RenderedBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: RenderedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index]!.trim()) {
      index += 1;
      continue;
    }

    const fence = lines[index]!.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const start = index;
      const marker = fence[1]!;
      const language = fence[2]!.trim().split(/\s+/)[0] ?? "";
      index += 1;
      const content: string[] = [];
      while (
        index < lines.length &&
        !lines[index]!.match(new RegExp(`^\\s*${marker[0]}{${marker.length},}`))
      ) {
        content.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const label = codeLanguageLabel(language);
      const languageAttribute = label ? ` data-code-language="${escapeHtml(label)}"` : "";
      blocks.push({
        html: `<pre${languageAttribute}><code>${escapeHtml(content.join("\n"))}</code></pre>`,
        element: true,
        lines: { start, end: index },
      });
      continue;
    }

    const heading = lines[index]!.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const start = index;
      index += 1;
      blocks.push({
        html: `<h${heading[1]!.length}>${renderInline(heading[2]!, resolveLocalUrl)}</h${heading[1]!.length}>`,
        element: true,
        lines: { start, end: index },
      });
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index]!)) {
      const start = index;
      index += 1;
      blocks.push({ html: "<hr>", element: true, lines: { start, end: index } });
      continue;
    }

    if (/^\s*>/.test(lines[index]!)) {
      const start = index;
      const content: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        content.push(lines[index]!.replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({
        html: `<blockquote><p>${renderInline(content.join("\n"), resolveLocalUrl)}</p></blockquote>`,
        element: true,
        lines: { start, end: index },
      });
      continue;
    }

    if (isListItem(lines[index]!)) {
      const start = index;
      const ordered = /^\s*\d+[.)]\s+/.test(lines[index]!);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index]!.match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/);
        if (!match) break;
        items.push(renderListItem(match[1]!, resolveLocalUrl));
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push({
        html: `<${tag}>${items.join("")}</${tag}>`,
        element: true,
        lines: { start, end: index },
      });
      continue;
    }

    const start = index;
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !isBlockStart(lines[index]!)) {
      paragraph.push(lines[index]!);
      index += 1;
    }
    if (index === start) {
      paragraph.push(lines[index]!);
      index += 1;
    }
    blocks.push({
      html: `<p>${renderInline(paragraph.join("\n"), resolveLocalUrl)}</p>`,
      element: true,
      lines: { start, end: index },
    });
  }

  return blocks;
}

export function codeLanguageLabel(language: string): string {
  const normalized = language.trim().split(/\s+/)[0] ?? "";
  if (!normalized) return "";
  return (
    CODE_LANGUAGE_LABELS[normalized.toLowerCase()] ??
    normalized.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function highlightCodeLines(source: string, _language: string): string[] {
  return source.split("\n").map(escapeHtml);
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)])\s+\S/.test(line);
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*(?:`{3,}|~{3,})/.test(line) ||
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*>/.test(line) ||
    isListItem(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function renderListItem(value: string, resolveLocalUrl?: LocalUrlResolver): string {
  const task = value.match(/^\[([ xX])\]\s+(.*)$/);
  if (!task) return `<li>${renderInline(value, resolveLocalUrl)}</li>`;
  const checked = task[1]!.toLowerCase() === "x";
  return `<li class="task-list-item"><input type="checkbox"${checked ? " checked" : ""} disabled>${renderInline(task[2]!, resolveLocalUrl)}</li>`;
}

function renderInline(value: string, resolveLocalUrl?: LocalUrlResolver): string {
  const tokens: string[] = [];
  const token = (html: string): string => {
    const value = `${TOKEN_START}${tokens.length}${TOKEN_END}`;
    tokens.push(html);
    return value;
  };

  let result = escapeHtml(value);
  result = result.replace(/`([^`\n]+)`/g, (_, code: string) => token(`<code>${code}</code>`));
  result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, destination: string) => {
    const resolved = resolveLocalUrl?.(destination);
    return resolved
      ? token(`<img src="${escapeHtml(resolved)}" alt="${alt}">`)
      : token(
          `<span role="img" aria-label="${alt || "Image unavailable"}">${alt || "Image"}</span>`,
        );
  });
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, destination: string) => {
    const href = safeHref(destination, resolveLocalUrl);
    return href ? token(`<a href="${href}">${label}</a>`) : label;
  });
  result = result.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
    (_, target: string, label?: string) =>
      token(
        `<a class="wikilink" data-wikilink="${escapeHtml(target.trim())}">${label?.trim() || target.trim()}</a>`,
      ),
  );
  result = result.replace(/(\*\*|__)(.+?)\1/g, (_, delimiter: string, content: string) =>
    token(`<strong>${content}</strong>`),
  );
  result = result.replace(/~~([^~]+)~~/g, (_, content: string) => token(`<del>${content}</del>`));
  result = result.replace(/==([^=]+)==/g, (_, content: string) => token(`<mark>${content}</mark>`));
  result = result.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g,
    (_, first: string, second: string) => token(`<em>${first || second}</em>`),
  );
  return result.replace(
    new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, "g"),
    (_, index: string) => tokens[Number(index)] ?? "",
  );
}

function safeHref(destination: string, resolveLocalUrl?: LocalUrlResolver): string | undefined {
  const resolved = resolveLocalUrl?.(destination);
  if (resolved) return escapeHtml(resolved);
  return /^(?:https?:|mailto:|#|\/)/i.test(destination) ? escapeHtml(destination) : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
