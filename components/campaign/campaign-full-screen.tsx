/**
 * CampaignFullScreen — Full-screen takeover for promotions and announcements.
 *
 * Design:
 * - Covers entire screen with background image or gradient
 * - Large title + message
 * - 1-2 action buttons at bottom
 * - Close button in top-left corner
 * - Fade-in animation
 * - RTL Hebrew text alignment
 *
 * Usage in remote_campaigns table:
 *   type: "full_screen"
 *   image_url: "https://..." (background image)
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  StatusBar,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CampaignFullScreenProps {
  campaign: RemoteCampaign;
  visible: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onClose: () => void;
}

// ── Constants ──

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const ANIM_DURATION = 300;

// ── Component ──

export function CampaignFullScreen({
  campaign,
  visible,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
}: CampaignFullScreenProps) {
  const insets = useSafeAreaInsets();
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    Animated.timing(opacityAnim, {
      toValue: 0,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [onClose]);

  if (!visible) return null;

  const isDismissible = campaign.dismissible;
  const hasImage = !!campaign.image_url;

  return (
    <Animated.View style={[s.container, { opacity: opacityAnim }]}>
      <StatusBar barStyle="light-content" />

      {/* Background Image */}
      {hasImage && (
        <Image
          source={{ uri: campaign.image_url! }}
          style={s.backgroundImage}
          contentFit="cover"
        />
      )}

      {/* Gradient Overlay (for readability over image) */}
      <View style={s.gradientOverlay} />

      {/* Close Button */}
      {isDismissible && (
        <TouchableOpacity
          style={[s.closeButton, { top: insets.top + DS_SPACING.md }]}
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="close" size={24} color={DS_COLORS.white} />
        </TouchableOpacity>
      )}

      {/* Content */}
      <View style={[s.content, { paddingBottom: insets.bottom + DS_SPACING.xxl }]}>
        {/* Icon (only if no image) */}
        {campaign.icon && !hasImage && (
          <View style={s.iconContainer}>
            <MaterialIcons
              name={_resolveIcon(campaign.icon)}
              size={48}
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

        {/* Spacer */}
        <View style={{ flex: 1 }} />

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
      </View>
    </Animated.View>
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
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DS_COLORS.primary,
    zIndex: 2000,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  closeButton: {
    position: "absolute",
    left: DS_SPACING.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxxl,
    paddingTop: 100,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: DS_SPACING.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.white,
    textAlign: "right",
    marginBottom: DS_SPACING.md,
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.medium,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "right",
    marginBottom: DS_SPACING.sm,
    writingDirection: "rtl",
  },
  message: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.regular,
    color: "rgba(255, 255, 255, 0.75)",
    textAlign: "right",
    lineHeight: 24,
    writingDirection: "rtl",
  },
  buttonContainer: {
    gap: DS_SPACING.md,
  },
  primaryButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.full,
    paddingVertical: DS_SPACING.lg,
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
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: DS_RADIUS.full,
    paddingVertical: DS_SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium,
    writingDirection: "rtl",
  },
});
