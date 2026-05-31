/**
 * Config Router — serves remote_config to the client via tRPC.
 *
 * Why: The remote_config table in Supabase has RLS enabled with no anon SELECT policy.
 * Instead of weakening RLS, we route reads through the server using service_role.
 * This is the recommended pattern for admin/config tables.
 *
 * Security:
 * - app_key + app_language are read from request headers (x-app-key, x-app-language),
 *   consistent with experience-router. The client cannot override them via input params.
 * - Only the fields needed by the app are returned (no id, created_at, updated_at, etc.).
 * - Returns null if headers are missing or no matching row found → client falls back to SAFE_DEFAULTS.
 *
 * Endpoints:
 * - config.getRemoteConfig: Public endpoint (no auth required — config is needed before login).
 */

import { publicProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.warn("[Config Router] Missing Supabase credentials — returning null");
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Explicit list of columns to return to the client.
 * This prevents leaking internal columns (id, created_at, updated_at, app_key, app_language).
 */
const ALLOWED_COLUMNS = [
  "schema_version",
  "paywall_enabled",
  "revenuecat_enabled",
  "remote_campaigns_enabled",
  "feedback_popup_enabled",
  "global_message_enabled",
  "external_urls_enabled",
  "cache_ttl_minutes",
  "force_update_enabled",
  "minimum_supported_version_code",
  "latest_version_code",
  "force_update_title",
  "force_update_message",
  "force_update_button_text",
  "google_play_url",
  "maintenance_enabled",
  "maintenance_title",
  "maintenance_message",
  "maintenance_action_text",
  "global_message_title",
  "global_message_text",
  "global_message_type",
  "global_message_action",
  "global_message_action_text",
  "global_message_dismissible",
  "session_timeout_minutes",
  "dynamic_onboarding_enabled",
  "default_entitlement_id",
  "default_offering_id",
  "paywall_provider",
].join(",");

// ============ ROUTER ============

export const configRouter = router({
  /**
   * Get remote config for the requesting app.
   * Reads app_key + app_language from request headers (x-app-key, x-app-language).
   * Public endpoint — no auth required (config is needed before login).
   * Returns only the fields the app needs, or null if not found.
   */
  getRemoteConfig: publicProcedure.query(async ({ ctx }) => {
    const headers = ctx.req.headers;
    const appKey =
      typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";
    const appLanguage =
      typeof headers["x-app-language"] === "string"
        ? headers["x-app-language"]
        : "";

    if (!appKey || !appLanguage) {
      console.warn(
        `[Config Router] Missing headers: x-app-key="${appKey}", x-app-language="${appLanguage}"`
      );
      return null;
    }

    const admin = getAdminClient();
    if (!admin) {
      return null;
    }

    try {
      const { data, error } = await admin
        .from("remote_config")
        .select(ALLOWED_COLUMNS)
        .eq("app_key", appKey)
        .eq("app_language", appLanguage)
        .single();

      if (error || !data) {
        console.warn(
          `[Config Router] remote_config fetch failed for ${appKey}/${appLanguage}:`,
          error?.message ?? "no data"
        );
        return null;
      }

      return data;
    } catch (err) {
      console.error("[Config Router] Unexpected error:", err);
      return null;
    }
  }),
});
