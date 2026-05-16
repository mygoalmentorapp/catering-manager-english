import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useData } from "@/lib/data-context";
import { useThemeContext } from "@/lib/theme-provider";
import { updateScheme, DS_COLORS } from "@/lib/design-system";

/**
 * Wraps the Stack navigator with a `key` that changes when the user picks a new
 * primary/accent color or switches dark/light mode.  Changing the key forces React
 * to unmount and remount the entire navigator tree, which causes every screen's
 * module-level `StyleSheet.create()` to re-execute and pick up the freshly-mutated
 * `DS_COLORS` values.
 *
 * IMPORTANT: updateScheme() must run BEFORE the key changes so that when React
 * remounts the tree, DS_COLORS already has the new palette values.
 */
export function ColorKeyNavigator() {
  const { colorKey } = useData();
  const { colorScheme } = useThemeContext();

  // Update DS_COLORS SYNCHRONOUSLY before render so that when the key-based
  // remount happens, all style factories read the correct palette.
  // Using useMemo ensures this runs during render (before commit), not after.
  const schemeKey = React.useMemo(() => {
    updateScheme(colorScheme);
    return colorScheme;
  }, [colorScheme]);

  return (
    <React.Fragment key={`color-${colorKey}-${schemeKey}`}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: DS_COLORS.background }, animation: "ios_from_right" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/signup" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth/forgot-password" options={{ presentation: "card" }} />
        <Stack.Screen name="beta-intro" options={{ gestureEnabled: false }} />
        <Stack.Screen name="feedback" options={{ presentation: "card" }} />
        <Stack.Screen name="products" options={{ presentation: "card" }} />
        <Stack.Screen name="order" options={{ presentation: "card" }} />
        <Stack.Screen name="orders" options={{ presentation: "card" }} />
        <Stack.Screen name="shopping-list" options={{ presentation: "card" }} />
        <Stack.Screen name="shopping-list-edit" options={{ presentation: "card" }} />
        <Stack.Screen name="shopping-list-view" options={{ presentation: "card" }} />
        <Stack.Screen name="shopping-lists" options={{ presentation: "card" }} />
        <Stack.Screen name="demo-order-detail" options={{ presentation: "card" }} />
        <Stack.Screen name="about" options={{ presentation: "card" }} />
        <Stack.Screen name="confirm" options={{ gestureEnabled: false }} />
        <Stack.Screen name="oauth/callback" />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </React.Fragment>
  );
}
