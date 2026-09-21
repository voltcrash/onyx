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
  "roboto-slab": () => import("@fontsource-variable/roboto-slab"),
  rokkitt: () => import("@fontsource-variable/rokkitt"),
  bitter: () => import("@fontsource-variable/bitter"),
  "cascadia-code": () => import("@fontsource-variable/cascadia-code"),
  "eb-garamond": () => import("@fontsource-variable/eb-garamond"),
  "ibm-plex-sans": () => import("@fontsource-variable/ibm-plex-sans"),
  manrope: () => import("@fontsource-variable/manrope"),
  lexend: () => import("@fontsource-variable/lexend"),
  nunito: () => import("@fontsource-variable/nunito"),
  quicksand: () => import("@fontsource-variable/quicksand"),
  rubik: () => import("@fontsource-variable/rubik"),
  fredoka: () => import("@fontsource-variable/fredoka"),
  "zilla-slab": () =>
    Promise.all([
      import("@fontsource/zilla-slab/400.css"),
      import("@fontsource/zilla-slab/500.css"),
      import("@fontsource/zilla-slab/600.css"),
      import("@fontsource/zilla-slab/700.css"),
    ]).then(() => undefined),
  arvo: () =>
    Promise.all([import("@fontsource/arvo/400.css"), import("@fontsource/arvo/700.css")]).then(
      () => undefined,
    ),
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
