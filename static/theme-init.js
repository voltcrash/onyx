(() => {
  const root = document.documentElement;
  const systemDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const storedMode = localStorage.getItem("onyx-theme");
    const preference =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system";
    const colorThemes = [
      "ember",
      "monochrome",
      "ocean",
      "phosphor",
      "graphite",
      "marigold",
      "espresso",
      "ink",
      "lavender",
      "burgundy",
      "rose",
      "solarized",
    ];
    const storedColorTheme = localStorage.getItem("onyx-color-theme");
    root.dataset.theme =
      preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
    root.dataset.themePreference = preference;
    root.dataset.colorTheme = colorThemes.includes(storedColorTheme ?? "")
      ? storedColorTheme
      : "monochrome";
  } catch {
    root.dataset.theme = systemDark ? "dark" : "light";
    root.dataset.themePreference = "system";
    root.dataset.colorTheme = "monochrome";
  }
})();
