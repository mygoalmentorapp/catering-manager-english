/**
 * DotsButton — Premium auth button with animated dots loading.
 *
 * States:
 * 1. idle: Teal-green background, white text (e.g. "Sign in")
 * 2. loading: Same background, text changes to loadingLabel + animated dots
 *    cycling: "Connecting." → "Connecting.." → "Connecting..."
 * 3. success: Same appearance as loading (auth navigation handles transition)
 * 4. error: Resets back to idle
 *
 * No background color change, no shrinking, no spinners.
 * Clean and elegant.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { StyleSheet, Pressable, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { DS_SPACING, DS_RADIUS, DS_FONT, DS_WEIGHT, DS_SHADOW } from "@/lib/design-system";

type ButtonState = "idle" | "loading" | "success" | "error";

interface DotsButtonProps {
  /** Current state of the button */
  state: ButtonState;
  /** Button label text shown in idle state (e.g. "Sign in") */
  label: string;
  /** Text shown during loading state before dots (e.g. "Connecting") */
  loadingLabel: string;
  /** Called when the button is pressed (only in idle/error state) */
  onPress: () => void;
}

// The teal-green from the app logo
const BUTTON_GREEN = "#3AAFA9";
const BUTTON_GREEN_PRESSED = "#329E98";

const DOT_INTERVAL = 500; // ms between dot changes

export function DotsButton({
  state,
  label,
  loadingLabel,
  onPress }: DotsButtonProps) {
  const [dotCount, setDotCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated opacity for text transition
  const textOpacity = useSharedValue(1);

  // Start/stop dot animation based on state
  useEffect(() => {
    if (state === "loading" || state === "success") {
      // Brief fade for text change
      textOpacity.value = withTiming(0, { duration: 100, easing: Easing.out(Easing.cubic) }, () => {
        textOpacity.value = withTiming(1, { duration: 150 });
      });

      setDotCount(0);
      intervalRef.current = setInterval(() => {
        setDotCount((prev) => (prev + 1) % 4); // 0,1,2,3 → "", ".", "..", "..."
      }, DOT_INTERVAL);
    } else {
      // Reset
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDotCount(0);
      textOpacity.value = withTiming(1, { duration: 150 });
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value }));

  const isLoading = state === "loading" || state === "success";
  const isDisabled = isLoading;

  // Build display text
  const dots = ".".repeat(dotCount);
  // Pad with invisible dots to prevent text width jumping
  const invisibleDots = "\u00A0".repeat(3 - dotCount);
  const displayText = isLoading ? `${loadingLabel}${dots}${invisibleDots}` : label;

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={isDisabled ? undefined : handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.button,
        pressed && !isDisabled && { backgroundColor: BUTTON_GREEN_PRESSED },
        isLoading && { opacity: 0.9 },
      ]}
    >
      <Animated.Text style={[s.buttonText, textStyle]}>
        {displayText}
      </Animated.Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    backgroundColor: BUTTON_GREEN,
    borderRadius: DS_RADIUS.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: DS_SPACING.sm,
    ...DS_SHADOW.button },
  buttonText: {
    color: "#FFFFFF",
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    textAlign: "center" } });
