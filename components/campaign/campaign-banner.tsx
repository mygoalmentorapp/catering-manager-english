/**
 * CampaignBanner — Non-blocking banner campaign component.
 *
 * Design:
 * - Slides in from top or bottom (based on campaign payload)
 * - Does NOT block user interaction with the app
 * - Dismissible via swipe or X button
 * - Compact: icon + text + optional action button
 * - RTL Hebrew text alignment
 * - Auto-dismiss after configurable duration (default: no auto-dismiss)
 *
 * Usage in remote_campaigns table:
 *   type: "banner"
 *   primary_button_payload: { position: "top" | "bottom", auto_dismiss_seconds: 10 }
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CampaignBannerProps {
  campaign: RemoteCampaign;
  visible: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onClose: () => void;
}

// ── Constants ──

const SCREEN_WIDTH = Dimensions.get("window").width;
const BANNER_MARGIN = 16;
const BANNER_WIDTH = SCREEN_WIDTH - BANNER_MARGIN * 2;
const SLIDE_DURATION = 300;
const SLIDE_DISTANCE = 120;

// ── Component ──

export function CampaignBanner({
  campaign,
  visible,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
}: CampaignBannerProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-SLIDE_DISTANCE)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine position from payload (default: top)
  const position = (campaign.primary_button_payload?.position as string) || "top";
  const isTop = position === "top";
  const autoDismissSeconds = (campaign.primary_button_payload?.auto_dismiss_seconds as number) || 0;

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss if configured
      if (autoDismissSeconds > 0) {
        autoDismissTimer.current = setTimeout(() => {
          onClose();
        }, autoDismissSeconds * 1000);
      }
    } else {
      // Reset
      slideAnim.setValue(isTop ? -SLIDE_DISTANCE : SLIDE_DISTANCE);
      opacityAnim.setValue(0);
    }

    return () => {
      if (autoDismissTimer.current) {
        clearTimeout(autoDismissTimer.current);
        autoDismissTimer.current = null;
      }
    };
  }, [visible]);

  const handleDismiss = useCallback(() => {
    // Slide out animation, then close
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isTop ? -SLIDE_DISTANCE : SLIDE_DISTANCE,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose, isTop]);

  if (!visible) return null;

  const isDismissible = campaign.dismissible;
  const hasActionButton = !!campaign.primary_button_text;

  return (
    <Animated.View
      style={[
        s.container,
        isTop
          ? { top: insets.top + DS_SPACING.md }
          : { bottom: insets.bottom + DS_SPACING.md + (Platform.OS === "ios" ? 60 : 70) },
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={s.banner}>
        {/* Icon */}
        {campaign.icon && (
          <View style={s.iconContainer}>
            <MaterialIcons
              name={_resolveIcon(campaign.icon)}
              size={24}
              color={DS_COLORS.accent}
            />
          </View>
        )}

        {/* Content */}
        <View style={s.content}>
          {campaign.title && (
            <Text style={s.title} numberOfLines={1}>
              {campaign.title}
            </Text>
          )}
          {campaign.message && (
            <Text style={s.message} numberOfLines={2}>
              {campaign.message}
            </Text>
          )}
        </View>

        {/* Action Button */}
        {hasActionButton && (
          <TouchableOpacity
            style={s.actionButton}
            onPress={onPrimaryAction}
            activeOpacity={0.7}
          >
            <Text style={s.actionButtonText} numberOfLines={1}>
              {campaign.primary_button_text}
            </Text>
          </TouchableOpacity>
        )}

        {/* Close Button */}
        {isDismissible && (
          <TouchableOpacity
            style={s.closeButton}
            onPress={handleDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <MaterialIcons name="close" size={18} color={DS_COLORS.textSecondary} />
          </TouchableOpacity>
        )}
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
  };

  return SAFE_ICONS[icon] || "campaign";
}

// ── Styles ──

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: BANNER_MARGIN,
    right: BANNER_MARGIN,
    zIndex: 1000,
    alignItems: "center",
  },
  banner: {
    width: BANNER_WIDTH,
    flexDirection: "row-reverse", // RTL
    alignItems: "center",
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.lg,
    gap: DS_SPACING.sm,
    ...DS_SHADOW.card,
    // Border for subtle definition
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  message: {
    fontSize: DS_FONT.caption,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    lineHeight: 18,
    writingDirection: "rtl",
  },
  actionButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.full,
    paddingVertical: DS_SPACING.sm,
    paddingHorizontal: DS_SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.caption,
    fontWeight: DS_WEIGHT.bold,
    writingDirection: "rtl",
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: DS_COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
