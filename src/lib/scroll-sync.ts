import type { SourceLines } from "./markdown.js";
import type { TextBlock } from "./markdown-output.js";

/** A point where a pane's content offset is known to show a given Markdown line. */
export interface ScrollAnchor {
  line: number;
  top: number;
}

export interface ScrollMetrics {
  anchors: ScrollAnchor[];
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Brackets anchors with the start and end of the content, dropping any that would make the
 * mapping run backwards, such as a block that renders above the one written before it.
 */
export function scrollAnchors(
  points: ScrollAnchor[],
  lineCount: number,
  contentHeight: number,
): ScrollAnchor[] {
  const anchors: ScrollAnchor[] = [{ line: 0, top: 0 }];
  const sorted = points
    .filter((point) => Number.isFinite(point.line) && Number.isFinite(point.top))
    .sort((a, b) => a.line - b.line || a.top - b.top);
  for (const point of sorted) {
    const last = anchors.at(-1)!;
    if (
      point.line >= last.line &&
      point.top >= last.top &&
      point.line <= lineCount &&
      point.top <= contentHeight
    ) {
      anchors.push(point);
    }
  }
  anchors.push({
    line: Math.max(lineCount, anchors.at(-1)!.line),
    top: Math.max(contentHeight, anchors.at(-1)!.top),
  });
  return anchors;
}

/** Reads one side of the anchors at a value of the other, interpolating between neighbours. */
export function interpolateAnchor(
  anchors: ScrollAnchor[],
  from: keyof ScrollAnchor,
  value: number,
): number {
  const to: keyof ScrollAnchor = from === "line" ? "top" : "line";
  const next = firstAnchorAtOrAfter(anchors, from, value);
  if (next === anchors.length) return anchors.at(-1)?.[to] ?? 0;
  const after = anchors[next]!;
  if (next === 0 || after[from] === value) return after[to];
  const before = anchors[next - 1]!;
  const progress = (value - before[from]) / (after[from] - before[from]);
  return before[to] + progress * (after[to] - before[to]);
}

// Anchors ascend on both sides, so the first one at or past a value can be found by halving.
function firstAnchorAtOrAfter(
  anchors: ScrollAnchor[],
  key: keyof ScrollAnchor,
  value: number,
): number {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (anchors[middle]![key] >= value) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * Where the target pane should scroll to show what the source pane shows. The line read slides
 * from the top edge of the viewport to its bottom edge as the pane scrolls, so both panes reach
 * their start and their end together however differently their content is laid out.
 */
export function syncedScrollTop(
  source: ScrollMetrics,
  target: Omit<ScrollMetrics, "scrollTop">,
): number {
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (targetRange <= 0) return 0;
  if (sourceRange <= 0 || source.scrollTop <= 0) return 0;
  // Scroll offsets can be fractional even when the reported dimensions are rounded.
  if (sourceRange - source.scrollTop <= 1) return targetRange;
  const reference = (source.scrollTop * source.scrollHeight) / sourceRange;
  const line = interpolateAnchor(source.anchors, "top", reference);
  const targetReference = interpolateAnchor(target.anchors, "line", line);
  return Math.min(Math.max((targetReference * targetRange) / target.scrollHeight, 0), targetRange);
}

/** Where the scroller's content starts, in viewport coordinates. */
function contentOrigin(scroller: Element): number {
  return scroller.getBoundingClientRect().top - scroller.scrollTop;
}

/** Anchors for elements laid out inside the scroller, each at the lines it was written on. */
export function elementAnchors(
  scroller: Element,
  elements: Array<[Element, SourceLines | undefined]>,
): ScrollAnchor[] {
  const origin = contentOrigin(scroller);
  return elements.flatMap(([element, lines]) => {
    if (!lines) return [];
    const rect = element.getBoundingClientRect();
    // Zero-height overlay lines (blank lines, hidden fences) occupy no rendered
    // space, so they must not bend the scroll mapping.
    if (!rect.height) return [];
    return [
      { line: lines.start, top: rect.top - origin },
      { line: lines.end, top: rect.bottom - origin },
    ];
  });
}

/** Anchors for text blocks joined by `separator` into the text content of the scroller. */
export function textAnchors(
  scroller: Element,
  blocks: TextBlock[],
  separator: string,
): ScrollAnchor[] {
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
  let textOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.length) continue;
    textNodes.push({ node, start: textOffset, end: textOffset + node.length });
    textOffset += node.length;
  }
  if (!textNodes.length) return [];
  const range = document.createRange();
  const rectAt = (offset: number, last: boolean): DOMRect | undefined => {
    const text = textNodes.find((candidate) => offset >= candidate.start && offset < candidate.end);
    if (!text) return undefined;
    const nodeOffset = offset - text.start;
    range.setStart(text.node, nodeOffset);
    range.setEnd(text.node, nodeOffset + 1);
    const rects = range.getClientRects();
    return last ? rects[rects.length - 1] : rects[0];
  };
  const origin = contentOrigin(scroller);
  const anchors: ScrollAnchor[] = [];
  let offset = 0;
  for (const block of blocks) {
    if (block.lines) {
      const start = rectAt(offset, false);
      const end = rectAt(offset + block.text.length - 1, true);
      if (start) anchors.push({ line: block.lines.start, top: start.top - origin });
      if (end) anchors.push({ line: block.lines.end, top: end.bottom - origin });
    }
    offset += block.text.length + separator.length;
  }
  return anchors;
}
