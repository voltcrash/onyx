import { describe, expect, it, vi } from "vite-plus/test";

import { memoryDirectory } from "../../../test/fixtures/filesystem.js";
import { MirroredVaultFilesystem, VaultFilesystem } from "./filesystem.js";
import { utf8ByteLength, Vault } from "./vault.js";

describe("Vault saves", () => {
  it("keeps a note in IndexedDB when OPFS is over quota", async () => {
    const putNote = vi.fn().mockResolvedValue(undefined);
    const database = { getNote: vi.fn().mockResolvedValue(undefined), putNote };
    const filesystem = {
      writeText: vi
        .fn()
        .mockRejectedValue(new DOMException("Storage quota exceeded", "QuotaExceededError")),
    };
    const vault = Reflect.construct(Vault, [database, filesystem]) as Vault;

    await expect(vault.saveNote({ title: "Draft", markdown: "kept text" })).resolves.toMatchObject({
      markdown: "kept text",
      revision: 1,
    });
    expect(putNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft" }),
      "kept text",
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
    );
  });
});

describe("utf8ByteLength", () => {
  it("matches the size of a Blob holding the same text", () => {
    for (const value of [
      "",
      "ascii",
      "café",
      "日本語",
      "😀 emoji",
      "lone \ud800 high",
      "lone \udc00 low",
    ]) {
      expect(utf8ByteLength(value)).toBe(new Blob([value]).size);
    }
  });
});

describe("Vault backlinks", () => {
  const note = (id: string, sourcePath: string, deletedAt?: string) => ({
    id,
    title: sourcePath.replace(/^.*\//, "").replace(/\.md$/, ""),
    path: `notes/${id}.md`,
    tags: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    revision: 1,
    size: 0,
    sourcePath,
    ...(deletedAt ? { deletedAt } : {}),
  });

  it("lists notes that link to a note by wiki link or relative link, excluding trash", async () => {
    const database = {
      getNotes: vi
        .fn()
        .mockResolvedValue([
          note("target", "garden/Tomatoes.md"),
          note("wiki", "Journal.md"),
          note("relative", "garden/Plan.md"),
          note("unrelated", "Other.md"),
          note("trashed", "Old.md", "2026-10-02T00:00:00.000Z"),
        ]),
      getNoteContents: vi.fn().mockResolvedValue([
        { noteId: "wiki", markdown: "Today [[Tomatoes]]." },
        { noteId: "relative", markdown: "[plants](Tomatoes.md)" },
        { noteId: "unrelated", markdown: "`[[Tomatoes]]`" },
        { noteId: "trashed", markdown: "[[Tomatoes]]" },
        { noteId: "target", markdown: "[[Tomatoes]]" },
      ]),
    };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
    const vault = Reflect.construct(Vault, [database, {}, coordination]) as Vault;

    const backlinks = await vault.listBacklinks("target");
    expect(backlinks.map(({ id }) => id)).toEqual(["wiki", "relative"]);
  });
});

describe("Trash lifecycle guards", () => {
  it("does not purge a restored note from a stale trash listing", async () => {
    const remove = vi.fn();
    const database = { getNote: vi.fn().mockResolvedValue({ id: "note", revision: 3 }) };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
    const vault = Reflect.construct(Vault, [database, { remove }, coordination]) as Vault;
    await expect(vault.purgeNote("note", "2026-01-01")).resolves.toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not purge a newer trash incarnation", async () => {
    const database = { getNote: vi.fn().mockResolvedValue({ id: "note", deletedAt: "new" }) };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
    const vault = Reflect.construct(Vault, [database, {}, coordination]) as Vault;
    await expect(vault.purgeNote("note", "old")).resolves.toBe(false);
    await expect(
      vault.addAttachment({
        noteId: "note",
        folder: "attachments",
        name: "a",
        contents: new Blob(),
      }),
    ).rejects.toThrow("Save the note");
  });
});

describe("Atomic folder mutations", () => {
  it("rolls files back when the folder metadata commit fails", async () => {
    const fileStorage = await VaultFilesystem.fromDirectory(memoryDirectory());
    await fileStorage.writeText("notes/n.md", "[image](../attachments/a.png)");
    const replaceVault = vi.fn().mockRejectedValue(new Error("commit rejected"));
    const database = {
      getNotes: async () => [
        {
          id: "n",
          title: "Note",
          sourcePath: "old/Note.md",
          path: "notes/n.md",
          revision: 1,
          tags: [],
          createdAt: "",
          updatedAt: "",
          size: 0,
        },
      ],
      getNoteMarkdown: async () => "[image](../attachments/a.png)",
      getAttachments: async () => [],
      getFileFolders: async () => [{ id: "f", path: "old", createdAt: "", updatedAt: "" }],
      getBackupOperations: async () => [],
      getVaultVersion: async () => 1,
      replaceVault,
    };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() };
    const vault = Reflect.construct(Vault, [
      database,
      new MirroredVaultFilesystem(fileStorage, vi.fn()),
      coordination,
    ]) as Vault;
    await expect(vault.moveFolder("old", "new", "attachments")).rejects.toThrow("commit rejected");
    expect(await fileStorage.readText("notes/n.md")).toBe("[image](../attachments/a.png)");
    expect(replaceVault.mock.calls[0][0][0].sourcePath).toBe("new/Note.md");
    expect(replaceVault.mock.calls[0][7].folders[0].path).toBe("new");
  });
});

