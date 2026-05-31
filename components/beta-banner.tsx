import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";

/**
 * Beta banner shown at the top of the home screen.
 * "גרסת בטא — נשמח לפידבק שלך"
 */
export function BetaBanner() {
  return (
    <TouchableOpacity
      style={s.container}
      onPress={() => router.push("/feedback" as any)}
      activeOpacity={0.8}
    >
      <View style={s.content}>
        <View style={s.badge}>
          <Text style={s.badgeText}>BETA</Text>
        </View>
        <Text style={s.text}>גרסת בטא — נשמח לפידבק שלך</Text>
      </View>
      <MaterialIcons name="chevron-left" size={18} color={DS_COLORS.accent} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: DS_COLORS.accentLight,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2,
    marginBottom: DS_SPACING.md,
  },
  content: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.sm,
    flex: 1,
  },
  badge: {
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.sm,
    paddingVertical: 2,
    borderRadius: DS_RADIUS.sm,
  },
  badgeText: {
    color: DS_COLORS.white,
    fontSize: 10,
    fontWeight: DS_WEIGHT.bold,
    letterSpacing: 1,
  },
  text: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.medium,
    flex: 1,
  },
});
