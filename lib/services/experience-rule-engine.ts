/**
 * ExperienceRuleEngine — Evaluates campaign eligibility conditions.
 *
 * A safe, limited rule engine that checks predefined conditions.
 * It does NOT execute arbitrary code from Supabase.
 *
 * Session 3 — Remote Campaigns + Rule Engine
 */

import { devLog, warnLog, SUPPORTED_SCHEMA_VERSION } from "./environment";

// ── Types ──

export interface RemoteCampaign {
  id: string;
  campaign_key: string;
  name: string | null;
  description: string | null;
  type: string;
  title: string | null;
  subtitle: string | null;
  message: string | null;
  icon: string | null;
  image_url: string | null;
  animation_url: string | null;
  animation_type: string | null;
  primary_button_text: string | null;
  primary_button_action: string | null;
  primary_button_payload: Record<string, unknown> | null;
  secondary_button_text: string | null;
  secondary_button_action: string | null;
  secondary_button_payload: Record<string, unknown> | null;
  // ── App identity fields ──
  app_key: string | null;
  app_language: string | null; // "he" | "en" | "all"
  is_enabled: boolean;
  is_archived: boolean;
  priority: number;
  rollout_percentage: number;
  environment: string | null;
  platform: string | null;
  language: string | null;
  country: string | null;
  region: string | null;
  target_audience: string | null;
  trigger_event: string | null;
  allowed_screens: string[];
  blocked_screens: string[];
  start_at: string | null;
  end_at: string | null;
  min_app_version: string | null;
  max_app_version: string | null;
  min_days_since_signup: number | null;
  min_days_since_first_open: number | null;
  min_sessions: number | null;
  min_session_duration_seconds: number | null;
  min_products_created: number | null;
  min_orders_created: number | null;
  min_shopping_lists_created: number | null;
  min_completed_orders: number | null;
  days_since_last_active: number | null;
  cooldown_days_after_view: number | null;
  cooldown_days_after_dismiss: number | null;
  max_impressions_per_user: number | null;
  max_impressions_per_session: number | null;
  max_impressions_per_day: number | null;
  max_clicks_per_user: number | null;
  depends_on_campaign_id: string | null;
  depends_on_campaign_status: string | null;
  show_only_if_feedback_not_submitted: boolean;
  show_only_if_onboarding_not_completed: boolean;
  show_only_if_not_premium: boolean;
  show_only_if_premium: boolean;
  requires_internet: boolean;
  dismissible: boolean;
  do_not_show_during_critical_flow: boolean;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

/** Context provided to the rule engine for evaluation. */
export interface RuleContext {
  userId: string;
  currentScreen: string;
  currentEvent: string | null;
  isInCriticalFlow: boolean;
  isOnline: boolean;
  appVersion: string;
  appKey: string; // "catering_manager_pro"
  platform: string; // "android" | "ios" | "web"
  language: string; // "he" | "en" — app variant language (from APP_LANGUAGE)
  country: string; // "IL" | "US" etc.
  region: string;
  environment: string; // "dev" | "staging" | "prod"
  // User state
  firstOpenAt: string | null;
  signupAt: string | null;
  lastActiveAt: string | null;
  sessionsCount: number;
  productsCreatedCount: number;
  ordersCreatedCount: number;
  completedOrdersCount: number;
  shoppingListsCreatedCount: number;
  onboardingCompleted: boolean;
  feedbackSubmitted: boolean;
  isPremium: boolean;
  subscriptionStatus: string;
  // Campaign state (per-campaign)
  campaignStates: Record<string, CampaignState>;
  // Current session impressions (in-memory)
  sessionImpressions: Record<string, number>;
}

export interface CampaignState {
  impressions_total: number;
  impressions_today: number;
  impressions_today_date: string | null;
  impressions_this_session: number;
  clicks_total: number;
  last_viewed_at: string | null;
  last_clicked_at: string | null;
  last_dismissed_at: string | null;
  dismissed_count: number;
  completed: boolean;
}

// ── Known condition fields ──

const KNOWN_CONDITION_FIELDS = new Set([
  "id", "campaign_key", "name", "description", "type",
  "title", "subtitle", "message", "icon", "image_url",
  "animation_url", "animation_type",
  "primary_button_text", "primary_button_action", "primary_button_payload",
  "secondary_button_text", "secondary_button_action", "secondary_button_payload",
  "is_enabled", "is_archived", "priority", "rollout_percentage",
  "environment", "platform", "language", "country", "region",
  "target_audience", "trigger_event",
  "allowed_screens", "blocked_screens",
  "start_at", "end_at",
  "min_app_version", "max_app_version",
  "min_days_since_signup", "min_days_since_first_open",
  "min_sessions", "min_session_duration_seconds",
  "min_products_created", "min_orders_created",
  "min_shopping_lists_created", "min_completed_orders",
  "days_since_last_active",
  "cooldown_days_after_view", "cooldown_days_after_dismiss",
  "max_impressions_per_user", "max_impressions_per_session",
  "max_impressions_per_day", "max_clicks_per_user",
  "depends_on_campaign_id", "depends_on_campaign_status",
  "show_only_if_feedback_not_submitted",
  "show_only_if_onboarding_not_completed",
  "show_only_if_not_premium", "show_only_if_premium",
  "requires_internet", "dismissible",
  "do_not_show_during_critical_flow",
  "schema_version", "created_at", "updated_at",
  // App identity fields
  "app_key", "app_language",
]);

// ── Helpers ──

/**
 * Stable hash for rollout_percentage using FNV-1a.
 * Same user + same campaign_key always gets the same result.
 * FNV-1a provides much better distribution than djb2.
 */
export function isInRollout(userId: string, key: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  const input = userId + ":" + key;
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 100) < percentage;
}

