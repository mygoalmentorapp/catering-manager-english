/**
 * OneSignalBootstrap — Invisible component that initializes OneSignal SDK at app startup.
 *
 * Responsibilities:
 * 1. Initialize OneSignal SDK with App ID from environment variable
 * 2. Login user with Supabase user.id (same ID used for Adapty)
 * 3. Sync user tags (subscription_status, is_premium, order_count, etc.)
 * 4. Set in-app message triggers based on current screen
 * 5. Bridge to Adapty: send OneSignal subscription ID via setIntegrationIdentifier
 * 6. Graceful degradation: if ONESIGNAL_APP_ID is missing, skip all operations silently
 *
 * Mount this component once inside AuthProvider (needs useAuth).
 * Place it alongside AdaptyBootstrap in the provider chain.
 *
 * NOTE: This component is mounted OUTSIDE DataProvider, so it cannot use useData().
 * Instead it uses trpc cache to fetch counts for tags.
 */

import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState } from "react-native";
import { useAuth } from "./auth-context";
import { devLog } from "./services/environment";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "./trpc";

const TAG = "OneSignalBoot";

// Get OneSignal App ID from environment — if missing, all operations are no-ops
const ONESIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || "";

// Key for storing install date (shared with adapty-bootstrap)
const INSTALL_DATE_KEY = "@adapty_install_date";

/**
 * Check if OneSignal is available (SDK installed + App ID configured)
 */
function isOneSignalAvailable(): boolean {
  if (!ONESIGNAL_APP_ID) {
    return false;
  }
  // On web, OneSignal native SDK is not available
  if (Platform.OS === "web") {
    return false;
  }
  return true;
}

/**
 * Lazy-load OneSignal module — returns null if not available
 */
function getOneSignal(): typeof import("react-native-onesignal").OneSignal | null {
  if (!isOneSignalAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OneSignal = require("react-native-onesignal").OneSignal;
    return OneSignal;
  } catch (err: any) {
    devLog(TAG, "OneSignal SDK not available:", err?.message);
    return null;
  }
}

export function OneSignalBootstrap(): null {
  const { user, isAuthenticated, profile } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const lastTagSyncRef = useRef<number>(0);
  const utils = trpc.useUtils();

  // ─── Tag sync function ───────────────────────────────────────────────
  const syncTags = useCallback(async () => {
    const OneSignal = getOneSignal();
    if (!OneSignal || !user?.id) return;

    // Throttle: don't sync more than once per 5 minutes
    const now = Date.now();
    if (now - lastTagSyncRef.current < 5 * 60 * 1000) return;
    lastTagSyncRef.current = now;

    try {
      // Calculate days since install
      let daysSinceInstall = 0;
      try {
        const stored = await AsyncStorage.getItem(INSTALL_DATE_KEY);
        if (stored) {
          daysSinceInstall = Math.floor(
            (Date.now() - new Date(stored).getTime()) / (1000 * 60 * 60 * 24)
          );
        }
      } catch { /* use 0 */ }

      // Check onboarding status
      const onboardingComplete = await AsyncStorage.getItem("onboarding_complete");

      // Get order/product counts from tRPC cache
      let orderCount = 0;
      let recipeCount = 0;
      try {
        const ordersData = utils.cloudData.orders.list.getData();
        const productsData = utils.cloudData.products.list.getData();
        orderCount = ordersData?.length ?? 0;
        recipeCount = productsData?.length ?? 0;
      } catch { /* cache miss — use 0 */ }

      // Determine subscription status
      const subscriptionStatus = profile?.subscription_status || "free";
      const isPremium = subscriptionStatus === "active" || subscriptionStatus === "free_access";

      // Build tags object
      const tags: Record<string, string> = {
        subscription_status: subscriptionStatus,
        is_premium: isPremium ? "true" : "false",
        order_count: String(orderCount),
        recipe_count: String(recipeCount),
        app_language: Constants.expoConfig?.extra?.appLanguage || "he",
        days_since_install: String(daysSinceInstall),
        onboarding_completed: onboardingComplete === "true" ? "true" : "false",
        platform: Platform.OS,
      };

      OneSignal.User.addTags(tags);
      devLog(TAG, "Tags synced:", JSON.stringify(tags));
    } catch (err: any) {
      devLog(TAG, "Tag sync error (non-fatal):", err?.message);
    }
  }, [user?.id, profile?.subscription_status, utils]);

  // ─── Step 1: Initialize SDK on mount ─────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    const OneSignal = getOneSignal();
    if (!OneSignal) {
      if (!ONESIGNAL_APP_ID) {
        devLog(TAG, "⚠️ EXPO_PUBLIC_ONESIGNAL_APP_ID not set — OneSignal disabled");
      }
      return;
    }

    initializedRef.current = true;

    try {
      // Initialize with App ID
      OneSignal.initialize(ONESIGNAL_APP_ID);
      devLog(TAG, "OneSignal initialized with App ID:", ONESIGNAL_APP_ID.substring(0, 8) + "...");

      // Request notification permission (non-blocking)
      OneSignal.Notifications.requestPermission(false);
    } catch (err: any) {
      devLog(TAG, "OneSignal init error (non-fatal):", err?.message);
    }
  }, []);

  // ─── Step 2: Login/logout based on auth state ────────────────────────
  useEffect(() => {
    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    const currentUserId = user?.id || null;

    // User signed in (or changed)
    if (currentUserId && currentUserId !== prevUserIdRef.current) {
      prevUserIdRef.current = currentUserId;

      try {
        // Login with same Supabase user ID used for Adapty
        OneSignal.login(currentUserId);
        devLog(TAG, "User logged in:", currentUserId);

        // Bridge to Adapty: send OneSignal push subscription ID
        bridgeToAdapty(OneSignal);

        // Sync tags immediately on login
        lastTagSyncRef.current = 0; // Reset throttle
        syncTags();
      } catch (err: any) {
        devLog(TAG, "Login error (non-fatal):", err?.message);
      }
    }

    // User signed out
    if (!currentUserId && prevUserIdRef.current) {
      prevUserIdRef.current = null;
      try {
        OneSignal.logout();
        devLog(TAG, "User logged out from OneSignal");
      } catch (err: any) {
        devLog(TAG, "Logout error (non-fatal):", err?.message);
      }
    }
  }, [user, isAuthenticated, syncTags]);

  // ─── Step 3: Re-sync tags when app comes to foreground ───────────────
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!isOneSignalAvailable()) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncTags();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id, syncTags]);

  return null;
}

