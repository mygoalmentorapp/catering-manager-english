/**
 * ShrinkProgressButton — Animated login button inspired by "Shrink Horizontal" effect.
 *
 * States:
 * 1. idle: Normal button with text
 * 2. loading: Button shrinks vertically (scaleY), text fades out, progress bar fills horizontally
 * 3. success: Button restores, shows checkmark briefly, then triggers onComplete
 *
 * Uses react-native-reanimated for smooth 60fps animations.
 */
import React, { useEffect, useCallback } from "react";
import { StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
  interpolate,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_SPACING, DS_RADIUS, DS_FONT, DS_WEIGHT, DS_SHADOW } from "@/lib/design-system";

type ButtonState = "idle" | "loading" | "success" | "error";

interface ShrinkProgressButtonProps {
  /** Current state of the button */
  state: ButtonState;
  /** Button label text (shown in idle state) */
  label: string;
  /** Called when the button is pressed (only in idle state) */
  onPress: () => void;
  /** Called after success animation completes */
  onSuccessComplete?: () => void;
}

const SHRINK_DURATION = 250;
const PROGRESS_DURATION = 2000;
const RESTORE_DURATION = 200;
const SUCCESS_HOLD = 600;

export function ShrinkProgressButton({
  state,
  label,
  onPress,
  onSuccessComplete,
}: ShrinkProgressButtonProps) {
  // Animation values
  const scaleY = useSharedValue(1);
  const textOpacity = useSharedValue(1);
  const progressWidth = useSharedValue(0); // 0 to 1
  const checkOpacity = useSharedValue(0);
  const progressOpacity = useSharedValue(0);

  const handleSuccessComplete = useCallback(() => {
    onSuccessComplete?.();
  }, [onSuccessComplete]);

  useEffect(() => {
    if (state === "loading") {
      // Phase 1: Shrink button + fade text + show progress
      textOpacity.value = withTiming(0, { duration: 150 });
      scaleY.value = withTiming(0.35, {
        duration: SHRINK_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      progressOpacity.value = withDelay(150, withTiming(1, { duration: 100 }));
      // Phase 2: Fill progress bar (indeterminate feel — fills to 90% then slows)
      progressWidth.value = withTiming(0.9, {
        duration: PROGRESS_DURATION,
        easing: Easing.out(Easing.quad),
      });
    } else if (state === "success") {
      // Complete the progress bar
      progressWidth.value = withTiming(1, { duration: 200 });
      // Then restore button
      progressOpacity.value = withDelay(200, withTiming(0, { duration: 150 }));
      scaleY.value = withDelay(
        300,
        withTiming(1, {
          duration: RESTORE_DURATION,
          easing: Easing.out(Easing.cubic),
        })
      );
      // Show checkmark
      checkOpacity.value = withDelay(400, withTiming(1, { duration: 200 }));
      // After hold, fade out check and call complete
      checkOpacity.value = withDelay(
        400 + SUCCESS_HOLD,
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished) {
            runOnJS(handleSuccessComplete)();
          }
        })
      );
    } else if (state === "error" || state === "idle") {
      // Restore everything
      scaleY.value = withTiming(1, { duration: RESTORE_DURATION });
      textOpacity.value = withTiming(1, { duration: 200 });
      progressWidth.value = withTiming(0, { duration: 150 });
      progressOpacity.value = withTiming(0, { duration: 150 });
      checkOpacity.value = withTiming(0, { duration: 100 });
    }
  }, [state]);

  // Animated styles
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progressWidth.value, [0, 1], [0, 100])}%` as any,
    opacity: progressOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
  }));

  const isDisabled = state === "loading" || state === "success";

  return (
    <Animated.View style={[s.buttonOuter, buttonStyle]}>
      <Animated.View
        style={[
          s.button,
          isDisabled && s.buttonDisabled,
        ]}
      >
        {/* Progress bar fill (behind content) */}
        <Animated.View style={[s.progressBar, progressBarStyle]} />

        {/* Button content */}
        <Animated.View
          style={[s.contentWrap]}
          // Use Pressable-like behavior via the outer touchable
        >
          {/* Text label */}
          <Animated.Text style={[s.buttonText, textStyle]}>
            {label}
          </Animated.Text>

          {/* Checkmark (success state) */}
          <Animated.View style={[s.checkWrap, checkStyle]}>
            <MaterialIcons name="check" size={24} color={DS_COLORS.white} />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Invisible pressable overlay */}
      {!isDisabled && (
        <Animated.View
          style={StyleSheet.absoluteFill}
          onTouchEnd={onPress}
        />
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  buttonOuter: {
    marginTop: DS_SPACING.sm,
    borderRadius: DS_RADIUS.md,
    overflow: "hidden",
  },
  button: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...DS_SHADOW.button,
  },
  buttonDisabled: {
    // Keep full opacity — the animation itself provides feedback
  },
  progressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: DS_RADIUS.md,
  },
  contentWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
  },
  buttonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
  },
  checkWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
