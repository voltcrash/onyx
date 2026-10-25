import { describe, expect, it } from "vite-plus/test";

import {
  createSearchPostings,
  diffSearchPostings,
  type SearchDocument,
  type SearchPosting,
} from "./database.js";

describe("createSearchPostings", () => {
  it("indexes Unicode terms and tracks field weights", () => {
    const document: SearchDocument = {
      noteId: "note-1",
      title: "project aurora",
      body: "aurora research नमस्ते aurora",
      tags: ["research"],
      updatedAt: "2026-09-05T00:00:00.000Z",
    };

    expect(createSearchPostings(document)).toEqual(
      expect.arrayContaining([
        {
          term: "aurora",
          noteId: "note-1",
          titleMatches: 1,
          bodyMatches: 2,
          tagMatches: 0,
        },
        {
          term: "research",
          noteId: "note-1",
          titleMatches: 0,
          bodyMatches: 1,
          tagMatches: 1,
        },
        {
          term: "नमस्ते",
          noteId: "note-1",
          titleMatches: 0,
          bodyMatches: 1,
          tagMatches: 0,
        },
      ]),
    );
  });
});

describe("diffSearchPostings", () => {
  const posting = (term: string, bodyMatches: number): SearchPosting => ({
    term,
    noteId: "note-1",
    titleMatches: 0,
    bodyMatches,
    tagMatches: 0,
  });

  it("writes only new or changed terms and removes vanished ones", () => {
    expect(
      diffSearchPostings(
        [posting("kept", 1), posting("changed", 1), posting("gone", 2)],
        [posting("kept", 1), posting("changed", 2), posting("added", 1)],
      ),
    ).toEqual({ removed: ["gone"], written: [posting("changed", 2), posting("added", 1)] });
  });
});
