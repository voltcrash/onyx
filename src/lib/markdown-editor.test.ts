import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { textChange } from "./markdown-editor.js";

describe("textChange", () => {
  it("does not dispatch a change for identical text", () => {
    expect(textChange("same", "same")).toBeUndefined();
  });

  it.each([
    ["", "# Note", { from: 0, to: 0, insert: "# Note" }],
    ["Note", "", { from: 0, to: 4, insert: "" }],
    ["note", "# note", { from: 0, to: 0, insert: "# " }],
    ["note", "notes", { from: 4, to: 4, insert: "s" }],
    ["one two three", "one new three", { from: 4, to: 7, insert: "new" }],
    ["one two three", "one three", { from: 5, to: 9, insert: "" }],
    ["# Note\n\nEnd", "# Note\nNew\nEnd", { from: 7, to: 7, insert: "New" }],
    ["😀 note", "😃 note", { from: 1, to: 2, insert: "\ude03" }],
  ])("updates %j to %j without replacing shared text", (before, after, expected) => {
    const change = textChange(before, after);
    expect(change).toEqual(expected);
    const state = EditorState.create({ doc: before });
    expect(state.update({ changes: change }).state.doc.toString()).toBe(after);
  });

  it("keeps a selection in unchanged text after a programmatic edit", () => {
    const state = EditorState.create({ doc: "title\nbody", selection: { anchor: 6, head: 10 } });
    const updated = state.update({
      changes: textChange(state.doc.toString(), "# title\nbody"),
    }).state;
    expect(updated.sliceDoc(updated.selection.main.from, updated.selection.main.to)).toBe("body");
  });
});
