/**
 * CampaignActionHandler — handles approved campaign button actions.
 *
 * Approved actions (spec v1.1):
 *   - open_feedback: navigate to existing feedback form
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

import { router } from "expo-router";
import { ExperienceEventService, EVENT_NAMES } from "./experience-event-service";
import { UserExperienceStateService } from "./user-experience-state-service";
import { devLog, warnLog } from "./environment";

// ── Types ──

export type ApprovedAction = "open_feedback" | "dismiss_for_later" | "close_campaign";

export interface ActionContext {
  campaignKey: string;
  userId: string;
  screenKey?: string;
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

      case "dismiss_for_later":
        return _handleDismissForLater(ctx, onClose);

      case "close_campaign":
        return _handleCloseCampaign(ctx, onClose);

      default:
        // Unknown action — log it and close
        warnLog("ActionHandler", `Unknown action: ${action}`);
        ExperienceEventService.logEvent({
          event_name: EVENT_NAMES.UNKNOWN_ACTION_RECEIVED,
          campaign_key: ctx.campaignKey,
          metadata: { action } }).catch(() => {});
        onClose();
        return false;
    }
  } };

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
    metadata: { action: "open_feedback" } }).catch(() => {});

  // Update clicks in campaign state (via tRPC)
  _updateCampaignClicks(ctx.campaignKey).catch(() => {});

  // Close the popup first, then navigate
  onClose();

  // Navigate to existing feedback form with campaign context
  try {
    router.push({
      pathname: "/feedback" as any,
      params: { context: `campaign:${ctx.campaignKey}` } });
  } catch (err) {
    warnLog("ActionHandler", "Failed to navigate to feedback:", err);
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
    metadata: { action: "dismiss_for_later" } }).catch(() => {});

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
    metadata: { action: "close_campaign" } }).catch(() => {});

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
      last_clicked_at: new Date().toISOString() });
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
      last_dismissed_at: new Date().toISOString() });
  } catch (err) {
    warnLog("ActionHandler", "Failed to update campaign dismissed:", err);
  }
}
