import { describe, expect, it } from "vite-plus/test";

import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";

import type { Vault } from "./storage/vault.js";
import {
  createMarkdownExport,
  createMarkdownZip,
  readMarkdownFolder,
  readMarkdownZip,
  writeMarkdownFolder,
} from "./markdown-transfer.js";

describe("Markdown archives", () => {
  it("rejects malformed ZIP archives", async () => {
    const malformed = new Blob(["this is not a zip archive"], { type: "application/zip" });

    await expect(readMarkdownZip(malformed)).rejects.toBeInstanceOf(Error);
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

  it("rewrites local links when an export path is collision-suffixed", async () => {
    const notes = [
      { id: "collision", title: "Collision", sourcePath: "notes/assets/map.png" },
      { id: "plan", title: "Plan", sourcePath: "notes/plan.md" },
    ];
    const attachments = [{ id: "map", name: "map.png", sourcePath: "notes/assets/map.png" }];
    const vault = {
      listNotes: async () => notes,
      listAttachments: async () => attachments,
      getNote: async (id: string) => ({
        ...notes.find((note) => note.id === id),
        markdown:
          id === "plan"
            ? "![Map](assets/map.png#crop) [Map](assets/map.png?download=1) ![[assets/map.png|Map]]"
            : "collision",
      }),
      getAttachment: async () => ({
        metadata: attachments[0],
        file: new Blob(["map"]) as File,
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
): FileSystemDirectoryHandle {
  const handle = {
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = node.entries.get(name);
      if (entry?.kind === "directory") return createMemoryDirectoryHandle(entry, failWrites);
      if (entry?.kind === "file") throw new DOMException("File exists", "TypeMismatchError");
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      const directory: MemoryDirectory = { kind: "directory", entries: new Map() };
      node.entries.set(name, directory);
      return createMemoryDirectoryHandle(directory, failWrites);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const entry = node.entries.get(name);
      if (entry?.kind === "directory")
        throw new DOMException("Directory exists", "TypeMismatchError");
      if (entry?.kind === "file") return createMemoryFileHandle(name, entry, failWrites);
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      const file: MemoryFile = { kind: "file", contents: new Blob() };
      node.entries.set(name, file);
      return createMemoryFileHandle(name, file, failWrites);
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
): FileSystemFileHandle {
  return {
    createWritable: async () => ({
      abort: async () => undefined,
      close: async () => undefined,
      write: async (contents: Blob) => {
        if (failWrites.has(name)) throw new Error("disk full");
        file.contents = contents;
      },
    }),
  } as unknown as FileSystemFileHandle;
}
