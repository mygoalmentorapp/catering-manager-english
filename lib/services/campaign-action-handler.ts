/**
 * CampaignActionHandler — handles approved campaign button actions.
 *
 * Approved actions (spec v1.2):
 *   - open_feedback: navigate to existing feedback form
 *   - open_external_url: open validated external URL in browser
 *   - open_deep_link: navigate to an in-app route (generic)
 *   - open_home: navigate to home tab
 *   - open_products: navigate to products screen
 *   - open_orders: navigate to orders screen
 *   - open_shopping_lists: navigate to shopping lists screen
 *   - open_settings: navigate to settings/about screen
 *   - dismiss_for_later: close popup, update campaign state, log event
 *   - close_campaign: close popup via X button (same as dismiss)
 *
 * NOT approved (must never be used):
 *   - navigate, dismiss (raw)
 *
 * ARCHITECTURE NOTE (Session 4 fix):
 * Campaign state updates go through UserExperienceStateService → tRPC → service_role,
 * bypassing RLS. No direct Supabase client calls from the app.
 *
 * Session 4 — Campaign UI Components + Feedback Circle Popup
 */

import { Linking } from "react-native";
import { router } from "expo-router";
import { ExperienceEventService, EVENT_NAMES } from "./experience-event-service";
import { UserExperienceStateService } from "./user-experience-state-service";
import { AllowedDomainsService } from "./allowed-domains-service";
import { devLog, warnLog } from "./environment";

// ── Types ──

export type ApprovedAction =
  | "open_feedback"
  | "open_external_url"
  | "open_deep_link"
  | "open_home"
  | "open_products"
  | "open_orders"
  | "open_shopping_lists"
  | "open_settings"
  | "open_paywall"
  | "dismiss_for_later"
  | "close_campaign";

/** Route map for named navigation actions */
const NAVIGATION_ROUTES: Record<string, string> = {
  open_home: "/(tabs)",
  open_products: "/products",
  open_orders: "/orders",
  open_shopping_lists: "/shopping-lists",
  open_settings: "/about",
};

export interface ActionContext {
  campaignKey: string;
  userId: string;
  screenKey?: string;
  /** URL for open_external_url action */
  actionUrl?: string;
  /** Route path for open_deep_link action (e.g. "/orders") */
  actionRoute?: string;
}

// ── Public API ──

export const CampaignActionHandler = {
  /**
   * Execute an approved action.
   * Returns true if the action was handled, false if unknown.
   */
  async execute(
    action: string | null,
    ctx: ActionContext,
    onClose: () => void,
  ): Promise<boolean> {
    if (!action) {
      devLog("ActionHandler", "No action provided, closing");
      onClose();
      return false;
    }

    switch (action) {
      case "open_feedback":
        return _handleOpenFeedback(ctx, onClose);

      case "open_external_url":
        return _handleOpenExternalUrl(ctx, onClose);

      case "open_deep_link":
        return _handleOpenDeepLink(ctx, onClose);

      case "open_home":
      case "open_products":
      case "open_orders":
      case "open_shopping_lists":
      case "open_settings":
        return _handleNamedNavigation(action, ctx, onClose);

      case "dismiss_for_later":
        return _handleDismissForLater(ctx, onClose);

      case "close_campaign":
        return _handleCloseCampaign(ctx, onClose);

      case "open_paywall":
        return _handleOpenPaywall(ctx, onClose);

      default:
        // Unknown action — log it and close
        warnLog("ActionHandler", `Unknown action: ${action}`);
        ExperienceEventService.logEvent({
          event_name: EVENT_NAMES.UNKNOWN_ACTION_RECEIVED,
          campaign_key: ctx.campaignKey,
          metadata: { action },
        }).catch(() => {});
        onClose();
        return false;
    }
  },
};

// ── Internal Handlers ──

/**
 * open_feedback: Navigate to the existing feedback form, then close popup.
 * Does NOT create a new form — uses the existing /feedback route.
 */
async function _handleOpenFeedback(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "open_feedback →", ctx.campaignKey);

  // Log campaign_clicked event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "open_feedback" },
  }).catch(() => {});

  // Update clicks in campaign state (via tRPC)
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup first, then navigate
  onClose();

  // Navigate to existing feedback form with campaign context
  try {
    router.push({
      pathname: "/feedback" as any,
      params: { context: `campaign:${ctx.campaignKey}` },
    });
  } catch (err) {
    warnLog("ActionHandler", "Failed to navigate to feedback:", err);
  }

  return true;
}

/**
 * open_external_url: Open an external URL in the browser.
 * Validates against allowed domains whitelist before opening.
 */
