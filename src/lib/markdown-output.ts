const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "code",
  "del",
  "em",
  "i",
  "img",
  "input",
  "kbd",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// Blocks whose text is significant, so their contents are copied through untouched.
const PRESERVED_TAGS = new Set(["pre", "code", "textarea", "script", "style"]);

/**
 * Indents the rendered fragment for reading. Inline elements and preserved blocks keep their
 * original spacing, because breaking them would change what the document says.
 */
export function formatHtmlSource(html: string): string {
  const lines: string[] = [];
  let depth = 0;
  let index = 0;
  let text = "";

  const flushText = (): void => {
    const value = text.trim();
    text = "";
    if (value) lines.push(`${"  ".repeat(depth)}${value}`);
  };

  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start === -1) {
      text += html.slice(index);
      break;
    }
    const end = html.indexOf(">", start);
    if (end === -1) {
      text += html.slice(index);
      break;
    }
    text += html.slice(index, start);
    const tag = html.slice(start, end + 1);
    const name = tag.match(/^<\/?\s*([a-z\d-]+)/i)?.[1]?.toLowerCase() ?? "";
    const closing = tag.startsWith("</");
    if (INLINE_TAGS.has(name) && !PRESERVED_TAGS.has(name)) {
      text += tag;
      index = end + 1;
      continue;
    }
    if (PRESERVED_TAGS.has(name) && !closing) {
      const closeIndex = html.toLowerCase().indexOf(`</${name}`, end + 1);
      const closeEnd = closeIndex === -1 ? -1 : html.indexOf(">", closeIndex);
      const block = html.slice(start, closeEnd === -1 ? html.length : closeEnd + 1);
      flushText();
      lines.push(`${"  ".repeat(depth)}${block}`);
      index = closeEnd === -1 ? html.length : closeEnd + 1;
      continue;
    }
    flushText();
    if (closing) depth = Math.max(0, depth - 1);
    lines.push(`${"  ".repeat(depth)}${tag}`);
    if (!closing && !VOID_TAGS.has(name) && !tag.endsWith("/>")) depth += 1;
    index = end + 1;
  }
  flushText();
  return lines.join("\n");
}

export interface HtmlDocumentOptions {
  title: string;
  body: string;
}

/** Wraps rendered Markdown in a standalone document that reads well on its own. */
export function createHtmlDocument({ title, body }: HtmlDocumentOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0 auto;
        max-width: 46rem;
        padding: 3rem 1.5rem 5rem;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 1.05rem;
        line-height: 1.7;
      }
      h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2.2em 0 0.6em; }
      h1 { margin-top: 0; }
      a { color: inherit; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
      pre { overflow-x: auto; padding: 1rem; border-radius: 8px; background: rgb(128 128 128 / 0.12); }
      blockquote { margin: 1.5em 0; padding-left: 1.1em; border-left: 3px solid currentColor; opacity: 0.85; }
      img { max-width: 100%; height: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 0.45em 0.7em; border: 1px solid rgb(128 128 128 / 0.35); }
      hr { border: 0; border-top: 1px solid rgb(128 128 128 / 0.35); }
    </style>
  </head>
  <body>
${body
  .split("\n")
  .map((line) => (line ? `    ${line}` : line))
  .join("\n")}
  </body>
</html>
`;
}

/** Turns a note title into a file name that every platform accepts. */
export function outputFileName(title: string, extension: string): string {
  const stem =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "note";
  return `${stem}.${extension}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
