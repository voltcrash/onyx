// Temporary first-paint and active-typing fallback. This is not a GitHub
// Markdown implementation; the full renderer replaces it once input settles.
// Keep it fast and approximate rather than growing it into a second parser.
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

// First-paint rendering only; the full renderer replaces this output.
export function renderMarkdown(source: string, resolveLocalUrl?: LocalUrlResolver): string {
  return renderMarkdownBlocks(source, resolveLocalUrl)
    .map((block) => block.html)
    .join("");
}

// First-paint block rendering only; approximate structure for instant display.
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
      const values: string[] = [];
      let loose = false;
      while (index < lines.length) {
        const line = lines[index]!;
        if (!line.trim()) {
          let ahead = index + 1;
          while (ahead < lines.length && !lines[ahead]!.trim()) ahead += 1;
          const next = ahead < lines.length ? lines[ahead]! : "";
          const continues = ordered
            ? /^\s*\d+[.)]\s+.+$/.test(next) && isListItem(next)
            : /^\s*[-+*]\s+.+$/.test(next) && isListItem(next);
          if (!continues) break;
          loose = true;
          index = ahead;
          continue;
        }
        const match = line.match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/);
        if (!match) break;
        values.push(match[1]!);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      const items = values.map((value) => renderListItem(value, resolveLocalUrl, loose));
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

// Fallback highlighting escapes without tokenizing; full renderer handles real highlighting.
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

function renderListItem(value: string, resolveLocalUrl?: LocalUrlResolver, loose = false): string {
  const task = value.match(/^\[([ xX])\]\s+(.*)$/);
  if (!task) {
    const inner = renderInline(value, resolveLocalUrl);
    return loose ? `<li><p>${inner}</p></li>` : `<li>${inner}</li>`;
  }
  const checked = task[1]!.toLowerCase() === "x";
  const inner = `<input type="checkbox"${checked ? " checked" : ""} disabled>${renderInline(task[2]!, resolveLocalUrl)}`;
  return loose
    ? `<li class="task-list-item"><p>${inner}</p></li>`
    : `<li class="task-list-item">${inner}</li>`;
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
  result = renderEmphasis(result);
  function renderEmphasis(text: string): string {
    text = text.replace(
      /\*\*\*([^*\n]+)\*\*\*|___([^_\n]+)___/g,
      (_, starContent: string | undefined, underscoreContent: string | undefined) =>
        `<em><strong>${renderEmphasis(starContent ?? underscoreContent ?? "")}</strong></em>`,
    );
    text = text.replace(
      /(\*\*|__)(.+?)\1/g,
      (_, _delimiter: string, content: string) => `<strong>${renderEmphasis(content)}</strong>`,
    );
    text = text.replace(
      /~~([^~]+)~~/g,
      (_, content: string) => `<del>${renderEmphasis(content)}</del>`,
    );
    text = text.replace(
      /==([^=]+)==/g,
      (_, content: string) => `<mark>${renderEmphasis(content)}</mark>`,
    );
    text = text.replace(
      /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g,
      (_, first: string | undefined, second: string | undefined) =>
        `<em>${renderEmphasis(first ?? second ?? "")}</em>`,
    );
    return text;
  }
  return result.replace(
    new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, "g"),
    (_, index: string) => tokens[Number(index)] ?? "",
  );
}

function safeHref(destination: string, resolveLocalUrl?: LocalUrlResolver): string | undefined {
  const resolved = resolveLocalUrl?.(destination);
  if (resolved) return escapeHtml(resolved);
  if (/^(?:https?:|mailto:|#|\/)/i.test(destination)) return escapeHtml(destination);
  // Preserve relative Markdown note links for the preview click handler, which resolves
  // them against the current note. Other relative files stay plain text in this fallback.
  if (
    !/^[a-z][a-z\d+.-]*:/i.test(destination) &&
    /\.(?:md|markdown)(?:[?#]|$)/i.test(destination)
  ) {
    return escapeHtml(destination);
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
