import { describe, expect, it, vi } from "vite-plus/test";

import { MirroredVaultFilesystem, type VaultFilesystem } from "./filesystem.js";

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
