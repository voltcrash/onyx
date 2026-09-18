export type NoteFormat = "markdown" | "html" | "text" | "rich-text" | "pdf";

export interface NoteFormatOption {
  id: NoteFormat;
  label: string;
  /** PDF only comes out of the print dialog, so it cannot be copied. */
  copyable: boolean;
}

export const noteFormats: NoteFormatOption[] = [
  { id: "markdown", label: "Markdown", copyable: true },
  { id: "html", label: "HTML", copyable: true },
  { id: "text", label: "Plain text", copyable: true },
  { id: "rich-text", label: "Rich text", copyable: true },
  { id: "pdf", label: "PDF", copyable: false },
];
