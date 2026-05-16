import React, { useRef, useCallback } from "react";
import { Text, View, TouchableOpacity, StyleSheet, Animated, Image, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import { usePastDueCheck } from "@/hooks/use-past-due-check";
import { GlobalMessageBanner } from "@/components/global-message-banner";
import { useThemeContext } from "@/lib/theme-provider";


const menuItems = [
  {
    route: "/products",
    icon: "inventory-2" as const,
    title: "Menu data entry",
    subtitle: "Product planning and management" },
  {
    route: "/order",
    icon: "add-shopping-cart" as const,
    title: "Create order",
    subtitle: "Plan order for customer" },
  {
    route: "/orders",
    icon: "list-alt" as const,
    title: "Orders list",
    subtitle: "Manage orders and generate shopping lists" },
  {
    route: "/shopping-lists",
    icon: "shopping-cart" as const,
    title: "Shopping lists",
    subtitle: "Manage shopping lists" },
  {
    route: "/settings",
    icon: "settings" as const,
    title: "Settings",
    subtitle: "Business name, logo, and customization" },
];

function MenuCard({
  item,
  onPress }: {
  item: (typeof menuItems)[0];
  onPress: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const styles = React.useMemo(() => _make_styles(), [DS_COLORS.accent, colorScheme]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true }).start();
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
              color={DS_COLORS.accent}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
          </View>
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={DS_COLORS.border}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const DEFAULT_BUSINESS_NAME = "Your business name";

export default function HomeScreen() {
  const { colorScheme } = useThemeContext();
  const styles = React.useMemo(() => _make_styles(), [DS_COLORS.accent, colorScheme]);


  const router = useRouter();
  const {
    businessName,
    businessLogo,
    orders,
    savedShoppingLists,
    loading,
    archiveOrder,
    deleteSavedShoppingList } = useData();

  usePastDueCheck({
    orders,
    savedShoppingLists,
    loading,
    archiveOrder,
    deleteSavedShoppingList });

  const displayName = businessName.trim() || DEFAULT_BUSINESS_NAME;

  return (
    <ScreenContainer
      containerClassName="bg-background"
      className="px-5 pt-8"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
              <Text style={styles.headerTitleHint}>Tap to update business name</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.headerSubtitle}>
            Product management, Orders and Shopping lists
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
    </ScreenContainer>
  );
}

const LOGO_SIZE = 80;

function _make_styles() { return StyleSheet.create({
  scrollContent: {
    gap: DS_SPACING.xxl,
    paddingBottom: DS_SPACING.xxl },
  header: {
    alignItems: "center",
    gap: DS_SPACING.sm,
    paddingTop: DS_SPACING.md },
  logoWrap: {
    marginBottom: DS_SPACING.sm },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: "hidden",
    backgroundColor: DS_COLORS.card,
    borderWidth: 2.5,
    borderColor: DS_COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    ...DS_SHADOW.card },
  logoImage: {
    width: LOGO_SIZE - 5,
    height: LOGO_SIZE - 5,
    borderRadius: (LOGO_SIZE - 5) / 2 },
  headerTitleWrap: {
    alignItems: "center" },
  headerTitle: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center" },
  headerTitleHint: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.bold,
    textAlign: "center",
    marginTop: 2 },
  headerSubtitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "center" },
  cardsContainer: {
    gap: DS_SPACING.lg },
  card: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    ...DS_SHADOW.card },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.lg
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center" },
  textContainer: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2 },
  cardTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "left" },
  cardSubtitle: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "left" } }); }
