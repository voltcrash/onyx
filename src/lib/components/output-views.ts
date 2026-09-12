import { FileText } from "@lucide/svelte";
import type { Component } from "svelte";

export type OutputView = "markdown";

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
];

export function isOutputView(value: string | undefined): value is OutputView {
  return outputViews.some((view) => view.id === value);
}
