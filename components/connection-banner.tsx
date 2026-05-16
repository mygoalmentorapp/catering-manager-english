/**
 * ConnectionBanner — Smart global connectivity status banner.
 *
 * Positioning:
 * - Absolute positioned at top of screen, below status bar (uses SafeArea insets.top)
 * - Sits between status bar and header/title
 * - Does NOT push content down — overlays on top of the screen content
 * - Compact height (28px) so it doesn't cover too much of the header area
 *
 * Behavior:
 * - Hidden when everything is fine (99% of the time)
 * - Slides down from top when there's a problem (offline / server unreachable)
 * - Shows progressive states:
 *   "Offline — X changes pending" → "Syncing..." → "Synced! ✓" (fades out after 2.5s)
 * - Uses semantic colors (red/orange/blue/green) that are NOT affected by user's brand color
 *
 * Semantic colors (locked, not user-customizable):
 * - Red: No internet
 * - Orange: Server unreachable / reconnecting
 * - Blue: Syncing pending operations
 * - Green: Just synced (auto-hides after 2.5s)
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNetwork } from "@/lib/network-context";
import { useData } from "@/lib/data-context";

// ============ TYPES ============

type BannerState = "hidden" | "offline" | "offline-pending" | "server-unreachable" | "syncing" | "reconnected";

interface BannerConfig {
  bgColor: string;
  textColor: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  text: string;
}

// ============ SEMANTIC COLORS (locked) ============

const BANNER_CONFIGS: Record<Exclude<BannerState, "hidden">, BannerConfig> = {
  offline: {
    bgColor: "#FEF2F2",
    textColor: "#DC2626",
    icon: "wifi-off",
    text: "No internet connection" },
  "offline-pending": {
    bgColor: "#FEF2F2",
    textColor: "#DC2626",
    icon: "wifi-off",
    text: "Offline — changes pending sync" },
  "server-unreachable": {
    bgColor: "#FFFBEB",
    textColor: "#D97706",
    icon: "cloud-off",
    text: "No server connection • Trying to connect..." },
  syncing: {
    bgColor: "#EFF6FF",
    textColor: "#2563EB",
    icon: "sync",
    text: "Syncing changes..." },
  reconnected: {
    bgColor: "#F0FDF4",
    textColor: "#16A34A",
    icon: "check-circle",
    text: "Synced! ✓" } };

// ============ CONSTANTS ============

const BANNER_CONTENT_HEIGHT = 28;
const SLIDE_DURATION = 200;
const RECONNECTED_DISPLAY_MS = 2500;

// ============ COMPONENT ============

export function ConnectionBanner() {
  const { isOnline, isServerReachable, isConnected } = useNetwork();
  const { syncStatus } = useData();
  const insets = useSafeAreaInsets();

  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [displayedState, setDisplayedState] = useState<BannerState>("hidden");
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDisconnectedRef = useRef(false);
  const wasSyncingRef = useRef(false);

  // Determine current banner state from network + sync status
  useEffect(() => {
    let newState: BannerState = "hidden";

    if (!isOnline) {
      newState = syncStatus.pendingCount > 0 ? "offline-pending" : "offline";
    } else if (!isServerReachable) {
      newState = "server-unreachable";
    } else if (syncStatus.isSyncing) {
      newState = "syncing";
    }

    // Track if we were disconnected or syncing
    if (newState === "offline" || newState === "offline-pending" || newState === "server-unreachable") {
      wasDisconnectedRef.current = true;
    }
    if (newState === "syncing") {
      wasSyncingRef.current = true;
    }

    // If we just came back online or finished syncing, show "reconnected" briefly
    if (newState === "hidden" && (wasDisconnectedRef.current || wasSyncingRef.current)) {
      wasDisconnectedRef.current = false;
      wasSyncingRef.current = false;
      setBannerState("reconnected");
    } else {
      setBannerState(newState);
    }
  }, [isOnline, isServerReachable, syncStatus.isSyncing, syncStatus.pendingCount]);

  // Handle animation and auto-hide for "reconnected"
  useEffect(() => {
    if (reconnectedTimerRef.current) {
      clearTimeout(reconnectedTimerRef.current);
      reconnectedTimerRef.current = null;
    }

    if (bannerState === "hidden") {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true }).start(() => {
        setDisplayedState("hidden");
      });
    } else {
      setDisplayedState(bannerState);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: SLIDE_DURATION,
        useNativeDriver: true }).start();

      if (bannerState === "reconnected") {
        reconnectedTimerRef.current = setTimeout(() => {
          setBannerState("hidden");
        }, RECONNECTED_DISPLAY_MS);
      }
    }

    return () => {
      if (reconnectedTimerRef.current) {
        clearTimeout(reconnectedTimerRef.current);
      }
    };
  }, [bannerState, slideAnim]);

  // Don't render anything if fully hidden
  if (displayedState === "hidden" && bannerState === "hidden") {
    return null;
  }

  const configKey = displayedState === "hidden" ? "offline" : displayedState;
  const config = BANNER_CONFIGS[configKey];

  // Dynamic text for offline-pending with count
  let displayText = config.text;
  if (displayedState === "offline-pending" && syncStatus.pendingCount > 0) {
    displayText = `Offline — ${syncStatus.pendingCount} changes pending sync`;
  }

  // Position: absolute, top = insets.top (below status bar)
  const topPosition = insets.top;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-BANNER_CONTENT_HEIGHT, 0] });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topPosition,
          backgroundColor: config.bgColor,
          transform: [{ translateY }],
          opacity: slideAnim },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, { color: config.textColor }]} numberOfLines={1}>
          {displayText}
        </Text>
        <MaterialIcons name={config.icon} size={14} color={config.textColor} style={styles.icon} />
      </View>
    </Animated.View>
  );
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    height: BANNER_CONTENT_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999 },
  content: {
    flexDirection: "row", // RTL: icon on right, text on left
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    height: BANNER_CONTENT_HEIGHT },
  icon: {
    marginLeft: 6 },
  text: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center" } });
