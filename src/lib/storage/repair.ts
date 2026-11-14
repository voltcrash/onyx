import type { VaultDatabase } from "./database.js";
import type { VaultFileStorage } from "./filesystem.js";

/** Retains crash recovery without a database transaction and serial disk read per note. */
export async function repairNoteFiles(
  database: Pick<VaultDatabase, "getNotes" | "getNoteContents">,
  filesystem: Pick<VaultFileStorage, "readText" | "writeText">,
): Promise<Set<string>> {
  const [notes, contents] = await Promise.all([database.getNotes(), database.getNoteContents()]);
  const markdownById = new Map(contents.map(({ noteId, markdown }) => [noteId, markdown]));
  const pending = new Set<string>();
  for (let offset = 0; offset < notes.length; offset += 8) {
    const batch = await Promise.all(
      notes.slice(offset, offset + 8).map(async (note) => {
        const markdown = markdownById.get(note.id);
        if (markdown === undefined) return;
        const file = await filesystem.readText(note.path).catch(() => undefined);
        return file === markdown ? undefined : { note, markdown };
      }),
    );
    for (const entry of batch) {
      if (!entry) continue;
      try {
        await filesystem.writeText(entry.note.path, entry.markdown);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "QuotaExceededError")) throw error;
        pending.add(entry.note.id);
      }
    }
  }
  return pending;
}
