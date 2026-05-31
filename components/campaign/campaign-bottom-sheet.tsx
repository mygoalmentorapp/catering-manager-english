/**
 * CampaignBottomSheet — Slides up from bottom for longer content.
 *
 * Design:
 * - Slides up from the bottom of the screen
 * - Covers ~60% of screen height (configurable via payload)
 * - Semi-transparent backdrop (tappable to dismiss if dismissible)
 * - Drag handle at top
 * - Supports: icon, title, subtitle, message, image, 2 buttons
 * - RTL Hebrew text alignment
 *
 * Usage in remote_campaigns table:
 *   type: "bottom_sheet"
 *   primary_button_payload: { height_percent: 60 }
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CampaignBottomSheetProps {
  campaign: RemoteCampaign;
  visible: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onClose: () => void;
}

// ── Constants ──

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SLIDE_DURATION = 350;
const DEFAULT_HEIGHT_PERCENT = 60;

// ── Component ──

export function CampaignBottomSheet({
  campaign,
  visible,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
}: CampaignBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const heightPercent = (campaign.primary_button_payload?.height_percent as number) || DEFAULT_HEIGHT_PERCENT;
  const sheetHeight = (SCREEN_HEIGHT * heightPercent) / 100;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose]);

  if (!visible) return null;

  const isDismissible = campaign.dismissible;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[s.backdrop, { opacity: backdropAnim }]}
        pointerEvents={isDismissible ? "auto" : "none"}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={isDismissible ? handleDismiss : undefined}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          s.sheet,
          {
            height: sheetHeight,
            paddingBottom: insets.bottom + DS_SPACING.lg,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Drag Handle */}
        <View style={s.handleContainer}>
          <View style={s.handle} />
        </View>

        {/* Close Button */}
        {isDismissible && (
          <TouchableOpacity
            style={s.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <MaterialIcons name="close" size={22} color={DS_COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Content */}
        <ScrollView
          style={s.scrollContent}
          contentContainerStyle={s.scrollContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Image */}
          {campaign.image_url && (
            <View style={s.imageContainer}>
              <Image
                source={{ uri: campaign.image_url }}
                style={s.image}
                contentFit="cover"
              />
            </View>
          )}

          {/* Icon */}
          {campaign.icon && !campaign.image_url && (
            <View style={s.iconContainer}>
              <MaterialIcons
                name={_resolveIcon(campaign.icon)}
                size={36}
                color={DS_COLORS.accent}
              />
            </View>
          )}

          {/* Title */}
          {campaign.title && (
            <Text style={s.title}>{campaign.title}</Text>
          )}

          {/* Subtitle */}
          {campaign.subtitle && (
            <Text style={s.subtitle}>{campaign.subtitle}</Text>
          )}

          {/* Message */}
          {campaign.message && (
            <Text style={s.message}>{campaign.message}</Text>
          )}
        </ScrollView>

        {/* Buttons */}
        <View style={s.buttonContainer}>
          {campaign.primary_button_text && (
            <TouchableOpacity
              style={s.primaryButton}
              onPress={onPrimaryAction}
              activeOpacity={0.8}
            >
              <Text style={s.primaryButtonText}>{campaign.primary_button_text}</Text>
            </TouchableOpacity>
          )}
          {campaign.secondary_button_text && (
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={onSecondaryAction}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryButtonText}>{campaign.secondary_button_text}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ── Icon Resolver ──

function _resolveIcon(icon: string): React.ComponentProps<typeof MaterialIcons>["name"] {
  const SAFE_ICONS: Record<string, React.ComponentProps<typeof MaterialIcons>["name"]> = {
    "rate-review": "rate-review",
    "feedback": "feedback",
    "star": "star",
    "thumb-up": "thumb-up",
    "favorite": "favorite",
    "chat": "chat",
    "campaign": "campaign",
    "celebration": "celebration",
    "emoji-events": "emoji-events",
    "lightbulb": "lightbulb",
    "info": "info",
    "help": "help",
    "new-releases": "new-releases",
    "local-offer": "local-offer",
    "notifications": "notifications",
    "announcement": "announcement",
    "shopping-cart": "shopping-cart",
    "restaurant": "restaurant",
  };
  return SAFE_ICONS[icon] || "campaign";
}

// ── Styles ──

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: DS_COLORS.card,
    borderTopLeftRadius: DS_RADIUS.xl,
    borderTopRightRadius: DS_RADIUS.xl,
    ...DS_SHADOW.card,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: DS_SPACING.md,
    paddingBottom: DS_SPACING.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: DS_COLORS.border,
  },
  closeButton: {
    position: "absolute",
    top: DS_SPACING.md,
    left: DS_SPACING.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DS_COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: DS_SPACING.xxl,
    paddingTop: DS_SPACING.md,
    paddingBottom: DS_SPACING.lg,
    gap: DS_SPACING.md,
  },
  imageContainer: {
    width: "100%",
    height: 160,
    borderRadius: DS_RADIUS.lg,
    overflow: "hidden",
    marginBottom: DS_SPACING.sm,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: DS_SPACING.sm,
  },
  title: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  message: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    lineHeight: 22,
    writingDirection: "rtl",
  },
  buttonContainer: {
    paddingHorizontal: DS_SPACING.xxl,
    gap: DS_SPACING.sm,
  },
  primaryButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.full,
    paddingVertical: DS_SPACING.md + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
    writingDirection: "rtl",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: DS_RADIUS.full,
    paddingVertical: DS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: DS_COLORS.textSecondary,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium,
    writingDirection: "rtl",
  },
});
