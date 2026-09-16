import { describe, expect, it } from "vite-plus/test";

import themeTokens from "./theme-tokens.json" with { type: "json" };

type TokenMap = Record<string, string>;
type ThemeMode = "light" | "dark";

const defaults = themeTokens.defaults as Record<ThemeMode, TokenMap>;
const themes = themeTokens.themes as Record<string, Record<ThemeMode, TokenMap>>;
const syntaxTokenNames = Object.keys(defaults.light).filter((name) =>
  name.startsWith("--code-syntax-"),
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((channel) => parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Expected a six-digit hex color: ${hex}`);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function resolvedTokens(theme: Record<ThemeMode, TokenMap>, mode: ThemeMode): TokenMap {
  return {
    ...defaults.light,
    ...defaults[mode],
    ...theme.light,
    ...(mode === "dark" ? theme.dark : {}),
  };
}

describe("code syntax theme tokens", () => {
  it("keeps code text and syntax tokens at readable contrast in every theme", () => {
    for (const [themeId, theme] of Object.entries(themes)) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = resolvedTokens(theme, mode);
        const codeBackground = tokens["--code-bg"]!;

        expect(
          contrastRatio(tokens["--code-text"]!, codeBackground),
          `${themeId}/${mode} code text`,
        ).toBeGreaterThanOrEqual(4.5);

        for (const tokenName of syntaxTokenNames) {
          expect(
            contrastRatio(tokens[tokenName]!, codeBackground),
            `${themeId}/${mode} ${tokenName}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps the monochrome syntax ramp hue-free and visibly separated", () => {
    for (const mode of ["light", "dark"] as const) {
      const tokens = resolvedTokens(themes.monochrome!, mode);
      const colors = syntaxTokenNames.map((tokenName) => tokens[tokenName]!);
      const channels = colors.map((color) => color.slice(1, 3));

      expect(colors.every((color) => color.slice(1, 3) === color.slice(3, 5))).toBe(true);
      expect(colors.every((color) => color.slice(3, 5) === color.slice(5, 7))).toBe(true);
      expect(
        Math.max(...channels.map((channel) => parseInt(channel, 16))) -
          Math.min(...channels.map((channel) => parseInt(channel, 16))),
      ).toBeGreaterThanOrEqual(80);
    }
  });
});
