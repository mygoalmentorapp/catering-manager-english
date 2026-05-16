/**
 * UserExperienceStateService — manages user_experience_state and user_campaign_state.
 *
 * All state operations go through tRPC server (experience router) which uses
 * Supabase service_role to bypass RLS. The vanilla tRPC client is used directly
 * (no React hooks/context dependency) so this service works from any context.
 *
 * The server always uses ctx.user.openId as user_id — client never sends user_id.
 */

import { Platform } from "react-native";
import { devLog, warnLog } from "./environment";
import { vanillaTrpc } from "../trpc";

/**
 * tRPC caller type — used for testing override.
 */
interface TrpcStateCaller {
  upsertState: { mutate: (input: { updates: Record<string, unknown> }) => Promise<{ success: boolean }> };
  getState: { query: () => Promise<Record<string, unknown> | null> };
  incrementCounter: { mutate: (input: { field: string }) => Promise<{ success: boolean; newValue?: number }> };
  getCampaignStates: { query: () => Promise<Record<string, unknown>[]> };
  upsertCampaignState: { mutate: (input: { campaign_key: string; updates: Record<string, unknown> }) => Promise<{ success: boolean }> };
}

/** Override tRPC client for testing */
let testTrpcClient: TrpcStateCaller | null = null;

/** Whether the service is ready (user authenticated) */
let isReady = false;

/** Get the active client (test override or vanilla) */
function getClient(): TrpcStateCaller {
  if (testTrpcClient) return testTrpcClient;
  return {
    upsertState: { mutate: (input) => vanillaTrpc.experience.upsertState.mutate(input) },
    getState: { query: () => vanillaTrpc.experience.getState.query() },
    incrementCounter: { mutate: (input) => vanillaTrpc.experience.incrementCounter.mutate(input) as any },
    getCampaignStates: { query: () => vanillaTrpc.experience.getCampaignStates.query() as any },
    upsertCampaignState: { mutate: (input) => vanillaTrpc.experience.upsertCampaignState.mutate(input) } };
}

export const UserExperienceStateService = {
  /**
   * Set the tRPC client override for testing.
   * In production, vanillaTrpc is used directly — no injection needed.
   */
  setTrpcClient(client: TrpcStateCaller): void {
    testTrpcClient = client;
    devLog("UserState", "Test tRPC client set");
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
   * Initialize state for a user — ensures a row exists.
   * Called once when user authenticates.
   */
  async initForUser(appVersion: string): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) {
        devLog("UserState", "Skipping init (not ready)");
        return;
      }
      const client = getClient();
      await client.upsertState.mutate({
        updates: {
          first_open_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          current_app_version: appVersion,
          platform: Platform.OS,
          language: "he" } });
      devLog("UserState", "Initialized for user");
    } catch (err) {
      console.error("[UserState] initForUser error:", err);
    }
  },

  /**
   * Record signup timestamp.
   */
  async recordSignup(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.upsertState.mutate({
        updates: { signup_at: new Date().toISOString() } });
      devLog("UserState", "Recorded signup");
    } catch (err) {
      console.error("[UserState] recordSignup error:", err);
    }
  },

  /**
   * Handle app_open: update last_active_at, current_app_version, platform, language.
   */
  async onAppOpen(appVersion: string): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.upsertState.mutate({
        updates: {
          last_active_at: new Date().toISOString(),
          current_app_version: appVersion,
          platform: Platform.OS,
          language: "he" } });
      devLog("UserState", "Updated on app_open");
    } catch (err) {
      console.error("[UserState] onAppOpen error:", err);
    }
  },

  /**
   * Handle session_start: increment sessions_count.
   */
  async onSessionStart(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.incrementCounter.mutate({ field: "sessions_count" });
      devLog("UserState", "Incremented sessions_count");
    } catch (err) {
      console.error("[UserState] onSessionStart error:", err);
    }
  },

  /**
   * Handle product_created: increment products_created_count.
   */
  async onProductCreated(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.incrementCounter.mutate({ field: "products_created_count" });
    } catch (err) {
      console.error("[UserState] onProductCreated error:", err);
    }
  },

  /**
   * Handle order_created: increment orders_created_count.
   */
  async onOrderCreated(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.incrementCounter.mutate({ field: "orders_created_count" });
    } catch (err) {
      console.error("[UserState] onOrderCreated error:", err);
    }
  },

  /**
   * Handle order_completed: increment completed_orders_count.
   */
  async onOrderCompleted(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.incrementCounter.mutate({ field: "completed_orders_count" });
    } catch (err) {
      console.error("[UserState] onOrderCompleted error:", err);
    }
  },

  /**
   * Handle shopping_list_created: increment shopping_lists_created_count.
   */
  async onShoppingListCreated(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.incrementCounter.mutate({ field: "shopping_lists_created_count" });
    } catch (err) {
      console.error("[UserState] onShoppingListCreated error:", err);
    }
  },

  /**
   * Handle onboarding_completed: set flag and timestamp.
   */
  async onOnboardingCompleted(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.upsertState.mutate({
        updates: {
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString() } });
      devLog("UserState", "Recorded onboarding_completed");
    } catch (err) {
      console.error("[UserState] onOnboardingCompleted error:", err);
    }
  },

  /**
   * Handle feedback_submitted: set flag and timestamp.
   */
  async onFeedbackSubmitted(): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.upsertState.mutate({
        updates: {
          feedback_submitted: true,
          feedback_submitted_at: new Date().toISOString() } });
      devLog("UserState", "Recorded feedback_submitted");
    } catch (err) {
      console.error("[UserState] onFeedbackSubmitted error:", err);
    }
  },

  /**
   * Get the current user's experience state (for Rule Engine).
   */
  async getState(): Promise<Record<string, unknown> | null> {
    try {
      if (!isReady && !testTrpcClient) return null;
      const client = getClient();
      return await client.getState.query();
    } catch (err) {
      console.error("[UserState] getState error:", err);
      return null;
    }
  },

  /**
   * Get all campaign states for the current user.
   */
  async getCampaignStates(): Promise<Record<string, unknown>[]> {
    try {
      if (!isReady && !testTrpcClient) return [];
      const client = getClient();
      return await client.getCampaignStates.query();
    } catch (err) {
      console.error("[UserState] getCampaignStates error:", err);
      return [];
    }
  },

  /**
   * Upsert a campaign state row.
   */
  async upsertCampaignState(
    campaignKey: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) return;
      const client = getClient();
      await client.upsertCampaignState.mutate({
        campaign_key: campaignKey,
        updates });
      devLog("UserState", `Campaign state updated: ${campaignKey}`);
    } catch (err) {
      console.error("[UserState] upsertCampaignState error:", err);
    }
  } };
