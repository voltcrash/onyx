import { readLocalStorage, writeLocalStorage } from "./browser-storage.js";

export type FontRole = "heading" | "content" | "code";

export type FontCategory = "serif" | "sans-serif" | "slab-serif" | "monospace";

export interface FontOption {
  id: string;
  name: string;
  stack: string;
  note: string;
  category: FontCategory;
}

export type FontChoices = Record<FontRole, string>;

export type FontCategories = Record<FontRole, FontCategory>;

const SANS_FALLBACK = '"Inter Variable", Inter, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';
const MONO_FALLBACK = 'ui-monospace, "SFMono-Regular", Consolas, monospace';
// Apple ships these and does not license them for the web, so they can only be
// named and left to resolve locally. Elsewhere the rest of the stack takes over.
const SF_PRO = `"SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, ${SANS_FALLBACK}`;
const SF_MONO = `"SF Mono", SFMono-Regular, ui-monospace, Menlo, ${MONO_FALLBACK}`;
const NEW_YORK = `"New York", ui-serif, ${SERIF_FALLBACK}`;

export const fontRoles: Array<{ id: FontRole; label: string; hint: string }> = [
  { id: "heading", label: "Headings", hint: "Every heading level, in both panes." },
  { id: "content", label: "Body text", hint: "Paragraphs, lists, quotes, and tables." },
  { id: "code", label: "Code", hint: "Code blocks, inline code, and the Markdown pane." },
];

export const fontCategories: Array<{ id: FontCategory; label: string }> = [
  { id: "serif", label: "Serif" },
  { id: "sans-serif", label: "Sans serif" },
  { id: "slab-serif", label: "Slab serif" },
  { id: "monospace", label: "Monospace" },
];

