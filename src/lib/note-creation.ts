import { readLocalStorage, writeLocalStorage } from "./browser-storage.ts";
import { normalizeFileName, normalizeFolderName, joinPath } from "./paths.ts";

export interface NoteCreationPreferences {
  templatesFolder: string;
  dailyFolder: string;
  dailyTemplate: string;
}
export const defaultNoteCreationPreferences: NoteCreationPreferences = {
  templatesFolder: "Templates",
  dailyFolder: "Daily",
  dailyTemplate: "",
};
export function normalizeNotePath(path: string): string {
  const parts = path.trim().split("/");
  const name = parts.pop() ?? "";
  return joinPath(parts.map(normalizeFolderName).join("/"), normalizeFileName(name));
}
export function normalizeCreationPreferences(
  value: NoteCreationPreferences,
): NoteCreationPreferences {
  const folder = (path: string) => path.trim().split("/").map(normalizeFolderName).join("/");
  return {
    templatesFolder: folder(value.templatesFolder),
    dailyFolder: folder(value.dailyFolder),
    dailyTemplate: value.dailyTemplate.trim() ? normalizeNotePath(value.dailyTemplate) : "",
  };
}
export function readCreationPreferences(vaultId: string): NoteCreationPreferences {
  try {
    const parsed = JSON.parse(
      readLocalStorage(`onyx:note-creation:${vaultId}`) ?? "{}",
    ) as Partial<NoteCreationPreferences>;
    return normalizeCreationPreferences({ ...defaultNoteCreationPreferences, ...parsed });
  } catch {
    return { ...defaultNoteCreationPreferences };
  }
}
export function writeCreationPreferences(vaultId: string, value: NoteCreationPreferences): boolean {
  return writeLocalStorage(
    `onyx:note-creation:${vaultId}`,
    JSON.stringify(normalizeCreationPreferences(value)),
  );
}
export function dailyNoteDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function renderNoteTemplate(markdown: string, title: string, date = new Date()): string {
  const values = {
    title,
    date: dailyNoteDate(date),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
  return markdown.replace(
    /{{\s*(title|date|time)\s*}}/g,
    (_, name: keyof typeof values) => values[name],
  );
}
