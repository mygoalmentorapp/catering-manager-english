/**
 * CampaignRenderer — Dispatches campaign to the correct UI component by type.
 *
 * Currently supported types:
 *   - circle_popup → CirclePopup
 *
 * Future types (skeleton-ready, not built):
 *   - banner → Banner (not approved yet)
 *   - bottom_sheet → BottomSheet (not approved yet)
 *   - full_screen → FullScreen (not approved yet)
 *
 * Responsibilities:
 *   - Renders the correct component for the campaign type
 *   - Logs campaign_viewed on first render
 *   - Updates impressions in user_campaign_state (via tRPC)
 *   - Delegates actions to CampaignActionHandler
 *
 * ARCHITECTURE NOTE (Session 4 fix):
 * Campaign state updates go through UserExperienceStateService → tRPC → service_role,
 * bypassing RLS. No direct Supabase client calls from the app.
 *
 * Session 4 — Campaign UI Components + Feedback Circle Popup
 */

import React, { useEffect, useRef, useCallback } from "react";
import { CirclePopup } from "./circle-popup";
import { CampaignActionHandler, type ActionContext } from "@/lib/services/campaign-action-handler";
import { ExperienceEventService, EVENT_NAMES } from "@/lib/services/experience-event-service";
import { UserExperienceStateService } from "@/lib/services/user-experience-state-service";
import { devLog, warnLog } from "@/lib/services/environment";
import type { RemoteCampaign } from "@/lib/services/experience-rule-engine";

// ── Types ──

export interface CampaignRendererProps {
  campaign: RemoteCampaign | null;
  visible: boolean;
  userId: string;
  currentScreen: string;
  onClose: () => void;
  /** Called after campaign_viewed is logged — update in-memory session impressions */
  onViewed?: (campaignKey: string) => void;
}

// ── Component ──

export function CampaignRenderer({
  campaign,
  visible,
  userId,
  currentScreen,
  onClose,
  onViewed }: CampaignRendererProps) {
  const viewedRef = useRef<string | null>(null);

  // Log campaign_viewed on first render of this campaign
  useEffect(() => {
    if (visible && campaign && viewedRef.current !== campaign.campaign_key) {
      viewedRef.current = campaign.campaign_key;
      _logCampaignViewed(campaign, currentScreen);
      onViewed?.(campaign.campaign_key);
    }
  }, [visible, campaign?.campaign_key]);

  // Reset viewed ref when campaign changes
  useEffect(() => {
    if (!campaign) {
      viewedRef.current = null;
    }
  }, [campaign?.campaign_key]);

  const actionCtx: ActionContext = {
    campaignKey: campaign?.campaign_key ?? "",
    userId,
    screenKey: currentScreen };

  const handlePrimaryAction = useCallback(() => {
    if (!campaign) return;
    CampaignActionHandler.execute(
      campaign.primary_button_action,
      actionCtx,
      onClose,
    ).catch(() => {});
  }, [campaign?.campaign_key, userId, currentScreen, onClose]);

  const handleSecondaryAction = useCallback(() => {
    if (!campaign) return;
    CampaignActionHandler.execute(
      campaign.secondary_button_action,
      actionCtx,
      onClose,
    ).catch(() => {});
  }, [campaign?.campaign_key, userId, currentScreen, onClose]);

  const handleClose = useCallback(() => {
    if (!campaign) return;
    // X button = close_campaign action
    CampaignActionHandler.execute(
      "close_campaign",
      actionCtx,
      onClose,
    ).catch(() => {});
  }, [campaign?.campaign_key, userId, currentScreen, onClose]);

  if (!campaign || !visible) return null;

  // Dispatch by campaign type
  switch (campaign.type) {
    case "circle_popup":
      return (
        <CirclePopup
          campaign={campaign}
          visible={visible}
          onPrimaryAction={handlePrimaryAction}
          onSecondaryAction={handleSecondaryAction}
          onClose={handleClose}
        />
      );

    // Future types — skeleton-ready, not built yet
    case "banner":
    case "bottom_sheet":
    case "full_screen":
      warnLog("CampaignRenderer", `Unsupported campaign type: ${campaign.type}`);
      return null;

    default:
      warnLog("CampaignRenderer", `Unknown campaign type: ${campaign.type}`);
      return null;
  }
}

// ── Campaign Viewed Tracking ──

/**
 * Log campaign_viewed event and update impressions in user_campaign_state.
 * All fire-and-forget — never blocks the UI.
 * Uses tRPC (via UserExperienceStateService) to bypass RLS.
 */
async function _logCampaignViewed(
  campaign: RemoteCampaign,
  screenKey: string,
): Promise<void> {
  devLog("CampaignRenderer", `campaign_viewed: ${campaign.campaign_key}`);

  // 1. Log event (via tRPC)
  ExperienceEventService.logEvent({
    event_name: EVENT_NAMES.CAMPAIGN_VIEWED,
    campaign_key: campaign.campaign_key,
    screen_key: screenKey,
    metadata: { type: campaign.type } }).catch(() => {});

  // 2. Update impressions in user_campaign_state (via tRPC)
  try {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // The server-side upsertCampaignState handles the read-then-write pattern.
    // We send the updates we want, and the server merges them.
    // For impressions, we need to increment — use a special pattern:
    // Send the date so the server can reset today's count if it's a new day.
    await UserExperienceStateService.upsertCampaignState(
      campaign.campaign_key,
      {
        _increment_impressions: true, // Signal to server to increment
        impressions_today_date: todayStr,
        last_viewed_at: new Date().toISOString() },
    );

    devLog("CampaignRenderer", "Impressions update sent via tRPC");
  } catch (err) {
    warnLog("CampaignRenderer", "Failed to update impressions:", err);
  }
}