/**
 * Compare semantic versions. Returns:
 * -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * Calculate fractional days between a date string and now.
 *
 * BUG FIX: Previously used Math.floor() which meant a cooldown of e.g. 0.003 days
 * (≈5 minutes) would floor to 0, and `0 < cooldown_days` would always be true,
 * preventing the campaign from ever re-showing after cooldown expired.
 *
 * Now returns fractional days (e.g., 0.5 = 12 hours, 0.003 ≈ 5 minutes)
 * so that sub-day cooldowns work correctly.
 */
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}

/** Determine target_audience match. */
function matchesAudience(
  audience: string | null,
  ctx: RuleContext,
): boolean {
  if (!audience || audience === "all") return true;
  switch (audience) {
    case "new_users": {
      // New user: signed up within last 7 days
      const days = daysSince(ctx.signupAt);
      return days !== null && days <= 7;
    }
    case "returning_users": {
      // Returning: signed up more than 7 days ago
      const days = daysSince(ctx.signupAt);
      return days !== null && days > 7;
    }
    case "premium":
      return ctx.isPremium;
    default:
      // Unknown audience — safe default: reject
      return false;
  }
}

// ── Rule Engine ──

export interface RuleResult {
  eligible: boolean;
  reason?: string;
}

export const ExperienceRuleEngine = {
  /**
   * Evaluate whether a campaign is eligible for display.
   * Returns { eligible: true } or { eligible: false, reason: "..." }.
   */
  evaluate(campaign: RemoteCampaign, ctx: RuleContext): RuleResult {
    // 0. Check for unknown fields (non-blocking, just log)
    _checkUnknownFields(campaign);

    // 1. Basic: is_enabled / is_archived
    if (!campaign.is_enabled) return { eligible: false, reason: "is_enabled=false" };
    if (campaign.is_archived) return { eligible: false, reason: "is_archived=true" };

    // 2. Schema version
    if (campaign.schema_version > SUPPORTED_SCHEMA_VERSION) {
      return { eligible: false, reason: `schema_version ${campaign.schema_version} > supported ${SUPPORTED_SCHEMA_VERSION}` };
    }

    // 3. Environment
    if (campaign.environment && campaign.environment !== ctx.environment) {
      return { eligible: false, reason: `environment mismatch: ${campaign.environment} != ${ctx.environment}` };
    }

    // 4. Date range: start_at / end_at
    const now = new Date();
    if (campaign.start_at) {
      const start = new Date(campaign.start_at);
      if (!isNaN(start.getTime()) && now < start) {
        return { eligible: false, reason: "before start_at" };
      }
    }
    if (campaign.end_at) {
      const end = new Date(campaign.end_at);
      if (!isNaN(end.getTime()) && now > end) {
        return { eligible: false, reason: "after end_at" };
      }
    }

    // 5. App version range
    if (campaign.min_app_version) {
      if (compareVersions(ctx.appVersion, campaign.min_app_version) < 0) {
        return { eligible: false, reason: `appVersion ${ctx.appVersion} < min ${campaign.min_app_version}` };
      }
    }
    if (campaign.max_app_version) {
      if (compareVersions(ctx.appVersion, campaign.max_app_version) > 0) {
        return { eligible: false, reason: `appVersion ${ctx.appVersion} > max ${campaign.max_app_version}` };
      }
    }

    // 6. Platform / app_language / app_key / country / region
    if (campaign.platform && campaign.platform !== ctx.platform) {
      return { eligible: false, reason: `platform mismatch: ${campaign.platform} != ${ctx.platform}` };
    }
    // app_key safety check (server already filters, but double-check)
    if (campaign.app_key && campaign.app_key !== ctx.appKey) {
      return { eligible: false, reason: `app_key mismatch: ${campaign.app_key} != ${ctx.appKey}` };
    }
    // app_language safety check: must match ctx.language or be "all"
    if (campaign.app_language && campaign.app_language !== "all" && campaign.app_language !== ctx.language) {
      return { eligible: false, reason: `app_language mismatch: ${campaign.app_language} != ${ctx.language}` };
    }
    // Campaigns without app_language are not shown (safe default)
    if (!campaign.app_language) {
      return { eligible: false, reason: `campaign missing app_language — not shown` };
    }
    // Legacy language field check (backward compat)
    if (campaign.language && campaign.language !== ctx.language) {
      return { eligible: false, reason: `language mismatch: ${campaign.language} != ${ctx.language}` };
    }
    if (campaign.country && campaign.country !== ctx.country) {
      return { eligible: false, reason: `country mismatch: ${campaign.country} != ${ctx.country}` };
    }
    if (campaign.region && campaign.region !== ctx.region) {
      return { eligible: false, reason: `region mismatch: ${campaign.region} != ${ctx.region}` };
    }

    // 7. Target audience
    if (!matchesAudience(campaign.target_audience, ctx)) {
      return { eligible: false, reason: `target_audience mismatch: ${campaign.target_audience}` };
    }

    // 8. Rollout percentage
    if (!isInRollout(ctx.userId, campaign.campaign_key, campaign.rollout_percentage)) {
      return { eligible: false, reason: `not in rollout (${campaign.rollout_percentage}%)` };
    }

    // 9. Trigger event
    if (campaign.trigger_event) {
      if (!ctx.currentEvent || campaign.trigger_event !== ctx.currentEvent) {
        return { eligible: false, reason: `trigger_event mismatch: ${campaign.trigger_event} != ${ctx.currentEvent}` };
      }
    }

    // 10. Allowed / blocked screens
    if (campaign.allowed_screens && campaign.allowed_screens.length > 0) {
      if (!campaign.allowed_screens.includes(ctx.currentScreen)) {
        return { eligible: false, reason: `screen ${ctx.currentScreen} not in allowed_screens` };
      }
    }
    if (campaign.blocked_screens && campaign.blocked_screens.length > 0) {
      if (campaign.blocked_screens.includes(ctx.currentScreen)) {
        return { eligible: false, reason: `screen ${ctx.currentScreen} in blocked_screens` };
      }
    }

    // 11. Critical flow
    if (campaign.do_not_show_during_critical_flow && ctx.isInCriticalFlow) {
      return { eligible: false, reason: "in critical flow" };
    }

    // 12. Requires internet
    if (campaign.requires_internet && !ctx.isOnline) {
      return { eligible: false, reason: "requires_internet but offline" };
    }

    // 13. User state conditions
    if (campaign.show_only_if_feedback_not_submitted && ctx.feedbackSubmitted) {
      return { eligible: false, reason: "feedback already submitted" };
    }
    if (campaign.show_only_if_onboarding_not_completed && ctx.onboardingCompleted) {
      return { eligible: false, reason: "onboarding already completed" };
    }
    if (campaign.show_only_if_not_premium && ctx.isPremium) {
      return { eligible: false, reason: "user is premium (show_only_if_not_premium)" };
    }
    if (campaign.show_only_if_premium && !ctx.isPremium) {
      return { eligible: false, reason: "user is not premium (show_only_if_premium)" };
    }

    // 14. Activity conditions
    if (campaign.min_days_since_signup != null) {
      const days = daysSince(ctx.signupAt);
      if (days === null || days < campaign.min_days_since_signup) {
        return { eligible: false, reason: `days_since_signup ${days} < min ${campaign.min_days_since_signup}` };
      }
    }
    if (campaign.min_days_since_first_open != null) {
      const days = daysSince(ctx.firstOpenAt);
      if (days === null || days < campaign.min_days_since_first_open) {
        return { eligible: false, reason: `days_since_first_open ${days} < min ${campaign.min_days_since_first_open}` };
      }
    }
    if (campaign.min_sessions != null && ctx.sessionsCount < campaign.min_sessions) {
      return { eligible: false, reason: `sessions ${ctx.sessionsCount} < min ${campaign.min_sessions}` };
    }
    // Note: min_session_duration_seconds is checked but we don't have current session duration in context.
    // For now, skip this check (always passes). It can be added when SessionTracker exposes duration.

    // 15. Usage conditions
    if (campaign.min_products_created != null && ctx.productsCreatedCount < campaign.min_products_created) {
      return { eligible: false, reason: `products_created ${ctx.productsCreatedCount} < min ${campaign.min_products_created}` };
    }
    if (campaign.min_orders_created != null && ctx.ordersCreatedCount < campaign.min_orders_created) {
      return { eligible: false, reason: `orders_created ${ctx.ordersCreatedCount} < min ${campaign.min_orders_created}` };
    }
    if (campaign.min_shopping_lists_created != null && ctx.shoppingListsCreatedCount < campaign.min_shopping_lists_created) {
      return { eligible: false, reason: `shopping_lists_created ${ctx.shoppingListsCreatedCount} < min ${campaign.min_shopping_lists_created}` };
    }
    if (campaign.min_completed_orders != null && ctx.completedOrdersCount < campaign.min_completed_orders) {
      return { eligible: false, reason: `completed_orders ${ctx.completedOrdersCount} < min ${campaign.min_completed_orders}` };
    }
    if (campaign.days_since_last_active != null) {
      const days = daysSince(ctx.lastActiveAt);
      if (days === null || days < campaign.days_since_last_active) {
        return { eligible: false, reason: `days_since_last_active ${days} < required ${campaign.days_since_last_active}` };
      }
    }

    // 16. Cooldown checks
    const cState = ctx.campaignStates[campaign.campaign_key];
    if (cState) {
      if (campaign.cooldown_days_after_view != null && cState.last_viewed_at) {
        const days = daysSince(cState.last_viewed_at);
        if (days !== null && days < campaign.cooldown_days_after_view) {
          return { eligible: false, reason: `cooldown_after_view: ${days} < ${campaign.cooldown_days_after_view} days` };
        }
      }
      if (campaign.cooldown_days_after_dismiss != null && cState.last_dismissed_at) {
        const days = daysSince(cState.last_dismissed_at);
        if (days !== null && days < campaign.cooldown_days_after_dismiss) {
          return { eligible: false, reason: `cooldown_after_dismiss: ${days} < ${campaign.cooldown_days_after_dismiss} days` };
        }
      }

      // 17. Impression limits
      if (campaign.max_impressions_per_user != null && cState.impressions_total >= campaign.max_impressions_per_user) {
        return { eligible: false, reason: `impressions_total ${cState.impressions_total} >= max ${campaign.max_impressions_per_user}` };
      }
      if (campaign.max_impressions_per_day != null && cState.impressions_today >= campaign.max_impressions_per_day) {
        // Only if today's date matches
        const today = new Date().toISOString().slice(0, 10);
        if (cState.impressions_today_date === today) {
          return { eligible: false, reason: `impressions_today ${cState.impressions_today} >= max ${campaign.max_impressions_per_day}` };
        }
      }
      if (campaign.max_clicks_per_user != null && cState.clicks_total >= campaign.max_clicks_per_user) {
        return { eligible: false, reason: `clicks_total ${cState.clicks_total} >= max ${campaign.max_clicks_per_user}` };
      }
    }

    // Session impressions (in-memory)
    if (campaign.max_impressions_per_session != null) {
      const sessionCount = ctx.sessionImpressions[campaign.campaign_key] || 0;
      if (sessionCount >= campaign.max_impressions_per_session) {
        return { eligible: false, reason: `impressions_this_session ${sessionCount} >= max ${campaign.max_impressions_per_session}` };
      }
    }

    // 18. Campaign dependency
    if (campaign.depends_on_campaign_id && campaign.depends_on_campaign_status) {
      const depState = _findDependencyState(campaign.depends_on_campaign_id, ctx);
      if (!depState) {
        return { eligible: false, reason: `dependency campaign ${campaign.depends_on_campaign_id} has no state` };
      }
      if (!_matchesDependencyStatus(depState, campaign.depends_on_campaign_status)) {
        return { eligible: false, reason: `dependency status mismatch: expected ${campaign.depends_on_campaign_status}` };
      }
    }

    // All conditions passed
    return { eligible: true };
  },
};

// ── Internal helpers ──

function _checkUnknownFields(campaign: RemoteCampaign): void {
  const keys = Object.keys(campaign);
  for (const key of keys) {
    if (!KNOWN_CONDITION_FIELDS.has(key)) {
      warnLog("RuleEngine", `unknown_condition_received: "${key}" in campaign ${campaign.campaign_key}`);
    }
  }
}

function _findDependencyState(
  campaignId: string,
  ctx: RuleContext,
): CampaignState | null {
  // campaignStates is keyed by campaign_key, but depends_on_campaign_id is a uuid.
  // We need to search by iterating. In practice, the CampaignSelectorService
  // will pass campaign_key-keyed states, so we also accept campaign_id as key.
  // For now, iterate all states looking for a match by key or id.
  for (const [_key, state] of Object.entries(ctx.campaignStates)) {
    // The key could be campaign_key or campaign_id
    if (_key === campaignId) return state;
  }
  return null;
}

function _matchesDependencyStatus(state: CampaignState, requiredStatus: string): boolean {
  switch (requiredStatus) {
    case "viewed":
      return state.impressions_total > 0;
    case "clicked":
      return state.clicks_total > 0;
    case "dismissed":
      return state.dismissed_count > 0;
    case "completed":
      return state.completed;
    default:
      return false;
  }
}
