import { describe, expect, it, vi } from "vite-plus/test";

import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";

import type { Vault } from "./storage/vault.js";
import {
  createMarkdownExport,
  createMarkdownZip,
  importMarkdownFiles,
  readMarkdownFolder,
  readMarkdownZip,
  writeMarkdownFolder,
} from "./markdown-transfer.js";

describe("Markdown archives", () => {
  it("rejects malformed ZIP archives", async () => {
    const malformed = new Blob(["this is not a zip archive"], { type: "application/zip" });

    await expect(readMarkdownZip(malformed)).rejects.toBeInstanceOf(Error);
  });

  it("strips a ZIP wrapper directory even when macOS metadata sits beside it", async () => {
    const contents = new Blob(["test"]);
    const archive = await createMarkdownZip([
      { path: "Export/Plan.md", contents },
      { path: "Export/assets/map.png", contents },
      { path: "__MACOSX/Export/._Plan.md", contents },
    ]);
    expect((await readMarkdownZip(archive)).map(({ path }) => path)).toEqual([
      "Plan.md",
      "assets/map.png",
    ]);
  });

  it("stops before writing when an export would overwrite a file", async () => {
    const existingFile = {} as FileSystemFileHandle;
    const root = {
      getDirectoryHandle: async () => {
        throw new DOMException("Missing", "NotFoundError");
      },
      getFileHandle: async (name: string) => {
        if (name === "existing.md") return existingFile;
        throw new DOMException("Missing", "NotFoundError");
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(
      writeMarkdownFolder(root, [
        { contents: new Blob(["existing"]), path: "existing.md" },
        { contents: new Blob(["new"]), path: "new.md" },
      ]),
    ).rejects.toThrow("existing files would be overwritten: existing.md");
  });

  it("enforces ZIP archive and expanded-content limits", async () => {
    const archive = await createTestZip("note.md", "large note");

    await expect(readMarkdownZip(archive, { maxArchiveBytes: archive.size - 1 })).rejects.toThrow(
      "ZIP archive exceeds",
    );
    await expect(readMarkdownZip(archive, { maxUncompressedBytes: 1 })).rejects.toThrow(
      "ZIP entry note.md exceeds",
    );
    await expect(
      createMarkdownZip([{ contents: new Blob(["note"]), path: "note.md" }], {
        maxArchiveBytes: 1,
      }),
    ).rejects.toThrow("ZIP archive exceeds");
  });

  it("rejects unsafe transfer paths", async () => {
    expect(() =>
      readMarkdownFolder([
        {
          name: "escape.md",
          webkitRelativePath: "../escape.md",
        } as File,
      ]),
    ).toThrow("Unsafe transfer path");
    expect(() =>
      readMarkdownFolder([
        {
          name: "escape.md",
          webkitRelativePath: "folder\\escape.md",
        } as File,
      ]),
    ).toThrow("Unsafe transfer path");
    await expect(readMarkdownZip(await createTestZip("../escape.md"))).rejects.toThrow(
      "Unsafe transfer path",
    );
    await expect(
      createMarkdownZip([{ contents: new Blob(["escape"]), path: "/escape.md" }]),
    ).rejects.toThrow("Unsafe transfer path");
  });

  it.each([
    [["Notes/Plan.md", "notes/plan.MD"], "Duplicate"],
    [["Notes", "notes/Plan.md"], "Conflicting"],
    [["notes/Plan.md", "Notes"], "Conflicting"],
  ])("rejects collisions between %j", async (paths, error) => {
    await expect(
      createMarkdownZip(paths.map((path) => ({ path, contents: new Blob() }))),
    ).rejects.toThrow(`${error} transfer path`);
  });

  it("rewrites local links when an export path is collision-suffixed", async () => {
    const vault = {
      captureExport: async () => ({
        notes: [
          {
            id: "collision",
            title: "Collision",
            sourcePath: "notes/assets/map.png",
            markdown: "collision",
          },
          {
            id: "plan",
            title: "Plan",
            sourcePath: "notes/plan.md",
            markdown:
              "![Map](assets/map.png#crop) [Map](assets/map.png?download=1) ![[assets/map.png|Map]]",
          },
        ],
        attachments: [
          {
            metadata: { name: "map.png", sourcePath: "notes/assets/map.png" },
            file: new Blob(["map"]),
          },
        ],
      }),
    } as unknown as Vault;

    const files = await createMarkdownExport(vault);
    const plan = files.find((file) => file.path === "notes/plan.md");

    expect(plan).toBeDefined();
    await expect(plan?.contents.text()).resolves.toBe(
      "![Map](assets/map-2.png#crop) [Map](assets/map-2.png?download=1) ![[assets/map-2.png|Map]]",
    );
  });

  it("rolls back files and directories after a partial folder export", async () => {
    const rootNode: MemoryDirectory = { kind: "directory", entries: new Map() };
    const root = createMemoryDirectoryHandle(rootNode, new Set(["second.md"]));

    await expect(
      writeMarkdownFolder(root, [
        { contents: new Blob(["first"]), path: "nested/first.md" },
        { contents: new Blob(["second"]), path: "nested/second.md" },
      ]),
    ).rejects.toThrow("disk full");
    expect(rootNode.entries.size).toBe(0);
  });

  it("preserves unrelated files added to an export directory during rollback", async () => {
    const rootNode: MemoryDirectory = { kind: "directory", entries: new Map() };
    const root = createMemoryDirectoryHandle(rootNode, new Set(), (name) => {
      if (name !== "second.md") return;
      const directory = rootNode.entries.get("nested") as MemoryDirectory;
      directory.entries.set("unrelated.txt", { kind: "file" });
      throw new Error("disk full");
    });

    await expect(
      writeMarkdownFolder(root, [
        { contents: new Blob(["first"]), path: "nested/first.md" },
        { contents: new Blob(["second"]), path: "nested/second.md" },
      ]),
    ).rejects.toThrow();
    const directory = rootNode.entries.get("nested") as MemoryDirectory | undefined;
    expect([...(directory?.entries.keys() ?? [])]).toEqual(["unrelated.txt"]);
  });
});

async function createTestZip(path: string, contents = "content"): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add(path, new BlobReader(new Blob([contents])));
  return writer.close();
}

type MemoryEntry = MemoryDirectory | MemoryFile;

interface MemoryDirectory {
  entries: Map<string, MemoryEntry>;
  kind: "directory";
}

interface MemoryFile {
  contents?: Blob;
  kind: "file";
}

function createMemoryDirectoryHandle(
  node: MemoryDirectory,
  failWrites: Set<string>,
  beforeWrite?: (name: string) => void,
): FileSystemDirectoryHandle {
  const handle = {
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = node.entries.get(name);
      if (entry?.kind === "directory")
        return createMemoryDirectoryHandle(entry, failWrites, beforeWrite);
      if (entry?.kind === "file") throw new DOMException("File exists", "TypeMismatchError");
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      const directory: MemoryDirectory = { kind: "directory", entries: new Map() };
      node.entries.set(name, directory);
      return createMemoryDirectoryHandle(directory, failWrites, beforeWrite);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = node.entries.get(name);
      if (entry?.kind === "directory")
        throw new DOMException("Directory exists", "TypeMismatchError");
      if (entry?.kind === "file")
        return createMemoryFileHandle(name, entry, failWrites, beforeWrite);
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      const file: MemoryFile = { kind: "file", contents: new Blob() };
      node.entries.set(name, file);
      return createMemoryFileHandle(name, file, failWrites, beforeWrite);
    },
    removeEntry: async (name: string, options?: { recursive?: boolean }) => {
      const entry = node.entries.get(name);
      if (!entry) throw new DOMException("Missing", "NotFoundError");
      if (entry.kind === "directory" && entry.entries.size > 0 && !options?.recursive) {
        throw new DOMException("Directory is not empty", "InvalidModificationError");
      }
      node.entries.delete(name);
    },
  } as unknown as FileSystemDirectoryHandle;
  return handle;
}

