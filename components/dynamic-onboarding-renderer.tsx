/**
 * DynamicOnboardingRenderer — renders dynamic onboarding screens from Supabase.
 *
 * Features:
 * - Displays screens in order (sort_order)
 * - Supports title, body, image_url, icon_name
 * - Primary/secondary buttons with ActionHandler integration
 * - Pagination dots
 * - Events: onboarding_started, onboarding_screen_viewed, onboarding_completed
 * - RTL support
 *
 * Actions supported:
 * - next_screen: advance to next screen
 * - previous_screen: go back to previous screen
 * - close_onboarding: complete onboarding and navigate away
 * - open_home, open_products, open_orders, open_settings: navigate + close
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  I18nManager,
  ViewToken,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { ExperienceEventService, EVENT_NAMES } from "@/lib/services/experience-event-service";
import { UserExperienceStateService } from "@/lib/services/user-experience-state-service";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";
import type { ActiveOnboardingFlow, OnboardingScreen } from "@/lib/services/dynamic-onboarding-service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ONBOARDING_COMPLETE_KEY = "onboarding_complete";

// ── Props ──

interface DynamicOnboardingRendererProps {
  flow: ActiveOnboardingFlow;
}

// ── Action Handling ──

/** Navigation routes for named actions */
const NAVIGATION_ROUTES: Record<string, string> = {
  open_home: "/(tabs)",
  open_products: "/products",
  open_orders: "/orders",
  open_shopping_lists: "/shopping-lists",
  open_settings: "/about",
};

/**
 * Execute an onboarding action.
 * Returns true if handled, false if unknown (unknown = no-op, no crash).
 */
function executeAction(
  actionType: string | null,
  _actionPayload: string | null,
  goNext: () => void,
  goPrev: () => void,
  closeOnboarding: () => void,
): boolean {
  if (!actionType) return false;

  switch (actionType) {
    case "next_screen":
      goNext();
      return true;

    case "previous_screen":
      goPrev();
      return true;

    case "close_onboarding":
      closeOnboarding();
      return true;

    case "open_home":
    case "open_products":
    case "open_orders":
    case "open_shopping_lists":
    case "open_settings": {
      const route = NAVIGATION_ROUTES[actionType];
      if (route) {
        closeOnboarding();
        try {
          router.replace(route as any);
        } catch {}
      }
      return true;
    }

    case "open_onboarding":
      // Already in onboarding — no-op
      return true;

    default:
      // Unknown action — log and no-op (never crash)
      ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.UNKNOWN_ACTION_RECEIVED,
        metadata: { action: actionType },
      }).catch(() => {});
      return false;
  }
}

// ── Component ──

