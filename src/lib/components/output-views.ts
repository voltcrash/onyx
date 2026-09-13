import { Code2, FileText, Printer, Type } from "@lucide/svelte";
import type { Component } from "svelte";

export type OutputView = "markdown" | "text" | "html" | "pdf";

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
    label: "Text",
    description: "Read the note as plain text, then copy or download it",
    icon: Type,
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