export const fontOptions: Record<FontRole, FontOption[]> = {
  heading: [
    {
      id: "newsreader",
      name: "Newsreader",
      stack: `"Newsreader Variable", ${SERIF_FALLBACK}`,
      note: "Editorial serif that keeps long titles compact.",
      category: "serif",
    },
    {
      id: "fraunces",
      name: "Fraunces",
      stack: `"Fraunces Variable", ${SERIF_FALLBACK}`,
      note: "Old-style serif with warmth and a little wobble.",
      category: "serif",
    },
    {
      id: "literata",
      name: "Literata",
      stack: `"Literata Variable", ${SERIF_FALLBACK}`,
      note: "Sturdy book serif with generous letterforms.",
      category: "serif",
    },
    {
      id: "source-serif",
      name: "Source Serif",
      stack: `"Source Serif 4 Variable", ${SERIF_FALLBACK}`,
      note: "Even and quiet, with no flourish to distract.",
      category: "serif",
    },
    {
      id: "new-york",
      name: "New York",
      stack: NEW_YORK,
      note: "Apple's screen serif, warm and compact. Needs an Apple device.",
      category: "serif",
    },
    {
      id: "geist",
      name: "Geist",
      stack: `"Geist Variable", ${SANS_FALLBACK}`,
      note: "Tight modern sans for titles that read as labels.",
      category: "sans-serif",
    },
    {
      id: "inter",
      name: "Inter",
      stack: SANS_FALLBACK,
      note: "Familiar sans that stays legible at any size.",
      category: "sans-serif",
    },
    {
      id: "space-grotesk",
      name: "Space Grotesk",
      stack: `"Space Grotesk Variable", ${SANS_FALLBACK}`,
      note: "Geometric sans with distinctive angled cuts.",
      category: "sans-serif",
    },
    {
      id: "sf-pro",
      name: "SF Pro",
      stack: SF_PRO,
      note: "Apple's interface sans, plain and even. Needs an Apple device.",
      category: "sans-serif",
    },
    {
      id: "system",
      name: "System serif",
      stack: `ui-serif, ${SERIF_FALLBACK}`,
      note: "Whatever serif this device already has. Nothing to download.",
      category: "serif",
    },
    {
      id: "roboto-slab",
      name: "Roboto Slab",
      stack: `"Roboto Slab Variable", ${SERIF_FALLBACK}`,
      note: "Sturdy slab serif with a confident voice.",
      category: "slab-serif",
    },
    {
      id: "geist-mono",
      name: "Geist Mono",
      stack: `"Geist Mono Variable", ${MONO_FALLBACK}`,
      note: "Wide monospace for titles with a technical edge.",
      category: "monospace",
    },
    {
      id: "jetbrains-mono",
      name: "JetBrains Mono",
      stack: `"JetBrains Mono Variable", ${MONO_FALLBACK}`,
      note: "Tall monospace that stays legible at large sizes.",
      category: "monospace",
    },
    {
      id: "fira-code",
      name: "Fira Code",
      stack: `"Fira Code Variable", ${MONO_FALLBACK}`,
      note: "Humanist monospace with a technical voice.",
      category: "monospace",
    },
    {
      id: "source-code-pro",
      name: "Source Code Pro",
      stack: `"Source Code Pro Variable", ${MONO_FALLBACK}`,
      note: "Narrow monospace, so long titles still fit.",
      category: "monospace",
    },
    {
      id: "roboto-mono",
      name: "Roboto Mono",
      stack: `"Roboto Mono Variable", ${MONO_FALLBACK}`,
      note: "Mechanical monospace with a level texture.",
      category: "monospace",
    },
    {
      id: "sf-mono",
      name: "SF Mono",
      stack: SF_MONO,
      note: "Apple's coding monospace, narrow and calm. Needs an Apple device.",
      category: "monospace",
    },
  ],
  content: [
    {
      id: "geist",
      name: "Geist",
      stack: `"Geist Variable", ${SANS_FALLBACK}`,
      note: "Clean sans with an open, even rhythm.",
      category: "sans-serif",
    },
    {
      id: "inter",
      name: "Inter",
      stack: SANS_FALLBACK,
      note: "Neutral sans tuned for screens.",
      category: "sans-serif",
    },
    {
      id: "sf-pro",
      name: "SF Pro",
      stack: SF_PRO,
      note: "Apple's interface sans, plain and even. Needs an Apple device.",
      category: "sans-serif",
    },
    {
      id: "newsreader",
      name: "Newsreader",
      stack: `"Newsreader Variable", ${SERIF_FALLBACK}`,
      note: "Serif with a newsprint cadence for long drafts.",
      category: "serif",
    },
    {
      id: "literata",
      name: "Literata",
      stack: `"Literata Variable", ${SERIF_FALLBACK}`,
      note: "Book serif that holds up over many pages.",
      category: "serif",
    },
    {
      id: "source-serif",
      name: "Source Serif",
      stack: `"Source Serif 4 Variable", ${SERIF_FALLBACK}`,
      note: "Steady serif with a low-contrast texture.",
      category: "serif",
    },
    {
      id: "fraunces",
      name: "Fraunces",
      stack: `"Fraunces Variable", ${SERIF_FALLBACK}`,
      note: "Characterful serif for notes with a voice.",
      category: "serif",
    },
    {
      id: "new-york",
      name: "New York",
      stack: NEW_YORK,
      note: "Apple's screen serif, warm and compact. Needs an Apple device.",
      category: "serif",
    },
    {
      id: "system",
      name: "System sans",
      stack: "ui-sans-serif, system-ui, sans-serif",
      note: "Whatever sans this device already has. Nothing to download.",
      category: "sans-serif",
    },
    {
      id: "roboto-slab",
      name: "Roboto Slab",
      stack: `"Roboto Slab Variable", ${SERIF_FALLBACK}`,
      note: "Blocky serifs that hold up over many pages.",
      category: "slab-serif",
    },
    {
      id: "geist-mono",
      name: "Geist Mono",
      stack: `"Geist Mono Variable", ${MONO_FALLBACK}`,
      note: "Wide shapes that suit logs and transcripts.",
      category: "monospace",
    },
    {
      id: "jetbrains-mono",
      name: "JetBrains Mono",
      stack: `"JetBrains Mono Variable", ${MONO_FALLBACK}`,
      note: "Tall x-height for comfortable long reads.",
      category: "monospace",
    },
    {
      id: "fira-code",
      name: "Fira Code",
      stack: `"Fira Code Variable", ${MONO_FALLBACK}`,
      note: "Humanist monospace, even outside code.",
      category: "monospace",
    },
    {
      id: "source-code-pro",
      name: "Source Code Pro",
      stack: `"Source Code Pro Variable", ${MONO_FALLBACK}`,
      note: "Narrow and plain, so more fits on a line.",
      category: "monospace",
    },
    {
      id: "roboto-mono",
      name: "Roboto Mono",
      stack: `"Roboto Mono Variable", ${MONO_FALLBACK}`,
      note: "Mechanical rhythm for structured notes.",
      category: "monospace",
    },
    {
      id: "sf-mono",
      name: "SF Mono",
      stack: SF_MONO,
      note: "Apple's coding monospace, narrow and calm. Needs an Apple device.",
      category: "monospace",
    },
  ],
  code: [
    {
      id: "geist-mono",
      name: "Geist Mono",
      stack: `"Geist Mono Variable", ${MONO_FALLBACK}`,
      note: "Wide monospace with clearly separated shapes.",
      category: "monospace",
    },
    {
      id: "jetbrains-mono",
      name: "JetBrains Mono",
      stack: `"JetBrains Mono Variable", ${MONO_FALLBACK}`,
      note: "Tall x-height built for reading code all day.",
      category: "monospace",
    },
    {
      id: "fira-code",
      name: "Fira Code",
      stack: `"Fira Code Variable", ${MONO_FALLBACK}`,
      note: "Humanist monospace with ligatures for operators.",
      category: "monospace",
    },
    {
      id: "source-code-pro",
      name: "Source Code Pro",
      stack: `"Source Code Pro Variable", ${MONO_FALLBACK}`,
      note: "Narrow and plain, so more fits on a line.",
      category: "monospace",
    },
    {
      id: "roboto-mono",
      name: "Roboto Mono",
      stack: `"Roboto Mono Variable", ${MONO_FALLBACK}`,
      note: "Even monospace with a mechanical, level texture.",
      category: "monospace",
    },
    {
      id: "sf-mono",
      name: "SF Mono",
      stack: SF_MONO,
      note: "Apple's coding monospace, narrow and calm. Needs an Apple device.",
      category: "monospace",
    },
    {
      id: "system",
      name: "System mono",
      stack: MONO_FALLBACK,
      note: "Whatever monospace this device already has. Nothing to download.",
      category: "monospace",
    },
    {
      id: "newsreader",
      name: "Newsreader",
      stack: `"Newsreader Variable", ${SERIF_FALLBACK}`,
      note: "Editorial serif for code with a print feel.",
      category: "serif",
    },
    {
      id: "fraunces",
      name: "Fraunces",
      stack: `"Fraunces Variable", ${SERIF_FALLBACK}`,
      note: "Old-style serif for notes with character.",
      category: "serif",
    },
    {
      id: "literata",
      name: "Literata",
      stack: `"Literata Variable", ${SERIF_FALLBACK}`,
      note: "Book serif with generous letterforms.",
      category: "serif",
    },
    {
      id: "source-serif",
      name: "Source Serif",
      stack: `"Source Serif 4 Variable", ${SERIF_FALLBACK}`,
      note: "Quiet serif with no flourish to distract.",
      category: "serif",
    },
    {
      id: "new-york",
      name: "New York",
      stack: NEW_YORK,
      note: "Apple's screen serif. Needs an Apple device.",
      category: "serif",
    },
    {
      id: "geist",
      name: "Geist",
      stack: `"Geist Variable", ${SANS_FALLBACK}`,
      note: "Tight modern sans for a clean source pane.",
      category: "sans-serif",
    },
    {
      id: "inter",
      name: "Inter",
      stack: SANS_FALLBACK,
      note: "Familiar sans that stays legible at any size.",
      category: "sans-serif",
    },
    {
      id: "space-grotesk",
      name: "Space Grotesk",
      stack: `"Space Grotesk Variable", ${SANS_FALLBACK}`,
      note: "Geometric sans with distinctive angled cuts.",
      category: "sans-serif",
    },
    {
      id: "sf-pro",
      name: "SF Pro",
      stack: SF_PRO,
      note: "Apple's interface sans. Needs an Apple device.",
      category: "sans-serif",
    },
    {
      id: "roboto-slab",
      name: "Roboto Slab",
      stack: `"Roboto Slab Variable", ${SERIF_FALLBACK}`,
      note: "Slab serif with an even, typewriter feel.",
      category: "slab-serif",
    },
  ],
};