async function _handleOpenExternalUrl(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "open_external_url →", ctx.campaignKey, ctx.actionUrl);

  if (!ctx.actionUrl) {
    warnLog("ActionHandler", "open_external_url called without actionUrl");
    onClose();
    return false;
  }

  // Validate URL against allowed domains
  try {
    const allowedDomains = await AllowedDomainsService.getDomains();
    const isAllowed = AllowedDomainsService.isDomainAllowed(ctx.actionUrl, allowedDomains);

    if (!isAllowed) {
      warnLog("ActionHandler", `Domain not allowed: ${ctx.actionUrl}`);
      ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.UNKNOWN_ACTION_RECEIVED,
        campaign_key: ctx.campaignKey,
        metadata: { action: "open_external_url", url: ctx.actionUrl, reason: "domain_not_allowed" },
      }).catch(() => {});
      onClose();
      return false;
    }
  } catch (err) {
    warnLog("ActionHandler", "Failed to validate domain, blocking:", err);
    onClose();
    return false;
  }

  // Log campaign_clicked event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "open_external_url", url: ctx.actionUrl },
  }).catch(() => {});

  // Update clicks in campaign state
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup first, then open URL
  onClose();

  try {
    await Linking.openURL(ctx.actionUrl);
  } catch (err) {
    warnLog("ActionHandler", "Failed to open URL:", err);
  }

  return true;
}

/**
 * open_deep_link: Navigate to an in-app route.
 * Uses expo-router to navigate to the specified path.
 */
async function _handleOpenDeepLink(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "open_deep_link →", ctx.campaignKey, ctx.actionRoute);

  if (!ctx.actionRoute) {
    warnLog("ActionHandler", "open_deep_link called without actionRoute");
    onClose();
    return false;
  }

  // Log campaign_clicked event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "open_deep_link", route: ctx.actionRoute },
  }).catch(() => {});

  // Update clicks in campaign state
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup first, then navigate
  onClose();

  try {
    router.push(ctx.actionRoute as any);
  } catch (err) {
    warnLog("ActionHandler", "Failed to navigate to route:", err);
  }

  return true;
}

/**
 * Named navigation actions: open_home, open_products, open_orders, open_shopping_lists, open_settings.
 * Each maps to a known in-app route. Logs click, updates campaign state, closes popup, then navigates.
 */
async function _handleNamedNavigation(
  action: string,
  ctx: ActionContext,
  onClose: () => void,
): Promise<boolean> {
  const route = NAVIGATION_ROUTES[action];
  if (!route) {
    warnLog("ActionHandler", `No route mapping for named action: ${action}`);
    onClose();
    return false;
  }

  devLog("ActionHandler", `${action} → ${route}`, ctx.campaignKey);

  // Log campaign_clicked event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action, route },
  }).catch(() => {});

  // Update clicks in campaign state
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup first, then navigate
  onClose();

  try {
    router.push(route as any);
  } catch (err) {
    warnLog("ActionHandler", `Failed to navigate to ${route}:`, err);
  }

  return true;
}

/**
 * dismiss_for_later: Close popup, update dismissed state, log event.
 * Respects cooldown_days_after_dismiss on next evaluation.
 */
async function _handleDismissForLater(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "dismiss_for_later →", ctx.campaignKey);

  // Log campaign_dismissed event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_DISMISSED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "dismiss_for_later" },
  }).catch(() => {});

  // Update dismissed state via tRPC
  _updateCampaignDismissed(ctx.campaignKey).catch(() => {});

  // Close the popup
  onClose();
  return true;
}

/**
 * close_campaign: Close popup via X button. Same as dismiss but via close button.
 */
async function _handleCloseCampaign(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "close_campaign →", ctx.campaignKey);

  // Log campaign_dismissed event (X button counts as dismiss)
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_DISMISSED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "close_campaign" },
  }).catch(() => {});

  // Update dismissed state via tRPC
  _updateCampaignDismissed(ctx.campaignKey).catch(() => {});

  // Close the popup
  onClose();
  return true;
}

// ── Campaign State Updates (via tRPC) ──

/**
 * Update clicks_total and last_clicked_at for a campaign.
 * Uses UserExperienceStateService.upsertCampaignState which goes through tRPC.
 */
async function _updateCampaignClicks(campaignKey: string): Promise<void> {
  try {
    await UserExperienceStateService.upsertCampaignState(campaignKey, {
      _increment_clicks: true,
      last_clicked_at: new Date().toISOString(),
    });
  } catch (err) {
    warnLog("ActionHandler", "Failed to update campaign clicks:", err);
  }
}

/**
 * Update dismissed_count and last_dismissed_at for a campaign.
 * Uses UserExperienceStateService.upsertCampaignState which goes through tRPC.
 */
async function _updateCampaignDismissed(campaignKey: string): Promise<void> {
  try {
    await UserExperienceStateService.upsertCampaignState(campaignKey, {
      _increment_dismissed: true,
      last_dismissed_at: new Date().toISOString(),
    });
  } catch (err) {
    warnLog("ActionHandler", "Failed to update campaign dismissed:", err);
  }
}

/**
 * open_paywall: Log event, close campaign, navigate to Adapty paywall.
 * Uses router.push("/paywall?placement=main") to open the Adapty paywall screen.
 */
async function _handleOpenPaywall(ctx: ActionContext, onClose: () => void): Promise<boolean> {
  devLog("ActionHandler", "open_paywall →", ctx.campaignKey);

  // Log campaign_clicked event
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
    campaign_key: ctx.campaignKey,
    screen_key: ctx.screenKey,
    metadata: { action: "open_paywall" },
  }).catch(() => {});

  // Update clicks in campaign state
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup
  onClose();

  // Navigate to Adapty paywall screen with "main" placement
  try {
    const { router } = require("expo-router");
    router.push("/paywall?placement=main");
  } catch (err) {
    devLog("ActionHandler", "open_paywall: navigation failed", err);
  }

  return true;
}