describe("Backup baselines", () => {
  it("captures every active file even after its queue was acknowledged", async () => {
    const database = {
      getNotes: async () => [{ id: "n", path: "notes/n.md", title: "Note", revision: 1, tags: [] }],
      getAttachments: async () => [],
      getFileFolders: async () => [],
      getBackupOperations: async () => [],
      getNoteMarkdown: async () => "saved before changing targets",
      getGithubBackupState: async () => undefined,
    };
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() };
    const vault = Reflect.construct(Vault, [database, {}, coordination]) as Vault;
    const captured = await vault.captureGithubBackup();
    expect(captured.snapshot.operationIds).toEqual([]);
    expect(captured.snapshot.changes.map((change) => change.path)).toEqual(["notes/n.md"]);
    expect(await captured.snapshot.changes[0].contents!.text()).toBe(
      "saved before changing targets",
    );
    expect(captured.manifest.notes[0].id).toBe("n");
  });
});

describe("Restore identity", () => {
  it("rejects a changed local vault before replacing any files", async () => {
    const replace = vi.fn();
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
    const vault = Reflect.construct(Vault, [
      { getVaultVersion: async () => 2 },
      { replace },
      coordination,
    ]) as Vault;
    await expect(
      vault.restoreBackup([], {
        manifest: { version: 1, notes: [], attachments: [] },
        restoredAt: "now",
        expectedVersion: 1,
      }),
    ).rejects.toThrow("changed in another tab");
    expect(replace).not.toHaveBeenCalled();
  });
  it("restores an empty manifest and its folders in the same commit", async () => {
    const replaceVault = vi.fn();
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() };
    const vault = Reflect.construct(Vault, [
      { getVaultVersion: async () => 1, replaceVault },
      {
        replace: async (_files: unknown, commit: (generation: string) => Promise<void>) =>
          commit("restored"),
      },
      coordination,
    ]) as Vault;
    const folders = [{ id: "f", path: "empty", createdAt: "", updatedAt: "" }];
    await expect(
      vault.restoreBackup([], {
        manifest: { version: 1, notes: [], attachments: [], folders },
        restoredAt: "now",
        expectedVersion: 1,
      }),
    ).resolves.toEqual({ noteCount: 0, attachmentCount: 0 });
    expect(replaceVault.mock.calls[0][7]).toMatchObject({ folders, generation: "restored" });
  });
});

it("does not clear a vault that changed after confirmation", async () => {
  const replace = vi.fn();
  const coordination = { runExclusive: <T>(task: () => Promise<T>) => task() };
  const vault = Reflect.construct(Vault, [
    { getVaultVersion: async () => 2 },
    { replace },
    coordination,
  ]) as Vault;
  await expect(vault.clear(1)).rejects.toThrow("changed in another tab");
  expect(replace).not.toHaveBeenCalled();
});

