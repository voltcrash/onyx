import { describe, expect, it } from "vite-plus/test";
import {
  clampContentWidth,
  clampSidebarWidth,
  clampSplitRatio,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  snapSidebarWidth,
} from "./layout.js";

describe("layout bounds", () => {
  it("keeps the sidebar within its limits", () => {
    expect(clampSidebarWidth(10)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(5_000)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it("snaps sidebar widths near the default", () => {
    expect(snapSidebarWidth(DEFAULT_SIDEBAR_WIDTH + 12)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(snapSidebarWidth(DEFAULT_SIDEBAR_WIDTH - 12)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(snapSidebarWidth(DEFAULT_SIDEBAR_WIDTH + 13)).toBe(DEFAULT_SIDEBAR_WIDTH + 13);
  });

  it("keeps both panes visible in a split", () => {
    expect(clampSplitRatio(5)).toBe(20);
    expect(clampSplitRatio(95)).toBe(80);
    expect(clampSplitRatio(42.5)).toBe(42.5);
  });

  it("rounds the content width to 20px steps within its limits", () => {
    expect(clampContentWidth(709)).toBe(700);
    expect(clampContentWidth(711)).toBe(720);
    expect(clampContentWidth(100)).toBe(480);
    expect(clampContentWidth(9_000)).toBe(1_200);
  });
});
