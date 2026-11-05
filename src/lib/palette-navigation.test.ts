import { expect, it } from "vite-plus/test";
import { nextEnabledIndex } from "./palette-navigation.js";
it("skips disabled commands linearly after a page-sized jump", () => {
  const items = [
    {},
    { disabled: true },
    { disabled: true },
    { disabled: true },
    {},
    { disabled: true },
  ];
  expect(nextEnabledIndex(items, 0, 3)).toBe(4);
  expect(nextEnabledIndex(items, 4, -3)).toBe(0);
  expect(nextEnabledIndex([{ disabled: true }], 0, 1)).toBe(-1);
});
