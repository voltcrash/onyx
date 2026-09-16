import { describe, expect, it } from "vite-plus/test";
import { findTextMatches, highlightFindMatches } from "./find-replace.js";

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
});

describe("highlightFindMatches", () => {
  it("escapes source text while marking the active match", () => {
    expect(highlightFindMatches("<note> note", [{ start: 7, end: 11 }], 0)).toBe(
      '&lt;note&gt; <mark class="find-match find-match-current">note</mark>',
    );
  });
});
