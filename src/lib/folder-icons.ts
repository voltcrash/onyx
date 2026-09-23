export const folderIconOptions = [
  { id: "archive", label: "Archive" },
  { id: "briefcase", label: "Briefcase" },
  { id: "calendar", label: "Calendar" },
  { id: "camera", label: "Camera" },
  { id: "code", label: "Code" },
  { id: "heart", label: "Heart" },
  { id: "home", label: "Home" },
  { id: "lightbulb", label: "Idea" },
  { id: "music", label: "Music" },
  { id: "palette", label: "Palette" },
  { id: "plane", label: "Travel" },
  { id: "rocket", label: "Launch" },
  { id: "sparkles", label: "Sparkles" },
  { id: "star", label: "Star" },
  { id: "tag", label: "Tag" },
] as const;

export type FolderIcon = (typeof folderIconOptions)[number]["id"];

export function isFolderIcon(value: unknown): value is FolderIcon {
  return typeof value === "string" && folderIconOptions.some((option) => option.id === value);
}
