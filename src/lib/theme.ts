export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "onyx-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#fbfaf7",
  dark: "#1b1b19",
};

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private browsing modes can reject storage access; fall back to the system theme.
  }
  return "system";
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
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[resolved]);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Persisting is best effort: the theme still applies for this session.
  }
  return resolved;
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(DARK_QUERY);
  if (!query) return () => undefined;
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return preference === "system" ? "light" : preference === "light" ? "dark" : "system";
}
