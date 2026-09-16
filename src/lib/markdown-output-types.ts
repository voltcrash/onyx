import type { SourceLines } from "./markdown-lite.js";

/** A top-level block of a text output, with the Markdown lines it was written from. */
export interface TextBlock {
  text: string;
  lines?: SourceLines;
}

export const PLAIN_TEXT_SEPARATOR = "\n\n";
export const HTML_SOURCE_SEPARATOR = "\n";

export function joinTextBlocks(blocks: TextBlock[], separator: string): string {
  return blocks.map((block) => block.text).join(separator);
}
