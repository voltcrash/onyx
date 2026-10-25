import type { RenderedBlock } from "./markdown-lite.js";
import type { LocalAttachmentUrl } from "./markdown-utils.js";

export interface MarkdownRenderJob {
  source: string;
  noteSourcePath?: string;
  attachments: LocalAttachmentUrl[];
}

export interface MarkdownRenderRequest extends MarkdownRenderJob {
  id: number;
}

export type MarkdownRenderResponse =
  | { id: number; blocks: RenderedBlock[]; error?: undefined }
  | { id: number; error: string; blocks?: undefined };

/** The part of a Worker the renderer uses, so tests can stand in for one. */
export interface MarkdownWorkerPort {
  postMessage(message: MarkdownRenderRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  terminate(): void;
}

interface PendingRender {
  job: MarkdownRenderJob;
  resolve: (blocks: RenderedBlock[] | undefined) => void;
  reject: (error: Error) => void;
}

/**
 * Renders notes off the main thread. One render runs at a time and only the newest waiting
 * request is kept, so a burst of edits never queues up stale work; superseded requests
 * resolve to `undefined`.
 */
export class MarkdownRenderWorker {
  readonly #port: MarkdownWorkerPort;
  #nextId = 0;
  #active?: PendingRender & { id: number };
  #queued?: PendingRender;
  #failure?: Error;

  constructor(port: MarkdownWorkerPort) {
    this.#port = port;
    port.addEventListener("message", (event: MessageEvent) =>
      this.#receive(event.data as MarkdownRenderResponse),
    );
    port.addEventListener("error", () => this.#fail(new Error("The Markdown worker failed")));
  }

  get failed(): boolean {
    return this.#failure !== undefined;
  }

  render(job: MarkdownRenderJob): Promise<RenderedBlock[] | undefined> {
    return new Promise((resolve, reject) => {
      if (this.#failure) {
        reject(this.#failure);
        return;
      }
      if (!this.#active) {
        this.#start({ job, resolve, reject });
        return;
      }
      this.#queued?.resolve(undefined);
      this.#queued = { job, resolve, reject };
    });
  }

  dispose(): void {
    this.#port.terminate();
    this.#fail(new Error("The Markdown worker was stopped"));
  }

  #start(pending: PendingRender): void {
    const id = ++this.#nextId;
    this.#active = { ...pending, id };
    try {
      this.#port.postMessage({ id, ...pending.job });
    } catch (error) {
      this.#fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #receive(response: MarkdownRenderResponse): void {
    const active = this.#active;
    if (!active || response.id !== active.id) return;
    this.#active = undefined;
    if (response.error !== undefined) active.reject(new Error(response.error));
    else active.resolve(response.blocks);
    const queued = this.#queued;
    this.#queued = undefined;
    if (queued) this.#start(queued);
  }

  #fail(error: Error): void {
    this.#failure ??= error;
    const pending = [this.#active, this.#queued];
    this.#active = undefined;
    this.#queued = undefined;
    for (const render of pending) render?.reject(error);
  }
}

export function createMarkdownRenderWorker(): MarkdownRenderWorker | undefined {
  if (typeof Worker === "undefined") return undefined;
  try {
    return new MarkdownRenderWorker(
      new Worker(new URL("./markdown.worker.ts", import.meta.url), { type: "module" }),
    );
  } catch {
    return undefined;
  }
}
