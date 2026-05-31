import React, { useMemo } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import { useThemeContext } from "@/lib/theme-provider";
import { useData } from "@/lib/data-context";
import { useAuth } from "@/lib/auth-context";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";

export default function AboutScreen() {
  const router = useRouter();
  const { colorScheme } = useThemeContext();
  const { businessLogo } = useData();
  const { user } = useAuth();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const s = useMemo(() => makeStyles(), [colorScheme]);

  const handleEmail = () => {
    const subject = encodeURIComponent("פנייה מאפליקציית ניהול קייטרינג פרו");
    const userEmail = user?.email || "לא מחובר";
    const userId = user?.id ? user.id.slice(0, 8) : "לא ידוע";
    const bodyLines = [
      "",
      "",
      "---",
      `גרסה: ${appVersion}`,
      `משתמש: ${userEmail}`,
      `מזהה: ${userId}`,
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    Linking.openURL(`mailto:support@cateringmanager.app?subject=${subject}&body=${body}`);
  };

  const handleWebsite = () => {
    Linking.openURL("https://cateringmanager.app");
  };

  const handleTerms = () => {
    Linking.openURL("https://cateringmanager.app/terms");
  };

  const handlePrivacy = () => {
    Linking.openURL("https://cateringmanager.app/privacy");
  };

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>אודות</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          {/* Logo & App Name */}
          <View style={s.logoSection}>
            <View style={s.logoCircle}>
              <Image
                source={
                  businessLogo
                    ? { uri: businessLogo }
                    : require("@/assets/images/icon.png")
                }
                style={s.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={s.appName}>ניהול קייטרינג פרו</Text>
            <Text style={s.versionText}>גרסה {appVersion}</Text>
          </View>

          {/* Contact Info Card */}
          <View style={s.infoCard}>
            {/* Website Row */}
            <TouchableOpacity style={s.infoRow} onPress={handleWebsite} activeOpacity={0.7}>
              <View style={s.infoIconWrap}>
                <MaterialIcons name="language" size={20} color={DS_COLORS.accent} />
              </View>
              <View style={s.infoTextWrap}>
                <Text style={s.infoLabel}>אתר</Text>
                <Text style={s.infoValue}>cateringmanager.app</Text>
              </View>
              <MaterialIcons name="open-in-new" size={16} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>

            <View style={s.divider} />

            {/* Email Row */}
            <TouchableOpacity style={s.infoRow} onPress={handleEmail} activeOpacity={0.7}>
              <View style={s.infoIconWrap}>
                <MaterialIcons name="email" size={20} color={DS_COLORS.accent} />
              </View>
              <View style={s.infoTextWrap}>
                <Text style={s.infoLabel}>יצירת קשר</Text>
                <Text style={s.infoValue}>support@cateringmanager.app</Text>
              </View>
              <MaterialIcons name="open-in-new" size={16} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Legal Links */}
          <View style={s.legalSection}>
            <TouchableOpacity onPress={handleTerms} activeOpacity={0.7} style={s.legalRow}>
              <MaterialIcons name="description" size={18} color={DS_COLORS.textSecondary} />
              <Text style={s.legalText}>תנאי שימוש</Text>
              <MaterialIcons name="chevron-left" size={18} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>

            <View style={s.legalDivider} />

            <TouchableOpacity onPress={handlePrivacy} activeOpacity={0.7} style={s.legalRow}>
              <MaterialIcons name="shield" size={18} color={DS_COLORS.textSecondary} />
              <Text style={s.legalText}>מדיניות פרטיות</Text>
              <MaterialIcons name="chevron-left" size={18} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={s.footerText}>
            נבנה באהבה עבור עסקי קייטרינג בישראל
          </Text>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const LOGO_SIZE = 80;

function makeStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: DS_COLORS.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: DS_SPACING.xl,
      paddingVertical: DS_SPACING.md,
      backgroundColor: DS_COLORS.background,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: DS_RADIUS.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: DS_COLORS.accentLight,
    },
    headerTitle: {
      fontSize: DS_FONT.titleLarge,
      fontWeight: DS_WEIGHT.bold,
      color: DS_COLORS.textPrimary,
      flex: 1,
      textAlign: "center",
      writingDirection: "rtl",
    },
    content: {
      padding: DS_SPACING.xl,
      alignItems: "center",
      gap: DS_SPACING.xxl,
    },
    logoSection: {
      alignItems: "center",
      gap: DS_SPACING.sm,
      marginTop: DS_SPACING.xl,
    },
    logoCircle: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: LOGO_SIZE / 2,
      overflow: "hidden",
      backgroundColor: DS_COLORS.card,
      borderWidth: 2,
      borderColor: DS_COLORS.accent,
      alignItems: "center",
      justifyContent: "center",
      ...DS_SHADOW.card,
    },
    logoImage: {
      width: LOGO_SIZE - 4,
      height: LOGO_SIZE - 4,
      borderRadius: (LOGO_SIZE - 4) / 2,
    },
    appName: {
      fontSize: 24,
      fontWeight: DS_WEIGHT.bold,
      color: DS_COLORS.textPrimary,
      textAlign: "center",
      writingDirection: "rtl",
      marginTop: DS_SPACING.sm,
    },
    versionText: {
      fontSize: DS_FONT.bodySmall,
      color: DS_COLORS.textSecondary,
      textAlign: "center",
    },
    infoCard: {
      width: "100%",
      backgroundColor: DS_COLORS.card,
      borderRadius: DS_RADIUS.lg,
      padding: DS_SPACING.lg,
      direction: "rtl" as const,
      ...DS_SHADOW.card,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: DS_SPACING.md,
      paddingVertical: DS_SPACING.md,
    },
    infoIconWrap: {
      width: 36,
      height: 36,
      borderRadius: DS_RADIUS.sm,
      backgroundColor: DS_COLORS.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    infoTextWrap: {
      flex: 1,
      gap: 2,
    },
    infoLabel: {
      fontSize: DS_FONT.bodySmall,
      color: DS_COLORS.textSecondary,
    },
    infoValue: {
      fontSize: DS_FONT.body,
      fontWeight: DS_WEIGHT.medium,
      color: DS_COLORS.textPrimary,
    },
    divider: {
      height: 1,
      backgroundColor: DS_COLORS.border,
      marginVertical: DS_SPACING.xs,
    },
    legalSection: {
      width: "100%",
      backgroundColor: DS_COLORS.card,
      borderRadius: DS_RADIUS.lg,
      padding: DS_SPACING.lg,
      direction: "rtl" as const,
      ...DS_SHADOW.card,
    },
    legalRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: DS_SPACING.md,
      paddingVertical: DS_SPACING.md,
    },
    legalText: {
      flex: 1,
      fontSize: DS_FONT.body,
      color: DS_COLORS.textPrimary,
      textAlign: "right",
      writingDirection: "rtl",
    },
    legalDivider: {
      height: 1,
      backgroundColor: DS_COLORS.border,
      marginVertical: DS_SPACING.xs,
    },
    footerText: {
      fontSize: DS_FONT.bodySmall,
      color: DS_COLORS.textSecondary,
      textAlign: "center",
      writingDirection: "rtl",
      marginTop: DS_SPACING.md,
    },
  });
}
