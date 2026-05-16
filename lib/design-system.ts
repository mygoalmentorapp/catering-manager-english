import { StyleSheet, Platform } from "react-native";

// Default accent color (teal-green, matching app logo)
const DEFAULT_ACCENT = "#3AAFA9";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function makeAccentLight(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}

function makeAccentMedium(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

// ============ LIGHT & DARK PALETTES ============
const LIGHT_PALETTE = {
  background: "#F8F8FC",
  card: "#FFFFFF",
  textPrimary: "#1E1E2E",
  textSecondary: "#7A7A90",
  border: "#E8E8F0" };

const DARK_PALETTE = {
  background: "#121218",
  card: "#1C1C24",
  textPrimary: "#E8E8F0",
  textSecondary: "#9A9AB0",
  border: "#2A2A38" };

// ============ COLOR PALETTE ============
// accent, accentLight, accentMedium are mutable — updated via updateAccentColor()
// background, card, textPrimary, textSecondary, border are mutable — updated via updateScheme()
export const DS_COLORS: {
  primary: string;
  accent: string;
  background: string;
  card: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  error: string;
  warning: string;
  warningBg: string;
  warningText: string;
  success: string;
  white: string;
  accentLight: string;
  accentMedium: string;
  inputBg: string;
  inputFocusBg: string;
} = {
  primary: "#1E1E2E",
  accent: DEFAULT_ACCENT,
  background: DARK_PALETTE.background,
  card: DARK_PALETTE.card,
  textPrimary: DARK_PALETTE.textPrimary,
  textSecondary: DARK_PALETTE.textSecondary,
  border: DARK_PALETTE.border,
  error: "#EF4444",
  warning: "#FBBF24",
  warningBg: "#3D2F0A",
  warningText: "#FDE68A",
  success: "#4ADE80",
  white: "#FFFFFF",
  accentLight: makeAccentLight(DEFAULT_ACCENT).replace("0.08", "0.12"),
  accentMedium: makeAccentMedium(DEFAULT_ACCENT).replace("0.15", "0.22"),
  inputBg: "#22222A",
  inputFocusBg: "#2A2A34" };

/**
 * Update the accent color globally. Call this when the user changes their primary color.
 * All subsequent reads of DS_COLORS.accent / accentLight / accentMedium will reflect the new color.
 */
export function updateAccentColor(hex: string): void {
  DS_COLORS.accent = hex;
  DS_COLORS.accentLight = makeAccentLight(hex);
  DS_COLORS.accentMedium = makeAccentMedium(hex);
}

/**
 * Update the color scheme (light/dark) globally.
 * All subsequent reads of DS_COLORS.background / card / textPrimary / textSecondary / border will reflect the new scheme.
 */
export function updateScheme(scheme: "light" | "dark"): void {
  const palette = scheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  DS_COLORS.background = palette.background;
  DS_COLORS.card = palette.card;
  DS_COLORS.textPrimary = palette.textPrimary;
  DS_COLORS.textSecondary = palette.textSecondary;
  DS_COLORS.border = palette.border;
  // Warning/success colors for dark mode
  if (scheme === "dark") {
    DS_COLORS.warning = "#FBBF24";
    DS_COLORS.warningBg = "#3D2F0A";
    DS_COLORS.warningText = "#FDE68A";
    DS_COLORS.success = "#4ADE80";
    DS_COLORS.accentLight = makeAccentLight(DS_COLORS.accent).replace("0.08", "0.12");
    DS_COLORS.accentMedium = makeAccentMedium(DS_COLORS.accent).replace("0.15", "0.22");
    DS_COLORS.inputBg = "#22222A";
    DS_COLORS.inputFocusBg = "#2A2A34";
  } else {
    DS_COLORS.warning = "#D97706";
    DS_COLORS.warningBg = "#FEF3C7";
    DS_COLORS.warningText = "#92400E";
    DS_COLORS.success = "#22C55E";
    DS_COLORS.accentLight = makeAccentLight(DS_COLORS.accent);
    DS_COLORS.accentMedium = makeAccentMedium(DS_COLORS.accent);
    DS_COLORS.inputBg = "#FFFFFF";
    DS_COLORS.inputFocusBg = "#FFFFFF";
  }
}

// ============ TYPOGRAPHY ============
export const DS_FONT = {
  titleLarge: 22,
  titleCard: 18,
  body: 16,
  bodySmall: 14,
  caption: 12 } as const;

export const DS_WEIGHT = {
  bold: "700" as const,
  semibold: "600" as const,
  medium: "500" as const,
  regular: "400" as const };

// ============ SPACING ============
export const DS_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32 } as const;

// ============ RADIUS ============
export const DS_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999 } as const;

// ============ SHADOWS ============
export const DS_SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12 },
    android: {
      elevation: 3 },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12 } }),
  button: Platform.select({
    ios: {
      shadowColor: "#3AAFA9",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8 },
    android: {
      elevation: 4 },
    default: {
      shadowColor: "#3AAFA9",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8 } }),
  subtle: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6 },
    android: {
      elevation: 1 },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6 } }) } as const;

// ============ SHARED STYLES ============
export const DS_STYLES = StyleSheet.create({
  // Screen
  screen: {
    flex: 1,
    backgroundColor: DS_COLORS.background },

  // Card
  card: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    ...DS_SHADOW.card },

  // Header bar
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.background },

  // Title
  titleLarge: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },

  titleCard: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },

  body: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },

  bodySecondary: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "left" },

  bodySmall: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "left" },

  // Primary button — uses accent at create time; override with inline style for dynamic color
  buttonPrimary: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    paddingHorizontal: DS_SPACING.xxl,
    alignItems: "center",
    justifyContent: "center",
    ...DS_SHADOW.button },

  buttonPrimaryText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold },

  // Outline button
  buttonOutline: {
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.xxl,
    alignItems: "center",
    justifyContent: "center" },

  buttonOutlineText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold },

  // Text input
  textInput: {
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md + 2,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },

  // Section title
  sectionTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },

  // Icon button (small circular)
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: DS_RADIUS.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.accentLight } });
