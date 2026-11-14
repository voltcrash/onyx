import type { SidebarSort } from "./browser-storage.ts";
import { fileStem, noteFilePath } from "./paths.ts";
import type { NoteMetadata } from "./storage/types.ts";

type SortableNote = Pick<
  NoteMetadata,
  "id" | "title" | "sourcePath" | "pinned" | "createdAt" | "updatedAt"
>;
export function compareSidebarNotes(
  left: SortableNote,
  right: SortableNote,
  sort: SidebarSort,
): number {
  const pinned = Number(right.pinned === true) - Number(left.pinned === true);
  if (pinned) return pinned;
  const leftName = left.title || fileStem(noteFilePath(left));
  const rightName = right.title || fileStem(noteFilePath(right));
  const name = leftName.localeCompare(rightName, undefined, { sensitivity: "base", numeric: true });
  const order = sort.by === "name" ? name : left[sort.by].localeCompare(right[sort.by]);
  return (
    (sort.direction === "asc" ? order : -order) ||
    name ||
    noteFilePath(left).localeCompare(noteFilePath(right)) ||
    left.id.localeCompare(right.id)
  );
}
