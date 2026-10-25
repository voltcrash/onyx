import { renderMarkdownBlocks } from "./markdown.js";
import { resolveLocalAttachmentUrl } from "./markdown-utils.js";
import type { MarkdownRenderRequest, MarkdownRenderResponse } from "./markdown-render-worker.js";

const scope = globalThis as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  postMessage(message: MarkdownRenderResponse): void;
};

scope.addEventListener("message", (event: MessageEvent<MarkdownRenderRequest>) => {
  const { id, source, noteSourcePath, attachments } = event.data;
  try {
    const blocks = renderMarkdownBlocks(source, (destination) =>
      resolveLocalAttachmentUrl(destination, noteSourcePath, attachments),
    );
    scope.postMessage({ id, blocks });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
