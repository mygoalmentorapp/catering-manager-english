/**
 * CampaignModal — Centered modal with image support.
 *
 * Design:
 * - Centered card with semi-transparent backdrop
 * - Supports hero image at top
 * - Icon, title, subtitle, message
 * - 1-2 action buttons
 * - Dismissible via X or backdrop tap
 * - Scale + fade animation
 * - RTL Hebrew text alignment
 *
 * Usage in remote_campaigns table:
 *   type: "modal"
 *   image_url: "https://..." (optional hero image)
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
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CampaignModalProps {
  campaign: RemoteCampaign;
  visible: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onClose: () => void;
}

// ── Constants ──

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MODAL_WIDTH = Math.min(SCREEN_WIDTH - 48, 360);
const MAX_MODAL_HEIGHT = SCREEN_HEIGHT * 0.75;
const ANIM_DURATION = 250;

// ── Component ──

export function CampaignModal({
  campaign,
  visible,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
}: CampaignModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose]);

  if (!visible) return null;

  const isDismissible = campaign.dismissible;
  const hasImage = !!campaign.image_url;

  return (
    <View style={s.overlay} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={isDismissible ? handleDismiss : undefined}
        />
      </Animated.View>

      {/* Modal */}
      <Animated.View
        style={[
          s.modal,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Close Button */}
        {isDismissible && (
          <TouchableOpacity
            style={s.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <MaterialIcons name="close" size={20} color={DS_COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        <ScrollView
          style={{ maxHeight: MAX_MODAL_HEIGHT - 80 }}
          contentContainerStyle={s.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Image */}
          {hasImage && (
            <View style={s.imageContainer}>
              <Image
                source={{ uri: campaign.image_url! }}
                style={s.image}
                contentFit="cover"
              />
            </View>
          )}

          {/* Icon (only if no image) */}
          {campaign.icon && !hasImage && (
            <View style={s.iconContainer}>
              <MaterialIcons
                name={_resolveIcon(campaign.icon)}
                size={40}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  modal: {
    width: MODAL_WIDTH,
    maxHeight: MAX_MODAL_HEIGHT,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.xl,
    overflow: "hidden",
    ...DS_SHADOW.card,
  },
  closeButton: {
    position: "absolute",
    top: DS_SPACING.md,
    left: DS_SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DS_COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  contentContainer: {
    paddingBottom: DS_SPACING.lg,
    gap: DS_SPACING.md,
  },
  imageContainer: {
    width: "100%",
    height: 180,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: DS_SPACING.xxl,
  },
  title: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    paddingHorizontal: DS_SPACING.xxl,
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    paddingHorizontal: DS_SPACING.xxl,
    writingDirection: "rtl",
  },
  message: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    lineHeight: 22,
    paddingHorizontal: DS_SPACING.xxl,
    writingDirection: "rtl",
  },
  buttonContainer: {
    paddingHorizontal: DS_SPACING.xxl,
    paddingBottom: DS_SPACING.xxl,
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
