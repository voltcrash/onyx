import { readLocalStorage, writeLocalStorage } from "./browser-storage.js";

export type FontRole = "heading" | "content" | "code";

export interface FontOption {
  id: string;
  name: string;
  stack: string;
  note: string;
}

export type FontChoices = Record<FontRole, string>;

const SANS_FALLBACK = '"Inter Variable", Inter, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';
const MONO_FALLBACK = 'ui-monospace, "SFMono-Regular", Consolas, monospace';

export const fontRoles: Array<{ id: FontRole; label: string; hint: string }> = [
  { id: "heading", label: "Headings", hint: "Every heading level, in both panes." },
  { id: "content", label: "Body text", hint: "Paragraphs, lists, quotes, and tables." },
  { id: "code", label: "Code", hint: "Code blocks, inline code, and the Markdown pane." },
];

export const fontOptions: Record<FontRole, FontOption[]> = {
  heading: [
    {
      id: "newsreader",
      name: "Newsreader",
      stack: `"Newsreader Variable", ${SERIF_FALLBACK}`,
      note: "Editorial serif that keeps long titles compact.",
    },
    {
      id: "fraunces",
      name: "Fraunces",
      stack: `"Fraunces Variable", ${SERIF_FALLBACK}`,
      note: "Old-style serif with warmth and a little wobble.",
    },
    {
      id: "literata",
      name: "Literata",
      stack: `"Literata Variable", ${SERIF_FALLBACK}`,
      note: "Sturdy book serif with generous letterforms.",
    },
    {
      id: "source-serif",
      name: "Source Serif",
      stack: `"Source Serif 4 Variable", ${SERIF_FALLBACK}`,
      note: "Even and quiet, with no flourish to distract.",
    },
    {
      id: "geist",
      name: "Geist",
      stack: `"Geist Variable", ${SANS_FALLBACK}`,
      note: "Tight modern sans for titles that read as labels.",
    },
    {
      id: "inter",
      name: "Inter",
      stack: SANS_FALLBACK,
      note: "Familiar sans that stays legible at any size.",
    },
    {
      id: "space-grotesk",
      name: "Space Grotesk",
      stack: `"Space Grotesk Variable", ${SANS_FALLBACK}`,
      note: "Geometric sans with distinctive angled cuts.",
    },
    {
      id: "system",
      name: "System serif",
      stack: `ui-serif, ${SERIF_FALLBACK}`,
      note: "Whatever serif this device already has. Nothing to download.",
    },
  ],
  content: [
    {
      id: "geist",
      name: "Geist",
      stack: `"Geist Variable", ${SANS_FALLBACK}`,
      note: "Clean sans with an open, even rhythm.",
    },
    {
      id: "inter",
      name: "Inter",
      stack: SANS_FALLBACK,
      note: "Neutral sans tuned for screens.",
    },
    {
      id: "newsreader",
      name: "Newsreader",
      stack: `"Newsreader Variable", ${SERIF_FALLBACK}`,
      note: "Serif with a newsprint cadence for long drafts.",
    },
    {
      id: "literata",
      name: "Literata",
      stack: `"Literata Variable", ${SERIF_FALLBACK}`,
      note: "Book serif that holds up over many pages.",
    },
    {
      id: "source-serif",
      name: "Source Serif",
      stack: `"Source Serif 4 Variable", ${SERIF_FALLBACK}`,
      note: "Steady serif with a low-contrast texture.",
    },
    {
      id: "fraunces",
      name: "Fraunces",
      stack: `"Fraunces Variable", ${SERIF_FALLBACK}`,
      note: "Characterful serif for notes with a voice.",
    },
    {
      id: "system",
      name: "System sans",
      stack: "ui-sans-serif, system-ui, sans-serif",
      note: "Whatever sans this device already has. Nothing to download.",
    },
  ],
  code: [
    {
      id: "geist-mono",
      name: "Geist Mono",
      stack: `"Geist Mono Variable", ${MONO_FALLBACK}`,
      note: "Wide monospace with clearly separated shapes.",
    },
    {
      id: "jetbrains-mono",
      name: "JetBrains Mono",
      stack: `"JetBrains Mono Variable", ${MONO_FALLBACK}`,
      note: "Tall x-height built for reading code all day.",
    },
    {
      id: "fira-code",
      name: "Fira Code",
      stack: `"Fira Code Variable", ${MONO_FALLBACK}`,
      note: "Humanist monospace with ligatures for operators.",
    },
    {
      id: "source-code-pro",
      name: "Source Code Pro",
      stack: `"Source Code Pro Variable", ${MONO_FALLBACK}`,
      note: "Narrow and plain, so more fits on a line.",
    },
    {
      id: "roboto-mono",
      name: "Roboto Mono",
      stack: `"Roboto Mono Variable", ${MONO_FALLBACK}`,
      note: "Even monospace with a mechanical, level texture.",
    },
    {
      id: "system",
      name: "System mono",
      stack: MONO_FALLBACK,
      note: "Whatever monospace this device already has. Nothing to download.",
    },
  ],
};

export const defaultFontChoices: FontChoices = {
  heading: "newsreader",
  content: "geist",
  code: "geist-mono",
};

const STORAGE_KEY: Record<FontRole, string> = {
  heading: "onyx:font-heading",
  content: "onyx:font-content",
  code: "onyx:font-code",
};

const CSS_VARIABLE: Record<FontRole, string> = {
  heading: "--font-heading",
  content: "--font-content",
  code: "--font-code",
};

export function fontOption(role: FontRole, id: string): FontOption {
  const options = fontOptions[role];
  return options.find((option) => option.id === id) ?? options[0]!;
}

export function fontStack(role: FontRole, id: string): string {
  return fontOption(role, id).stack;
}

export function readFontChoices(): FontChoices {
  const choices = { ...defaultFontChoices };
  for (const role of Object.keys(choices) as FontRole[]) {
    const stored = readLocalStorage(STORAGE_KEY[role]);
    if (stored && fontOptions[role].some((option) => option.id === stored)) choices[role] = stored;
  }
  return choices;
}

export function applyFontChoices(choices: FontChoices): void {
  const root = document.documentElement;
  for (const role of Object.keys(choices) as FontRole[]) {
    root.style.setProperty(CSS_VARIABLE[role], fontStack(role, choices[role]));
    writeLocalStorage(STORAGE_KEY[role], choices[role]);
  }
}