export const defaultFontChoices: FontChoices = {
  heading: "newsreader",
  content: "geist",
  code: "fira-code",
};

const STORAGE_KEY: Record<FontRole, string> = {
  heading: "onyx:font-heading",
  content: "onyx:font-content",
  code: "onyx:font-code",
};

const TYPE_STORAGE_KEY: Record<FontRole, string> = {
  heading: "onyx:font-heading-type",
  content: "onyx:font-content-type",
  code: "onyx:font-code-type",
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

export function fontCategory(role: FontRole, id: string): FontCategory {
  return fontOption(role, id).category;
}

export const defaultFontCategories: FontCategories = {
  heading: fontCategory("heading", defaultFontChoices.heading),
  content: fontCategory("content", defaultFontChoices.content),
  code: fontCategory("code", defaultFontChoices.code),
};

function isFontCategory(value: string | null | undefined): value is FontCategory {
  return fontCategories.some((category) => category.id === value);
}

export function readFontCategories(choices: FontChoices): FontCategories {
  const categories = { ...defaultFontCategories };
  for (const role of Object.keys(categories) as FontRole[]) {
    const stored = readLocalStorage(TYPE_STORAGE_KEY[role]);
    if (
      isFontCategory(stored) &&
      fontOptions[role].some((option) => option.category === stored && option.id === choices[role])
    ) {
      categories[role] = stored;
    } else {
      categories[role] = fontCategory(role, choices[role]);
    }
  }
  return categories;
}

export function writeFontCategory(role: FontRole, category: FontCategory): void {
  writeLocalStorage(TYPE_STORAGE_KEY[role], category);
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
