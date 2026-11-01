import {
  renderMarkdownBlocks as renderLiteMarkdownBlocks,
  type RenderedBlock,
} from "#lib/markdown-lite.ts";
import {
  createMarkdownRenderWorker,
  type MarkdownRenderWorker,
} from "#lib/markdown-render-worker.ts";
import type { LocalAttachmentUrl } from "#lib/markdown-utils.ts";
import { untrack } from "svelte";

type MarkdownModule = typeof import("#lib/markdown.ts");

interface PreviewKey {
  source: string;
  attachments: LocalAttachmentUrl[];
  noteSourcePath: string | undefined;
}

interface WorkerPreview extends PreviewKey {
  blocks: RenderedBlock[];
}

export interface PreviewRendererHost {
  /** The settled Markdown the preview shows. */
  source(): string;
  attachments(): LocalAttachmentUrl[];
  noteSourcePath(): string | undefined;
  resolveAttachmentUrl: (destination: string) => string | undefined;
}

/**
 * Keeps the last full preview during edits while the worker prepares its replacement.
 * The lite renderer handles first paint; unavailable workers use the main-thread parser.
 */
export function createPreviewRenderer(host: PreviewRendererHost) {
  let markdownModule: MarkdownModule | undefined;
  let markdownModulePromise: Promise<MarkdownModule> | undefined;
  let revision = $state(0);
  // Undefined until first needed, and null once workers prove unavailable.
  let renderWorker: MarkdownRenderWorker | null | undefined;
  let workerPreview = $state.raw<WorkerPreview>();
  let pendingWorkerPreview: (PreviewKey & { done: Promise<void> }) | undefined;
  let renderSequence = 0;
  let displayedSequence = 0;

  const blocks = $derived.by(() => {
    const source = host.source();
    const preview = workerPreview;
    if (
      preview &&
      renderWorker !== null &&
      preview.noteSourcePath === host.noteSourcePath() &&
      preview.attachments === host.attachments()
    )
      return preview.blocks;
    void revision;
    return renderOnPage(source);
  });

  $effect(() => {
    const source = host.source();
    const attachments = host.attachments();
    const noteSourcePath = host.noteSourcePath();
    untrack(() => void render(source, { attachments, noteSourcePath }));
  });

  function loadMarkdownModule(): Promise<MarkdownModule> {
    return (markdownModulePromise ??= import("#lib/markdown.ts").then((module) => {
      markdownModule = module;
      revision += 1;
      return module;
    }));
  }

  // Only first paint uses lite output; edits retain full blocks until the worker answers.
  function renderOnPage(source: string): RenderedBlock[] {
    return (
      (renderWorker === null
        ? markdownModule?.renderMarkdownBlocks(source, host.resolveAttachmentUrl)
        : undefined) ?? renderLiteMarkdownBlocks(source, host.resolveAttachmentUrl)
    );
  }

  function worker(): MarkdownRenderWorker | undefined {
    if (renderWorker === undefined) renderWorker = createMarkdownRenderWorker() ?? null;
    if (renderWorker?.failed) renderWorker = null;
    return renderWorker ?? undefined;
  }

  function matches(
    preview: PreviewKey,
    source: string,
    attachments = host.attachments(),
    noteSourcePath = host.noteSourcePath(),
  ): boolean {
    return (
      preview.source === source &&
      preview.attachments === attachments &&
      preview.noteSourcePath === noteSourcePath
    );
  }

  /**
   * Renders a note in the worker so the main thread stays free while it parses. Resolves once
   * the result is ready to show, or once the main-thread renderer has loaded in its place.
   */
  async function render(
    source: string,
    context = { attachments: host.attachments(), noteSourcePath: host.noteSourcePath() },
  ): Promise<void> {
    const { attachments, noteSourcePath } = context;
    if (workerPreview && matches(workerPreview, source, attachments, noteSourcePath)) return;
    const pending = pendingWorkerPreview;
    if (pending && matches(pending, source, attachments, noteSourcePath)) return pending.done;
    const done = renderInWorker(source, attachments, noteSourcePath, ++renderSequence);
    const request = { source, attachments, noteSourcePath, done };
    pendingWorkerPreview = request;
    try {
      await done;
    } finally {
      if (pendingWorkerPreview === request) pendingWorkerPreview = undefined;
    }
  }

  async function renderInWorker(
    source: string,
    attachments: LocalAttachmentUrl[],
    noteSourcePath: string | undefined,
    sequence: number,
  ): Promise<void> {
    const current = worker();
    if (current) {
      try {
        const rendered = await current.render({ source, noteSourcePath, attachments });
        if (rendered && sequence > displayedSequence) {
          displayedSequence = sequence;
          workerPreview = { source, attachments, noteSourcePath, blocks: rendered };
        }
        return;
      } catch {
        renderWorker = null;
        workerPreview = undefined;
      }
    }
    await loadMarkdownModule().catch(() => undefined);
  }

  return {
    get blocks() {
      return blocks;
    },
    render,
    loadMarkdownModule,
    /** Starts loading the main-thread parser when there is no worker to render with. */
    ensureFullParser(): void {
      if (worker()) return;
      if (!markdownModule) void loadMarkdownModule().catch(() => undefined);
    },
    /** Re-renders on the main thread after attachment URLs change underneath it. */
    invalidate(): void {
      revision += 1;
    },
    dispose(): void {
      renderWorker?.dispose();
      renderWorker = null;
    },
  };
}
