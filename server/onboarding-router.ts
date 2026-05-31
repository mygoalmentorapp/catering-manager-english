/**
 * Onboarding Router — serves dynamic onboarding flows to the client via tRPC.
 *
 * Why: The onboarding_flows and onboarding_screens tables in Supabase have RLS enabled.
 * Reads are routed through the server using service_role to bypass RLS.
 *
 * Security:
 * - app_key + app_language are read from request headers (x-app-key, x-app-language).
 * - Only active, valid flows within date range and rollout are returned.
 * - Returns null if headers are missing or no matching flow found → client falls back to static onboarding.
 *
 * Endpoints:
 * - onboarding.getActiveFlow: Public endpoint (onboarding is shown before login).
 */

import { publicProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.warn("[Onboarding Router] Missing Supabase credentials — returning null");
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Columns to return for onboarding_screens.
 * Excludes internal columns (id, flow_id, created_at, updated_at).
 */
const SCREEN_COLUMNS = [
  "screen_key",
  "sort_order",
  "title",
  "body",
  "image_url",
  "icon_name",
  "primary_button_text",
  "secondary_button_text",
  "primary_action_type",
  "primary_action_payload",
  "secondary_action_type",
  "secondary_action_payload",
].join(",");

/**
 * Evaluate rollout_percentage for a flow.
 * Uses a deterministic hash based on flow_key to ensure consistent behavior
 * across multiple requests from the same app variant.
 */
function isInRollout(flowKey: string, rolloutPercentage: number): boolean {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;

  // Simple deterministic hash: sum of char codes mod 100
  let hash = 0;
  for (let i = 0; i < flowKey.length; i++) {
    hash = (hash + flowKey.charCodeAt(i)) % 100;
  }
  return hash < rolloutPercentage;
}

// ============ TYPES ============

interface OnboardingFlow {
  id: number;
  flow_key: string;
  name: string;
  description: string | null;
  status: string;
  priority: number;
  audience: string | null;
  rollout_percentage: number;
  start_at: string | null;
  end_at: string | null;
}

interface OnboardingScreen {
  screen_key: string;
  sort_order: number;
  title: string;
  body: string | null;
  image_url: string | null;
  icon_name: string | null;
  primary_button_text: string;
  secondary_button_text: string | null;
  primary_action_type: string;
  primary_action_payload: string | null;
  secondary_action_type: string | null;
  secondary_action_payload: string | null;
}

export interface ActiveOnboardingFlow {
  flow_key: string;
  name: string;
  screens: OnboardingScreen[];
}

// ============ ROUTER ============

export const onboardingRouter = router({
  /**
   * Get the active onboarding flow for the requesting app.
   * Reads app_key + app_language from request headers (x-app-key, x-app-language).
   * Public endpoint — no auth required (onboarding is shown before login).
   *
   * Selection logic:
   * 1. Require app_key + app_language headers
   * 2. Fetch all flows with status=active, matching app_key + app_language
   * 3. Filter by start_at/end_at date range
   * 4. Filter by rollout_percentage
   * 5. Sort by priority desc → pick the first
   * 6. Fetch screens for the winning flow, sorted by sort_order
   * 7. Return flow + screens, or null if none found
   */
  getActiveFlow: publicProcedure.query(async ({ ctx }) => {
    const headers = ctx.req.headers;
    const appKey =
      typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";
    const appLanguage =
      typeof headers["x-app-language"] === "string"
        ? headers["x-app-language"]
        : "";

    if (!appKey || !appLanguage) {
      console.warn(
        `[Onboarding Router] Missing headers: x-app-key="${appKey}", x-app-language="${appLanguage}"`
      );
      return null;
    }

    const admin = getAdminClient();
    if (!admin) {
      return null;
    }

    try {
      const now = new Date().toISOString();

      // Fetch active flows for this app variant
      const { data: flows, error: flowError } = await admin
        .from("onboarding_flows")
        .select("id, flow_key, name, description, status, priority, audience, rollout_percentage, start_at, end_at")
        .eq("app_key", appKey)
        .eq("app_language", appLanguage)
        .eq("status", "active")
        .order("priority", { ascending: false });

      if (flowError || !flows || flows.length === 0) {
        if (flowError) {
          console.warn(
            `[Onboarding Router] flows fetch error for ${appKey}/${appLanguage}:`,
            flowError.message
          );
        }
        return null;
      }

      // Filter by date range and rollout
      const eligibleFlows = (flows as OnboardingFlow[]).filter((flow) => {
        // Date range check
        if (flow.start_at && flow.start_at > now) return false;
        if (flow.end_at && flow.end_at < now) return false;
        // Rollout check
        if (!isInRollout(flow.flow_key, flow.rollout_percentage)) return false;
        return true;
      });

      if (eligibleFlows.length === 0) {
        return null;
      }

      // Already sorted by priority desc from DB — take the first
      const winningFlow = eligibleFlows[0];

      // Fetch screens for the winning flow
      const { data: screens, error: screenError } = await admin
        .from("onboarding_screens")
        .select(SCREEN_COLUMNS)
        .eq("flow_id", winningFlow.id)
        .order("sort_order", { ascending: true });

      if (screenError || !screens || screens.length === 0) {
        if (screenError) {
          console.warn(
            `[Onboarding Router] screens fetch error for flow ${winningFlow.flow_key}:`,
            screenError.message
          );
        }
        // No valid screens → return null (fallback to static)
        return null;
      }

      // Return the flow with its screens
      const result: ActiveOnboardingFlow = {
        flow_key: winningFlow.flow_key,
        name: winningFlow.name,
        screens: screens as unknown as OnboardingScreen[],
      };

      return result;
    } catch (err) {
      console.error("[Onboarding Router] Unexpected error:", err);
      return null;
    }
  }),
});
