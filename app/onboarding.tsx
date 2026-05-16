import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  ViewToken,
  I18nManager } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { OnboardingSlide } from "@/components/onboarding-slide";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

// ============ SLIDE DATA ============

interface SlideData {
  id: string;
  title: string;
  description: string;
  iconName: keyof typeof MaterialIcons.glyphMap;
  accentColor: string;
}

const SLIDES: SlideData[] = [
  {
    id: "welcome",
    title: "Welcome to Catering Manager Pro",
    description: "The tool that helps you manage your catering business easily and professionally",
    iconName: "restaurant",
    accentColor: "#3AAFA9" },
  {
    id: "products",
    title: "Product management",
    description: "Set up your products, prices, costs, and categories — all in one place",
    iconName: "inventory-2",
    accentColor: "#4CAF50" },
  {
    id: "orders",
    title: "Order management",
    description: "Create orders, track statuses, and manage all your customers easily",
    iconName: "receipt-long",
    accentColor: "#2196F3" },
  {
    id: "shopping",
    title: "Shopping lists",
    description: "Automatic shopping list from all orders — saves time and prevents forgetting",
    iconName: "shopping-cart",
    accentColor: "#FF9800" },
  {
    id: "profit",
    title: "Profit tracking",
    description: "See exactly how much you earn from every order and product — full control of your business",
    iconName: "trending-up",
    accentColor: "#E91E63" },
  {
    id: "cta",
    title: "Let's get started!",
    description: "Create an account or sign in to start managing your business",
    iconName: "rocket-launch",
    accentColor: "#3AAFA9" },
];

/**
 * In RTL mode, FlatList reverses the horizontal layout.
 * We use `inverted` to counteract this, so slides appear in logical order (0→5 left-to-right visually).
 * We also reverse the data array so the visual order matches the logical order.
 */
const isRTL = I18nManager.isRTL;

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  /**
   * Use onViewableItemsChanged for reliable index tracking.
   * This works correctly regardless of RTL/LTR and scroll direction.
   */
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const goToSlide = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
    }
  }, [currentIndex, goToSlide]);

  const handleComplete = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    router.replace("/auth/signup" as any);
  }, []);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    router.replace("/auth/signup" as any);
  }, []);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = useCallback(({ item }: { item: SlideData }) => (
    <OnboardingSlide
      title={item.title}
      description={item.description}
      accentColor={item.accentColor}
      visual={
        <MaterialIcons
          name={item.iconName}
          size={72}
          color={item.accentColor}
        />
      }
    />
  ), []);

  return (
    <SafeAreaView style={s.container}>
      {/* Skip Button — always visible */}
      <View style={s.skipRow}>
        <TouchableOpacity onPress={handleSkip} style={s.skipButton} activeOpacity={0.7}>
          <Text style={s.skipText}>Skip</Text>
          <MaterialIcons name="chevron-left" size={18} color={DS_COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index })}
      />

      {/* Bottom Controls */}
      <View style={s.bottomControls}>
        {/* Pagination Dots */}
        <View style={s.dotsContainer}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                s.dot,
                index === currentIndex && s.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Action Button */}
        {isLastSlide ? (
          <TouchableOpacity
            style={s.ctaButton}
            onPress={handleComplete}
            activeOpacity={0.8}
          >
            <Text style={s.ctaButtonText}>Let's get started!</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.nextButton}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={s.nextButtonText}>Next</Text>
            <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.white} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background },
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: DS_SPACING.xl,
    paddingTop: DS_SPACING.sm,
    paddingBottom: DS_SPACING.sm },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.sm },
  skipText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    fontWeight: DS_WEIGHT.medium },
  bottomControls: {
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xxl,
    gap: DS_SPACING.xl },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: DS_SPACING.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DS_COLORS.border },
  dotActive: {
    width: 24,
    backgroundColor: DS_COLORS.accent,
    borderRadius: 4 },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.xs,
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    ...DS_SHADOW.button },
  nextButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold },
  ctaButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    ...DS_SHADOW.button },
  ctaButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold } });
