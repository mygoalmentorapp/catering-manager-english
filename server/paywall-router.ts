/**
 * Paywall Router — tRPC endpoints for paywall placements, rules, and feature gates.
 *
 * These endpoints use service_role to bypass RLS and return only the data
 * needed by the client. They filter by app_key + app_language from headers.
 *
 * Current state: All endpoints work but paywall is OFF (paywall_enabled=false).
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.warn("[Paywall Router] Missing Supabase credentials — returning null");
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============ ROUTER ============

export const paywallRouter = router({
  /**
   * Get active placements for the current app_key + app_language.
   * Returns only enabled placements.
   */
  getPlacements: publicProcedure.query(async ({ ctx }) => {
    const headers = ctx.req.headers;
    const appKey = typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";
    const appLanguage = typeof headers["x-app-language"] === "string" ? headers["x-app-language"] : "";

    if (!appKey || !appLanguage) {
      return [];
    }

    try {
      const supabase = getAdminClient();
      if (!supabase) return [];

      const { data, error } = await supabase
        .from("paywall_placements")
        .select("id, placement_key, display_name, description, is_enabled, default_offering_id")
        .eq("app_key", appKey)
        .eq("app_language", appLanguage)
        .eq("is_enabled", true)
        .order("placement_key");

      if (error) {
        console.error("[PaywallRouter] getPlacements error:", error.message);
        return [];
      }

      return data ?? [];
    } catch (err) {
      console.error("[PaywallRouter] getPlacements exception:", err);
      return [];
    }
  }),

  /**
   * Get rules for a specific placement.
   * Returns only enabled rules, ordered by priority.
   */
  getRulesForPlacement: publicProcedure
    .input(z.object({ placementKey: z.string() }))
    .query(async ({ ctx, input }) => {
      const headers = ctx.req.headers;
      const appKey = typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";
      const appLanguage = typeof headers["x-app-language"] === "string" ? headers["x-app-language"] : "";

      if (!appKey || !appLanguage) {
        return [];
      }

      try {
        const supabase = getAdminClient();
        if (!supabase) return [];

        // First get the placement ID
        const { data: placement } = await supabase
          .from("paywall_placements")
          .select("id")
          .eq("app_key", appKey)
          .eq("app_language", appLanguage)
          .eq("placement_key", input.placementKey)
          .eq("is_enabled", true)
          .single();

        if (!placement) {
          return [];
        }

        // Then get rules for that placement
        const { data: rules, error } = await supabase
          .from("paywall_rules")
          .select("id, rule_key, priority, is_enabled, required_entitlement, offering_id, target_audience, rollout_percentage, cooldown_hours, max_impressions, start_at, end_at")
          .eq("placement_id", placement.id)
          .eq("is_enabled", true)
          .order("priority", { ascending: false });

        if (error) {
          console.error("[PaywallRouter] getRulesForPlacement error:", error.message);
          return [];
        }

        return rules ?? [];
      } catch (err) {
        console.error("[PaywallRouter] getRulesForPlacement exception:", err);
        return [];
      }
    }),

  /**
   * Get premium feature gates for the current app.
   * Returns all enabled gates so the client can check locally.
   */
  getFeatureGates: publicProcedure.query(async ({ ctx }) => {
    const headers = ctx.req.headers;
    const appKey = typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";
    const appLanguage = typeof headers["x-app-language"] === "string" ? headers["x-app-language"] : "";

    if (!appKey || !appLanguage) {
      return [];
    }

    try {
      const supabase = getAdminClient();
      if (!supabase) return [];

      const { data, error } = await supabase
        .from("premium_feature_gates")
        .select("id, feature_key, display_name, requires_premium, required_entitlement, placement_key, is_enabled")
        .eq("app_key", appKey)
        .eq("app_language", appLanguage)
        .eq("is_enabled", true)
        .order("feature_key");

      if (error) {
        console.error("[PaywallRouter] getFeatureGates error:", error.message);
        return [];
      }

      return data ?? [];
    } catch (err) {
      console.error("[PaywallRouter] getFeatureGates exception:", err);
      return [];
    }
  }),

  /**
   * Get cached entitlements for a user.
   * This is used to quickly check premium status without calling RevenueCat.
   */
  getUserEntitlements: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      try {
        const supabase = getAdminClient();
        if (!supabase) return null;

        const { data, error } = await supabase
          .from("user_entitlements_cache")
          .select("revenuecat_customer_id, active_entitlements, subscription_status, last_synced_at")
          .eq("user_id", input.userId)
          .single();

        if (error || !data) {
          return null;
        }

        return data;
      } catch (err) {
        console.error("[PaywallRouter] getUserEntitlements exception:", err);
        return null;
      }
    }),
});
