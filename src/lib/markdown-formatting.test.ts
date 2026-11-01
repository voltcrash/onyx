import { expect, it } from "vite-plus/test";
import { toggleInlineSyntax } from "./markdown-utils.js";
it("toggles bold and italic independently while preserving selection", () => {
  let edit = { value: "Line three soft", start: 5, end: 10 };
  for (const marker of ["**", "_", "_", "**"])
    edit = toggleInlineSyntax(edit.value, edit.start, edit.end, marker);
  expect(edit).toEqual({ value: "Line three soft", start: 5, end: 10 });
});

it("removes outer formatting while retaining inner formatting", () => {
  let edit = { value: "three", start: 0, end: 5 };
  for (const marker of ["**", "_", "**"])
    edit = toggleInlineSyntax(edit.value, edit.start, edit.end, marker);
  expect(edit).toEqual({ value: "_three_", start: 1, end: 6 });
});
