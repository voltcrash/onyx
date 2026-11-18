import { describe, expect, it } from "vite-plus/test";
import { compareBackupNotes, mergeBackupFiles, type MergeVault } from "./backup-merge.ts";

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

it("reserves remote filenames before naming conflict siblings", async () => {
  const remote = vault({ a: "remote", existing: "already a conflict" });
  remote.manifest.notes[1]!.sourcePath = "a (conflict 2026-11-17).md";
  const merged = await mergeBackupFiles(
    vault({ a: "base" }),
    vault({ a: "local" }),
    remote,
    "2026-11-17",
  );
  const paths = merged.manifest.notes.map((note) => note.sourcePath!.toLowerCase());
  expect(new Set(paths).size).toBe(3);
  expect(paths).toContain("a (conflict 2026-11-17) 2.md");
});

it("retains remote title-only edits", async () => {
  const remote = vault({ a: "unchanged" });
  remote.manifest.notes[0]!.title = "Renamed title";
  const merged = await mergeBackupFiles(
    vault({ a: "unchanged" }),
    vault({ a: "unchanged" }),
    remote,
  );
  expect(merged.manifest.notes[0]!.title).toBe("Renamed title");
});

it("retains attachment metadata edits even when the bytes are unchanged", async () => {
  const base = vault({ a: "note" });
  base.manifest.attachments.push({
    id: "image",
    noteId: "a",
    name: "image.png",
    path: "attachments/a/image",
    type: "application/octet-stream",
    size: 3,
    createdAt: "",
    updatedAt: "",
  });
  base.files.push({ path: "attachments/a/image", contents: new Blob(["png"]) });
  const local = structuredClone(base);
  const remote = structuredClone(base);
  remote.manifest.attachments[0]!.name = "renamed.png";
  remote.manifest.attachments[0]!.type = "image/png";
  const merged = await mergeBackupFiles(base, local, remote);
  expect(merged.manifest.attachments).toMatchObject([{ name: "renamed.png", type: "image/png" }]);
});

it("merges folder edits and deletions against their baseline", async () => {
  const base = vault({});
  base.manifest.folders = ["deleted", "edited", "renamed"].map((path) => ({
    id: path,
    path,
    createdAt: "",
    updatedAt: "",
  }));
  const local = structuredClone(base);
  const remote = structuredClone(base);
  remote.manifest.folders = remote.manifest.folders!.filter((folder) => folder.path !== "deleted");
  remote.manifest.folders[0]!.pinned = true;
  remote.manifest.folders[1]!.path = "new name";
  for (const [left, right] of [
    [local, remote],
    [remote, local],
  ]) {
    const merged = await mergeBackupFiles(base, left!, right!);
    expect(merged.manifest.folders!.map((folder) => folder.path).sort()).toEqual([
      "edited",
      "new name",
    ]);
    expect(merged.manifest.folders!.find((folder) => folder.path === "edited")!.pinned).toBe(true);
  }
});

it("summarizes only differing notes and compares both sides of conflicts", async () => {
  const base = vault({ edited: "before", removed: "before", same: "before" });
  const local = vault({ edited: "left", same: "after", new: "" });
  const remote = vault({ edited: "right", removed: "after", same: "after" });
  expect(await compareBackupNotes(base, local, remote)).toMatchObject([
    {
      path: "edited.md",
      localChange: "Edited",
      remoteChange: "Edited",
      versions: [{ markdown: "left" }, { markdown: "right" }],
    },
    {
      path: "removed.md",
      localChange: "Deleted",
      remoteChange: "Edited",
      versions: [{ note: undefined }, { markdown: "after" }],
    },
    { path: "new.md", localChange: "Added", remoteChange: "Absent", versions: undefined },
  ]);
});
