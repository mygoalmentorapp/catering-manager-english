import React from "react";
import { View, Text, StyleSheet, Linking, Pressable, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";

// Fallback Google Play URL based on package name
const FALLBACK_PLAY_URL =
  "https://play.google.com/store/apps/details?id=space.manus.catering.manager.t20260411205951";

interface ForceUpdateScreenProps {
  /** Title text from remote config */
  title?: string;
  /** Message text from remote config */
  message?: string;
  /** Button label from remote config */
  buttonText?: string;
  /** Google Play URL from remote config (empty string = use fallback) */
  googlePlayUrl?: string;
}

/**
 * Full-screen blocking overlay shown when the app version is below
 * the minimum supported version. No back button, no dismiss — the
 * only action is to open the Google Play store page.
 *
 * Fail-safe: this screen is NEVER shown if remote config is unavailable.
 */
export function ForceUpdateScreen({
  title,
  message,
  buttonText,
  googlePlayUrl,
}: ForceUpdateScreenProps) {
  const displayTitle = title || "יש גרסה חדשה חובה";
  const displayMessage =
    message || "כדי להמשיך להשתמש באפליקציה, נא לעדכן לגרסה האחרונה.";
  const displayButtonText = buttonText || "עדכון עכשיו";
  const storeUrl = googlePlayUrl?.trim() || FALLBACK_PLAY_URL;

  const handleOpenStore = () => {
    Linking.openURL(storeUrl).catch((err) => {
      console.warn("[ForceUpdate] Failed to open store URL:", err);
      // Try fallback if custom URL failed
      if (storeUrl !== FALLBACK_PLAY_URL) {
        Linking.openURL(FALLBACK_PLAY_URL).catch(() => {});
      }
    });
  };

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom", "left", "right"]}>
      <View style={s.content}>
        {/* Icon */}
        <View style={s.iconCircle}>
          <MaterialIcons name="system-update" size={48} color={DS_COLORS.accent} />
        </View>

        {/* Title */}
        <Text style={s.title}>{displayTitle}</Text>

        {/* Message */}
        <Text style={s.description}>{displayMessage}</Text>

        {/* Update button */}
        <Pressable
          onPress={handleOpenStore}
          style={({ pressed }) => [
            s.button,
            { backgroundColor: DS_COLORS.accent },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <MaterialIcons
            name="open-in-new"
            size={20}
            color={DS_COLORS.white}
            style={s.buttonIcon}
          />
          <Text style={s.buttonText}>{displayButtonText}</Text>
        </Pressable>

        {/* Subtle version info */}
        <Text style={s.hint}>
          {"האפליקציה תמשיך לעבוד לאחר העדכון.\nהנתונים שלך לא יימחקו."}
        </Text>
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
    fontSize: 26,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md,
    textAlign: "center",
  },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxxl,
    paddingHorizontal: DS_SPACING.lg,
  },
  button: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    paddingHorizontal: DS_SPACING.xxxl,
    minWidth: 220,
    ...DS_SHADOW.button,
  },
  buttonIcon: {
    marginLeft: Platform.OS === "web" ? 0 : DS_SPACING.sm,
    marginRight: Platform.OS === "web" ? DS_SPACING.sm : 0,
  },
  buttonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  hint: {
    marginTop: DS_SPACING.xxl,
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
