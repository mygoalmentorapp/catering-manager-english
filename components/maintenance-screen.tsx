import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING } from "@/lib/design-system";

interface MaintenanceScreenProps {
  /** Screen title — from remote_config.maintenance_title */
  title?: string;
  /** Screen message — from remote_config.maintenance_message */
  message?: string;
  /** Action button text — from remote_config.maintenance_action_text */
  actionText?: string;
  /** Called when user taps the action button (e.g., retry / refresh config) */
  onAction?: () => void;
}

/**
 * Full-screen maintenance overlay.
 * Shown when remote_config.maintenance_enabled = true.
 * Text content is fully server-controlled via remote_config fields.
 */
export function MaintenanceScreen({ title, message, actionText, onAction }: MaintenanceScreenProps) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <View style={s.iconCircle}>
          <MaterialIcons name="construction" size={48} color={DS_COLORS.accent} />
        </View>
        <Text style={s.title}>{title || "תחזוקה"}</Text>
        <Text style={s.description}>
          {message || "האפליקציה בתחזוקה כרגע. נחזור בקרוב!"}
        </Text>
        {(actionText || onAction) && (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [s.actionButton, pressed && { opacity: 0.8 }]}
          >
            <Text style={s.actionButtonText}>{actionText || "נסה שוב"}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md,
  },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  actionButton: {
    marginTop: DS_SPACING.xl,
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.xxl,
    paddingVertical: DS_SPACING.md,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: "#FFFFFF",
  },
});
