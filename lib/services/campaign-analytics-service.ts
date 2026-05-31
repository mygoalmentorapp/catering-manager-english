/**
 * Campaign Analytics Service
 * 
 * Client-side service for tracking campaign performance metrics.
 * Reports events to the server which aggregates them in campaign_analytics table.
 * 
 * Events tracked:
 *   - impression: Campaign was shown to user
 *   - click: User clicked a campaign button/CTA
 *   - dismiss: User dismissed the campaign
 *   - complete: Campaign action was completed (e.g., feedback submitted)
 *   - close: Campaign was closed (X button or auto-dismiss)
 * 
 * All reporting is fire-and-forget — failures never crash the app.
 */

import { getVanillaTrpc } from "@/lib/trpc";

export type CampaignAnalyticsEvent =
  | "impression"
  | "click"
  | "dismiss"
  | "complete"
  | "close"
  | "cta_primary"
  | "cta_secondary";

interface AnalyticsPayload {
  campaign_key: string;
  campaign_type: string;
  event: CampaignAnalyticsEvent;
  metadata?: Record<string, string | number | boolean>;
}

// ── Queue for batching events ──
let eventQueue: AnalyticsPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const MAX_BATCH_SIZE = 20;

/**
 * Track a campaign analytics event.
 * Events are queued and sent in batches to reduce network calls.
 */
export function trackCampaignEvent(
  campaignKey: string,
  campaignType: string,
  event: CampaignAnalyticsEvent,
  metadata?: Record<string, string | number | boolean>
): void {
  eventQueue.push({
    campaign_key: campaignKey,
    campaign_type: campaignType,
    event,
    metadata,
  });

  // Flush immediately if batch is full
  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents();
    return;
  }

  // Otherwise schedule a flush
  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush all queued events to the server.
 * Called automatically on timer or when batch is full.
 * Can also be called manually (e.g., on app background).
 */
export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const batch = [...eventQueue];
  eventQueue = [];

  try {
    // Use the vanilla tRPC client (non-React) for service-layer calls
    const client = getVanillaTrpc();
    await client.experience.logAnalyticsBatch.mutate({ events: batch });
  } catch (err) {
    // Fire-and-forget: log warning but don't crash
    console.warn("[CampaignAnalytics] Failed to flush events:", err);
    // Re-queue failed events (up to a limit to prevent memory leak)
    if (eventQueue.length + batch.length <= 100) {
      eventQueue = [...batch, ...eventQueue];
    }
  }
}

/**
 * Convenience: Track impression when campaign is shown.
 */
export function trackImpression(campaignKey: string, campaignType: string): void {
  trackCampaignEvent(campaignKey, campaignType, "impression");
}

/**
 * Convenience: Track CTA click.
 */
export function trackClick(
  campaignKey: string,
  campaignType: string,
  buttonType: "primary" | "secondary" = "primary"
): void {
  trackCampaignEvent(campaignKey, campaignType, buttonType === "primary" ? "cta_primary" : "cta_secondary");
  trackCampaignEvent(campaignKey, campaignType, "click");
}

/**
 * Convenience: Track dismiss.
 */
export function trackDismiss(campaignKey: string, campaignType: string): void {
  trackCampaignEvent(campaignKey, campaignType, "dismiss");
}

/**
 * Convenience: Track completion.
 */
export function trackComplete(campaignKey: string, campaignType: string): void {
  trackCampaignEvent(campaignKey, campaignType, "complete");
}

/**
 * Convenience: Track close (X button or auto-dismiss).
 */
export function trackClose(campaignKey: string, campaignType: string): void {
  trackCampaignEvent(campaignKey, campaignType, "close");
}