describe("Native directory configuration changes", () => {
  it("stops mirroring after another tab disconnects the native folder", async () => {
    const native = memoryDirectory("external");
    Object.assign(native, {
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
    });
    vi.stubGlobal("showDirectoryPicker", async () => native);
    let stored: FileSystemDirectoryHandle | undefined;
    const database = {
      getNativeDirectoryHandle: async () => stored,
      getFileGeneration: async () => undefined,
      setNativeDirectoryHandle: async (handle: FileSystemDirectoryHandle) => {
        stored = handle;
      },
      getNote: async () => undefined,
      putNote: async () => undefined,
    };
    const fallback = await VaultFilesystem.fromDirectory(memoryDirectory());
    const filesystem = new MirroredVaultFilesystem(fallback, () => undefined);
    const coordination = { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() };
    const vault = Reflect.construct(Vault, [database, filesystem, coordination]) as Vault;
    try {
      await vault.connectNativeDirectory();
      await vault.saveNote({ id: "n", title: "N", markdown: "mirrored" });
      stored = undefined;
      await vault.saveNote({ id: "n", title: "N", markdown: "local only" });
      expect(await (await VaultFilesystem.fromDirectory(native)).readText("notes/n.md")).toBe(
        "mirrored",
      );
      expect(await fallback.readText("notes/n.md")).toBe("local only");
      expect(vault.getFileStorageStatus().mode).toBe("opfs");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Inbound links during moves", () => {
  const note = (id: string, sourcePath: string, markdown: string) => ({
    id,
    sourcePath,
    markdown,
    title: id,
    path: `notes/${id}.md`,
    tags: [],
    revision: 1,
    size: markdown.length,
    createdAt: "",
    updatedAt: "",
  });

  it("rewrites inbound Markdown and wiki links in the same file-tree update", async () => {
    const tree = {
      notes: [
        note("target", "Old.md", "[other](Other.md)"),
        note(
          "source",
          "Index.md",
          '[[Old#Heading|label]] [text](Old.md#heading) `[[Old]]`\n\n[Target][ref]\n\n[ref]: <Old.md#heading> "Title"',
        ),
      ],
      folders: [],
      attachments: [],
    };
    const vault = Reflect.construct(Vault, [{}, {}]) as Vault;
    const update = vi.spyOn(vault, "updateFileTree").mockImplementation(async (apply) => {
      apply(tree);
    });
    await vault.moveNote("target", "folder/New.md", "attachments");
    expect(update).toHaveBeenCalledTimes(1);
    expect(tree.notes[1]!.markdown).toBe(
      '[[New#Heading|label]] [text](folder/New.md#heading) `[[Old]]`\n\n[Target][ref]\n\n[ref]: <folder/New.md#heading> "Title"',
    );
    expect(tree.notes[0]!.markdown).toBe("[other](../Other.md)");
  });

  it("updates folder-qualified wiki links from outside a moved folder", async () => {
    const tree = {
      notes: [
        note("target", "old/Target.md", ""),
        note("source", "Index.md", "[[old/Target|label]] [text](old/Target.md)"),
      ],
      folders: [],
      attachments: [],
    };
    const vault = Reflect.construct(Vault, [{}, {}]) as Vault;
    vi.spyOn(vault, "updateFileTree").mockImplementation(async (apply) => {
      apply(tree);
    });
    await vault.moveFolder("old", "new", "attachments");
    expect(tree.notes[1]!.markdown).toBe("[[Target|label]] [text](new/Target.md)");
  });
});

describe("Linking unlinked mentions", () => {
  it("checks current prose offsets and writes a path-qualified wiki target", async () => {
    const metadata = { revision: 1, size: 0, tags: [], createdAt: "", updatedAt: "" };
    const tree = {
      notes: [
        {
          ...metadata,
          id: "target",
          title: "Garden",
          sourcePath: "plants/Garden.md",
          path: "notes/target.md",
          markdown: "",
        },
        {
          ...metadata,
          id: "source",
          title: "Journal",
          sourcePath: "Journal.md",
          path: "notes/source.md",
          markdown: "A Garden today.",
        },
      ],
      folders: [],
      attachments: [],
    };
    const vault = Reflect.construct(Vault, [{}, {}]) as Vault;
    vi.spyOn(vault, "updateFileTree").mockImplementation(async (update) => {
      update(tree);
    });
    await vault.linkMention("source", "target", 2, 8);
    expect(tree.notes[1]!.markdown).toBe("A [[plants/Garden|Garden]] today.");
    await expect(vault.linkMention("source", "target", 2, 8)).rejects.toThrow("changed");
  });
});

it("rewrites note links when moving a folder inside the pinned attachment folder", async () => {
  const metadata = { revision: 1, size: 0, tags: [], createdAt: "", updatedAt: "" };
  const tree = {
    notes: [
      {
        ...metadata,
        id: "target",
        title: "Target",
        path: "notes/target.md",
        sourcePath: "attachments/old/Target.md",
        markdown: "",
      },
      {
        ...metadata,
        id: "source",
        title: "Index",
        path: "notes/source.md",
        sourcePath: "Index.md",
        markdown: "[target](attachments/old/Target.md)",
      },
    ],
    folders: [],
    attachments: [],
  };
  const vault = Reflect.construct(Vault, [{}, {}]) as Vault;
  vi.spyOn(vault, "updateFileTree").mockImplementation(async (update) => {
    update(tree);
  });
  await vault.moveFolder("attachments/old", "new", "attachments", true);
  expect(tree.notes[1]!.markdown).toBe("[target](new/Target.md)");
});

it.each([false, true])(
  "preserves local trash and bytes during merge (ID collision: %s)",
  async (collision) => {
    const trash = {
      id: "trash",
      path: "notes/trash.md",
      title: "Trash",
      tags: [],
      revision: 2,
      size: 4,
      createdAt: "",
      updatedAt: "",
      deletedAt: "yesterday",
    };
    const attachment = {
      id: "image",
      noteId: "trash",
      path: "attachments/trash/image",
      name: "image.png",
      type: "image/png",
      size: 3,
      createdAt: "",
      updatedAt: "",
    };
    const filesystem = await VaultFilesystem.fromDirectory(memoryDirectory());
    await filesystem.writeText(trash.path, "kept");
    await filesystem.write(attachment.path, new Blob([new Uint8Array([0, 255, 42])]));
    const replaceVault = vi.fn();
    const vault = Reflect.construct(Vault, [
      {
        getNotes: async () => [trash],
        getAttachments: async () => [attachment],
        getNoteMarkdown: async () => "kept",
        getVaultVersion: async () => 1,
        replaceVault,
      },
      filesystem,
      { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() },
    ]) as Vault;
    await vault.restoreBackup(
      collision ? [{ path: trash.path, contents: new Blob(["remote"]) }] : [],
      {
        manifest: {
          version: 1,
          notes: collision ? [{ ...trash, deletedAt: undefined }] : [],
          attachments: [],
        },
        restoredAt: "now",
        preserveTrash: true,
      },
    );
    const notes = replaceVault.mock.calls[0][0];
    expect(notes.filter((note: { deletedAt?: string }) => note.deletedAt)).toEqual([trash]);
    if (collision) {
      const active = notes.find((note: { deletedAt?: string }) => !note.deletedAt);
      expect(active.id).not.toBe(trash.id);
      expect(await filesystem.readText(active.path)).toBe("remote");
    }
    expect(replaceVault.mock.calls[0][2]).toEqual([attachment]);
    expect(await filesystem.readText(trash.path)).toBe("kept");
    expect([
      ...new Uint8Array(await (await filesystem.read(attachment.path)).arrayBuffer()),
    ]).toEqual([0, 255, 42]);
  },
);

it("preserves the current encryption setting when completing an older backup", async () => {
  const encryption = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600_000,
    salt: "salt",
    keyCheck: "check",
  } as const;
  const captured = {
    owner: "onyx",
    repository: "vault",
    branch: "main",
    directory: "vault",
    githubAccountId: 1,
    githubAccountLogin: "onyx",
    updatedAt: "before",
  };
  const completeGithubBackup = vi.fn();
  const vault = Reflect.construct(Vault, [
    {
      getGithubBackupState: async () => ({ ...captured, encryption, autoBackup: true }),
      completeGithubBackup,
    },
    {},
    { runExclusive: <T>(task: () => Promise<T>) => task(), publish: vi.fn() },
  ]) as Vault;
  const completed = await vault.completeGithubBackup({ ...captured, lastCommitSha: "new" }, [
    "operation",
  ]);
  expect(completed.encryption).toEqual(encryption);
  expect(completeGithubBackup).toHaveBeenCalledWith(
    expect.objectContaining({ encryption, autoBackup: true, lastCommitSha: "new" }),
    ["operation"],
  );
});
