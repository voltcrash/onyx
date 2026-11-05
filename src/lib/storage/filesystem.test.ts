import { describe, expect, it, vi } from "vite-plus/test";

import { MirroredVaultFilesystem, VaultFilesystem } from "./filesystem.js";

import { memoryDirectory } from "../../../test/fixtures/filesystem.js";

describe("MirroredVaultFilesystem", () => {
  it("continues in OPFS after native directory permission is lost", async () => {
    const fallbackWrite = vi.fn().mockResolvedValue(undefined);
    const mirrorWrite = vi
      .fn()
      .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    const fallback = { writeText: fallbackWrite } as unknown as VaultFilesystem;
    const mirror = { writeText: mirrorWrite } as unknown as VaultFilesystem;
    const onMirrorUnavailable = vi.fn();
    const filesystem = new MirroredVaultFilesystem(fallback, onMirrorUnavailable);
    filesystem.attach(mirror);

    await expect(filesystem.writeText("notes/note.md", "first")).resolves.toBeUndefined();
    await expect(filesystem.writeText("notes/note.md", "second")).resolves.toBeUndefined();

    expect(fallbackWrite).toHaveBeenCalledTimes(2);
    expect(mirrorWrite).toHaveBeenCalledTimes(1);
    expect(onMirrorUnavailable).toHaveBeenCalledWith("permission");
  });
});

describe("Mirror commit ownership", () => {
  it("does not replay a failed metadata commit or blame the mirror", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const replace = vi.fn().mockImplementation(async (_files, apply) => apply());
    const unavailable = vi.fn();
    const filesystem = new MirroredVaultFilesystem(
      { replace } as unknown as VaultFilesystem,
      unavailable,
    );
    const mirrorReplace = vi.fn();
    filesystem.attach({ replace: mirrorReplace } as unknown as VaultFilesystem);
    await expect(filesystem.replace([], commit)).rejects.toThrow("database unavailable");
    expect(commit).toHaveBeenCalledOnce();
    expect(mirrorReplace).not.toHaveBeenCalled();
    expect(unavailable).not.toHaveBeenCalled();
  });
});

// Recovery reads a new instance, as it would after an interrupted tab is reopened.
describe("Durable replacement recovery", () => {
  it("restores the previous generation after an interrupted commit", async () => {
    const root = memoryDirectory();
    const filesystem = await VaultFilesystem.fromDirectory(root);
    await filesystem.writeText("notes/old.md", "old");
    let release!: () => void;
    let entered!: () => void;
    const committing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = filesystem.replace(
      [{ path: "notes/new.md", contents: new Blob(["new"]) }],
      async () => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    );
    await committing;
    const reopened = Reflect.construct(VaultFilesystem, [root]) as VaultFilesystem;
    await reopened.recover();
    expect(await reopened.readText("notes/old.md")).toBe("old");
    await expect(reopened.read("notes/new.md")).rejects.toThrow();
    release();
    await pending;
  });

  it("keeps a generation whose database commit completed", async () => {
    const filesystem = await VaultFilesystem.fromDirectory(memoryDirectory());
    await filesystem.writeText("notes/old.md", "old");
    await filesystem.replace(
      [{ path: "notes/new.md", contents: new Blob(["new"]) }],
      async (generation) => {
        await filesystem.recover(generation);
      },
    );
    expect(await filesystem.readText("notes/new.md")).toBe("new");
  });
});

describe("Retained file replacement", () => {
  it("materializes retained files before replacing both local and mirror trees", async () => {
    let readable = true;
    class RetainedFile extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        if (!readable)
          return Promise.reject(new DOMException("File was removed", "NotReadableError"));
        return super.arrayBuffer();
      }
    }
    const fallback = await VaultFilesystem.fromDirectory(memoryDirectory());
    const mirror = await VaultFilesystem.fromDirectory(memoryDirectory());
    for (const filesystem of [fallback, mirror]) {
      await filesystem.writeText("notes/removed.md", "remove");
      await filesystem.writeText("notes/retained.md", "retain");
    }
    const replace = fallback.replace.bind(fallback);
    vi.spyOn(fallback, "replace").mockImplementation(async (files, commit) => {
      await replace(files, commit);
      readable = false;
    });
    const unavailable = vi.fn();
    const filesystem = new MirroredVaultFilesystem(fallback, unavailable);
    filesystem.attach(mirror);
    const commit = vi.fn().mockResolvedValue(undefined);
    await filesystem.replace(
      [{ path: "notes/retained.md", contents: new RetainedFile(["retain"]) }],
      commit,
    );
    expect(commit).toHaveBeenCalledOnce();
    expect(unavailable).not.toHaveBeenCalled();
    expect(await mirror.readText("notes/retained.md")).toBe("retain");
    await expect(mirror.read("notes/removed.md")).rejects.toThrow();
  });
});
