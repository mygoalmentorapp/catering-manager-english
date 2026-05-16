/**
 * EditBlockOverlay — Overlay components for edit screens.
 *
 * With offline-first support, the overlay is now INFORMATIONAL, not blocking.
 * It tells the user their changes are saved locally and will sync when online.
 *
 * Components:
 * 1. OfflineEditDialog — Friendly dismissible dialog explaining offline save
 * 2. OfflineTouchInterceptor — REMOVED (no longer blocks touches)
 * 3. useOfflineDialog — Hook to manage dialog visibility
 * 4. OfflineInfoBanner — Inline banner for edit screens showing offline status
 *
 * Usage:
 *   const { isOffline } = useEditGuard();
 *
 *   // Show inline banner (non-blocking):
 *   <OfflineInfoBanner visible={isOffline} />
 *
 *   // Or show dialog on first offline save:
 *   const { showOfflineDialog, triggerOfflineDialog, dismissOfflineDialog } = useOfflineDialog(blockReason);
 *   <OfflineEditDialog visible={showOfflineDialog} onDismiss={dismissOfflineDialog} />
 */

import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DS_COLORS, DS_FONT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";
import type { EditBlockReason } from "@/hooks/use-edit-guard";

// ============ LEGACY EXPORT (kept for backward compatibility) ============

interface EditBlockOverlayProps {
  reason: EditBlockReason;
  onBack: () => void;
}

/**
 * @deprecated No longer needed. Device binding is handled by DeviceGate,
 * and offline editing is now allowed (offline-first).
 */
export function EditBlockOverlay({ reason, onBack }: EditBlockOverlayProps) {
  return null;
}

// ============ OFFLINE INFO DIALOG ============

interface OfflineEditDialogProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Friendly dismissible dialog for offline editing.
 * Explains that changes are saved locally and will sync when online.
 * Non-blocking — user can continue editing after dismissing.
 */
export function OfflineEditDialog({ visible, onDismiss }: OfflineEditDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Cloud icon with save indicator */}
          <View style={s.cloudIconCircle}>
            <MaterialIcons name="cloud-queue" size={36} color={DS_COLORS.accent} />
          </View>

          {/* Title */}
          <Text style={s.title}>Saved on device</Text>

          {/* Main message */}
          <Text style={s.message}>
            No internet connection right now. Your changes are saved on the device and will sync to the cloud when connected.
          </Text>

          {/* Secondary message */}
          <Text style={s.secondaryMessage}>
            You can continue working as usual.
          </Text>

          {/* Dismiss button */}
          <View style={s.buttonRow}>
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                s.dismissButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={s.dismissButtonText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============ OFFLINE INFO BANNER ============

interface OfflineInfoBannerProps {
  visible: boolean;
}

/**
 * Inline banner for edit screens showing offline status.
 * Non-blocking — just informational.
 */
export function OfflineInfoBanner({ visible }: OfflineInfoBannerProps) {
  if (!visible) return null;

  return (
    <View style={s.banner}>
      <MaterialIcons name="cloud-off" size={16} color="#92400E" />
      <Text style={s.bannerText}>
        Offline mode — changes are saved on the device and will sync when connected
      </Text>
    </View>
  );
}

// ============ HOOK: useOfflineDialog ============

/**
 * Hook to manage the offline dialog visibility.
 * Shows the dialog once per offline session (not on every tap).
 */
export function useOfflineDialog(blockReason: EditBlockReason) {
  const [showDialog, setShowDialog] = useState(false);
  const [shownThisOfflineSession, setShownThisOfflineSession] = useState(false);

  const triggerOfflineDialog = useCallback(() => {
    if ((blockReason === "offline" || blockReason === "server-unreachable") && !shownThisOfflineSession) {
      setShowDialog(true);
      setShownThisOfflineSession(true);
    }
  }, [blockReason, shownThisOfflineSession]);

  const dismissOfflineDialog = useCallback(() => {
    setShowDialog(false);
  }, []);

  // Reset the "shown" flag when connection comes back
  const isOfflineBlocked = blockReason === "offline" || blockReason === "server-unreachable";
  if (!isOfflineBlocked && shownThisOfflineSession) {
    setShownThisOfflineSession(false);
  }

  const visible = showDialog && isOfflineBlocked;

  return {
    showOfflineDialog: visible,
    triggerOfflineDialog,
    dismissOfflineDialog };
}

// ============ OFFLINE TOUCH INTERCEPTOR (LEGACY — NO-OP) ============

interface OfflineTouchInterceptorProps {
  active: boolean;
  onTap: () => void;
}

/**
 * @deprecated No longer needed — offline editing is allowed.
 * Kept as a no-op for backward compatibility.
 */
export function OfflineTouchInterceptor({ active, onTap }: OfflineTouchInterceptorProps) {
  // No longer intercepts touches — offline editing is allowed
  return null;
}

// ============ STYLES ============

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: DS_SPACING.lg,
  },
  card: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl + 4,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cloudIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E0F7F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    writingDirection: "rtl",
    marginBottom: DS_SPACING.sm,
  },
  message: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 24,
    marginBottom: DS_SPACING.sm,
  },
  secondaryMessage: {
    fontSize: DS_FONT.bodySmall,
    color: "#9CA3AF",
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 22,
    marginBottom: DS_SPACING.lg,
  },
  buttonRow: {
    width: "100%",
    gap: DS_SPACING.sm,
  },
  dismissButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
  },
  dismissButtonText: {
    color: "#fff",
    fontSize: DS_FONT.body,
    fontWeight: "600",
  },
  touchInterceptor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 9999,
  },
  // Inline banner styles
  banner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: DS_RADIUS.sm,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    marginBottom: DS_SPACING.sm,
    gap: 8,
  },
  bannerText: {
    fontSize: DS_FONT.bodySmall,
    color: "#92400E",
    textAlign: "right",
    writingDirection: "rtl",
    flex: 1,
    lineHeight: 20,
  },
});
