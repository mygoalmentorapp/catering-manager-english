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
  error: { icon: "error-outline", bgColor: "#FEF2F2", textColor: "#991B1B", iconColor: "#EF4444" },
  update: { icon: "system-update", bgColor: "#F5F3FF", textColor: "#5B21B6", iconColor: "#8B5CF6" },
  maintenance: { icon: "construction", bgColor: "#FFF7ED", textColor: "#9A3412", iconColor: "#F97316" },
};

/**
 * Global message banner — reads from remote_config (not legacy app_config).
 * Shown when global_message_enabled = true AND global_message_text is non-empty.
 * Dismissal is tracked by message hash — new message text = new banner.
 * Supports title, action button, and dismissible control from remote_config.
 */
export function GlobalMessageBanner() {
  const { remoteConfig } = useConfig();
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const messageText = remoteConfig.global_message_text || "";
  const messageTitle = remoteConfig.global_message_title || "";
  const messageHash = simpleHash(messageText);
  const isDismissible = remoteConfig.global_message_dismissible !== false; // default true

  // Check if this message was already dismissed
  useEffect(() => {
    const checkDismissed = async () => {
      try {
        const savedHash = await AsyncStorage.getItem(DISMISSED_MESSAGE_HASH_KEY);
        if (savedHash === messageHash && isDismissible) {
          setDismissed(true);
        }
      } catch {}
      setLoaded(true);
    };
    checkDismissed();
  }, [messageHash, isDismissible]);

  const handleDismiss = useCallback(async () => {
    if (!isDismissible) return;
    setDismissed(true);
    await AsyncStorage.setItem(DISMISSED_MESSAGE_HASH_KEY, messageHash);
  }, [messageHash, isDismissible]);

  const handleAction = useCallback(() => {
    const action = remoteConfig.global_message_action || "";

    if (action === "feedback") {
      router.push("/feedback" as any);
    } else if (action === "dismiss") {
      handleDismiss();
    } else if (action.startsWith("url:")) {
      const url = action.replace("url:", "");
      Linking.openURL(url).catch(() => {});
    } else if (action === "open_home") {
      router.push("/(tabs)" as any);
    } else if (action === "open_products") {
      router.push("/products" as any);
    } else if (action === "open_orders") {
      router.push("/orders" as any);
    } else if (action === "open_shopping_lists") {
      router.push("/shopping-lists" as any);
    } else if (action === "open_settings") {
      router.push("/about" as any);
    }
  }, [remoteConfig.global_message_action, handleDismiss]);

  // Don't show if not enabled, dismissed, or not loaded
  if (!loaded || dismissed) return null;
  if (!remoteConfig.global_message_enabled || !messageText) return null;

  const type = remoteConfig.global_message_type || "info";
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const actionText = remoteConfig.global_message_action_text || "";

  return (
    <View style={[s.container, { backgroundColor: config.bgColor }]}>
      <View style={s.mainRow}>
        <MaterialIcons name={config.icon} size={20} color={config.iconColor} />
        <View style={s.textColumn}>
          {messageTitle ? (
            <Text style={[s.title, { color: config.textColor }]} numberOfLines={1}>
              {messageTitle}
            </Text>
          ) : null}
          <Text style={[s.text, { color: config.textColor }]} numberOfLines={3}>
            {messageText}
          </Text>
        </View>
        {isDismissible && (
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="close" size={18} color={config.textColor} />
          </TouchableOpacity>
        )}
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
    marginBottom: DS_SPACING.md,
  },
  mainRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: DS_SPACING.sm,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold,
    textAlign: "right",
    lineHeight: 20,
  },
  text: {
    flex: 1,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium,
    lineHeight: 20,
    textAlign: "right",
  },
  actionButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: DS_SPACING.xs,
    gap: 2,
  },
  actionText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold,
  },
});