function createMemoryFileHandle(
  name: string,
  file: MemoryFile,
  failWrites: Set<string>,
  beforeWrite?: (name: string) => void,
): FileSystemFileHandle {
  return {
    createWritable: async () => ({
      abort: async () => undefined,
      close: async () => undefined,
      write: async (contents: Blob) => {
        beforeWrite?.(name);
        if (failWrites.has(name)) throw new Error("disk full");
        file.contents = contents;
      },
    }),
  } as unknown as FileSystemFileHandle;
}

it("exports one captured vault generation without rereading live notes", async () => {
  const vault = {
    captureExport: async () => ({
      notes: [{ id: "n", title: "Snapshot", sourcePath: "Snapshot.md", markdown: "captured text" }],
      attachments: [],
    }),
    listNotes: async () => {
      throw new Error("must not read live metadata");
    },
    getNote: async () => {
      throw new Error("must not read live text");
    },
  } as unknown as Vault;
  const files = await createMarkdownExport(vault);
  expect(await files[0].contents.text()).toBe("captured text");
});

it.each(["CON", "nul", "COM1", "LPT9.txt"])(
  "exports a legacy note titled %s using a portable fallback",
  async (title) => {
    const vault = {
      captureExport: async () => ({
        notes: [{ id: "legacy", title, markdown: "kept text" }],
        attachments: [],
      }),
    } as unknown as Vault;
    const files = await createMarkdownExport(vault);
    expect(files[0]!.path).toBe(`_${title}.md`);
    await expect(files[0]!.contents.text()).resolves.toBe("kept text");
    await expect(readMarkdownZip(await createMarkdownZip(files))).resolves.toHaveLength(1);
  },
);

