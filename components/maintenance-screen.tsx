import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING } from "@/lib/design-system";

interface MaintenanceScreenProps {
  message?: string;
}

/**
 * Full-screen maintenance overlay.
 * Shown when app_config.maintenance_enabled = true.
 */
export function MaintenanceScreen({ message }: MaintenanceScreenProps) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <View style={s.iconCircle}>
          <MaterialIcons name="construction" size={48} color={DS_COLORS.accent} />
        </View>
        <Text style={s.title}>Maintenance</Text>
        <Text style={s.description}>
          {message || "The app is currently under maintenance. We will be back soon!"}
        </Text>
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
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24 } });
