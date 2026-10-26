import type { NoteFormat } from "./components/note-formats.js";
import { outputFileName } from "./output-utils.js";

type MarkdownModule = typeof import("./markdown.js");
type MarkdownOutputModule = typeof import("./markdown-output.js");

export type CopyableNoteFormat = Exclude<NoteFormat, "pdf">;

export interface NoteSource {
  markdown: string;
  title: string;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Copies and downloads notes in every format but PDF, which comes from the print dialog. The
 * output and Markdown renderers load on first use.
 */
export function createNoteOutput(loadMarkdownModule: () => Promise<MarkdownModule>) {
  let outputModulePromise: Promise<MarkdownOutputModule> | undefined;

  function loadOutputModule(): Promise<MarkdownOutputModule> {
    return (outputModulePromise ??= import("./markdown-output.js").then((module) => {
      void loadMarkdownModule().catch(() => undefined);
      return module;
    }));
  }

  // Exports keep the note's own attachment paths, because in-app blob URLs die with the tab.
  async function exportedHtml(source: string): Promise<string> {
    const markdownModule = await loadMarkdownModule();
    return markdownModule.renderMarkdown(source, undefined, { remoteImages: "allow" });
  }

  async function withRenderers(source: NoteSource) {
    return Promise.all([exportedHtml(source.markdown), loadOutputModule()]);
  }

  const copiers: Record<CopyableNoteFormat, (source: NoteSource) => Promise<void>> = {
    markdown: (source) => navigator.clipboard.writeText(source.markdown),
    text: async (source) => {
      const output = await loadOutputModule();
      await navigator.clipboard.writeText(output.markdownToPlainText(source.markdown));
    },
    "rich-text": async (source) => {
      const [html, output] = await withRenderers(source);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([output.markdownToPlainText(source.markdown)], {
            type: "text/plain",
          }),
        }),
      ]);
    },
    html: async (source) => {
      const [html, output] = await withRenderers(source);
      await navigator.clipboard.writeText(output.formatHtmlSource(html));
    },
  };

  const downloaders: Record<CopyableNoteFormat, (source: NoteSource) => void | Promise<void>> = {
    markdown: (source) => {
      downloadBlob(
        new Blob([source.markdown.endsWith("\n") ? source.markdown : `${source.markdown}\n`], {
          type: "text/markdown",
        }),
        outputFileName(source.title, "md"),
      );
    },
    text: async (source) => {
      const output = await loadOutputModule();
      downloadBlob(
        new Blob([`${output.markdownToPlainText(source.markdown)}\n`], { type: "text/plain" }),
        outputFileName(source.title, "txt"),
      );
    },
    "rich-text": async (source) => {
      const output = await loadOutputModule();
      downloadBlob(
        new Blob([output.markdownToRtf(source.markdown)], { type: "application/rtf" }),
        outputFileName(source.title, "rtf"),
      );
    },
    html: async (source) => {
      const [body, output] = await withRenderers(source);
      const html = output.createHtmlDocument({
        title: source.title,
        body: output.formatHtmlSource(body),
      });
      downloadBlob(new Blob([html], { type: "text/html" }), outputFileName(source.title, "html"));
    },
  };

  return {
    copy: (source: NoteSource, format: CopyableNoteFormat) => copiers[format](source),
    download: (source: NoteSource, format: CopyableNoteFormat) => downloaders[format](source),
  };
}
