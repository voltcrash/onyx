import { describe, expect, it } from "vite-plus/test";
import { mergeBackupFiles, type MergeVault } from "./backup-merge.ts";

function vault(values: Record<string, string>): MergeVault {
  return {
    manifest: {
      version: 1,
      notes: Object.keys(values).map((id) => ({
        id,
        title: id,
        path: `notes/${id}.md`,
        sourcePath: `${id}.md`,
        revision: 1,
        size: 0,
        tags: [],
        createdAt: "",
        updatedAt: "",
      })),
      attachments: [],
    },
    files: Object.entries(values).map(([id, text]) => ({
      path: `notes/${id}.md`,
      contents: new Blob([text]),
    })),
  };
}

describe("three-way backup merge", () => {
  it("combines independent edits and additions", async () => {
    const merged = await mergeBackupFiles(
      vault({ a: "a", b: "b" }),
      vault({ a: "local", b: "b", c: "new" }),
      vault({ a: "a", b: "remote", d: "other" }),
    );
    expect(
      Object.fromEntries(
        await Promise.all(
          merged.files.map(async (file) => [file.path, await file.contents.text()]),
        ),
      ),
    ).toEqual({
      "notes/a.md": "local",
      "notes/b.md": "remote",
      "notes/c.md": "new",
      "notes/d.md": "other",
    });
  });
  it("keeps local conflicts and a dated remote sibling without overwriting another note", async () => {
    const local = vault({ a: "local", occupied: "occupied" });
    local.manifest.notes[1]!.sourcePath = "a (conflict 2026-11-14).md";
    const merged = await mergeBackupFiles(
      vault({ a: "base" }),
      local,
      vault({ a: "remote" }),
      "2026-11-14",
    );
    expect(merged.manifest.notes.map((note) => note.sourcePath)).toContain(
      "a (conflict 2026-11-14) 2.md",
    );
    expect(await merged.files.find((file) => file.path === "notes/a.md")!.contents.text()).toBe(
      "local",
    );
    expect(await Promise.all(merged.files.map((file) => file.contents.text()))).toContain("remote");
  });
  it("keeps edits against deletions and accepts deletions against unchanged files", async () => {
    const merged = await mergeBackupFiles(
      vault({ a: "base", b: "base", c: "base" }),
      vault({ b: "base", c: "local" }),
      vault({ a: "remote", c: "base" }),
    );
    expect(merged.manifest.notes.map((note) => note.id).sort()).toEqual(["a", "c"]);
  });
});

it("keeps an edited attachment and its owner when the other device deletes the note", async () => {
  const base = vault({ a: "note" });
  const attachment = {
    id: "image",
    noteId: "a",
    name: "image.png",
    path: "attachments/a/image",
    sourcePath: "attachments/image.png",
    type: "image/png",
    size: 3,
    createdAt: "",
    updatedAt: "",
  };
  base.manifest.attachments.push(attachment);
  base.files.push({ path: attachment.path, contents: new Blob(["old"]) });
  const remote = vault({ a: "note" });
  remote.manifest.attachments.push(attachment);
  remote.files.push({ path: attachment.path, contents: new Blob(["edited"]) });
  const merged = await mergeBackupFiles(base, vault({}), remote);
  expect(merged.manifest.notes.map((note) => note.id)).toEqual(["a"]);
  expect(merged.manifest.attachments.map((file) => file.id)).toEqual(["image"]);
  expect(await merged.files.find((file) => file.path === attachment.path)!.contents.text()).toBe(
    "edited",
  );
});
