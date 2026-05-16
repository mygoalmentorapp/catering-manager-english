/**
 * FillProgressButton — Animated button with RTL fill effect and dual-layer text.
 *
 * States:
 * 1. idle: Purple background, white text (e.g. "Sign in")
 * 2. loading: White background with purple border, text changes (e.g. "Starting connection"),
 *    purple fill sweeps from right to left. Dual-layer text: purple on white area,
 *    white on filled purple area.
 * 3. success: Fill completes to 100%, fully purple with white text.
 * 4. error: Resets back to idle state.
 *
 * Uses react-native-reanimated for smooth 60fps animations.
 */
import React, { useEffect, useCallback } from "react";
import { StyleSheet, Pressable, I18nManager } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing } from "react-native-reanimated";
import { DS_COLORS, DS_SPACING, DS_RADIUS, DS_FONT, DS_WEIGHT, DS_SHADOW } from "@/lib/design-system";

type ButtonState = "idle" | "loading" | "success" | "error";

interface FillProgressButtonProps {
  /** Current state of the button */
  state: ButtonState;
  /** Button label text shown in idle state (e.g. "Sign in") */
  label: string;
  /** Text shown during loading state (e.g. "Starting connection") */
  loadingLabel: string;
  /** Called when the button is pressed (only in idle state) */
  onPress: () => void;
  /** Called after success animation completes */
  onSuccessComplete?: () => void;
}

// Animation durations
const TRANSITION_TO_LOADING = 250; // idle → loading (bg change + border appear)
const FILL_DURATION = 2500; // Progress fill to 90%
const FILL_COMPLETE = 300; // 90% → 100% on success
const SUCCESS_HOLD = 400; // Hold at 100% before calling complete

export function FillProgressButton({
  state,
  label,
  loadingLabel,
  onPress,
  onSuccessComplete }: FillProgressButtonProps) {
  // fillProgress: 0 = empty (white bg), 1 = fully filled (purple bg)
  const fillProgress = useSharedValue(0);
  // phase: 0 = idle (purple bg), 1 = loading/filling (white bg + fill)
  const phase = useSharedValue(0);

  const handleSuccessComplete = useCallback(() => {
    onSuccessComplete?.();
  }, [onSuccessComplete]);

  useEffect(() => {
    if (state === "loading") {
      // Transition to loading: white bg with purple border
      phase.value = withTiming(1, { duration: TRANSITION_TO_LOADING });
      fillProgress.value = 0;
      // Start filling to 90%
      fillProgress.value = withDelay(
        TRANSITION_TO_LOADING,
        withTiming(0.9, {
          duration: FILL_DURATION,
          easing: Easing.out(Easing.quad) })
      );
    } else if (state === "success") {
      // Complete the fill to 100%
      fillProgress.value = withTiming(1, {
        duration: FILL_COMPLETE,
        easing: Easing.out(Easing.cubic) });
      // After fill completes + hold, transition back to solid purple (phase=0)
      phase.value = withDelay(
        FILL_COMPLETE + SUCCESS_HOLD,
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished) {
            runOnJS(handleSuccessComplete)();
          }
        })
      );
    } else if (state === "error" || state === "idle") {
      // Reset to idle
      phase.value = withTiming(0, { duration: 200 });
      fillProgress.value = withTiming(0, { duration: 200 });
    }
  }, [state]);

  // Outer button style: interpolate between solid purple (phase=0) and white+border (phase=1)
  const buttonStyle = useAnimatedStyle(() => {
    const p = phase.value;
    return {
      backgroundColor: p > 0.5 ? "#FFFFFF" : DS_COLORS.accent,
      borderColor: DS_COLORS.accent,
      borderWidth: 2 };
  });

  // Fill overlay: purple rectangle that grows from right to left
  const fillStyle = useAnimatedStyle(() => {
    return {
      width: `${fillProgress.value * 100}%` as any,
      opacity: phase.value, // only visible during loading phase
    };
  });

  // Bottom text layer (purple text on white background) — visible where fill hasn't reached
  const purpleTextStyle = useAnimatedStyle(() => {
    return {
      opacity: phase.value, // visible during loading
    };
  });

  // Top text layer (white text) — clipped by the fill overlay
  // This is inside the fill view with overflow:hidden, so it's only visible
  // where the purple fill has reached.

  // Idle text (white on purple) — visible when not in loading phase
  const idleTextStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - phase.value };
  });

  const isDisabled = state === "loading" || state === "success";
  const displayText = state === "loading" || state === "success" ? loadingLabel : label;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.pressable,
        pressed && !isDisabled && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Animated.View style={[s.button, buttonStyle]}>
        {/* Layer 1: Purple text on white background (visible during loading) */}
        <Animated.View style={[s.textLayer, purpleTextStyle]} pointerEvents="none">
          <Animated.Text style={[s.text, { color: DS_COLORS.accent }]}>
            {displayText}
          </Animated.Text>
        </Animated.View>

        {/* Layer 2: Purple fill overlay (grows from right to left) */}
        <Animated.View style={[s.fillOverlay, fillStyle]} pointerEvents="none">
          {/* White text inside fill — positioned to match the full button width */}
          <Animated.Text style={[s.text, s.fillText, { color: "#FFFFFF" }]}>
            {displayText}
          </Animated.Text>
        </Animated.View>

        {/* Layer 3: Idle text (white on purple, visible when not loading) */}
        <Animated.View style={[s.textLayer, idleTextStyle]} pointerEvents="none">
          <Animated.Text style={[s.text, { color: "#FFFFFF" }]}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const BUTTON_HEIGHT = 52;

const s = StyleSheet.create({
  pressable: {
    marginTop: DS_SPACING.sm },
  button: {
    height: BUTTON_HEIGHT,
    borderRadius: DS_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...DS_SHADOW.button },
  textLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center" },
  text: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    textAlign: "center" },
  fillOverlay: {
    position: "absolute",
    // RTL: fill from right side. In RTL mode, right:0 is the start side.
    // We use right:0 so it grows from the right edge toward the left.
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: DS_COLORS.accent,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center" },
  fillText: {
    // The text inside the fill overlay needs to be positioned so it aligns
    // with the full-width text underneath. We use a fixed width matching
    // the button and center it. Since the fill overlay clips from the right,
    // only the portion of text over the purple area is visible.
    position: "absolute",
    textAlign: "center",
    // Width will be set to match button width — we use a large value
    // and rely on the parent's overflow:hidden to clip correctly.
    width: 1000,
    // Center the text: the fill grows from right:0, so we need the text
    // to be anchored to the right edge of the button.
    right: 0 } });