// ─── Adapty ↔ OneSignal Bridge ───────────────────────────────────────────────

/**
 * Send OneSignal push subscription ID to Adapty for server-to-server integration.
 * Uses the official key name: "one_signal_subscription_id"
 * (from Adapty docs: https://adapty.io/docs/migration-to-react-native330)
 */
async function bridgeToAdapty(OneSignal: any): Promise<void> {
  try {
    // Listen for subscription changes and send to Adapty
    OneSignal.User.pushSubscription.addEventListener("change", async (subscription: any) => {
      const subscriptionId = subscription?.current?.id;
      if (subscriptionId) {
        try {
          const { adapty } = require("react-native-adapty");
          await adapty.setIntegrationIdentifier("one_signal_subscription_id", subscriptionId);
          devLog(TAG, "Adapty bridge: sent OneSignal subscription ID:", subscriptionId.substring(0, 8) + "...");
        } catch (err: any) {
          devLog(TAG, "Adapty bridge error (non-fatal):", err?.message);
        }
      }
    });

    // Also try to send current subscription ID immediately
    const currentId = OneSignal.User.pushSubscription.getPushSubscriptionId?.();
    if (currentId) {
      const { adapty } = require("react-native-adapty");
      await adapty.setIntegrationIdentifier("one_signal_subscription_id", currentId);
      devLog(TAG, "Adapty bridge: sent current subscription ID");
    }
  } catch (err: any) {
    devLog(TAG, "Adapty bridge setup error (non-fatal):", err?.message);
  }
}

// ─── In-App Message Triggers ─────────────────────────────────────────────────

/**
 * Set an in-app message trigger for the current screen.
 * Call this from screen components to enable screen-based in-app messages.
 *
 * Usage:
 *   import { setOneSignalScreenTrigger } from "@/lib/onesignal-bootstrap";
 *   useEffect(() => { setOneSignalScreenTrigger("home"); }, []);
 *
 * Available screen keys:
 * - "home" — main home screen
 * - "settings" — settings screen
 * - "orders" — orders list
 * - "products" — products list
 * - "shopping_list" — shopping list screen
 * - "paywall" — paywall screen
 */
export function setOneSignalScreenTrigger(screenKey: string): void {
  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  try {
    OneSignal.InAppMessages.addTrigger("screen", screenKey);
    devLog(TAG, "Screen trigger set:", screenKey);
  } catch (err: any) {
    devLog(TAG, "Trigger error (non-fatal):", err?.message);
  }
}

/**
 * Remove the screen trigger (call on screen unmount if needed).
 */
export function removeOneSignalScreenTrigger(): void {
  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  try {
    OneSignal.InAppMessages.removeTrigger("screen");
  } catch { /* non-fatal */ }
}
