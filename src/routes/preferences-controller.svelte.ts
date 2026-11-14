import {
  applyFontChoices,
  defaultFontCategories,
  defaultFontChoices,
  fontCategory,
  fontOptionsFor,
  readFontCategories,
  readFontChoices,
  writeFontCategory,
  type FontCategories,
  type FontCategory,
  type FontChoices,
  type FontRole,
} from "#lib/fonts.ts";
import { loadFont } from "#lib/font-loader.ts";
import {
  defaultKeyboardShortcuts,
  formatShortcut,
  writeKeyboardShortcuts,
  type KeyboardShortcut,
  type KeyboardShortcuts,
  type PrimaryModifier,
  type ShortcutAction,
} from "#lib/keyboard-shortcuts.ts";
import {
  applyColorTheme,
  applyTheme,
  type ColorTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "#lib/theme.ts";

export function createPreferencesController() {
  let theme = $state<ThemePreference>("system");

  let resolvedTheme = $state<ResolvedTheme>("light");

  let colorTheme = $state<ColorTheme>("ember");

  let fonts = $state<FontChoices>({ ...defaultFontChoices });

  let fontCategories = $state<FontCategories>({ ...defaultFontCategories });

  let shortcuts = $state<KeyboardShortcuts>(structuredClone(defaultKeyboardShortcuts));

  let primaryModifier = $state<PrimaryModifier>("meta");

  let fontRevision = 0;

  function applyStoredFontChoices(): void {
    const storedFonts = readFontChoices();
    fontRevision += 1;
    const revision = fontRevision;
    fonts = storedFonts;
    fontCategories = readFontCategories(storedFonts);
    const customRoles = (Object.keys(storedFonts) as FontRole[]).filter(
      (role) => storedFonts[role] !== defaultFontChoices[role],
    );
    applyFontChoices(storedFonts);
    if (customRoles.length === 0) return;
    void Promise.all(customRoles.map((role) => loadFont(storedFonts[role]))).then(
      () => {
        if (fontRevision === revision) applyFontChoices(storedFonts);
      },
      () => {
        if (fontRevision === revision) applyFontChoices(storedFonts);
      },
    );
  }

  function setFont(role: FontRole, id: string): void {
    fontRevision += 1;
    const revision = fontRevision;
    const nextFonts = { ...fonts, [role]: id };
    fonts = nextFonts;
    const nextCategories = { ...fontCategories, [role]: fontCategory(role, id) };
    fontCategories = nextCategories;
    writeFontCategory(role, nextCategories[role]!);
    applyFontChoices(nextFonts);
    if (id === defaultFontChoices[role]) {
      return;
    }
    void loadFont(id).then(
      () => {
        if (fontRevision === revision) applyFontChoices(nextFonts);
      },
      () => {
        if (fontRevision === revision) applyFontChoices(nextFonts);
      },
    );
  }

  function resetFonts(): void {
    fontRevision += 1;
    fonts = { ...defaultFontChoices };
    fontCategories = { ...defaultFontCategories };
    for (const role of Object.keys(fontCategories) as FontRole[]) {
      writeFontCategory(role, fontCategories[role]!);
    }
    applyFontChoices(fonts);
  }

  function setFontCategory(role: FontRole, category: FontCategory): void {
    if (fontCategories[role] === category) return;
    fontRevision += 1;
    fontCategories = { ...fontCategories, [role]: category };
    writeFontCategory(role, category);
    const candidates = fontOptionsFor(role, category);
    const current = fonts[role]!;
    const nextId = candidates.some((option) => option.id === current)
      ? current
      : (candidates[0]?.id ?? current);
    if (nextId !== current) setFont(role, nextId);
  }

  function shortcutLabel(action: ShortcutAction): string | undefined {
    const shortcut = shortcuts[action];
    return shortcut ? formatShortcut(shortcut, primaryModifier) : undefined;
  }

  function setShortcut(action: ShortcutAction, shortcut: KeyboardShortcut | null): void {
    shortcuts = { ...shortcuts, [action]: shortcut };
    writeKeyboardShortcuts(shortcuts);
  }

  function resetShortcuts(): void {
    shortcuts = structuredClone(defaultKeyboardShortcuts);
    writeKeyboardShortcuts(shortcuts);
  }

  function setTheme(preference: ThemePreference): void {
    theme = preference;
    resolvedTheme = applyTheme(preference);
  }

  function setColorTheme(nextTheme: ColorTheme): void {
    colorTheme = nextTheme;
    applyColorTheme(nextTheme);
  }
  return {
    setFont,
    resetFonts,
    setFontCategory,
    shortcutLabel,
    setShortcut,
    resetShortcuts,
    setTheme,
    setColorTheme,
    applyStoredFontChoices,
    get theme() {
      return theme;
    },
    set theme(value) {
      theme = value;
    },
    get resolvedTheme() {
      return resolvedTheme;
    },
    set resolvedTheme(value) {
      resolvedTheme = value;
    },
    get colorTheme() {
      return colorTheme;
    },
    set colorTheme(value) {
      colorTheme = value;
    },
    get fonts() {
      return fonts;
    },
    set fonts(value) {
      fonts = value;
    },
    get fontCategories() {
      return fontCategories;
    },
    set fontCategories(value) {
      fontCategories = value;
    },
    get shortcuts() {
      return shortcuts;
    },
    set shortcuts(value) {
      shortcuts = value;
    },
    get primaryModifier() {
      return primaryModifier;
    },
    set primaryModifier(value) {
      primaryModifier = value;
    },
    get fontRevision() {
      return fontRevision;
    },
    set fontRevision(value) {
      fontRevision = value;
    },
  };
}
