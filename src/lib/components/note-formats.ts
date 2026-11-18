export const noteFormats = [
  { id: "markdown", label: "Markdown", copyable: true },
  { id: "html", label: "HTML", copyable: true },
  { id: "html-images", label: "HTML · Include local images", copyable: false },
  { id: "text", label: "Plain text", copyable: true },
  { id: "rich-text", label: "Rich text", copyable: true },
  { id: "pdf", label: "PDF", copyable: false },
] as const;

type FormatOption = (typeof noteFormats)[number];
export type NoteFormat = FormatOption["id"];
export type CopyableNoteFormat = Extract<FormatOption, { copyable: true }>["id"];
