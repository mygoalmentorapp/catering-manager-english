/**
 * AdaptyService — Central wrapper around the Adapty SDK.
 *
 * Responsibilities:
 * 1. SDK activation (with mock mode for Expo Go / web)
 * 2. User identification (Supabase user ID)
 * 3. Paywall fetching by placement ID
 * 4. Subscription status (getProfile)
 * 5. OneSignal integration identifier
 * 6. Custom user attributes
 * 7. Logout / reset
 *
 * IMPORTANT: Adapty native module is only available in dev-client / production builds.
 * In Expo Go or web, all methods gracefully return safe defaults (mock mode).
 */

import { Platform } from "react-native";
import { devLog, warnLog } from "./environment";

const TAG = "Adapty";

// ============ PLACEMENT IDS ============

/**
 * All Adapty placement IDs used in the app.
 * These MUST match the placement IDs configured in the Adapty Dashboard.
 *
 * IMPORTANT: Use ONLY these constants. Never hardcode placement strings elsewhere.
 */
export const ADAPTY_PLACEMENTS = {
  /** Settings screen — manual upgrade button */
  settings: "settings",
  /** Main screen — triggered by campaign or paywall gate */
  main: "main",
  /** Onboarding flow — end of onboarding paywall */
  onboarding: "onboarding",
  /** Feature limit reached — triggered when user hits free tier limit */
  feature_limit: "feature_limit",
} as const;

export type AdaptyPlacementId = (typeof ADAPTY_PLACEMENTS)[keyof typeof ADAPTY_PLACEMENTS];

// ============ TYPES ============

/** Adapty access level status */
export interface AdaptyAccessLevel {
  id: string;
  isActive: boolean;
  vendorProductId: string | null;
  store: string | null;
  activatedAt: string | Date | null;
  renewedAt: string | Date | null;
  expiresAt: string | Date | null;
  isLifetime: boolean;
  willRenew: boolean;
  isInGracePeriod: boolean;
  unsubscribedAt: string | Date | null;
}

/** Simplified subscription status for the app */
export interface SubscriptionStatus {
  isPremium: boolean;
  accessLevel: AdaptyAccessLevel | null;
  productId: string | null;
  expiresAt: string | null;
  isLifetime: boolean;
  willRenew: boolean;
}

/** User attributes to send to Adapty for segmentation */
export interface AdaptyUserAttributes {
  business_type?: string;
  order_count?: number;
  recipe_count?: number;
  app_language?: string;
  onboarding_completed?: boolean;
  days_since_install?: number;
  platform?: string;
}

// ============ STATE ============

let _activated = false;
let _mockMode = false;
let _adaptyModule: any = null;

// ============ HELPERS ============

/**
 * Dynamically import the Adapty module.
 * Returns null if the native module isn't available (Expo Go / web).
 */
async function getAdaptyModule(): Promise<any> {
  if (_adaptyModule) return _adaptyModule;
  try {
    const mod = await import("react-native-adapty");
    _adaptyModule = mod.adapty || mod.default || mod;
    return _adaptyModule;
  } catch (err) {
    devLog(TAG, "Native module not available — using mock mode");
    return null;
  }
}

// ============ PUBLIC API ============

/**
 * Check if Adapty SDK has been activated.
 */
export function isActivated(): boolean {
  return _activated;
}

/**
 * Check if running in mock mode (no native module).
 */
export function isMockMode(): boolean {
  return _mockMode;
}

/**
 * Activate the Adapty SDK.
 * Call this once at app startup (in AdaptyBootstrap).
 *
 * @param sdkKey - The Adapty Public SDK Key (EXPO_PUBLIC_ADAPTY_KEY)
 */
export async function activate(sdkKey: string): Promise<void> {
  if (_activated) {
    devLog(TAG, "Already activated, skipping");
    return;
  }

  if (!sdkKey) {
    warnLog(TAG, "No SDK key provided — entering mock mode");
    _mockMode = true;
    _activated = true;
    return;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) {
    devLog(TAG, "Native module unavailable — entering mock mode");
    _mockMode = true;
    _activated = true;
    return;
  }

  try {
    await adapty.activate(sdkKey, {
      logLevel: __DEV__ ? "verbose" : "error",
    });
    _activated = true;
    _mockMode = false;
    devLog(TAG, "SDK activated successfully");
  } catch (err: any) {
    warnLog(TAG, "Activation failed — entering mock mode:", err?.message);
    _mockMode = true;
    _activated = true;
  }
}

