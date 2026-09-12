import { Code2, FileText } from "@lucide/svelte";
import type { Component } from "svelte";

export type OutputView = "markdown" | "html";

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
    id: "html",
    label: "HTML",
    description: "Read the generated HTML and download it",
    icon: Code2,
  },
];

export function isOutputView(value: string | undefined): value is OutputView {
  return outputViews.some((view) => view.id === value);
}
