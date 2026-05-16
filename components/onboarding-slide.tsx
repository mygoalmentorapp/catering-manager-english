import React from "react";
import { View, Text, StyleSheet, Dimensions, Image, ImageSourcePropType } from "react-native";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING } from "@/lib/design-system";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingSlideProps {
  /** Title text (Hebrew) */
  title: string;
  /** Description text (Hebrew) */
  description: string;
  /**
   * Visual content for the slide. Can be:
   * - A React element (placeholder icon/illustration)
   * - An image source (for future real screenshots)
   */
  visual: React.ReactNode | ImageSourcePropType;
  /** Accent color for the visual background circle */
  accentColor?: string;
}

export function OnboardingSlide({ title, description, visual, accentColor }: OnboardingSlideProps) {
  const isImageSource = visual && typeof visual === "object" && !React.isValidElement(visual);

  return (
    <View style={s.slide}>
      {/* Visual Area — fixed height container for easy screenshot swap */}
      <View style={s.visualContainer}>
        {isImageSource ? (
          <Image
            source={visual as ImageSourcePropType}
            style={s.screenshotImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[s.iconCircle, accentColor ? { backgroundColor: accentColor + "15" } : undefined]}>
            {visual as React.ReactNode}
          </View>
        )}
      </View>

      {/* Text Area */}
      <View style={s.textContainer}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.description}>{description}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl },
  visualContainer: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32 },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center" },
  screenshotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 16 },
  textContainer: {
    alignItems: "center",
    paddingHorizontal: DS_SPACING.lg },
  title: {
    fontSize: 24,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.md },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24 } });
