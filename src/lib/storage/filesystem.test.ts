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
