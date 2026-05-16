import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useConfig } from "@/lib/config-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";

const DISMISSED_MESSAGE_HASH_KEY = "dismissed_global_message_hash";

// Simple hash for message text to track dismissals
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

const TYPE_CONFIG: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; bgColor: string; textColor: string; iconColor: string }> = {
  info: { icon: "info-outline", bgColor: "#EFF6FF", textColor: "#1D4ED8", iconColor: "#3B82F6" },
  warning: { icon: "warning-amber", bgColor: "#FFFBEB", textColor: "#92400E", iconColor: "#F59E0B" },
  success: { icon: "check-circle-outline", bgColor: "#F0FDF4", textColor: "#166534", iconColor: "#22C55E" },
  update: { icon: "system-update", bgColor: "#F5F3FF", textColor: "#5B21B6", iconColor: "#8B5CF6" } };

/**
 * Global message banner from app_config.
 * Shown when global_message_enabled = true.
 * Dismissal is tracked by message hash — new message text = new banner.
 */
export function GlobalMessageBanner() {
  const { appConfig } = useConfig();
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const messageText = appConfig?.global_message_text || "";
  const messageHash = simpleHash(messageText);

  // Check if this message was already dismissed
  useEffect(() => {
    const checkDismissed = async () => {
      try {
        const savedHash = await AsyncStorage.getItem(DISMISSED_MESSAGE_HASH_KEY);
        if (savedHash === messageHash) {
          setDismissed(true);
        }
      } catch {}
      setLoaded(true);
    };
    checkDismissed();
  }, [messageHash]);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await AsyncStorage.setItem(DISMISSED_MESSAGE_HASH_KEY, messageHash);
  }, [messageHash]);

  const handleAction = useCallback(() => {
    const action = appConfig?.global_message_action || "";

    if (action === "feedback") {
      router.push("/feedback" as any);
    } else if (action === "dismiss") {
      handleDismiss();
    } else if (action.startsWith("url:")) {
      const url = action.replace("url:", "");
      Linking.openURL(url).catch(() => {});
    }
  }, [appConfig?.global_message_action, handleDismiss]);

  // Don't show if not enabled, dismissed, or not loaded
  if (!loaded || dismissed) return null;
  if (!appConfig?.global_message_enabled || !messageText) return null;

  const type = appConfig.global_message_type || "info";
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const actionText = appConfig.global_message_action_text || "";

  return (
    <View style={[s.container, { backgroundColor: config.bgColor }]}>
      <View style={s.mainRow}>
        <MaterialIcons name={config.icon} size={20} color={config.iconColor} />
        <Text style={[s.text, { color: config.textColor }]} numberOfLines={3}>
          {messageText}
        </Text>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="close" size={18} color={config.textColor} />
        </TouchableOpacity>
      </View>

      {actionText ? (
        <TouchableOpacity style={s.actionButton} onPress={handleAction} activeOpacity={0.7}>
          <Text style={[s.actionText, { color: config.iconColor }]}>{actionText}</Text>
          <MaterialIcons name="chevron-left" size={16} color={config.iconColor} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2,
    marginBottom: DS_SPACING.md },
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: DS_SPACING.sm },
  text: {
    flex: 1,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium,
    lineHeight: 20,
    textAlign: "left" },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: DS_SPACING.xs,
    gap: 2 },
  actionText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold } });
