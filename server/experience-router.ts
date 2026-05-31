/**
 * Experience Router — Server-side endpoints for experience event logging,
 * user state tracking, and campaign state management.
 *
 * SECURITY RULES (approved):
 * 1. user_id is NEVER accepted from the client — always ctx.user.openId
 * 2. service_role is server-side only — never exposed to client
 * 3. platform, language, app_version are set server-side from request headers
 * 4. Client sends only: event_name, screen_key, campaign_key, action, metadata, session_id
 * 5. Campaigns returned only if: is_enabled=true, is_archived=false, valid date range, matching environment
 * 6. All operations are fire-and-forget from client perspective — failures don't crash the app
 *
 * Tables: user_experience_events, user_experience_state, user_campaign_state, remote_campaigns, campaign_analytics
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase credentials not configured",
    });
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Always derive user_id from the authenticated JWT — never from client input */
function getUserId(ctx: { user: { openId: string } }): string {
  return ctx.user.openId;
}

/**
 * Derive platform, language, app_version from request context.
 * These are set server-side to prevent client spoofing.
 */
function getDeviceInfo(ctx: { req?: { headers?: Record<string, string | string[] | undefined> } }): {
  platform: string;
  language: string;
  app_key: string;
  app_version: string;
} {
  const headers = ctx.req?.headers ?? {};
  const ua = (typeof headers["user-agent"] === "string" ? headers["user-agent"] : "") || "";

  // Detect platform from User-Agent
  let platform = "unknown";
  if (ua.includes("Android")) platform = "android";
  else if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iOS")) platform = "ios";
  else if (ua.includes("Expo")) platform = "expo";
  else if (ua.includes("Mozilla") || ua.includes("Chrome")) platform = "web";

  // App key from x-app-key header (identifies which app product)
  const appKey = typeof headers["x-app-key"] === "string" ? headers["x-app-key"] : "";

  // Language: prefer x-app-language (app variant identity) over Accept-Language
  const appLang = typeof headers["x-app-language"] === "string" ? headers["x-app-language"] : "";
  const acceptLang = typeof headers["accept-language"] === "string" ? headers["accept-language"] : "";
  const language = appLang || acceptLang.split(",")[0]?.trim() || "unknown";

  // App version from custom header (set by tRPC client) or fallback
  const appVersion = typeof headers["x-app-version"] === "string" ? headers["x-app-version"] : "unknown";

  return { platform, language, app_key: appKey, app_version: appVersion };
}

/**
 * Determine the current environment.
 * Production server = "prod", otherwise "dev".
 */
