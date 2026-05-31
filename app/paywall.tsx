/**
 * Paywall Screen — Displays Adapty paywall based on placement ID.
 *
 * Route: /paywall?placement=settings (or main, onboarding, feature_limit)
 *
 * States handled:
 * 1. Loading — spinner while fetching paywall
 * 2. No paywall available — friendly message with back button
 * 3. Adapty error — error message with retry option
 * 4. Mock mode (Expo Go / web) — info message explaining dev client needed
 * 5. Success — renders AdaptyPaywallView
 *
 * RTL: Full Hebrew support, all text right-aligned.
 */

import { useEffect, useState, useCallback } from "react";
import { setOneSignalScreenTrigger } from "@/lib/onesignal-bootstrap";
import { View, Text, ActivityIndicator, StyleSheet, Pressable, I18nManager, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS } from "@/lib/design-system";
import * as AdaptyService from "@/lib/services/adapty-service";
import { ADAPTY_PLACEMENTS, type AdaptyPlacementId } from "@/lib/services/adapty-service";

// AdaptyPaywallView is native-only (since react-native-adapty 3.14+, UI is in main package).
// On web/Expo Go it's not available.
let AdaptyPaywallView: any = null;
if (Platform.OS !== "web") {
  try {
    const adaptyModule = require("react-native-adapty");
    AdaptyPaywallView = adaptyModule?.AdaptyPaywallView || null;
  } catch {
    // Not available — will show mock mode message
  }
}

type PaywallState = "loading" | "ready" | "no_paywall" | "error" | "mock_mode";

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placement?: string }>();
  const placementId = (params.placement || "settings") as AdaptyPlacementId;

  const [state, setState] = useState<PaywallState>("loading");
  const [paywall, setPaywall] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // OneSignal in-app message trigger
  useEffect(() => { setOneSignalScreenTrigger("paywall"); }, []);

  // Validate placement ID
  const isValidPlacement = Object.values(ADAPTY_PLACEMENTS).includes(placementId);

  const fetchPaywall = useCallback(async () => {
    setState("loading");
    setErrorMessage("");

    // Check mock mode
    if (AdaptyService.isMockMode() || !AdaptyService.isActivated()) {
      setState("mock_mode");
      return;
    }

    // Check if AdaptyPaywallView is available
    if (!AdaptyPaywallView) {
      setState("mock_mode");
      return;
    }

    if (!isValidPlacement) {
      setState("error");
      setErrorMessage(`Placement ID לא תקין: "${placementId}"`);
      return;
    }

    try {
      const result = await AdaptyService.getPaywall(placementId);
      if (result) {
        setPaywall(result);
        setState("ready");
      } else {
        setState("no_paywall");
      }
    } catch (err: any) {
      setState("error");
      setErrorMessage(err?.message || "שגיאה לא ידועה");
    }
  }, [placementId, isValidPlacement]);

  useEffect(() => {
    fetchPaywall();
  }, [fetchPaywall]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)" as any);
    }
  }, [router]);

  const handlePurchaseCompleted = useCallback(() => {
    handleClose();
  }, [handleClose]);

  const handleRestoreCompleted = useCallback(() => {
    handleClose();
  }, [handleClose]);

  // ============ RENDER STATES ============

  if (state === "loading") {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={DS_COLORS.accent} />
          <Text style={styles.loadingText}>טוען מסך תשלום...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (state === "mock_mode") {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>🧪</Text>
          <Text style={styles.title}>מצב פיתוח</Text>
          <Text style={styles.description}>
            מסך התשלום זמין רק ב-Dev Client או בגרסת ייצור.{"\n"}
            ב-Expo Go ובאינטרנט, Adapty לא פעיל.
          </Text>
          <Text style={styles.hint}>
            בנה APK עם dev client כדי לבדוק את מסך התשלום.
          </Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (state === "no_paywall") {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>📋</Text>
          <Text style={styles.title}>אין מסך תשלום זמין</Text>
          <Text style={styles.description}>
            לא הוגדר מסך תשלום עבור placement "{placementId}" בדשבורד של Adapty.{"\n"}
            נא להגדיר paywall ולחבר אותו ל-placement הזה.
          </Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (state === "error") {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centered}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>שגיאה בטעינת מסך התשלום</Text>
          <Text style={styles.description}>{errorMessage}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={fetchPaywall}
              style={({ pressed }) => [styles.button, styles.retryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>נסה שוב</Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>חזרה</Text>
            </Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ============ READY — Render Adapty Paywall ============

  if (state === "ready" && paywall && AdaptyPaywallView) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.paywallContainer}>
          {/* Close button */}
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>

          <AdaptyPaywallView
            paywall={paywall}
            onPurchaseCompleted={handlePurchaseCompleted}
            onRestoreCompleted={handleRestoreCompleted}
            onCloseButtonPress={handleClose}
            style={styles.paywallView}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Fallback
  return null;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DS_SPACING.xxl,
  },
  icon: {
    fontSize: 48,
    marginBottom: DS_SPACING.lg,
  },
  title: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.md,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.lg,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  hint: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: DS_SPACING.xl,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  loadingText: {
    marginTop: DS_SPACING.lg,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  button: {
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.xxl,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    minWidth: 120,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  buttonRow: {
    flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
    gap: DS_SPACING.md,
  },
  retryButton: {
    backgroundColor: DS_COLORS.accent,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  secondaryButtonText: {
    color: DS_COLORS.textPrimary,
  },
  paywallContainer: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    top: DS_SPACING.md,
    right: I18nManager.isRTL ? undefined : DS_SPACING.lg,
    left: I18nManager.isRTL ? DS_SPACING.lg : undefined,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: DS_COLORS.white,
    fontSize: 18,
    fontWeight: DS_WEIGHT.bold,
  },
  paywallView: {
    flex: 1,
  },
});
