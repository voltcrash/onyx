import { readLocalStorage, writeLocalStorage } from "./browser-storage.js";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type ColorTheme = "ember" | "monochrome";

const STORAGE_KEY = "onyx-theme";
const COLOR_THEME_STORAGE_KEY = "onyx-color-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const THEME_COLOR: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  ember: { light: "#fbfaf7", dark: "#1b1b19" },
  monochrome: { light: "#ffffff", dark: "#000000" },
};

function paintThemeColor(colorTheme: ColorTheme, resolved: ResolvedTheme): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[colorTheme][resolved]);
}

export function readThemePreference(): ThemePreference {
  const stored = readLocalStorage(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function readColorTheme(): ColorTheme {
  const stored = readLocalStorage(COLOR_THEME_STORAGE_KEY);
  return stored === "ember" || stored === "monochrome" ? stored : "ember";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return globalThis.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  paintThemeColor(readColorTheme(), resolved);
  writeLocalStorage(STORAGE_KEY, preference);
  return resolved;
}

export function applyColorTheme(theme: ColorTheme): void {
  const root = document.documentElement;
  root.dataset.colorTheme = theme;
  paintThemeColor(theme, root.dataset.theme === "dark" ? "dark" : "light");
  writeLocalStorage(COLOR_THEME_STORAGE_KEY, theme);
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(DARK_QUERY);
  if (!query) return () => undefined;
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  if (preference === "light") return "dark";
  if (preference === "dark") return "system";
  return "light";
}
