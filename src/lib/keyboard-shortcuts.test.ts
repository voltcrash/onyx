import { describe, expect, it } from "vite-plus/test";
import {
  detectPrimaryModifier,
  formatShortcut,
  shortcutMatchesEvent,
} from "./keyboard-shortcuts.js";

describe("platform keyboard shortcuts", () => {
  it("uses Command on Apple platforms", () => {
    const primaryModifier = detectPrimaryModifier({
      platform: "MacIntel",
      userAgent: "",
    });

    expect(primaryModifier).toBe("meta");
    expect(
      formatShortcut({ key: "k", primary: true, alt: true, shift: true }, primaryModifier),
    ).toBe("⌘ ⌥ ⇧ K");
  });

  it("uses Control on Windows and Linux", () => {
    for (const platform of ["Win32", "Linux x86_64"]) {
      const primaryModifier = detectPrimaryModifier({ platform, userAgent: "" });
      const event = {
        key: "k",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent;

      expect(primaryModifier).toBe("control");
      expect(formatShortcut({ key: "k", primary: true, shift: true }, primaryModifier)).toBe(
        "Ctrl + Shift + K",
      );
      expect(formatShortcut({ key: "k", alt: true }, primaryModifier)).toBe("Alt + K");
      expect(shortcutMatchesEvent({ key: "k", primary: true }, event, primaryModifier)).toBe(true);
    }
  });
});
