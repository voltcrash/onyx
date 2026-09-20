import { readLocalStorage, writeLocalStorage } from "./browser-storage.js";

export type FontRole = "heading" | "content" | "code";

export type FontCategory = "serif" | "sans-serif" | "slab-serif" | "monospace" | "rounded-sans";

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
  { id: "rounded-sans", label: "Rounded sans" },
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
      id: "roboto-serif",
      name: "Roboto Serif",
      stack: `"Roboto Serif Variable", ${SERIF_FALLBACK}`,
      note: "Crisp serif with an even, rational texture.",
      category: "serif",
    },
    {
      id: "eb-garamond",
      name: "EB Garamond",
      stack: `"EB Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Classic Garamond revival with old-style grace.",
      category: "serif",
    },
    {
      id: "lora",
      name: "Lora",
      stack: `"Lora Variable", ${SERIF_FALLBACK}`,
      note: "Calligraphic serif with soft, brushed curves.",
      category: "serif",
    },
    {
      id: "merriweather",
      name: "Merriweather",
      stack: `"Merriweather Variable", ${SERIF_FALLBACK}`,
      note: "Sturdy serif designed for screens.",
      category: "serif",
    },
    {
      id: "playfair-display",
      name: "Playfair Display",
      stack: `"Playfair Display Variable", ${SERIF_FALLBACK}`,
      note: "High-contrast display serif for bold titles.",
      category: "serif",
    },
    {
      id: "cormorant-garamond",
      name: "Cormorant Garamond",
      stack: `"Cormorant Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Delicate Garamond with a light touch.",
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
      id: "ibm-plex-sans",
      name: "IBM Plex Sans",
      stack: `"IBM Plex Sans Variable", ${SANS_FALLBACK}`,
      note: "IBM's grotesque with a technical voice.",
      category: "sans-serif",
    },
    {
      id: "manrope",
      name: "Manrope",
      stack: `"Manrope Variable", ${SANS_FALLBACK}`,
      note: "Geometric sans with soft, open shapes.",
      category: "sans-serif",
    },
    {
      id: "dm-sans",
      name: "DM Sans",
      stack: `"DM Sans Variable", ${SANS_FALLBACK}`,
      note: "Low-contrast grotesque for confident titles.",
      category: "sans-serif",
    },
    {
      id: "plus-jakarta-sans",
      name: "Plus Jakarta Sans",
      stack: `"Plus Jakarta Sans Variable", ${SANS_FALLBACK}`,
      note: "Friendly geometric sans with wide shapes.",
      category: "sans-serif",
    },
    {
      id: "roboto-flex",
      name: "Roboto Flex",
      stack: `"Roboto Flex Variable", ${SANS_FALLBACK}`,
      note: "Adaptable grotesque with width axes.",
      category: "sans-serif",
    },
    {
      id: "archivo",
      name: "Archivo",
      stack: `"Archivo Variable", ${SANS_FALLBACK}`,
      note: "Expanded grotesque for statement titles.",
      category: "sans-serif",
    },
    {
      id: "sora",
      name: "Sora",
      stack: `"Sora Variable", ${SANS_FALLBACK}`,
      note: "Geometric sans with a futuristic edge.",
      category: "sans-serif",
    },
    {
      id: "montserrat",
      name: "Montserrat",
      stack: `"Montserrat Variable", ${SANS_FALLBACK}`,
      note: "Urban geometric sans, classic and clean.",
      category: "sans-serif",
    },
    {
      id: "open-sans",
      name: "Open Sans",
      stack: `"Open Sans Variable", ${SANS_FALLBACK}`,
      note: "Neutral workhorse, legible everywhere.",
      category: "sans-serif",
    },
    {
      id: "ubuntu-sans",
      name: "Ubuntu Sans",
      stack: `"Ubuntu Sans Variable", ${SANS_FALLBACK}`,
      note: "Ubuntu's rounded grotesque for screens.",
      category: "sans-serif",
    },
    {
      id: "noto-sans",
      name: "Noto Sans",
      stack: `"Noto Sans Variable", ${SANS_FALLBACK}`,
      note: "Global sans with broad script coverage.",
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
      id: "zilla-slab",
      name: "Zilla Slab",
      stack: `"Zilla Slab", ${SERIF_FALLBACK}`,
      note: "Slab serif with a friendly, typewriter charm.",
      category: "slab-serif",
    },
    {
      id: "rokkitt",
      name: "Rokkitt",
      stack: `"Rokkitt Variable", ${SERIF_FALLBACK}`,
      note: "Tall slab serif with a rugged edge.",
      category: "slab-serif",
    },
    {
      id: "arvo",
      name: "Arvo",
      stack: `"Arvo", ${SERIF_FALLBACK}`,
      note: "Geometric slab serif, sturdy and direct.",
      category: "slab-serif",
    },
    {
      id: "bitter",
      name: "Bitter",
      stack: `"Bitter Variable", ${SERIF_FALLBACK}`,
      note: "Slab serif with a warm, bookish rhythm.",
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
    {
      id: "cascadia-code",
      name: "Cascadia Code",
      stack: `"Cascadia Code Variable", ${MONO_FALLBACK}`,
      note: "Microsoft's coding face with a friendly curve.",
      category: "monospace",
    },
    {
      id: "ubuntu-sans-mono",
      name: "Ubuntu Sans Mono",
      stack: `"Ubuntu Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Ubuntu's grotesque mono with open shapes.",
      category: "monospace",
    },
    {
      id: "google-sans-code",
      name: "Google Sans Code",
      stack: `"Google Sans Code Variable", ${MONO_FALLBACK}`,
      note: "Google's geometric mono, clean and round.",
      category: "monospace",
    },
    {
      id: "inconsolata",
      name: "Inconsolata",
      stack: `"Inconsolata Variable", ${MONO_FALLBACK}`,
      note: "Tall, narrow mono for compact titles.",
      category: "monospace",
    },
    {
      id: "noto-sans-mono",
      name: "Noto Sans Mono",
      stack: `"Noto Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Noto's even mono for global scripts.",
      category: "monospace",
    },
    {
      id: "nunito",
      name: "Nunito",
      stack: `"Nunito Variable", ${SANS_FALLBACK}`,
      note: "Rounded sans with a warm, friendly voice.",
      category: "rounded-sans",
    },
    {
      id: "quicksand",
      name: "Quicksand",
      stack: `"Quicksand Variable", ${SANS_FALLBACK}`,
      note: "Geometric rounded sans with a light feel.",
      category: "rounded-sans",
    },
    {
      id: "comfortaa",
      name: "Comfortaa",
      stack: `"Comfortaa Variable", ${SANS_FALLBACK}`,
      note: "Soft rounded sans with wide shapes.",
      category: "rounded-sans",
    },
    {
      id: "rubik",
      name: "Rubik",
      stack: `"Rubik Variable", ${SANS_FALLBACK}`,
      note: "Rounded grotesque with a sturdy rhythm.",
      category: "rounded-sans",
    },
    {
      id: "fredoka",
      name: "Fredoka",
      stack: `"Fredoka Variable", ${SANS_FALLBACK}`,
      note: "Playful rounded sans for cheerful titles.",
      category: "rounded-sans",
    },
    {
      id: "dosis",
      name: "Dosis",
      stack: `"Dosis Variable", ${SANS_FALLBACK}`,
      note: "Narrow rounded sans with an airy feel.",
      category: "rounded-sans",
    },
    {
      id: "lexend",
      name: "Lexend",
      stack: `"Lexend Variable", ${SANS_FALLBACK}`,
      note: "Research-driven sans for reading comfort.",
      category: "rounded-sans",
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
      id: "ibm-plex-sans",
      name: "IBM Plex Sans",
      stack: `"IBM Plex Sans Variable", ${SANS_FALLBACK}`,
      note: "Technical grotesque for clear drafts.",
      category: "sans-serif",
    },
    {
      id: "manrope",
      name: "Manrope",
      stack: `"Manrope Variable", ${SANS_FALLBACK}`,
      note: "Soft geometry for comfortable reading.",
      category: "sans-serif",
    },
    {
      id: "dm-sans",
      name: "DM Sans",
      stack: `"DM Sans Variable", ${SANS_FALLBACK}`,
      note: "Even grotesque for everyday notes.",
      category: "sans-serif",
    },
    {
      id: "plus-jakarta-sans",
      name: "Plus Jakarta Sans",
      stack: `"Plus Jakarta Sans Variable", ${SANS_FALLBACK}`,
      note: "Friendly shapes for long passages.",
      category: "sans-serif",
    },
    {
      id: "roboto-flex",
      name: "Roboto Flex",
      stack: `"Roboto Flex Variable", ${SANS_FALLBACK}`,
      note: "Flexible grotesque for any layout.",
      category: "sans-serif",
    },
    {
      id: "archivo",
      name: "Archivo",
      stack: `"Archivo Variable", ${SANS_FALLBACK}`,
      note: "Grotesque with room to breathe.",
      category: "sans-serif",
    },
    {
      id: "sora",
      name: "Sora",
      stack: `"Sora Variable", ${SANS_FALLBACK}`,
      note: "Futuristic geometry for modern notes.",
      category: "sans-serif",
    },
    {
      id: "montserrat",
      name: "Montserrat",
      stack: `"Montserrat Variable", ${SANS_FALLBACK}`,
      note: "Clean classic for structured text.",
      category: "sans-serif",
    },
    {
      id: "open-sans",
      name: "Open Sans",
      stack: `"Open Sans Variable", ${SANS_FALLBACK}`,
      note: "Neutral and legible at any size.",
      category: "sans-serif",
    },
    {
      id: "ubuntu-sans",
      name: "Ubuntu Sans",
      stack: `"Ubuntu Sans Variable", ${SANS_FALLBACK}`,
      note: "Rounded grotesque, easy on the eyes.",
      category: "sans-serif",
    },
    {
      id: "noto-sans",
      name: "Noto Sans",
      stack: `"Noto Sans Variable", ${SANS_FALLBACK}`,
      note: "Broad coverage for multilingual notes.",
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
      id: "roboto-serif",
      name: "Roboto Serif",
      stack: `"Roboto Serif Variable", ${SERIF_FALLBACK}`,
      note: "Even texture for comfortable long reads.",
      category: "serif",
    },
    {
      id: "eb-garamond",
      name: "EB Garamond",
      stack: `"EB Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Timeless texture for book-length drafts.",
      category: "serif",
    },
    {
      id: "lora",
      name: "Lora",
      stack: `"Lora Variable", ${SERIF_FALLBACK}`,
      note: "Brushed curves that read well on screens.",
      category: "serif",
    },
    {
      id: "merriweather",
      name: "Merriweather",
      stack: `"Merriweather Variable", ${SERIF_FALLBACK}`,
      note: "Open letterforms built for screens.",
      category: "serif",
    },
    {
      id: "playfair-display",
      name: "Playfair Display",
      stack: `"Playfair Display Variable", ${SERIF_FALLBACK}`,
      note: "High-contrast serif for expressive notes.",
      category: "serif",
    },
    {
      id: "cormorant-garamond",
      name: "Cormorant Garamond",
      stack: `"Cormorant Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Light, airy serif for elegant drafts.",
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
      id: "zilla-slab",
      name: "Zilla Slab",
      stack: `"Zilla Slab", ${SERIF_FALLBACK}`,
      note: "Friendly slab serif for readable drafts.",
      category: "slab-serif",
    },
    {
      id: "rokkitt",
      name: "Rokkitt",
      stack: `"Rokkitt Variable", ${SERIF_FALLBACK}`,
      note: "Rugged slab serif for notes with bite.",
      category: "slab-serif",
    },
    {
      id: "arvo",
      name: "Arvo",
      stack: `"Arvo", ${SERIF_FALLBACK}`,
      note: "Sturdy geometric slab for long reads.",
      category: "slab-serif",
    },
    {
      id: "bitter",
      name: "Bitter",
      stack: `"Bitter Variable", ${SERIF_FALLBACK}`,
      note: "Warm slab serif, comfortable over many pages.",
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
    {
      id: "cascadia-code",
      name: "Cascadia Code",
      stack: `"Cascadia Code Variable", ${MONO_FALLBACK}`,
      note: "Friendly coding face for readable drafts.",
      category: "monospace",
    },
    {
      id: "ubuntu-sans-mono",
      name: "Ubuntu Sans Mono",
      stack: `"Ubuntu Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Open shapes for comfortable long reads.",
      category: "monospace",
    },
    {
      id: "google-sans-code",
      name: "Google Sans Code",
      stack: `"Google Sans Code Variable", ${MONO_FALLBACK}`,
      note: "Round geometric mono for soft text.",
      category: "monospace",
    },
    {
      id: "inconsolata",
      name: "Inconsolata",
      stack: `"Inconsolata Variable", ${MONO_FALLBACK}`,
      note: "Narrow mono that fits more per line.",
      category: "monospace",
    },
    {
      id: "noto-sans-mono",
      name: "Noto Sans Mono",
      stack: `"Noto Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Even rhythm with broad language coverage.",
      category: "monospace",
    },
    {
      id: "nunito",
      name: "Nunito",
      stack: `"Nunito Variable", ${SANS_FALLBACK}`,
      note: "Warm and rounded for friendly drafts.",
      category: "rounded-sans",
    },
    {
      id: "quicksand",
      name: "Quicksand",
      stack: `"Quicksand Variable", ${SANS_FALLBACK}`,
      note: "Light geometric sans for airy notes.",
      category: "rounded-sans",
    },
    {
      id: "comfortaa",
      name: "Comfortaa",
      stack: `"Comfortaa Variable", ${SANS_FALLBACK}`,
      note: "Soft curves for comfortable reading.",
      category: "rounded-sans",
    },
    {
      id: "rubik",
      name: "Rubik",
      stack: `"Rubik Variable", ${SANS_FALLBACK}`,
      note: "Sturdy rounded sans for everyday text.",
      category: "rounded-sans",
    },
    {
      id: "fredoka",
      name: "Fredoka",
      stack: `"Fredoka Variable", ${SANS_FALLBACK}`,
      note: "Playful curves for cheerful notes.",
      category: "rounded-sans",
    },
    {
      id: "dosis",
      name: "Dosis",
      stack: `"Dosis Variable", ${SANS_FALLBACK}`,
      note: "Narrow and airy for compact paragraphs.",
      category: "rounded-sans",
    },
    {
      id: "lexend",
      name: "Lexend",
      stack: `"Lexend Variable", ${SANS_FALLBACK}`,
      note: "Built to reduce reading fatigue.",
      category: "rounded-sans",
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
      note: "Apple's screen serif, warm and compact. Needs an Apple device.",
      category: "serif",
    },
    {
      id: "roboto-serif",
      name: "Roboto Serif",
      stack: `"Roboto Serif Variable", ${SERIF_FALLBACK}`,
      note: "Rational serif for a calm source pane.",
      category: "serif",
    },
    {
      id: "eb-garamond",
      name: "EB Garamond",
      stack: `"EB Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Old-style serif for code with heritage.",
      category: "serif",
    },
    {
      id: "lora",
      name: "Lora",
      stack: `"Lora Variable", ${SERIF_FALLBACK}`,
      note: "Soft serif for a gentler source pane.",
      category: "serif",
    },
    {
      id: "merriweather",
      name: "Merriweather",
      stack: `"Merriweather Variable", ${SERIF_FALLBACK}`,
      note: "Screen-first serif, steady in code.",
      category: "serif",
    },
    {
      id: "playfair-display",
      name: "Playfair Display",
      stack: `"Playfair Display Variable", ${SERIF_FALLBACK}`,
      note: "Bold display serif for statement code.",
      category: "serif",
    },
    {
      id: "cormorant-garamond",
      name: "Cormorant Garamond",
      stack: `"Cormorant Garamond Variable", ${SERIF_FALLBACK}`,
      note: "Light serif for airy code.",
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
      id: "ibm-plex-sans",
      name: "IBM Plex Sans",
      stack: `"IBM Plex Sans Variable", ${SANS_FALLBACK}`,
      note: "Technical grotesque for a crisp source pane.",
      category: "sans-serif",
    },
    {
      id: "manrope",
      name: "Manrope",
      stack: `"Manrope Variable", ${SANS_FALLBACK}`,
      note: "Soft sans for a gentle source pane.",
      category: "sans-serif",
    },
    {
      id: "dm-sans",
      name: "DM Sans",
      stack: `"DM Sans Variable", ${SANS_FALLBACK}`,
      note: "Even grotesque, calm in code.",
      category: "sans-serif",
    },
    {
      id: "plus-jakarta-sans",
      name: "Plus Jakarta Sans",
      stack: `"Plus Jakarta Sans Variable", ${SANS_FALLBACK}`,
      note: "Wide, friendly sans for code.",
      category: "sans-serif",
    },
    {
      id: "roboto-flex",
      name: "Roboto Flex",
      stack: `"Roboto Flex Variable", ${SANS_FALLBACK}`,
      note: "Adaptable sans for dense code.",
      category: "sans-serif",
    },
    {
      id: "archivo",
      name: "Archivo",
      stack: `"Archivo Variable", ${SANS_FALLBACK}`,
      note: "Roomy grotesque for the source pane.",
      category: "sans-serif",
    },
    {
      id: "sora",
      name: "Sora",
      stack: `"Sora Variable", ${SANS_FALLBACK}`,
      note: "Futuristic sans with a sharp voice.",
      category: "sans-serif",
    },
    {
      id: "montserrat",
      name: "Montserrat",
      stack: `"Montserrat Variable", ${SANS_FALLBACK}`,
      note: "Clean geometric sans for code.",
      category: "sans-serif",
    },
    {
      id: "open-sans",
      name: "Open Sans",
      stack: `"Open Sans Variable", ${SANS_FALLBACK}`,
      note: "Neutral sans, steady everywhere.",
      category: "sans-serif",
    },
    {
      id: "ubuntu-sans",
      name: "Ubuntu Sans",
      stack: `"Ubuntu Sans Variable", ${SANS_FALLBACK}`,
      note: "Rounded Ubuntu sans for screens.",
      category: "sans-serif",
    },
    {
      id: "noto-sans",
      name: "Noto Sans",
      stack: `"Noto Sans Variable", ${SANS_FALLBACK}`,
      note: "Global coverage for any script.",
      category: "sans-serif",
    },
    {
      id: "roboto-slab",
      name: "Roboto Slab",
      stack: `"Roboto Slab Variable", ${SERIF_FALLBACK}`,
      note: "Slab serif with an even, typewriter feel.",
      category: "slab-serif",
    },
    {
      id: "zilla-slab",
      name: "Zilla Slab",
      stack: `"Zilla Slab", ${SERIF_FALLBACK}`,
      note: "Typewriter charm for a softer source pane.",
      category: "slab-serif",
    },
    {
      id: "rokkitt",
      name: "Rokkitt",
      stack: `"Rokkitt Variable", ${SERIF_FALLBACK}`,
      note: "Rugged slab serif with an editorial punch.",
      category: "slab-serif",
    },
    {
      id: "arvo",
      name: "Arvo",
      stack: `"Arvo", ${SERIF_FALLBACK}`,
      note: "Geometric slab, sturdy in code.",
      category: "slab-serif",
    },
    {
      id: "bitter",
      name: "Bitter",
      stack: `"Bitter Variable", ${SERIF_FALLBACK}`,
      note: "Bookish slab serif for code with warmth.",
      category: "slab-serif",
    },
    {
      id: "cascadia-code",
      name: "Cascadia Code",
      stack: `"Cascadia Code Variable", ${MONO_FALLBACK}`,
      note: "Microsoft's coding face with ligatures.",
      category: "monospace",
    },
    {
      id: "ubuntu-sans-mono",
      name: "Ubuntu Sans Mono",
      stack: `"Ubuntu Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Ubuntu mono with clear, open letterforms.",
      category: "monospace",
    },
    {
      id: "google-sans-code",
      name: "Google Sans Code",
      stack: `"Google Sans Code Variable", ${MONO_FALLBACK}`,
      note: "Geometric mono with a soft voice.",
      category: "monospace",
    },
    {
      id: "inconsolata",
      name: "Inconsolata",
      stack: `"Inconsolata Variable", ${MONO_FALLBACK}`,
      note: "Narrow mono built for code listings.",
      category: "monospace",
    },
    {
      id: "noto-sans-mono",
      name: "Noto Sans Mono",
      stack: `"Noto Sans Mono Variable", ${MONO_FALLBACK}`,
      note: "Noto mono with broad script coverage.",
      category: "monospace",
    },
    {
      id: "nunito",
      name: "Nunito",
      stack: `"Nunito Variable", ${SANS_FALLBACK}`,
      note: "Friendly rounded sans for a soft source pane.",
      category: "rounded-sans",
    },
    {
      id: "quicksand",
      name: "Quicksand",
      stack: `"Quicksand Variable", ${SANS_FALLBACK}`,
      note: "Light rounded sans for airy code.",
      category: "rounded-sans",
    },
    {
      id: "comfortaa",
      name: "Comfortaa",
      stack: `"Comfortaa Variable", ${SANS_FALLBACK}`,
      note: "Soft wide sans for relaxed code.",
      category: "rounded-sans",
    },
    {
      id: "rubik",
      name: "Rubik",
      stack: `"Rubik Variable", ${SANS_FALLBACK}`,
      note: "Sturdy rounded sans, steady in code.",
      category: "rounded-sans",
    },
    {
      id: "fredoka",
      name: "Fredoka",
      stack: `"Fredoka Variable", ${SANS_FALLBACK}`,
      note: "Playful rounded sans for cheerful code.",
      category: "rounded-sans",
    },
    {
      id: "dosis",
      name: "Dosis",
      stack: `"Dosis Variable", ${SANS_FALLBACK}`,
      note: "Narrow rounded sans that saves space.",
      category: "rounded-sans",
    },
    {
      id: "lexend",
      name: "Lexend",
      stack: `"Lexend Variable", ${SANS_FALLBACK}`,
      note: "Reading-optimized sans for long sessions.",
      category: "rounded-sans",
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

export function fontOptionsFor(role: FontRole, category: FontCategory): FontOption[] {
  return fontOptions[role]
    .filter((option) => option.category === category)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
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
