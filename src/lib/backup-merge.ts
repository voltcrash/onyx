import type {
  AttachmentMetadata,
  NoteMetadata,
  VaultBackupManifest,
  VaultRestoreFile,
} from "./storage/types.ts";
import { fileStem, noteFilePath, parentPath, joinPath } from "./paths.ts";

export interface MergeVault {
  manifest: VaultBackupManifest;
  files: VaultRestoreFile[];
}

async function fingerprint(blob: Blob | undefined): Promise<string | undefined> {
  if (!blob) return;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function mergeBackupFiles(
  base: MergeVault,
  local: MergeVault,
  remote: MergeVault,
  date = new Date().toISOString().slice(0, 10),
): Promise<MergeVault> {
  const files: VaultRestoreFile[] = [];
  const manifest: VaultBackupManifest = { version: 1, notes: [], attachments: [], folders: [] };
  const maps = [base, local, remote].map(
    (vault) => new Map(vault.files.map((file) => [file.path, file.contents])),
  );
  const occupied = new Set(
    local.manifest.notes.map((note) => noteFilePath(note).toLocaleLowerCase()),
  );
  const siblingPath = (path: string) => {
    const stem = fileStem(path);
    for (let index = 1; ; index += 1) {
      const candidate = joinPath(
        parentPath(path),
        `${stem} (conflict ${date})${index === 1 ? "" : ` ${index}`}.md`,
      );
      if (!occupied.has(candidate.toLocaleLowerCase())) {
        occupied.add(candidate.toLocaleLowerCase());
        return candidate;
      }
    }
  };
  async function mergeEntities<T extends NoteMetadata | AttachmentMetadata>(
    kind: "notes" | "attachments",
    destination: T[],
  ): Promise<void> {
    const entities = [base, local, remote].map(
      (vault) => new Map((vault.manifest[kind] as T[]).map((entity) => [entity.id, entity])),
    );
    const ids = new Set(entities.flatMap((map) => [...map.keys()]));
    for (const id of ids) {
      const [b, l, r] = entities.map((map) => map.get(id));
      const signatures = await Promise.all(
        [b, l, r].map(async (entity, index) =>
          entity
            ? JSON.stringify([
                await fingerprint(maps[index]!.get(entity.path)),
                entity.sourcePath,
                "pinned" in entity ? entity.pinned : undefined,
                "deletedAt" in entity ? entity.deletedAt : undefined,
              ])
            : undefined,
        ),
      );
      const [bs, ls, rs] = signatures;
      let selected: T | undefined,
        side = 1;
      let conflict = false;
      if (ls === rs || rs === bs) selected = l;
      else if (ls === bs) {
        selected = r;
        side = 2;
      } else if (!l) {
        selected = r;
        side = 2;
      } else {
        selected = l;
        conflict = Boolean(r && kind === "notes");
      }
      if (selected) {
        const contents = maps[side]!.get(selected.path);
        if (!contents) throw new Error("A backup file is missing");
        let entry = { ...selected };
        if (side === 2 && kind === "notes") {
          const logical = noteFilePath(entry as NoteMetadata);
          const collision = local.manifest.notes.some(
            (note) =>
              note.id !== id &&
              noteFilePath(note).toLocaleLowerCase() === logical.toLocaleLowerCase(),
          );
          if (collision) entry = { ...entry, sourcePath: siblingPath(logical) };
          else occupied.add(logical.toLocaleLowerCase());
        }
        destination.push(entry);
        files.push({ path: entry.path, contents });
      }
      if (conflict && r) {
        const remoteNote = r as NoteMetadata;
        const conflictId = crypto.randomUUID();
        const copy = {
          ...remoteNote,
          id: conflictId,
          path: `notes/${conflictId}.md`,
          sourcePath: siblingPath(noteFilePath(remoteNote)),
          title: `${remoteNote.title} (conflict ${date})`,
          revision: 1,
        };
        const contents = maps[2]!.get(r.path);
        if (!contents) throw new Error("A backup file is missing");
        manifest.notes.push(copy);
        files.push({ path: copy.path, contents });
      }
      if (kind === "attachments" && l && r && ls !== rs && ls !== bs && rs !== bs) {
        const conflictId = crypto.randomUUID();
        const copy = {
          ...r,
          id: conflictId,
          path: `attachments/${(r as AttachmentMetadata).noteId}/${conflictId}`,
          sourcePath: `${r.sourcePath ?? (r as AttachmentMetadata).name}.conflict-${date}-${conflictId}`,
        } as AttachmentMetadata;
        const contents = maps[2]!.get(r.path);
        if (!contents) throw new Error("A backup file is missing");
        manifest.attachments.push(copy);
        files.push({ path: copy.path, contents });
      }
    }
  }
  await mergeEntities<NoteMetadata>("notes", manifest.notes);
  await mergeEntities<AttachmentMetadata>("attachments", manifest.attachments);
  const noteIds = new Set(manifest.notes.map((note) => note.id));
  manifest.attachments = manifest.attachments.filter((attachment) =>
    noteIds.has(attachment.noteId),
  );
  const folders = new Map(
    [...(remote.manifest.folders ?? []), ...(local.manifest.folders ?? [])].map((folder) => [
      folder.path,
      folder,
    ]),
  );
  manifest.folders = [...folders.values()];
  return { manifest, files };
}
