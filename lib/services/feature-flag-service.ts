/**
 * FeatureFlagService — fetches and caches the `feature_flags` table
 * from Supabase. Provides granular per-feature control.
 *
 * Safe defaults: every flag is OFF if Supabase is unreachable or data is corrupt.
 */
import { supabase } from "../supabase";
import { CacheManager } from "./cache-manager";
import { CACHE_TTL, devLog, warnLog } from "./environment";

// ── Types ──

export interface FeatureFlags {
  [flagName: string]: boolean;
}

// ── Safe defaults ──

export const FLAG_SAFE_DEFAULTS: Readonly<FeatureFlags> = Object.freeze({
  cloud_sync: false,
  google_signin: false,
  paywall: false,
  limited_mode: false,
  feedback_triggers: false,
  revenuecat: false,
  remote_campaigns: false,
  feedback_popup: false,
  global_message: false,
  external_urls: false,
  dynamic_onboarding: false,
});

const CACHE_KEY = "feature_flags";

export const FeatureFlagService = {
  /**
   * Fetch feature flags with cache-first strategy.
   */
  async getFlags(): Promise<FeatureFlags> {
    // 1. Try cache
    const cached = await CacheManager.get<FeatureFlags>(CACHE_KEY);
    if (cached) {
      devLog("FeatureFlags", "Using cached flags");
      return cached;
    }

    // 2. Try Supabase
    try {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("flag_name, enabled");

      if (error || !data) {
        warnLog("FeatureFlags", "Supabase fetch failed:", error?.message ?? "no data");
        return { ...FLAG_SAFE_DEFAULTS };
      }

      const flags: FeatureFlags = { ...FLAG_SAFE_DEFAULTS };
      for (const row of data) {
        if (row.flag_name && typeof row.enabled === "boolean") {
          flags[row.flag_name] = row.enabled;
        }
      }

      await CacheManager.set(CACHE_KEY, flags, CACHE_TTL.featureFlags);
      devLog("FeatureFlags", "Fetched and cached fresh flags");
      return flags;
    } catch (err) {
      warnLog("FeatureFlags", "Unexpected error:", err);
      return { ...FLAG_SAFE_DEFAULTS };
    }
  },

  async refresh(): Promise<FeatureFlags> {
    await CacheManager.remove(CACHE_KEY);
    return FeatureFlagService.getFlags();
  },

  async isFlagEnabled(flagName: string): Promise<boolean> {
    const flags = await FeatureFlagService.getFlags();
    return flags[flagName] === true;
  },
};
