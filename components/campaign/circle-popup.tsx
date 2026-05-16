/**
 * CirclePopup — Campaign popup component for feedback requests.
 *
 * Design:
 * - Centered rounded card with semi-transparent overlay
 * - Fade + scale animation on mount
 * - X button if campaign.dismissible === true
 * - Primary + optional secondary button
 * - RTL Hebrew text alignment
 * - Uses design system colors and typography
 *
 * Session 4 — Campaign UI Components + Feedback Circle Popup
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  StyleSheet,
  Dimensions,
  Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CirclePopupProps {
  campaign: RemoteCampaign;
  visible: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onClose: () => void;
}

// ── Constants ──

const SCREEN_WIDTH = Dimensions.get("window").width;
const POPUP_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);
const ANIMATION_DURATION = 250;

// ── Component ──

export function CirclePopup({
  campaign,
  visible,
  onPrimaryAction,
  onSecondaryAction,
  onClose }: CirclePopupProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (visible) {
      // Animate in: fade + scale
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true }),
      ]).start();
    } else {
      // Reset for next show
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.85);
    }
  }, [visible]);

  if (!visible) return null;

  const hasSecondaryButton = !!campaign.secondary_button_text;
  const isDismissible = campaign.dismissible;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={isDismissible ? onClose : undefined}
    >
      {/* Overlay */}
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={s.overlayTouch}
          activeOpacity={1}
          onPress={isDismissible ? onClose : undefined}
        />

        {/* Popup Card */}
        <Animated.View
          style={[
            s.card,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* X Close Button */}
          {isDismissible && (
            <TouchableOpacity
              style={s.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.6}
            >
              <MaterialIcons name="close" size={22} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Icon */}
          {campaign.icon && (
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
            <Text style={s.title} numberOfLines={2}>
              {campaign.title}
            </Text>
          )}

          {/* Subtitle */}
          {campaign.subtitle && (
            <Text style={s.subtitle} numberOfLines={2}>
              {campaign.subtitle}
            </Text>
          )}

          {/* Message */}
          {campaign.message && (
            <Text style={s.message} numberOfLines={4}>
              {campaign.message}
            </Text>
          )}

          {/* Buttons */}
          <View style={s.buttonContainer}>
            {/* Primary Button */}
            {campaign.primary_button_text && (
              <TouchableOpacity
                style={s.primaryButton}
                onPress={onPrimaryAction}
                activeOpacity={0.8}
              >
                <Text style={s.primaryButtonText}>
                  {campaign.primary_button_text}
                </Text>
              </TouchableOpacity>
            )}

            {/* Secondary Button */}
            {hasSecondaryButton && (
              <TouchableOpacity
                style={s.secondaryButton}
                onPress={onSecondaryAction}
                activeOpacity={0.7}
              >
                <Text style={s.secondaryButtonText}>
                  {campaign.secondary_button_text}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Icon Resolver ──

/**
 * Resolve campaign icon name to MaterialIcons name.
 * Campaign icons are stored as MaterialIcons names in the DB.
 * Falls back to "campaign" if unknown.
 */
function _resolveIcon(icon: string): React.ComponentProps<typeof MaterialIcons>["name"] {
  // Known safe icons for campaigns
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
    "help": "help" };

  return SAFE_ICONS[icon] || "campaign";
}

// ── Styles ──

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center" },
  overlayTouch: {
    ...StyleSheet.absoluteFillObject },
  card: {
    width: POPUP_WIDTH,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.xl,
    paddingTop: DS_SPACING.xxxl,
    paddingBottom: DS_SPACING.xxl,
    paddingHorizontal: DS_SPACING.xxl,
    alignItems: "center",
    ...DS_SHADOW.card,
    // Ensure card is above overlay touch
    zIndex: 10 },
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
    zIndex: 20 },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.lg },
  title: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.sm
  },
  subtitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    marginBottom: DS_SPACING.sm
  },
  message: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.regular,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: DS_SPACING.xl
  },
  buttonContainer: {
    width: "100%",
    gap: DS_SPACING.sm },
  primaryButton: {
    width: "100%",
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: DS_COLORS.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8 },
      android: {
        elevation: 4 },
      default: {} }) },
  primaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold
  },
  secondaryButton: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md,
    alignItems: "center",
    justifyContent: "center" },
  secondaryButtonText: {
    color: DS_COLORS.textSecondary,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium
  } });
