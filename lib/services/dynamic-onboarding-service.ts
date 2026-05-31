/**
 * DynamicOnboardingService — Loads, caches, and provides the active onboarding flow.
 *
 * Flow:
 * 1. Check cache (keyed by app_key + app_language)
 * 2. If cache miss → fetch from tRPC server (onboarding.getActiveFlow)
 * 3. Return the flow or null (null = use static onboarding fallback)
 *
 * Cache keys are per-language to prevent cross-language contamination:
 *   dynamic_onboarding_catering_manager_pro_he
 *   dynamic_onboarding_catering_manager_pro_en
 *
 * ARCHITECTURE:
 * Uses vanillaTrpc directly (no React hooks/context dependency) so this service
 * works from any context. Supports test client injection for unit tests.
 */

import { CacheManager } from "./cache-manager";
import { devLog, warnLog, CACHE_TTL } from "./environment";
import { vanillaTrpc } from "../trpc";
import { APP_KEY, APP_LANGUAGE } from "@/constants/app-identity";

// ── Types ──

export interface OnboardingScreen {
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

// ── Constants ──

const TAG = "DynamicOnboarding";

/** Cache key includes app_key + app_language for isolation */
function getCacheKey(): string {
  return `dynamic_onboarding_${APP_KEY}_${APP_LANGUAGE}`;
}

/** Cache TTL — dedicated onboarding TTL (1 hour in prod, 2 min in dev) */
const ONBOARDING_CACHE_TTL = CACHE_TTL.onboarding;

// ── tRPC client injection (for testing only) ──

interface TrpcOnboardingCaller {
  getActiveFlow: { query: () => Promise<ActiveOnboardingFlow | null> };
}

let testTrpcClient: TrpcOnboardingCaller | null = null;

/** Whether the service is ready */
let isReady = false;

// ── Public API ──

export const DynamicOnboardingService = {
  /**
   * Set the tRPC client override for testing.
   * In production, vanillaTrpc is used directly — no injection needed.
   */
  setTrpcClient(client: TrpcOnboardingCaller): void {
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
   * Mark the service as ready.
   */
  setReady(): void {
    isReady = true;
  },

  /**
   * Mark the service as not ready.
   */
  setNotReady(): void {
    isReady = false;
  },

  /**
   * Get the active onboarding flow.
   * Returns the flow with screens, or null if no dynamic flow is available.
   * On null, the caller should fall back to static onboarding.
   */
  async getActiveFlow(): Promise<ActiveOnboardingFlow | null> {
    try {
      return await _loadFlow();
    } catch (error) {
      warnLog(TAG, "getActiveFlow failed:", error);
      return null;
    }
  },

  /**
   * Force refresh the flow from server (bypasses cache).
   */
  async refresh(): Promise<ActiveOnboardingFlow | null> {
    return _fetchFromServer();
  },

  /**
   * Get cached flow without fetching.
   */
  async getCached(): Promise<ActiveOnboardingFlow | null> {
    return CacheManager.get<ActiveOnboardingFlow>(getCacheKey());
  },

  /**
   * Clear the onboarding flow cache.
   */
  async clearCache(): Promise<void> {
    await CacheManager.remove(getCacheKey());
  },
};

// ── Internal ──

/**
 * Load flow: cache-first, then server.
 * If cache exists and is valid, return it immediately.
 * Then try server in background to refresh cache.
 */
async function _loadFlow(): Promise<ActiveOnboardingFlow | null> {
  // Try cache first
  const cached = await CacheManager.get<ActiveOnboardingFlow>(getCacheKey());
  if (cached && cached.screens && cached.screens.length > 0) {
    devLog(TAG, `Loaded flow "${cached.flow_key}" from cache (${cached.screens.length} screens)`);
    // Background refresh (non-blocking)
    _fetchFromServer().catch(() => {});
    return cached;
  }

  // No cache — fetch from server
  devLog(TAG, "No cache, fetching from server");
  return _fetchFromServer();
}

/**
 * Fetch the active flow from tRPC server and update cache.
 * Server uses service_role to bypass RLS on onboarding tables.
 * Uses vanillaTrpc directly (or testTrpcClient in tests).
 */
async function _fetchFromServer(): Promise<ActiveOnboardingFlow | null> {
  try {
    if (!isReady && !testTrpcClient) {
      devLog(TAG, "Not ready — cannot fetch onboarding flow");
      const fallback = await CacheManager.get<ActiveOnboardingFlow>(getCacheKey());
      return fallback || null;
    }

    let data: ActiveOnboardingFlow | null;
    if (testTrpcClient) {
      data = await testTrpcClient.getActiveFlow.query();
    } else {
      data = (await vanillaTrpc.onboarding.getActiveFlow.query()) as ActiveOnboardingFlow | null;
    }

    if (!data || !data.screens || data.screens.length === 0) {
      devLog(TAG, "Server returned no active flow");
      // Clear stale cache
      await CacheManager.remove(getCacheKey());
      return null;
    }

    devLog(TAG, `Fetched flow "${data.flow_key}" from server (${data.screens.length} screens)`);

    // Update cache
    await CacheManager.set(getCacheKey(), data, ONBOARDING_CACHE_TTL);

    return data;
  } catch (error) {
    warnLog(TAG, "Server fetch exception:", error);
    // Fall back to cache
    const fallback = await CacheManager.get<ActiveOnboardingFlow>(getCacheKey());
    return fallback || null;
  }
}
