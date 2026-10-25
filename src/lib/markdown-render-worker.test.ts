import { describe, expect, it } from "vite-plus/test";
import {
  MarkdownRenderWorker,
  type MarkdownRenderRequest,
  type MarkdownRenderResponse,
  type MarkdownWorkerPort,
} from "./markdown-render-worker.js";

class FakePort implements MarkdownWorkerPort {
  readonly requests: MarkdownRenderRequest[] = [];
  terminated = false;
  #listeners = new Map<string, Array<(event: never) => void>>();

  postMessage(message: MarkdownRenderRequest): void {
    this.requests.push(message);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: MarkdownRenderResponse): void {
    for (const listener of this.#listeners.get("message") ?? []) {
      listener({ data: response } as never);
    }
  }

  crash(): void {
    for (const listener of this.#listeners.get("error") ?? [])
      listener(new Event("error") as never);
  }
}

const job = (source: string) => ({ source, attachments: [] });
const block = (html: string) => ({ html, element: true });

describe("MarkdownRenderWorker", () => {
  it("keeps only the newest waiting render while one is running", async () => {
    const port = new FakePort();
    const worker = new MarkdownRenderWorker(port);
    const first = worker.render(job("a"));
    const superseded = worker.render(job("b"));
    const latest = worker.render(job("c"));

    expect(port.requests.map((request) => request.source)).toEqual(["a"]);
    await expect(superseded).resolves.toBeUndefined();

    port.reply({ id: port.requests[0]!.id, blocks: [block("<p>a</p>")] });
    await expect(first).resolves.toEqual([block("<p>a</p>")]);
    expect(port.requests.map((request) => request.source)).toEqual(["a", "c"]);

    port.reply({ id: port.requests[1]!.id, blocks: [block("<p>c</p>")] });
    await expect(latest).resolves.toEqual([block("<p>c</p>")]);
  });

  it("rejects pending and later renders once the worker fails", async () => {
    const port = new FakePort();
    const worker = new MarkdownRenderWorker(port);
    const running = worker.render(job("a"));
    const waiting = worker.render(job("b"));
    port.crash();

    await expect(running).rejects.toThrow("failed");
    await expect(waiting).rejects.toThrow("failed");
    await expect(worker.render(job("c"))).rejects.toThrow("failed");
    expect(worker.failed).toBe(true);
  });

  it("rejects a render the worker reports as failed and moves on", async () => {
    const port = new FakePort();
    const worker = new MarkdownRenderWorker(port);
    const broken = worker.render(job("a"));
    const next = worker.render(job("b"));
    port.reply({ id: port.requests[0]!.id, error: "boom" });

    await expect(broken).rejects.toThrow("boom");
    port.reply({ id: port.requests[1]!.id, blocks: [] });
    await expect(next).resolves.toEqual([]);
  });
});
