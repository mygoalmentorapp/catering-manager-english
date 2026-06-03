import React, { useRef, useCallback, useEffect } from "react";
import { Text, View, TouchableOpacity, StyleSheet, Animated, Image, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import {
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
} from "@/lib/design-system";
import { usePastDueCheck } from "@/hooks/use-past-due-check";
import { GlobalMessageBanner } from "@/components/global-message-banner";
import { useThemeContext } from "@/lib/theme-provider";
import { setOneSignalScreenTrigger } from "@/lib/onesignal-bootstrap";

// ─── Premium palette (from APP_BRAND in CateringAuthScreens) ────────────────
const PREMIUM = {
  bg: "#020708",
  bg2: "#061214",
  card: "rgba(5, 22, 24, 0.76)",
  border: "rgba(101, 255, 239, 0.28)",
  borderStrong: "rgba(101, 255, 239, 0.72)",
  teal: "#35E9DD",
  tealSoft: "#79FFF4",
  text: "#E7ECEF",
  muted: "#AAB6BB",
  muted2: "#77868B",
  iconBg: "rgba(53, 233, 221, 0.10)",
  chevron: "rgba(101, 255, 239, 0.4)",
} as const;

const menuItems = [
  {
    route: "/products",
    icon: "inventory-2" as const,
    title: "הזנת נתוני תפריט",
    subtitle: "תכנון וניהול מוצרים",
  },
  {
    route: "/order",
    icon: "add-shopping-cart" as const,
    title: "יצירת הזמנה",
    subtitle: "תכנון הזמנה ללקוח",
  },
  {
    route: "/orders",
    icon: "list-alt" as const,
    title: "רשימת הזמנות",
    subtitle: "ניהול הזמנות והפקת רשימת קניות",
  },
  {
    route: "/shopping-lists",
    icon: "shopping-cart" as const,
    title: "רשימות קניות",
    subtitle: "ניהול רשימות קניות",
  },
  {
    route: "/settings",
    icon: "settings" as const,
    title: "הגדרות",
    subtitle: "שם העסק, לוגו והתאמות",
  },
];

function MenuCard({
  item,
  onPress,
}: {
  item: (typeof menuItems)[0];
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.card}
      >
        <View style={styles.cardContent}>
          <View style={styles.iconContainer}>
            <MaterialIcons
              name={item.icon}
              size={26}
              color={PREMIUM.teal}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
          </View>
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={PREMIUM.chevron}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const DEFAULT_BUSINESS_NAME = "שם העסק שלך";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    businessName,
    businessLogo,
    orders,
    savedShoppingLists,
    loading,
    archiveOrder,
    deleteSavedShoppingList,
  } = useData();

  usePastDueCheck({
    orders,
    savedShoppingLists,
    loading,
    archiveOrder,
    deleteSavedShoppingList,
  });

  // OneSignal in-app message trigger
  useEffect(() => { setOneSignalScreenTrigger("home"); }, []);

  const displayName = businessName.trim() || DEFAULT_BUSINESS_NAME;

  // Bottom padding: same gap as between cards (DS_SPACING.lg = 16) + safe area bottom
  const bottomPadding = Math.max(DS_SPACING.xxl, insets.bottom + DS_SPACING.lg);

  return (
    <LinearGradient
      colors={[PREMIUM.bg, PREMIUM.bg2, PREMIUM.bg] as const}
      style={styles.gradient}
    >
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* Global Message Banner */}
          <GlobalMessageBanner />

          {/* Header with Logo */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.push("/settings" as any)}
              activeOpacity={0.7}
              style={styles.logoWrap}
            >
              <View style={styles.logoCircle}>
                {businessLogo ? (
                  <Image
                    source={{ uri: businessLogo }}
                    style={styles.logoImage}
                  />
                ) : (
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={styles.logoImage}
                  />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/settings" as any)}
              activeOpacity={0.7}
              style={styles.headerTitleWrap}
            >
              <Text style={styles.headerTitle}>{displayName}</Text>
              {!businessName.trim() && (
                <Text style={styles.headerTitleHint}>לחץ לעדכון שם העסק</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.headerSubtitle}>
              ניהול מוצרים, הזמנות ורשימות קניות
            </Text>
          </View>

          {/* Menu Cards */}
          <View style={styles.cardsContainer}>
            {menuItems.map((item) => (
              <MenuCard
                key={item.route}
                item={item}
                onPress={() => router.push(item.route as any)}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const LOGO_SIZE = 80;

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    gap: DS_SPACING.xxl,
    paddingHorizontal: 20,
    paddingTop: DS_SPACING.md,
  },
  header: {
    alignItems: "center",
    gap: DS_SPACING.sm,
    paddingTop: DS_SPACING.md,
  },
  logoWrap: {
    marginBottom: DS_SPACING.sm,
  },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: "hidden",
    backgroundColor: PREMIUM.card,
    borderWidth: 1.5,
    borderColor: PREMIUM.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: PREMIUM.teal,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: PREMIUM.teal,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
    }),
  },
  logoImage: {
    width: LOGO_SIZE - 3,
    height: LOGO_SIZE - 3,
    borderRadius: (LOGO_SIZE - 3) / 2,
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: PREMIUM.text,
    textAlign: "center",
  },
  headerTitleHint: {
    fontSize: DS_FONT.caption,
    color: PREMIUM.teal,
    fontWeight: DS_WEIGHT.bold,
    textAlign: "center",
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.regular,
    color: PREMIUM.muted,
    textAlign: "center",
  },
  cardsContainer: {
    gap: DS_SPACING.lg,
  },
  card: {
    backgroundColor: PREMIUM.card,
    borderRadius: DS_RADIUS.lg,
    borderWidth: 1,
    borderColor: PREMIUM.border,
    padding: DS_SPACING.xl,
    ...Platform.select({
      ios: {
        shadowColor: PREMIUM.teal,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      default: {
        shadowColor: PREMIUM.teal,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
    }),
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.lg,
    direction: "rtl",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: DS_RADIUS.md,
    backgroundColor: PREMIUM.iconBg,
    borderWidth: 1,
    borderColor: PREMIUM.border,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  cardTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: PREMIUM.tealSoft,
    textAlign: "right",
  },
  cardSubtitle: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: PREMIUM.muted,
    textAlign: "right",
  },
});
