import type { FontChoices, FontRole } from "./fonts.js";

type FontLoader = () => Promise<unknown>;

const fontLoaders: Record<string, FontLoader> = {
  inter: () => import("@fontsource-variable/inter"),
  newsreader: () => import("@fontsource-variable/newsreader"),
  fraunces: () => import("@fontsource-variable/fraunces"),
  literata: () => import("@fontsource-variable/literata"),
  "source-serif": () => import("@fontsource-variable/source-serif-4"),
  geist: () => import("@fontsource-variable/geist"),
  "space-grotesk": () => import("@fontsource-variable/space-grotesk"),
  "geist-mono": () => import("@fontsource-variable/geist-mono"),
  "jetbrains-mono": () => import("@fontsource-variable/jetbrains-mono"),
  "fira-code": () => import("@fontsource-variable/fira-code"),
  "source-code-pro": () => import("@fontsource-variable/source-code-pro"),
  "roboto-mono": () => import("@fontsource-variable/roboto-mono"),
  "roboto-slab": () => import("@fontsource-variable/roboto-slab"),
};

const loadedFonts = new Map<string, Promise<void>>();

export function loadFont(id: string): Promise<void> {
  const loader = fontLoaders[id];
  if (!loader) return Promise.resolve();
  const existing = loadedFonts.get(id);
  if (existing) return existing;
  const load = loader().then(() => undefined);
  loadedFonts.set(id, load);
  return load;
}

export function loadFontChoices(choices: FontChoices): Promise<void> {
  return Promise.all(
    (Object.keys(choices) as FontRole[]).map((role) => loadFont(choices[role])),
  ).then(() => undefined);
}
