/**
 * BridgeRetryScreen — Displayed when Supabase auth succeeded but bridge (custom JWT exchange) failed.
 *
 * This is an intermediate state between "not logged in" and "fully authenticated":
 * - Supabase session is alive (user IS authenticated with Supabase)
 * - Bridge has failed (custom JWT not available for tRPC calls)
 * - isAuthenticated is still false (prevents premature tRPC/DataProvider calls)
 *
 * The screen shows:
 * - Clear message that login succeeded but account loading failed
 * - The user's email (so they know they don't need to re-enter credentials)
 * - "Try again" button → retryBridge() with existing access_token
 * - "Sign out" button → full signOut
 *
 * During auto-retry (first 3s after failure), shows a loading state with "Loading your account..."
 */

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Pressable } from "react-native";
import { DS_COLORS, DS_FONT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface BridgeRetryScreenProps {
  /** The signed-in user's email address */
  email: string;
  /** Whether a bridge retry is currently in progress */
  isRetrying: boolean;
  /** Called when user taps "Try again" */
  onRetry: () => void;
  /** Called when user taps "Sign out" */
  onLogout: () => void;
}

export function BridgeRetryScreen({
  email,
  isRetrying,
  onRetry,
  onLogout }: BridgeRetryScreenProps) {
  // During auto-retry, show a simpler loading state
  if (isRetrying) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <ActivityIndicator size="large" color={DS_COLORS.accent} style={s.spinner} />
          <Text style={s.loadingTitle}>Loading your account...</Text>
          <Text style={s.loadingSubtitle}>
            Sign in successful, waiting for server response
          </Text>
          {email ? (
            <Text style={s.emailText}>Connected as {email}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  // After auto-retry failed — show full retry screen
  return (
    <View style={s.container}>
      <View style={s.card}>
        {/* Icon */}
        <View style={s.iconContainer}>
          <MaterialIcons name="cloud-off" size={48} color={DS_COLORS.accent} />
        </View>

        {/* Title */}
        <Text style={s.title}>Account loading failed</Text>

        {/* Message */}
        <Text style={s.message}>
          Sign in was successful, but loading the account is taking{"\n"}
          too long. Please try again in a moment.
        </Text>

        {/* Email info */}
        {email ? (
          <Text style={s.emailText}>Connected as {email}</Text>
        ) : null}

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
          <Text style={s.retryButtonText}>Try again</Text>
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
  spinner: {
    marginBottom: DS_SPACING.md },
  loadingTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: "700",
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.xs },
  loadingSubtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.sm },
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
  emailText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    marginBottom: DS_SPACING.md,
    fontStyle: "italic" },
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
