/**
 * CampaignSelectorService — Loads, filters, and selects the best campaign.
 *
 * Flow:
 * 1. Load campaigns from cache (fast) → then tRPC server (fresh)
 * 2. Filter through ExperienceRuleEngine
 * 3. Sort by priority desc → created_at desc → campaign_key asc
 * 4. Return exactly one campaign or null
 *
 * ARCHITECTURE NOTE (Session 4 fix):
 * Campaign fetching goes through tRPC server (experience.getActiveCampaigns)
 * which uses service_role to bypass RLS. The vanilla tRPC client is used directly
 * (no React hooks/context dependency) so this service works from any context.
 */

import { CacheManager } from "./cache-manager";
import { devLog, warnLog, CACHE_TTL, SUPPORTED_SCHEMA_VERSION } from "./environment";
import {
  ExperienceRuleEngine,
  type RemoteCampaign,
  type RuleContext } from "./experience-rule-engine";
import { vanillaTrpc } from "../trpc";

// ── Constants ──

const CACHE_KEY = "campaigns";
const TAG = "CampaignSelector";

/** Cache TTL for campaigns — same as remote config */
const CAMPAIGNS_CACHE_TTL = CACHE_TTL.remoteConfig;

// ── tRPC client injection (for testing only) ──

interface TrpcCampaignCaller {
  getActiveCampaigns: { query: () => Promise<Record<string, unknown>[]> };
}

let testTrpcClient: TrpcCampaignCaller | null = null;

/** Whether the service is ready (user authenticated) */
let isReady = false;

// ── Public API ──

export const CampaignSelectorService = {
  /**
   * Set the tRPC client override for testing.
   * In production, vanillaTrpc is used directly — no injection needed.
   */
  setTrpcClient(client: TrpcCampaignCaller): void {
    testTrpcClient = client;
    devLog(TAG, "Test tRPC client set");
  },

  /**
   * Clear the test tRPC client.
   */
  clearTrpcClient(): void {
    testTrpcClient = null;
  },

  /**
   * Mark the service as ready (user authenticated).
   */
  setReady(): void {
    isReady = true;
  },

  /**
   * Mark the service as not ready (user signed out).
   */
  setNotReady(): void {
    isReady = false;
  },

  /**
   * Select the best eligible campaign for the current context.
   *
   * @param ctx - The full rule context (user state, screen, event, etc.)
   * @returns The winning campaign or null if none eligible.
   */
  async selectCampaign(ctx: RuleContext): Promise<RemoteCampaign | null> {
    try {
      const campaigns = await _loadCampaigns();
      console.log(`[${TAG}] selectCampaign: loaded ${campaigns?.length ?? 0} campaigns, trigger=${ctx.currentEvent}`);
      if (!campaigns || campaigns.length === 0) {
        console.log(`[${TAG}] No campaigns loaded — returning null`);
        return null;
      }

      // Filter through rule engine
      const eligible: RemoteCampaign[] = [];
      for (const campaign of campaigns) {
        const result = ExperienceRuleEngine.evaluate(campaign, ctx);
        if (result.eligible) {
          eligible.push(campaign);
          console.log(`[${TAG}] ✅ Campaign ${campaign.campaign_key} is ELIGIBLE`);
        } else {
          console.log(`[${TAG}] ❌ Campaign ${campaign.campaign_key} REJECTED: ${result.reason}`);
        }
      }

      if (eligible.length === 0) {
        console.log(`[${TAG}] No eligible campaigns after filtering (ctx: sessions=${ctx.sessionsCount}, orders=${ctx.ordersCreatedCount}, feedback=${ctx.feedbackSubmitted})`);
        return null;
      }

      // Sort: priority desc → created_at desc → campaign_key asc
      eligible.sort((a, b) => {
        // Priority: higher first
        if (a.priority !== b.priority) return b.priority - a.priority;
        // Created at: newer first
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        if (aTime !== bTime) return bTime - aTime;
        // Campaign key: alphabetical (stable)
        return a.campaign_key.localeCompare(b.campaign_key);
      });

      const winner = eligible[0];
      devLog(TAG, `Selected campaign: ${winner.campaign_key} (priority=${winner.priority})`);
      return winner;
    } catch (error) {
      warnLog(TAG, "selectCampaign failed:", error);
      return null;
    }
  },

  /**
   * Force refresh campaigns from server (bypasses cache).
   */
  async refresh(): Promise<RemoteCampaign[]> {
    return _fetchFromServer();
  },

  /**
   * Get all cached campaigns without fetching.
   */
  async getCached(): Promise<RemoteCampaign[] | null> {
    return CacheManager.get<RemoteCampaign[]>(CACHE_KEY);
  },

  /**
   * Clear campaign cache.
   */
  async clearCache(): Promise<void> {
    await CacheManager.remove(CACHE_KEY);
  } };

// ── Internal ──

/**
 * Load campaigns: cache-first, then server.
 * If cache exists and is valid, return it immediately.
 * Then try server in background to refresh cache.
 */
async function _loadCampaigns(): Promise<RemoteCampaign[]> {
  // Try cache first
  const cached = await CacheManager.get<RemoteCampaign[]>(CACHE_KEY);
  if (cached && cached.length > 0) {
    devLog(TAG, `Loaded ${cached.length} campaigns from cache`);
    // Background refresh (non-blocking)
    _fetchFromServer().catch(() => {});
    return cached;
  }

  // No cache — fetch from server
  devLog(TAG, "No cache, fetching from server");
  return _fetchFromServer();
}

/**
 * Fetch campaigns from tRPC server and update cache.
 * Server uses service_role to bypass RLS on remote_campaigns table.
 * Uses vanillaTrpc directly (or testTrpcClient in tests).
 */
async function _fetchFromServer(): Promise<RemoteCampaign[]> {
  try {
    if (!isReady && !testTrpcClient) {
      devLog(TAG, "Not ready — cannot fetch campaigns");
      const fallback = await CacheManager.get<RemoteCampaign[]>(CACHE_KEY);
      return fallback || [];
    }

    let data: Record<string, unknown>[];
    if (testTrpcClient) {
      data = await testTrpcClient.getActiveCampaigns.query();
    } else {
      data = await vanillaTrpc.experience.getActiveCampaigns.query() as any;
    }

    // Filter by supported schema version
    const campaigns = (data || []).filter(
      (c) => ((c.schema_version as number) ?? 1) <= SUPPORTED_SCHEMA_VERSION
    ) as unknown as RemoteCampaign[];

    devLog(TAG, `Fetched ${campaigns.length} campaigns from server`);

    // Update cache
    await CacheManager.set(CACHE_KEY, campaigns, CAMPAIGNS_CACHE_TTL);

    return campaigns;
  } catch (error) {
    console.error("[CampaignSelector] Server fetch exception:", error);
    // Fall back to cache
    const fallback = await CacheManager.get<RemoteCampaign[]>(CACHE_KEY);
    return fallback || [];
  }
}
