import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  ViewToken,
  I18nManager,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { OnboardingSlide } from "@/components/onboarding-slide";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import { DynamicOnboardingRenderer } from "@/components/dynamic-onboarding-renderer";
import { DynamicOnboardingService, type ActiveOnboardingFlow } from "@/lib/services/dynamic-onboarding-service";
import { useConfig } from "@/lib/config-context";
import { ExperienceEventService, EVENT_NAMES } from "@/lib/services/experience-event-service";
import { UserExperienceStateService } from "@/lib/services/user-experience-state-service";

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
    title: "ברוך הבא לניהול קייטרינג פרו",
    description: "הכלי שיעזור לך לנהל את עסק הקייטרינג שלך בקלות ובמקצועיות",
    iconName: "restaurant",
    accentColor: "#3AAFA9",
  },
  {
    id: "products",
    title: "ניהול מוצרים",
    description: "הגדר את המוצרים שלך, מחירים, עלויות וקטגוריות — הכל במקום אחד",
    iconName: "inventory-2",
    accentColor: "#4CAF50",
  },
  {
    id: "orders",
    title: "ניהול הזמנות",
    description: "צור הזמנות, עקוב אחרי סטטוסים, ונהל את כל הלקוחות שלך בקלות",
    iconName: "receipt-long",
    accentColor: "#2196F3",
  },
  {
    id: "shopping",
    title: "רשימות קניות חכמות",
    description: "רשימת קניות אוטומטית מכל ההזמנות — חוסך לך זמן ומונע שכחה",
    iconName: "shopping-cart",
    accentColor: "#FF9800",
  },
  {
    id: "profit",
    title: "מעקב רווחים",
    description: "ראה בדיוק כמה אתה מרוויח מכל הזמנה ומכל מוצר — שליטה מלאה בעסק",
    iconName: "trending-up",
    accentColor: "#E91E63",
  },
  {
    id: "cta",
    title: "בוא נתחיל!",
    description: "צור חשבון או התחבר כדי להתחיל לנהל את העסק שלך",
    iconName: "rocket-launch",
    accentColor: "#3AAFA9",
  },
];

/**
 * In RTL mode, FlatList reverses the horizontal layout.
 * We use `inverted` to counteract this, so slides appear in logical order (0→5 left-to-right visually).
 * We also reverse the data array so the visual order matches the logical order.
 */
const isRTL = I18nManager.isRTL;

export default function OnboardingScreen() {
  const { remoteConfig, remoteConfigReady } = useConfig();
  const [dynamicFlow, setDynamicFlow] = useState<ActiveOnboardingFlow | null>(null);
  const [dynamicLoading, setDynamicLoading] = useState(true);

  // Try to load dynamic onboarding flow
  useEffect(() => {
    let cancelled = false;

    async function loadDynamic() {
      try {
        // Only attempt if dynamic_onboarding_enabled is true in remote config
        if (remoteConfigReady && remoteConfig.dynamic_onboarding_enabled) {
          DynamicOnboardingService.setReady();
          const flow = await DynamicOnboardingService.getActiveFlow();
          if (!cancelled && flow && flow.screens.length > 0) {
            setDynamicFlow(flow);
          }
        }
      } catch {
        // Fail silently — fall back to static
      } finally {
        if (!cancelled) setDynamicLoading(false);
      }
    }

    // Wait for remote config to be ready, or timeout after 3s
    if (remoteConfigReady) {
      loadDynamic();
    } else {
      const timeout = setTimeout(() => {
        if (!cancelled) setDynamicLoading(false);
      }, 3000);
      return () => { cancelled = true; clearTimeout(timeout); };
    }

    return () => { cancelled = true; };
  }, [remoteConfigReady, remoteConfig.dynamic_onboarding_enabled]);

  // Show loading briefly while checking for dynamic flow
  if (dynamicLoading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={DS_COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // If dynamic flow available, render it
  if (dynamicFlow) {
    return <DynamicOnboardingRenderer flow={dynamicFlow} />;
  }

  // Otherwise, fall back to static onboarding
  return <StaticOnboarding />;
}

/**
 * StaticOnboarding — the original hardcoded onboarding screens.
 * Used as fallback when dynamic_onboarding_enabled=false or no active flow exists.
 */
function StaticOnboarding() {
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
    // Fire onboarding_completed event (same as dynamic renderer)
    ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.ONBOARDING_COMPLETED,
      flow_key: "static_fallback",
    }).catch(() => {});
    UserExperienceStateService.onOnboardingCompleted().catch(() => {});
    router.replace("/auth/signup" as any);
  }, []);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    // Fire onboarding_completed even on skip (user saw onboarding)
    ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.ONBOARDING_COMPLETED,
      flow_key: "static_fallback_skipped",
    }).catch(() => {});
    UserExperienceStateService.onOnboardingCompleted().catch(() => {});
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
          <Text style={s.skipText}>דלג</Text>
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
          index,
        })}
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
            <Text style={s.ctaButtonText}>בוא נתחיל!</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.nextButton}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={s.nextButtonText}>הבא</Text>
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
    backgroundColor: DS_COLORS.background,
  },
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: DS_SPACING.xl,
    paddingTop: DS_SPACING.sm,
    paddingBottom: DS_SPACING.sm,
  },
  skipButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 2,
    paddingVertical: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.sm,
  },
  skipText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    fontWeight: DS_WEIGHT.medium,
  },
  bottomControls: {
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xxl,
    gap: DS_SPACING.xl,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: DS_SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DS_COLORS.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: DS_COLORS.accent,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.xs,
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    ...DS_SHADOW.button,
  },
  nextButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  ctaButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    ...DS_SHADOW.button,
  },
  ctaButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
});
