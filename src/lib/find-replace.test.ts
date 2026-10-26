import { describe, expect, it } from "vite-plus/test";
import { findTextMatches } from "./find-replace.js";

describe("findTextMatches", () => {
  it("finds case-insensitive, non-overlapping matches", () => {
    expect(
      findTextMatches("Onyx onyx ONYX", "onyx", { matchCase: false, wholeWord: false }),
    ).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ]);
  });

  it("limits whole-word searches to word boundaries", () => {
    expect(
      findTextMatches("note notes note-taking", "note", { matchCase: true, wholeWord: true }),
    ).toEqual([
      { start: 0, end: 4 },
      { start: 11, end: 15 },
    ]);
  });

  it("treats astral letters beside a match as part of the word", () => {
    expect(
      findTextMatches("𝐀note note𝐀 😀note", "note", { matchCase: true, wholeWord: true }),
    ).toEqual([{ start: 16, end: 20 }]);
  });
});
