/**
 * App Identity Constants
 *
 * Identifies WHICH APP VARIANT is running — Hebrew or English.
 * This is determined by the app itself (set in app.config.ts → extra.appLanguage),
 * NOT by the device locale or user preference.
 *
 * Hebrew app: APP_LANGUAGE = "he", APP_KEY = "catering_manager_pro"
 * English app: APP_LANGUAGE = "en", APP_KEY = "catering_manager_pro"
 *
 * Used by Remote Experience to filter campaigns:
 * - Server returns only campaigns matching app_key + app_language
 * - Client Rule Engine double-checks as safety net
 */

import Constants from "expo-constants";

export type AppLanguage = "he" | "en";

/**
 * Unique key identifying this app product.
 * Shared across all language variants of the same app.
 * Used in x-app-key header and matched against campaign.app_key.
 */
export const APP_KEY = "catering_manager_pro";

/**
 * The language variant of this app build.
 * Read from app.config.ts → extra.appLanguage.
 * Defaults to "he" (Hebrew) if not set.
 */
export const APP_LANGUAGE: AppLanguage =
  (Constants.expoConfig?.extra?.appLanguage as AppLanguage) ?? "he";

/**
 * Helper to check if this is the Hebrew app variant.
 */
export const IS_HEBREW_APP = APP_LANGUAGE === "he";

/**
 * Helper to check if this is the English app variant.
 */
export const IS_ENGLISH_APP = APP_LANGUAGE === "en";