function getEnvironment(): string {
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

// ============ ROUTER ============

export const experienceRouter = router({
  /**
   * Log an experience event.
   * Client sends only event data — server adds user_id, platform, language, app_version.
   */
  logEvent: protectedProcedure
    .input(
      z.object({
        event_name: z.string(),
        screen_key: z.string().nullable().optional(),
        campaign_key: z.string().nullable().optional(),
        flow_key: z.string().nullable().optional(),
        action: z.string().nullable().optional(),
        session_id: z.string(),
        metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const deviceInfo = getDeviceInfo(ctx);
      const admin = getAdminClient();

      const { error } = await admin.from("user_experience_events").insert({
        user_id: userId,
        event_name: input.event_name,
        screen_key: input.screen_key ?? null,
        campaign_key: input.campaign_key ?? null,
        flow_key: input.flow_key ?? null,
        action: input.action ?? null,
        platform: deviceInfo.platform,
        language: deviceInfo.language,
        app_version: deviceInfo.app_version,
        session_id: input.session_id,
        metadata: input.metadata ?? {},
      });

      if (error) {
        console.warn("[Experience] logEvent insert error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    }),

  /**
   * Initialize or update user experience state.
   * user_id is always ctx.user.openId — never from client.
   */
  upsertState: protectedProcedure
    .input(
      z.object({
        updates: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const admin = getAdminClient();

      // Strip any user_id the client might have sent (defense in depth)
      const safeUpdates = { ...input.updates };
      delete safeUpdates.user_id;

      const { error } = await admin.from("user_experience_state").upsert(
        {
          user_id: userId,
          ...safeUpdates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.warn("[Experience] upsertState error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    }),

  /**
   * Get the current user's experience state.
   */
  getState: protectedProcedure.query(async ({ ctx }): Promise<Record<string, unknown> | null> => {
    const userId = getUserId(ctx);
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("user_experience_state")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.warn("[Experience] getState error:", error.message);
    }

    return data ?? null;
  }),

  /**
   * Increment a counter field in user_experience_state.
   * Read-then-write pattern (Supabase JS doesn't support SQL increment).
   */
  incrementCounter: protectedProcedure
    .input(
      z.object({
        field: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const admin = getAdminClient();

      const { data, error: readError } = await admin
        .from("user_experience_state")
        .select(input.field)
        .eq("user_id", userId)
        .single();

      if (readError || !data) {
        console.warn("[Experience] incrementCounter read error:", readError?.message ?? "no data");
        return { success: false };
      }

      const currentValue = ((data as unknown as Record<string, number>)[input.field]) ?? 0;

      const { error: writeError } = await admin
        .from("user_experience_state")
        .update({
          [input.field]: currentValue + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (writeError) {
        console.warn("[Experience] incrementCounter write error:", writeError.message);
        return { success: false };
      }

      return { success: true, newValue: currentValue + 1 };
    }),

  /**
   * Get all campaign states for the current user.
   * user_id derived from ctx — never from client.
   */
  getCampaignStates: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx);
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("user_campaign_state")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.warn("[Experience] getCampaignStates error:", error.message);
      return [];
    }

    return data ?? [];
  }),

  /**
   * Upsert a campaign state row.
   * user_id is always ctx.user.openId.
   *
   * Supports special increment signals:
   *   _increment_impressions: true → increment impressions_total, handle impressions_today
   *   _increment_clicks: true → increment clicks_total
   *   _increment_dismissed: true → increment dismissed_count
   */
  upsertCampaignState: protectedProcedure
    .input(
      z.object({
        campaign_key: z.string(),
        updates: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const admin = getAdminClient();

      // Strip any user_id the client might have sent (defense in depth)
      const updates: Record<string, unknown> = { ...input.updates };
      delete updates.user_id;

      // Read existing state for increment operations
      const { data: existing } = await admin
        .from("user_campaign_state")
        .select("*")
        .eq("user_id", userId)
        .eq("campaign_key", input.campaign_key)
        .single();

      const row = existing as Record<string, unknown> | null;

      // Handle _increment_impressions
      if (updates._increment_impressions) {
        delete updates._increment_impressions;
        const todayStr = updates.impressions_today_date as string ?? new Date().toISOString().split("T")[0];
        const isNewDay = !row || (row.impressions_today_date as string) !== todayStr;
        updates.impressions_total = ((row?.impressions_total as number) ?? 0) + 1;
        updates.impressions_today = isNewDay ? 1 : ((row?.impressions_today as number) ?? 0) + 1;
        updates.impressions_today_date = todayStr;
      }

      // Handle _increment_clicks
      if (updates._increment_clicks) {
        delete updates._increment_clicks;
        updates.clicks_total = ((row?.clicks_total as number) ?? 0) + 1;
      }

      // Handle _increment_dismissed
      if (updates._increment_dismissed) {
        delete updates._increment_dismissed;
        updates.dismissed_count = ((row?.dismissed_count as number) ?? 0) + 1;
      }

      const { error } = await admin.from("user_campaign_state").upsert(
        {
          user_id: userId,
          campaign_key: input.campaign_key,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,campaign_key" }
      );

      if (error) {
        console.warn("[Experience] upsertCampaignState error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    }),

  /**
   * Get active remote campaigns.
   *
   * Server-side gates (checked BEFORE returning any campaigns):
   *   1. remote_config.remote_campaigns_enabled must be true
   *   2. feature_flags.remote_campaigns must be true
   *   If either is false → return [] (global kill switch).
   *
   * Per-campaign gates:
   *   - is_enabled = true
   *   - is_archived = false
   *   - start_at is null OR <= now
   *   - end_at is null OR >= now
   *   - environment matches current server environment OR is null (any)
   *
   * Post-filter:
   *   - If feedback_popup feature is disabled (remote_config OR feature_flags),
   *     exclude campaigns where type contains "feedback" or campaign_key contains "feedback".
   *
   * Never returns disabled, archived, expired, or future campaigns.
   */
  getActiveCampaigns: protectedProcedure.query(async ({ ctx }): Promise<Record<string, unknown>[]> => {
    const admin = getAdminClient();
    const env = getEnvironment();
    const now = new Date().toISOString();
    const deviceInfo = getDeviceInfo(ctx);
    const appKey = deviceInfo.app_key;
    const appLanguage = deviceInfo.language;

    // ── Gate 0: Require app_key and app_language ──
    if (!appKey || !appLanguage || appLanguage === "unknown") {
      console.log(`[Experience] getActiveCampaigns: BLOCKED — missing app_key (${appKey}) or app_language (${appLanguage})`);
      return [];
    }

    // ── Gate 1: Check remote_config (filtered by app_key + app_language from headers) ──
    const { data: rcRows } = await admin
      .from("remote_config")
      .select("remote_campaigns_enabled, feedback_popup_enabled")
      .eq("app_key", appKey)
      .eq("app_language", appLanguage)
      .single();

    const rc = rcRows as { remote_campaigns_enabled?: boolean; feedback_popup_enabled?: boolean } | null;

    // If no matching config row found → use SAFE_DEFAULTS (everything off)
    if (!rc) {
      console.log(`[Experience] getActiveCampaigns: BLOCKED — no remote_config for app_key=${appKey}, app_language=${appLanguage}`);
      return [];
    }

    // If remote_campaigns_enabled is explicitly false → return no campaigns
    if (rc.remote_campaigns_enabled === false) {
      console.log("[Experience] getActiveCampaigns: BLOCKED by remote_config.remote_campaigns_enabled=false");
      return [];
    }

    // ── Gate 2: Check feature_flags (rows with flag_name + enabled columns) ──
    const { data: ffData } = await admin
      .from("feature_flags")
      .select("flag_name, enabled")
      .in("flag_name", ["remote_campaigns", "feedback_popup"]);

    const ffMap: Record<string, boolean> = {};
    for (const row of ffData ?? []) {
      ffMap[(row as { flag_name: string }).flag_name] = (row as { enabled: boolean }).enabled;
    }

    // If feature_flags.remote_campaigns is explicitly false → return no campaigns
    if (ffMap.remote_campaigns === false) {
      console.log("[Experience] getActiveCampaigns: BLOCKED by feature_flags.remote_campaigns=false");
      return [];
    }

    // ── Fetch campaigns ──
    // Filter by app_key and app_language at the DB level.
    // Only return campaigns that match this app's key AND language (or "all").
    const { data, error } = await admin
      .from("remote_campaigns")
      .select("*")
      .eq("is_enabled", true)
      .eq("is_archived", false)
      .eq("app_key", appKey)
      .or(`app_language.eq.${appLanguage},app_language.eq.all`)
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`end_at.is.null,end_at.gte.${now}`)
      .or(`environment.is.null,environment.eq.${env}`);

    if (error) {
      console.warn("[Experience] getActiveCampaigns error:", error.message);
      return [];
    }

    let campaigns = data ?? [];

    // ── Post-filter: If feedback_popup is disabled, exclude feedback campaigns ──
    const feedbackPopupDisabledByConfig = rc?.feedback_popup_enabled === false;
    const feedbackPopupDisabledByFlag = ffMap.feedback_popup === false;

    if (feedbackPopupDisabledByConfig || feedbackPopupDisabledByFlag) {
      const before = campaigns.length;
      campaigns = campaigns.filter((c) => {
        const cType = (c.type as string) ?? "";
        const cKey = (c.campaign_key as string) ?? "";
        const isFeedback = cType.includes("feedback") || cKey.includes("feedback");
        return !isFeedback;
      });
      const removed = before - campaigns.length;
      if (removed > 0) {
        console.log(`[Experience] getActiveCampaigns: Filtered out ${removed} feedback campaign(s) (feedback_popup disabled)`);
      }
    }

    return campaigns;
  }),

  /**
   * Log a batch of campaign analytics events.
   * Client sends an array of events — server adds user_id, platform, language, app_version.
   * Fire-and-forget pattern: returns { success: true } even on partial failure.
   */
  logAnalyticsBatch: protectedProcedure
    .input(
      z.object({
        events: z.array(
          z.object({
            campaign_key: z.string(),
            campaign_type: z.string(),
            event: z.string(),
            metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
          })
        ).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const deviceInfo = getDeviceInfo(ctx);
      const admin = getAdminClient();

      const rows = input.events.map((evt) => ({
        user_id: userId,
        campaign_key: evt.campaign_key,
        campaign_type: evt.campaign_type,
        event: evt.event,
        metadata: evt.metadata ?? {},
        platform: deviceInfo.platform,
        language: deviceInfo.language,
        app_version: deviceInfo.app_version,
      }));

      const { error } = await admin.from("campaign_analytics").insert(rows);

      if (error) {
        console.warn("[Experience] logAnalyticsBatch insert error:", error.message);
        // Fire-and-forget: still return success to client
      }

      return { success: true, count: rows.length };
    }),

  /**
   * Get campaign analytics report.
   * Admin-only endpoint that aggregates events by campaign_key + event type.
   * Returns summary with impressions, clicks, dismissals, completions, CTR, completion rate.
   */
  getCampaignAnalytics: adminProcedure
    .input(
      z.object({
        campaign_key: z.string().optional(),
        days: z.number().min(1).max(365).default(30),
      }).optional()
    )
    .query(async ({ input }) => {
      const admin = getAdminClient();
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      let query = admin
        .from("campaign_analytics")
        .select("campaign_key, campaign_type, event")
        .gte("created_at", since);

      if (input?.campaign_key) {
        query = query.eq("campaign_key", input.campaign_key);
      }

      const { data, error } = await query;

      if (error) {
        console.warn("[Experience] getCampaignAnalytics error:", error.message);
        return [];
      }

      // Aggregate by campaign_key
      const agg: Record<string, {
        campaign_key: string;
        campaign_type: string;
        impressions: number;
        clicks: number;
        dismissals: number;
        completions: number;
        closes: number;
        cta_primary: number;
        cta_secondary: number;
      }> = {};

      for (const row of data ?? []) {
        const key = row.campaign_key as string;
        if (!agg[key]) {
          agg[key] = {
            campaign_key: key,
            campaign_type: row.campaign_type as string,
            impressions: 0,
            clicks: 0,
            dismissals: 0,
            completions: 0,
            closes: 0,
            cta_primary: 0,
            cta_secondary: 0,
          };
        }

        const evt = row.event as string;
        if (evt === "impression") agg[key].impressions++;
        else if (evt === "click") agg[key].clicks++;
        else if (evt === "dismiss") agg[key].dismissals++;
        else if (evt === "complete") agg[key].completions++;
        else if (evt === "close") agg[key].closes++;
        else if (evt === "cta_primary") agg[key].cta_primary++;
        else if (evt === "cta_secondary") agg[key].cta_secondary++;
      }

      // Calculate rates and return
      return Object.values(agg).map((c) => ({
        ...c,
        ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        completion_rate: c.impressions > 0 ? Math.round((c.completions / c.impressions) * 10000) / 100 : 0,
      }));
    }),
});
