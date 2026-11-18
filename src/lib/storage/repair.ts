import type { VaultFileStorage } from "./filesystem.js";

export async function repairNoteFiles(
  files: Array<{ id: string; path: string; markdown: string }>,
  filesystem: Pick<VaultFileStorage, "readText" | "writeText">,
  pending: Set<string>,
): Promise<void> {
  for (let offset = 0; offset < files.length; offset += 8) {
    const batch = await Promise.all(
      files.slice(offset, offset + 8).map(async (note) => {
        const file = await filesystem.readText(note.path).catch(() => undefined);
        if (file !== note.markdown) return note;
        pending.delete(note.id);
      }),
    );
    for (const note of batch) {
      if (!note) continue;
      try {
        await filesystem.writeText(note.path, note.markdown);
        pending.delete(note.id);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
        pending.add(note.id);
      }
    }
  }
}
