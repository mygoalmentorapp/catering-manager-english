/**
 * AdaptyBootstrap — Invisible component that initializes Adapty SDK at app startup.
 *
 * Responsibilities:
 * 1. Activate Adapty SDK with the public key
 * 2. Identify user when authenticated (Supabase user ID)
 * 3. Sync full user attributes after identification (appLanguage, orderCount, daysSinceInstall, onboardingCompleted)
 * 4. Re-sync attributes on app foreground (AppState change)
 * 5. Logout from Adapty when user signs out
 *
 * Mount this component once inside AuthProvider (needs useAuth).
 * Place it alongside ExperienceBootstrap in the provider chain.
 *
 * NOTE: This component is mounted OUTSIDE DataProvider, so it cannot use useData().
 * Instead it uses trpc directly to fetch counts when syncing attributes.
 */

import { useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { useAuth } from "./auth-context";
import * as AdaptyService from "./services/adapty-service";
import { devLog } from "./services/environment";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "./trpc";

const TAG = "AdaptyBoot";

// Get the SDK key from environment
const ADAPTY_SDK_KEY = process.env.EXPO_PUBLIC_ADAPTY_KEY || "";

// Key for storing install date
const INSTALL_DATE_KEY = "@adapty_install_date";

/**
 * Get or set the install date. First call stores current date, subsequent calls return stored date.
 */
async function getInstallDate(): Promise<Date> {
  try {
    const stored = await AsyncStorage.getItem(INSTALL_DATE_KEY);
    if (stored) {
      return new Date(stored);
    }
    // First time — store now
    const now = new Date().toISOString();
    await AsyncStorage.setItem(INSTALL_DATE_KEY, now);
    return new Date(now);
  } catch {
    return new Date();
  }
}

export function AdaptyBootstrap(): null {
  const { user, isAuthenticated } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);
  const activatedRef = useRef(false);
  const lastSyncRef = useRef<number>(0);
  const utils = trpc.useUtils();

  // Full attribute sync function
  const syncFullAttributes = useCallback(async () => {
    // Throttle: don't sync more than once per 5 minutes
    const now = Date.now();
    if (now - lastSyncRef.current < 5 * 60 * 1000) return;
    lastSyncRef.current = now;

    try {
      const installDate = await getInstallDate();
      const daysSinceInstall = Math.floor(
        (Date.now() - installDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check onboarding status from AsyncStorage
      const onboardingComplete = await AsyncStorage.getItem("onboarding_complete");

      // Try to get order/product counts from tRPC cache (non-blocking)
      let orderCount = 0;
      let recipeCount = 0;
      try {
        const ordersData = utils.cloudData.orders.list.getData();
        const productsData = utils.cloudData.products.list.getData();
        orderCount = ordersData?.length ?? 0;
        recipeCount = productsData?.length ?? 0;
      } catch {
        // Cache miss — use 0, will sync correctly next time
      }

      await AdaptyService.syncUserAttributes({
        appLanguage: Constants.expoConfig?.extra?.appLanguage || "he",
        orderCount,
        recipeCount,
        daysSinceInstall,
        onboardingCompleted: onboardingComplete === "true",
      });
      devLog(TAG, `Attributes synced: orders=${orderCount}, products=${recipeCount}, days=${daysSinceInstall}`);
    } catch (err: any) {
      devLog(TAG, "Attribute sync error (non-fatal):", err?.message);
    }
  }, [utils]);

  // Step 1: Activate SDK on mount
  useEffect(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;

    (async () => {
      await AdaptyService.activate(ADAPTY_SDK_KEY);
      devLog(TAG, "Adapty activated, mock mode:", AdaptyService.isMockMode());
      // Initialize install date on first launch
      await getInstallDate();
    })();
  }, []);

  // Step 2: Identify / logout based on auth state
  useEffect(() => {
    const currentUserId = user?.id || null;

    // User signed in (or changed)
    if (currentUserId && currentUserId !== prevUserIdRef.current) {
      prevUserIdRef.current = currentUserId;
      (async () => {
        await AdaptyService.identify(currentUserId);
        devLog(TAG, "User identified:", currentUserId);

        // Full attribute sync on login
        lastSyncRef.current = 0; // Reset throttle for fresh login
        await syncFullAttributes();

        // TODO: OneSignal Integration — Wire when OneSignal SDK is installed
        // After installing react-native-onesignal and initializing it:
        //   import OneSignal from "react-native-onesignal";
        //   const subId = OneSignal.User.pushSubscription.getPushSubscriptionId();
        //   if (subId) await AdaptyService.setOneSignalSubscriptionId(subId);
        // This sends the OneSignal subscription ID to Adapty for server-to-server
        // communication (subscription status tags, events, etc.)
        // The same Supabase user.id is used for both Adapty and OneSignal identification.
      })();
    }

    // User signed out
    if (!currentUserId && prevUserIdRef.current) {
      prevUserIdRef.current = null;
      AdaptyService.logout();
      devLog(TAG, "User logged out from Adapty");
    }
  }, [user, isAuthenticated, syncFullAttributes]);

  // Step 3: Re-sync attributes when app comes to foreground
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncFullAttributes();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id, syncFullAttributes]);

  return null;
}
