import { describe, it, expect, vi } from "vitest";

// Mock react-native since design-system.ts imports StyleSheet and Platform
vi.mock("react-native", () => ({
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Platform: {
    select: (opts: any) => opts.default ?? opts.ios,
    OS: "web",
  },
}));

import { DS_COLORS, updateAccentColor, updateScheme } from "../design-system";

describe("Dynamic accent color", () => {
  const ORIGINAL_ACCENT = DS_COLORS.accent;

  it("updateAccentColor mutates DS_COLORS.accent", () => {
    updateAccentColor("#FF0000");
    expect(DS_COLORS.accent).toBe("#FF0000");
    updateAccentColor(ORIGINAL_ACCENT);
  });

  it("updateAccentColor derives accentLight as rgba with 0.08 opacity", () => {
    updateAccentColor("#FF0000");
    expect(DS_COLORS.accentLight).toBe("rgba(255, 0, 0, 0.08)");
    updateAccentColor(ORIGINAL_ACCENT);
  });

  it("updateAccentColor derives accentMedium as rgba with 0.15 opacity", () => {
    updateAccentColor("#FF0000");
    expect(DS_COLORS.accentMedium).toBe("rgba(255, 0, 0, 0.15)");
    updateAccentColor(ORIGINAL_ACCENT);
  });

  it("updateAccentColor handles various hex colors", () => {
    const colors = [
      { hex: "#6C63FF", r: 108, g: 99, b: 255 },
      { hex: "#2196F3", r: 33, g: 150, b: 243 },
      { hex: "#4CAF50", r: 76, g: 175, b: 80 },
      { hex: "#000000", r: 0, g: 0, b: 0 },
    ];

    for (const c of colors) {
      updateAccentColor(c.hex);
      expect(DS_COLORS.accent).toBe(c.hex);
      expect(DS_COLORS.accentLight).toBe(`rgba(${c.r}, ${c.g}, ${c.b}, 0.08)`);
      expect(DS_COLORS.accentMedium).toBe(`rgba(${c.r}, ${c.g}, ${c.b}, 0.15)`);
    }

    updateAccentColor(ORIGINAL_ACCENT);
  });

  it("DS_COLORS object is mutable (not frozen)", () => {
    expect(Object.isFrozen(DS_COLORS)).toBe(false);
  });
});

describe("Dark mode scheme switching", () => {
  it("updateScheme('dark') sets dark palette colors", () => {
    updateScheme("dark");
    expect(DS_COLORS.background).toBe("#121218");
    expect(DS_COLORS.card).toBe("#1C1C24");
    expect(DS_COLORS.textPrimary).toBe("#E8E8F0");
    expect(DS_COLORS.textSecondary).toBe("#9A9AB0");
    expect(DS_COLORS.border).toBe("#2A2A38");
  });

  it("updateScheme('light') restores light palette colors", () => {
    updateScheme("light");
    expect(DS_COLORS.background).toBe("#F8F8FC");
    expect(DS_COLORS.card).toBe("#FFFFFF");
    expect(DS_COLORS.textPrimary).toBe("#1E1E2E");
    expect(DS_COLORS.textSecondary).toBe("#7A7A90");
    expect(DS_COLORS.border).toBe("#E8E8F0");
  });

  it("updateScheme does not affect accent color", () => {
    const originalAccent = DS_COLORS.accent;
    updateScheme("dark");
    expect(DS_COLORS.accent).toBe(originalAccent);
    updateScheme("light");
    expect(DS_COLORS.accent).toBe(originalAccent);
  });

  it("dark mode adjusts accentLight opacity", () => {
    updateAccentColor("#FF0000");
    updateScheme("dark");
    expect(DS_COLORS.accentLight).toContain("0.12");
    updateScheme("light");
    expect(DS_COLORS.accentLight).toContain("0.08");
    updateAccentColor("#3AAFA9"); // restore
  });
});