export function DynamicOnboardingRenderer({ flow }: DynamicOnboardingRendererProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const startedRef = useRef(false);

  const screens = flow.screens;

  // Log onboarding_started on mount
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.ONBOARDING_STARTED,
        flow_key: flow.flow_key,
      }).catch(() => {});
    }
  }, [flow.flow_key]);

  // Log screen_viewed when index changes
  useEffect(() => {
    if (screens[currentIndex]) {
      ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.ONBOARDING_SCREEN_VIEWED,
        flow_key: flow.flow_key,
        screen_key: screens[currentIndex].screen_key,
        metadata: { screen_key: screens[currentIndex].screen_key },
      }).catch(() => {});
    }
  }, [currentIndex, flow.flow_key, screens]);

  // Viewability tracking
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  // Navigation helpers
  const goToSlide = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex < screens.length - 1) {
      goToSlide(currentIndex + 1);
    }
  }, [currentIndex, screens.length, goToSlide]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      goToSlide(currentIndex - 1);
    }
  }, [currentIndex, goToSlide]);

  const closeOnboarding = useCallback(async () => {
    // Mark onboarding complete
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");

    // Log completion event
    ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.ONBOARDING_COMPLETED,
      flow_key: flow.flow_key,
    }).catch(() => {});

    // Update user state
    UserExperienceStateService.onOnboardingCompleted().catch(() => {});

    // Navigate to auth
    router.replace("/auth/signup" as any);
  }, [flow.flow_key]);

  // Handle skip
  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    // Log skip as a separate event
    ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.ONBOARDING_COMPLETED,
      flow_key: flow.flow_key,
      metadata: { action: "skipped" },
    }).catch(() => {});
    router.replace("/auth/signup" as any);
  }, [flow.flow_key]);

  // Render a single screen
  const renderScreen = useCallback(({ item }: { item: OnboardingScreen }) => {
    return (
      <View style={s.slide}>
        {/* Visual: image or icon */}
        <View style={s.visualContainer}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={s.image}
              contentFit="contain"
            />
          ) : item.icon_name ? (
            <MaterialIcons
              name={item.icon_name as any}
              size={72}
              color={DS_COLORS.primary}
            />
          ) : (
            <MaterialIcons
              name="auto-awesome"
              size={72}
              color={DS_COLORS.primary}
            />
          )}
        </View>

        {/* Title */}
        <Text style={s.title}>{item.title}</Text>

        {/* Body */}
        {item.body && <Text style={s.body}>{item.body}</Text>}
      </View>
    );
  }, []);

  // Handle primary button press
  const handlePrimary = useCallback(() => {
    const screen = screens[currentIndex];
    if (!screen) return;
    executeAction(
      screen.primary_action_type,
      screen.primary_action_payload,
      goNext,
      goPrev,
      closeOnboarding,
    );
  }, [currentIndex, screens, goNext, goPrev, closeOnboarding]);

  // Handle secondary button press
  const handleSecondary = useCallback(() => {
    const screen = screens[currentIndex];
    if (!screen) return;
    executeAction(
      screen.secondary_action_type ?? null,
      screen.secondary_action_payload ?? null,
      goNext,
      goPrev,
      closeOnboarding,
    );
  }, [currentIndex, screens, goNext, goPrev, closeOnboarding]);

  const currentScreen = screens[currentIndex];

  return (
    <SafeAreaView style={s.container}>
      {/* Skip Button */}
      <View style={s.skipRow}>
        <TouchableOpacity onPress={handleSkip} style={s.skipButton} activeOpacity={0.7}>
          <Text style={s.skipText}>{I18nManager.isRTL ? "דלג" : "Skip"}</Text>
          <MaterialIcons
            name={I18nManager.isRTL ? "chevron-left" : "chevron-right"}
            size={18}
            color={DS_COLORS.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Screens */}
      <FlatList
        ref={flatListRef}
        data={screens}
        renderItem={renderScreen}
        keyExtractor={(item) => item.screen_key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Bottom Controls */}
      <View style={s.bottomControls}>
        {/* Pagination Dots */}
        <View style={s.dotsContainer}>
          {screens.map((_, index) => (
            <View
              key={index}
              style={[s.dot, index === currentIndex && s.dotActive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={s.buttonsRow}>
          {/* Secondary Button */}
          {currentScreen?.secondary_button_text && (
            <TouchableOpacity
              onPress={handleSecondary}
              style={s.secondaryButton}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryButtonText}>
                {currentScreen.secondary_button_text}
              </Text>
            </TouchableOpacity>
          )}

          {/* Primary Button */}
          <TouchableOpacity
            onPress={handlePrimary}
            style={[
              s.primaryButton,
              !currentScreen?.secondary_button_text && s.primaryButtonFull,
            ]}
            activeOpacity={0.8}
          >
            <Text style={s.primaryButtonText}>
              {currentScreen?.primary_button_text ?? (I18nManager.isRTL ? "הבא" : "Next")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  skipRow: {
    flexDirection: "row",
    justifyContent: I18nManager.isRTL ? "flex-start" : "flex-end",
    paddingHorizontal: DS_SPACING.lg,
    paddingTop: DS_SPACING.sm,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: DS_SPACING.xs,
  },
  skipText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    fontWeight: DS_WEIGHT.medium as any,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DS_SPACING.xl,
  },
  visualContainer: {
    width: 160,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: DS_SPACING.xl,
  },
  image: {
    width: 160,
    height: 160,
    borderRadius: DS_RADIUS.lg,
  },
  title: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.md,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  body: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: DS_SPACING.md,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  bottomControls: {
    paddingHorizontal: DS_SPACING.lg,
    paddingBottom: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DS_COLORS.border,
  },
  dotActive: {
    backgroundColor: DS_COLORS.primary,
    width: 24,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: DS_SPACING.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: DS_COLORS.primary,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.full,
    alignItems: "center",
  },
  primaryButtonFull: {
    flex: 1,
  },
  primaryButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: "#FFFFFF",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: DS_COLORS.card,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.full,
    alignItems: "center",
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  secondaryButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium as any,
    color: DS_COLORS.textPrimary,
  },
});
