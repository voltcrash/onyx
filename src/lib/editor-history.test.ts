import { describe, expect, it } from "vite-plus/test";
import { EditorHistory } from "./editor-history.js";

describe("EditorHistory", () => {
  it("undoes and redoes edits in order", () => {
    const history = new EditorHistory();
    history.record({ markdown: "a" });
    history.record({ markdown: "ab" });

    expect(history.undo({ markdown: "abc" })).toEqual({ markdown: "ab" });
    expect(history.undo({ markdown: "ab" })).toEqual({ markdown: "a" });
    expect(history.undo({ markdown: "a" })).toBeUndefined();
    expect(history.redo({ markdown: "a" })).toEqual({ markdown: "ab" });
    expect(history.redo({ markdown: "ab" })).toEqual({ markdown: "abc" });
    expect(history.redo({ markdown: "abc" })).toBeUndefined();
  });

  it("drops the redo stack after a new edit", () => {
    const history = new EditorHistory();
    history.record({ markdown: "a" });
    history.undo({ markdown: "ab" });
    history.record({ markdown: "a" });

    expect(history.redo({ markdown: "ax" })).toBeUndefined();
  });

  it("prefers the remembered selection for the text being edited", () => {
    const history = new EditorHistory();
    history.remember({ markdown: "a", selection: { start: 0, end: 1 } });
    history.record({ markdown: "a", selection: { start: 1, end: 1 } });

    expect(history.undo({ markdown: "b" })).toEqual({
      markdown: "a",
      selection: { start: 0, end: 1 },
    });
  });

  it("ignores a remembered entry for other text", () => {
    const history = new EditorHistory();
    history.remember({ markdown: "old", selection: { start: 0, end: 0 } });
    history.record({ markdown: "a" });

    expect(history.undo({ markdown: "b" })).toEqual({ markdown: "a" });
  });

  it("keeps the first capture for the same text", () => {
    const history = new EditorHistory();
    history.capture({ markdown: "a", selection: { start: 0, end: 0 } });
    history.capture({ markdown: "a", selection: { start: 1, end: 1 } });
    history.record({ markdown: "a" });

    expect(history.undo({ markdown: "b" })?.selection).toEqual({ start: 0, end: 0 });
  });

  it("forgets the oldest entries past its limit", () => {
    const history = new EditorHistory(2);
    for (const markdown of ["a", "b", "c"]) history.record({ markdown });

    expect(history.undo({ markdown: "d" })?.markdown).toBe("c");
    expect(history.undo({ markdown: "c" })?.markdown).toBe("b");
    expect(history.undo({ markdown: "b" })).toBeUndefined();
  });

  it("clears everything on reset", () => {
    const history = new EditorHistory();
    history.record({ markdown: "a" });
    history.reset();

    expect(history.undo({ markdown: "b" })).toBeUndefined();
  });
});