it("exports stored nonportable paths and keeps relative links working", async () => {
  const vault = {
    captureExport: async () => ({
      notes: [
        {
          id: "plan",
          title: "Plan",
          sourcePath: "Trips: 2026/Plan?.md",
          markdown: "![Map](../CON/Map%3F.png)",
        },
      ],
      attachments: [
        {
          metadata: { id: "map", name: "Map?.png", sourcePath: "CON/Map?.png" },
          file: new Blob(["map"]),
        },
      ],
    }),
  } as unknown as Vault;
  const files = await readMarkdownZip(await createMarkdownZip(await createMarkdownExport(vault)));
  expect(files.map(({ path }) => path)).toEqual(["Trips- 2026/Plan-.md", "_CON/Map-.png"]);
  await expect(files[0]!.contents.text()).resolves.toBe("![Map](../_CON/Map-.png)");
});

it("assigns attachments to an actual link before falling back to the closest folder", async () => {
  const importNotes = vi.fn();
  const vault = { importNotes } as unknown as Vault;
  const files = [
    { path: "Root.md", contents: new Blob(["`![example](Trips/assets/map.png)`"]) },
    { path: "Trips/Plan.md", contents: new Blob(["![Map](assets/map.png)"]) },
    { path: "Trips/Other.md", contents: new Blob(["Other"]) },
    { path: "Trips/assets/map.png", contents: new Blob(["map"]) },
    { path: "Trips/assets/extra.png", contents: new Blob(["extra"]) },
  ];
  await importMarkdownFiles(vault, files);
  expect(importNotes).toHaveBeenCalledWith([
    expect.objectContaining({ sourcePath: "Root.md", attachments: [] }),
    expect.objectContaining({
      sourcePath: "Trips/Plan.md",
      attachments: [
        expect.objectContaining({ name: "map.png" }),
        expect.objectContaining({ name: "extra.png" }),
      ],
    }),
    expect.objectContaining({ sourcePath: "Trips/Other.md", attachments: [] }),
  ]);
});

it("keeps parentheses escaped in exported Markdown link destinations", async () => {
  const vault = {
    captureExport: async () => ({
      notes: [
        { id: "plan", title: "Plan", sourcePath: "Plan.md", markdown: "![Map](Map%20%29.png)" },
      ],
      attachments: [
        {
          metadata: { name: "Map ).png", sourcePath: "Map ).png" },
          file: new Blob(["map"]),
        },
      ],
    }),
  } as unknown as Vault;
  const [plan] = await createMarkdownExport(vault);
  await expect(plan?.contents.text()).resolves.toBe("![Map](Map%20%29.png)");
});

it("suffixes a file that collides with a directory while retaining its links", async () => {
  const vault = {
    captureExport: async () => ({
      notes: [
        {
          id: "agenda",
          title: "Agenda",
          sourcePath: "Meeting.md/Agenda.md",
          markdown: "[Minutes](../Meeting.md)",
        },
        { id: "minutes", title: "Minutes", sourcePath: "Meeting.md", markdown: "# Minutes" },
      ],
      attachments: [],
    }),
  } as unknown as Vault;
  const files = await createMarkdownExport(vault);
  expect(files.map(({ path }) => path)).toEqual(["Meeting-2.md", "Meeting.md/Agenda.md"]);
  await expect(files[1]?.contents.text()).resolves.toBe("[Minutes](../Meeting-2.md)");
});

it("rewrites local links with an escaped colon in the first path segment", async () => {
  const vault = {
    captureExport: async () => ({
      notes: [
        {
          id: "index",
          title: "Index",
          sourcePath: "Index.md",
          markdown: "[Log](Trip%3A2026.md) [External](https://example.com)",
        },
        { id: "log", title: "Log", sourcePath: "Trip:2026.md", markdown: "# Log" },
      ],
      attachments: [],
    }),
  } as unknown as Vault;
  const files = await createMarkdownExport(vault);
  const index = files.find(({ path }) => path === "Index.md");
  await expect(index?.contents.text()).resolves.toBe(
    "[Log](Trip-2026.md) [External](https://example.com)",
  );
});
