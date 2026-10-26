export const DEFAULT_SIDEBAR_WIDTH = 258;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 480;
const SIDEBAR_SNAP_DISTANCE = 12;

export const DEFAULT_CONTENT_WIDTH = 700;

export function clampSidebarWidth(value: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

/** Widths dragged close to the default settle on it. */
export function snapSidebarWidth(value: number): number {
  return Math.abs(value - DEFAULT_SIDEBAR_WIDTH) <= SIDEBAR_SNAP_DISTANCE
    ? DEFAULT_SIDEBAR_WIDTH
    : value;
}

/** The source pane's share of a split workspace, in percent. */
export function clampSplitRatio(value: number): number {
  return Math.min(80, Math.max(20, value));
}

/** The reading width in pixels, in 20px steps. */
export function clampContentWidth(value: number): number {
  return Math.min(1_200, Math.max(480, Math.round(value / 20) * 20));
}
