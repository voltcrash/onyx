import { Code2, FileText, Pilcrow, Printer, Type } from "@lucide/svelte";
import type { Component } from "svelte";

export type OutputView = "markdown" | "text" | "rich-text" | "html" | "pdf";

export interface OutputViewOption {
  id: OutputView;
  label: string;
  description: string;
  icon: Component;
}

export const outputViews: OutputViewOption[] = [
  {
    id: "markdown",
    label: "Markdown",
    description: "Write and edit the Markdown source",
    icon: FileText,
  },
  {
    id: "text",
    label: "Plain text",
    description: "Read the note as plain text, then copy or download it",
    icon: Type,
  },
  {
    id: "rich-text",
    label: "Rich text",
    description: "Copy the formatted note into a document, or download it as RTF",
    icon: Pilcrow,
  },
  {
    id: "html",
    label: "HTML",
    description: "Read the generated HTML and download it",
    icon: Code2,
  },
  {
    id: "pdf",
    label: "PDF",
    description: "Preview the printed page and save it as a PDF",
    icon: Printer,
  },
];

export function isOutputView(value: string | undefined): value is OutputView {
  return outputViews.some((view) => view.id === value);
}
