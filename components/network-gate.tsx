import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Network from "expo-network";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING } from "@/lib/design-system";

interface NetworkGateProps {
  children: React.ReactNode;
}

/**
 * NetworkGate wraps the app and shows a full-screen "no internet" message
 * when the device is offline. The app is online-only — all data is in the cloud.
 *
 * Uses expo-network's useNetworkState() hook which works on iOS, Android, and web.
 * Automatically re-renders when connectivity changes.
 */
export function NetworkGate({ children }: NetworkGateProps) {
  const networkState = Network.useNetworkState();

  // On web, isInternetReachable may be undefined — fall back to isConnected
  const isOnline =
    Platform.OS === "web"
      ? networkState.isConnected !== false
      : (networkState.isInternetReachable ?? networkState.isConnected) !== false;

  // Still initializing (first render before state is populated)
  if (networkState.isConnected === undefined && networkState.type === undefined) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={DS_COLORS.accent} />
      </View>
    );
  }

  // No internet — show full-screen message
  if (!isOnline) {
    return (
      <SafeAreaView style={s.container} edges={["top", "bottom", "left", "right"]}>
        <View style={s.content}>
          <View style={s.iconCircle}>
            <MaterialIcons name="wifi-off" size={56} color={DS_COLORS.accent} />
          </View>

          <Text style={s.title}>No internet connection</Text>

          <Text style={s.description}>
            The app requires an active internet connection to work.{"\n\n"}
            All your data is securely stored in the cloud.{"\n"}
            please Check your internet connection and try again.
          </Text>

          <View style={s.hintRow}>
            <MaterialIcons name="info-outline" size={18} color={DS_COLORS.textSecondary} />
            <Text style={s.hintText}>The connection will resume automatically when the internet returns</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Connected — render app
  return <>{children}</>;
}

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.background },
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.xxl },
  title: {
    fontSize: 26,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.lg,
    textAlign: "center" },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxl },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.xs },
  hintText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary } });
