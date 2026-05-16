import { useMemo } from "react";
import { useData } from "@/lib/data-context";

/**
 * Returns the user-selected accent/primary color and derived variants.
 * Use this instead of DS_COLORS.accent for dynamic theming.
 */
export function useAccentColor() {
  const { primaryColor } = useData();

  return useMemo(() => {
    const accent = primaryColor;
    // Parse hex to RGB for alpha variants
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);

    return {
      accent,
      accentLight: `rgba(${r}, ${g}, ${b}, 0.08)`,
      accentMedium: `rgba(${r}, ${g}, ${b}, 0.15)` };
  }, [primaryColor]);
}
