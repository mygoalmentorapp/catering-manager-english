/**
 * ConnectionErrorScreen — Displayed when session.claim fails due to network/server error
 * OR when profile loading fails (PROFILE_LOAD_FAILED).
 *
 * This screen does NOT grant access to the app but does NOT sign the user out.
 * Shows a clear message in Hebrew with:
 * - "Try again" button (manual retry)
 * - "Sign out" button
 * - Auto-retry every 10 seconds
 *
 * Variants:
 * - "network" (default): Generic connection/server error
 * - "profile": Profile loading failed (JWT valid, DB issue)
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Pressable } from "react-native";
import { DS_COLORS, DS_FONT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";

interface ConnectionErrorScreenProps {
  onRetry: () => void;
  onLogout: () => void;
  isRetrying: boolean;
  /** Error variant — determines the icon, title, and message shown */
  variant?: "network" | "profile";
}

const VARIANT_CONTENT = {
  network: {
    icon: "📡",
    title: "No server connection",
    message: "Unable to verify the session.\nCheck your internet connection and try again." },
  profile: {
    icon: "⚠️",
    title: "Temporary issue loading account",
    message: "There was a temporary issue loading your account.\nPlease try again in a moment." } };

export function ConnectionErrorScreen({
  onRetry,
  onLogout,
  isRetrying,
  variant = "network" }: ConnectionErrorScreenProps) {
  const content = VARIANT_CONTENT[variant];

  // Auto-retry every 10 seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!isRetrying) {
        onRetry();
      }
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onRetry, isRetrying]);

  return (
    <View style={s.container}>
      <View style={s.card}>
        {/* Icon */}
        <View style={s.iconContainer}>
          <Text style={s.icon}>{content.icon}</Text>
        </View>

        {/* Title */}
        <Text style={s.title}>{content.title}</Text>

        {/* Message */}
        <Text style={s.message}>{content.message}</Text>

        {/* Auto-retry indicator */}
        <Text style={s.autoRetryText}>Retrying automatically every 10 seconds...</Text>

        {/* Retry button */}
        <Pressable
          onPress={onRetry}
          disabled={isRetrying}
          style={({ pressed }) => [
            s.retryButton,
            pressed && { opacity: 0.8 },
            isRetrying && { opacity: 0.6 },
          ]}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.retryButtonText}>Try again</Text>
          )}
        </Pressable>

        {/* Logout button */}
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [
            s.logoutButton,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={s.logoutButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: DS_SPACING.lg },
  card: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3 },
  iconContainer: {
    marginBottom: DS_SPACING.md },
  icon: {
    fontSize: 48 },
  title: {
    fontSize: DS_FONT.titleCard,
    fontWeight: "700",
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.sm },
  message: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.sm },
  autoRetryText: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    marginBottom: DS_SPACING.lg },
  retryButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginBottom: DS_SPACING.sm },
  retryButtonText: {
    color: "#fff",
    fontSize: DS_FONT.body,
    fontWeight: "600" },
  logoutButton: {
    borderRadius: DS_RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: DS_COLORS.border },
  logoutButtonText: {
    color: DS_COLORS.textSecondary,
    fontSize: DS_FONT.body,
    fontWeight: "500" } });
