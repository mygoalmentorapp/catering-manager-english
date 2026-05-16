import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";

interface PaywallScreenProps {
  daysExpired?: number;
  onRestore?: () => void;
}

/**
 * Paywall screen — shown when trial expires and paywall is enabled.
 * In BETA: This screen is NEVER shown. Trial does not block users.
 * Prepared for future use with RevenueCat integration.
 */
export function PaywallScreen({ daysExpired, onRestore }: PaywallScreenProps) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <View style={s.iconCircle}>
          <MaterialIcons name="lock-outline" size={48} color={DS_COLORS.accent} />
        </View>

        <Text style={s.title}>Trial period ended</Text>
        <Text style={s.description}>
          The free trial period has ended{daysExpired ? ` ${daysExpired} days ago` : ""}.
          {"\n\n"}
          To continue using the app, please purchase a subscription.
        </Text>

        {/* Placeholder for RevenueCat purchase button */}
        <TouchableOpacity
          style={s.primaryButton}
          activeOpacity={0.8}
          onPress={() => {
            // TODO: RevenueCat purchase flow
          }}
        >
          <Text style={s.primaryButtonText}>Purchase subscription</Text>
        </TouchableOpacity>

        {/* Restore purchases */}
        <TouchableOpacity
          style={s.secondaryButton}
          activeOpacity={0.7}
          onPress={onRestore}
        >
          <Text style={s.secondaryButtonText}>Restore purchases</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.xxl },
  title: {
    fontSize: 24,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxl },
  primaryButton: {
    alignSelf: "stretch",
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.md,
    ...DS_SHADOW.button },
  primaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold },
  secondaryButton: {
    paddingVertical: DS_SPACING.md },
  secondaryButtonText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    fontWeight: DS_WEIGHT.medium } });