/**
 * Identify the user with their Supabase user ID.
 * Call after user signs in.
 *
 * @param userId - Supabase auth user ID (UUID)
 */
export async function identify(userId: string): Promise<void> {
  if (_mockMode || !_activated) {
    devLog(TAG, "identify() skipped (mock mode or not activated)");
    return;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return;

  try {
    await adapty.identify(userId);
    devLog(TAG, "User identified:", userId.substring(0, 8) + "...");
  } catch (err: any) {
    warnLog(TAG, "identify() failed:", err?.message);
  }
}

/**
 * Logout the current user from Adapty.
 * Call when user signs out.
 */
export async function logout(): Promise<void> {
  if (_mockMode || !_activated) return;

  const adapty = await getAdaptyModule();
  if (!adapty) return;

  try {
    await adapty.logout();
    devLog(TAG, "User logged out from Adapty");
  } catch (err: any) {
    warnLog(TAG, "logout() failed:", err?.message);
  }
}

/**
 * Get a paywall by placement ID.
 * Returns the paywall object or null if unavailable.
 *
 * @param placementId - One of ADAPTY_PLACEMENTS values
 */
export async function getPaywall(placementId: AdaptyPlacementId): Promise<any | null> {
  if (_mockMode || !_activated) {
    devLog(TAG, `getPaywall("${placementId}") — mock mode, returning null`);
    return null;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return null;

  try {
    const paywall = await adapty.getPaywall(placementId);
    devLog(TAG, `Paywall fetched for placement "${placementId}"`);
    return paywall;
  } catch (err: any) {
    warnLog(TAG, `getPaywall("${placementId}") failed:`, err?.message);
    return null;
  }
}

/**
 * Get the user's subscription profile.
 * Returns the full profile object or null.
 */
export async function getProfile(): Promise<any | null> {
  if (_mockMode || !_activated) {
    devLog(TAG, "getProfile() — mock mode, returning null");
    return null;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return null;

  try {
    const profile = await adapty.getProfile();
    return profile;
  } catch (err: any) {
    warnLog(TAG, "getProfile() failed:", err?.message);
    return null;
  }
}

/**
 * Get simplified subscription status from the user's profile.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const defaultStatus: SubscriptionStatus = {
    isPremium: false,
    accessLevel: null,
    productId: null,
    expiresAt: null,
    isLifetime: false,
    willRenew: false,
  };

  const profile = await getProfile();
  if (!profile) return defaultStatus;

  // Adapty stores access levels in profile.accessLevels
  const accessLevels = profile.accessLevels || {};
  const premium = accessLevels["premium"] || null;

  if (!premium || !premium.isActive) return defaultStatus;

  return {
    isPremium: true,
    accessLevel: premium,
    productId: premium.vendorProductId || null,
    expiresAt: premium.expiresAt ? String(premium.expiresAt) : null,
    isLifetime: premium.isLifetime || false,
    willRenew: premium.willRenew || false,
  };
}

/**
 * Restore purchases (for users who reinstalled or switched devices).
 */
export async function restorePurchases(): Promise<any | null> {
  if (_mockMode || !_activated) {
    devLog(TAG, "restorePurchases() — mock mode");
    return null;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return null;

  try {
    const profile = await adapty.restorePurchases();
    devLog(TAG, "Purchases restored");
    return profile;
  } catch (err: any) {
    warnLog(TAG, "restorePurchases() failed:", err?.message);
    return null;
  }
}

// ============ ONESIGNAL INTEGRATION ============

/**
 * Set the OneSignal Subscription ID in Adapty.
 * This enables server-to-server communication between Adapty and OneSignal.
 *
 * IMPORTANT: The key MUST be "oneSignalSubscriptionId" as per Adapty's official documentation.
 * See: https://adapty.io/docs/onesignal
 *
 * @param subscriptionId - The OneSignal Subscription ID (from OneSignal.User.pushSubscription.id)
 */
export async function setOneSignalSubscriptionId(subscriptionId: string): Promise<void> {
  if (_mockMode || !_activated) {
    devLog(TAG, "setOneSignalSubscriptionId() — mock mode");
    return;
  }
  if (!subscriptionId) {
    devLog(TAG, "setOneSignalSubscriptionId() — empty ID, skipping");
    return;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return;

  try {
    // Official Adapty key for OneSignal integration
    await adapty.setIntegrationIdentifier("one_signal", { subscriptionId });
    devLog(TAG, "OneSignal subscription ID set in Adapty");
  } catch (err: any) {
    warnLog(TAG, "setOneSignalSubscriptionId() failed:", err?.message);
  }
}

// ============ USER ATTRIBUTES ============

/**
 * Update custom user attributes in Adapty.
 * Used for segmentation, A/B testing, and targeted paywalls.
 *
 * Adapty limits: max 30 custom attributes, key max 30 chars, value max 50 chars.
 * We send only essential attributes for paywall targeting.
 *
 * @param attributes - User attributes to update
 */
export async function updateCustomAttributes(attributes: AdaptyUserAttributes): Promise<void> {
  if (_mockMode || !_activated) {
    devLog(TAG, "updateCustomAttributes() — mock mode");
    return;
  }

  const adapty = await getAdaptyModule();
  if (!adapty) return;

  try {
    // Build the custom attributes object
    const customAttributes: Record<string, string | number | boolean> = {};

    if (attributes.business_type !== undefined) {
      customAttributes["business_type"] = String(attributes.business_type).substring(0, 50);
    }
    if (attributes.order_count !== undefined) {
      customAttributes["order_count"] = attributes.order_count;
    }
    if (attributes.recipe_count !== undefined) {
      customAttributes["recipe_count"] = attributes.recipe_count;
    }
    if (attributes.app_language !== undefined) {
      customAttributes["app_language"] = attributes.app_language;
    }
    if (attributes.onboarding_completed !== undefined) {
      customAttributes["onboarding_completed"] = attributes.onboarding_completed;
    }
    if (attributes.days_since_install !== undefined) {
      customAttributes["days_since_install"] = attributes.days_since_install;
    }
    if (attributes.platform !== undefined) {
      customAttributes["platform"] = attributes.platform;
    }

    await adapty.updateProfile({
      customAttributes,
    });
    devLog(TAG, "Custom attributes updated:", Object.keys(customAttributes).join(", "));
  } catch (err: any) {
    // Non-critical — don't crash the app
    warnLog(TAG, "updateCustomAttributes() failed:", err?.message);
  }
}

/**
 * Convenience: update all relevant user attributes at once.
 * Call this after login, after onboarding, and periodically (e.g., on app_open).
 */
export async function syncUserAttributes(params: {
  businessType?: string;
  orderCount?: number;
  recipeCount?: number;
  appLanguage?: string;
  onboardingCompleted?: boolean;
  daysSinceInstall?: number;
}): Promise<void> {
  await updateCustomAttributes({
    business_type: params.businessType,
    order_count: params.orderCount,
    recipe_count: params.recipeCount,
    app_language: params.appLanguage,
    onboarding_completed: params.onboardingCompleted,
    days_since_install: params.daysSinceInstall,
    platform: Platform.OS,
  });
}

// ============ PROFILE LISTENER ============

/**
 * Subscribe to profile updates (subscription changes).
 * Returns an unsubscribe function.
 */
export function onProfileUpdated(callback: (profile: any) => void): () => void {
  if (_mockMode || !_activated) {
    return () => {}; // No-op unsubscribe
  }

  // Adapty SDK provides addEventListener for profile updates
  let unsubscribe: (() => void) | null = null;

  getAdaptyModule().then((adapty) => {
    if (!adapty || !adapty.addEventListener) return;
    try {
      unsubscribe = adapty.addEventListener("onLatestProfileLoad", callback);
    } catch (err: any) {
      warnLog(TAG, "addEventListener failed:", err?.message);
    }
  });

  return () => {
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // Best effort
      }
    }
  };
}
