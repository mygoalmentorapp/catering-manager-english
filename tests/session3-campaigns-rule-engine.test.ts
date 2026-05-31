// @ts-nocheck
/**
 * Session 3 Tests — ExperienceRuleEngine + CampaignSelectorService
 *
 * Tests:
 * - Rule engine: all condition checks
 * - Rollout percentage stability
 * - Priority tiebreaking
 * - Cooldown/impressions
 * - Unknown conditions
 * - CampaignSelectorService: load, filter, select
 * - CriticalFlowProvider: state management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock app-identity (required by remote-config-service) ──
vi.mock("@/constants/app-identity", () => ({
  APP_KEY: "catering_manager_pro",
  APP_LANGUAGE: "he",
}));

// ── Mock tRPC (campaign-selector-service uses ../lib/trpc relative path) ──
vi.mock("../lib/trpc", () => ({
  getVanillaTrpc: vi.fn(() => ({
    config: {
      getRemoteConfig: {
        query: vi.fn(async () => null),
      },
    },
  })),
  vanillaTrpc: {
    campaign: {
      getActiveCampaigns: {
        query: vi.fn(async () => []),
      },
    },
  },
  trpc: {},
}));

// ── Mock AsyncStorage ──
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(mockStorage))),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
  },
}));

// ── Mock Supabase ──
const mockSupabaseSelect = vi.fn();

vi.mock("../lib/supabase", () => {
  const _mockSelect = vi.fn();
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              lte: _mockSelect,
            })),
          })),
        })),
      })),
    },
    _mockSelect,
  };
});

// ── Mock react-native ──
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// ── Import after mocks ──
import {
  ExperienceRuleEngine,
  isInRollout,
  type RemoteCampaign,
  type RuleContext,
  type CampaignState,
} from "../lib/services/experience-rule-engine";
import { CampaignSelectorService } from "../lib/services/campaign-selector-service";

// ── Helpers ──

function makeCampaign(overrides: Partial<RemoteCampaign> = {}): RemoteCampaign {
  return {
    id: "test-id",
    campaign_key: "test_campaign",
    name: "Test Campaign",
    description: null,
    type: "circle_popup",
    title: "Hello",
    subtitle: null,
    message: "Test message",
    icon: null,
    image_url: null,
    animation_url: null,
    animation_type: null,
    primary_button_text: "OK",
    primary_button_action: "dismiss",
    primary_button_payload: null,
    secondary_button_text: null,
    secondary_button_action: null,
    secondary_button_payload: null,
    is_enabled: true,
    is_archived: false,
    priority: 10,
    rollout_percentage: 100,
    environment: "prod",
    app_key: "catering_manager_pro",
    app_language: "he",
    platform: null,
    language: null,
    country: null,
    region: null,
    target_audience: "all",
    trigger_event: null,
    allowed_screens: [],
    blocked_screens: [],
    start_at: null,
    end_at: null,
    min_app_version: null,
    max_app_version: null,
    min_days_since_signup: null,
    min_days_since_first_open: null,
    min_sessions: null,
    min_session_duration_seconds: null,
    min_products_created: null,
    min_orders_created: null,
    min_shopping_lists_created: null,
    min_completed_orders: null,
    days_since_last_active: null,
    cooldown_days_after_view: null,
    cooldown_days_after_dismiss: null,
    max_impressions_per_user: null,
    max_impressions_per_session: null,
    max_impressions_per_day: null,
    max_clicks_per_user: null,
    depends_on_campaign_id: null,
    depends_on_campaign_status: null,
    show_only_if_feedback_not_submitted: false,
    show_only_if_onboarding_not_completed: false,
    show_only_if_not_premium: false,
    show_only_if_premium: false,
    requires_internet: false,
    dismissible: true,
    do_not_show_during_critical_flow: true,
    schema_version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    userId: "user-123",
    currentScreen: "(tabs)",
    currentEvent: null,
    isInCriticalFlow: false,
    isOnline: true,
    appVersion: "1.0.0",
    appKey: "catering_manager_pro",
    platform: "android",
    language: "he",
    country: "IL",
    region: "",
    environment: "prod",
    firstOpenAt: "2026-01-01T00:00:00Z",
    signupAt: "2026-01-01T00:00:00Z",
    lastActiveAt: new Date().toISOString(),
    sessionsCount: 10,
    productsCreatedCount: 5,
    ordersCreatedCount: 3,
    completedOrdersCount: 2,
    shoppingListsCreatedCount: 1,
    onboardingCompleted: true,
    feedbackSubmitted: false,
    isPremium: false,
    subscriptionStatus: "trial",
    campaignStates: {},
    sessionImpressions: {},
    ...overrides,
  };
}

function makeCampaignState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    impressions_total: 0,
    impressions_today: 0,
    impressions_today_date: null,
    impressions_this_session: 0,
    clicks_total: 0,
    last_viewed_at: null,
    last_clicked_at: null,
    last_dismissed_at: null,
    dismissed_count: 0,
    completed: false,
    ...overrides,
  };
}

// ── Tests ──

describe("Session 3: ExperienceRuleEngine", () => {
  // ── Basic conditions ──

  describe("Basic conditions", () => {
    it("should accept an enabled, non-archived campaign", () => {
      const result = ExperienceRuleEngine.evaluate(makeCampaign(), makeContext());
      expect(result.eligible).toBe(true);
    });

    it("should reject disabled campaign", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ is_enabled: false }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("is_enabled");
    });

    it("should reject archived campaign", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ is_archived: true }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("is_archived");
    });
  });

  // ── Schema version ──

  describe("Schema version", () => {
    it("should reject campaign with higher schema_version than supported", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ schema_version: 999 }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("schema_version");
    });

    it("should accept campaign with equal schema_version", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ schema_version: 1 }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Environment ──

  describe("Environment", () => {
    it("should reject campaign with wrong environment", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ environment: "dev" }),
        makeContext({ environment: "prod" }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("environment");
    });

    it("should accept campaign with matching environment", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ environment: "prod" }),
        makeContext({ environment: "prod" }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept campaign with null environment (any)", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ environment: null }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Date range ──

  describe("Date range", () => {
    it("should reject campaign before start_at", () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ start_at: future }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("start_at");
    });

    it("should reject campaign after end_at", () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ end_at: past }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("end_at");
    });

    it("should accept campaign within date range", () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const future = new Date(Date.now() + 86400000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ start_at: past, end_at: future }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── App version ──

  describe("App version", () => {
    it("should reject if app version below min", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_app_version: "2.0.0" }),
        makeContext({ appVersion: "1.0.0" }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("appVersion");
    });

    it("should reject if app version above max", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_app_version: "0.9.0" }),
        makeContext({ appVersion: "1.0.0" }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("appVersion");
    });

    it("should accept if app version within range", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_app_version: "1.0.0", max_app_version: "2.0.0" }),
        makeContext({ appVersion: "1.5.0" }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Platform / Language / Country / Region ──

  describe("Platform/Language/Country/Region", () => {
    it("should reject wrong platform", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ platform: "ios" }),
        makeContext({ platform: "android" }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept null platform (any)", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ platform: null }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject wrong language", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ language: "en" }),
        makeContext({ language: "he" }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject wrong country", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ country: "US" }),
        makeContext({ country: "IL" }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject wrong region", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ region: "north" }),
        makeContext({ region: "south" }),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Target audience ──

  describe("Target audience", () => {
    it("should accept 'all' audience", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "all" }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept null audience (treated as all)", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: null }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept new_users for recently signed up user", () => {
      const recent = new Date(Date.now() - 3 * 86400000).toISOString(); // 3 days ago
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "new_users" }),
        makeContext({ signupAt: recent }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject new_users for old user", () => {
      const old = new Date(Date.now() - 30 * 86400000).toISOString(); // 30 days ago
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "new_users" }),
        makeContext({ signupAt: old }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept returning_users for old user", () => {
      const old = new Date(Date.now() - 30 * 86400000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "returning_users" }),
        makeContext({ signupAt: old }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept premium audience for premium user", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "premium" }),
        makeContext({ isPremium: true }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject premium audience for non-premium user", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "premium" }),
        makeContext({ isPremium: false }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject unknown audience", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ target_audience: "unknown_group" }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Rollout percentage ──

  describe("Rollout percentage", () => {
    it("should always include at 100%", () => {
      expect(isInRollout("any-user", "any-key", 100)).toBe(true);
    });

    it("should always exclude at 0%", () => {
      expect(isInRollout("any-user", "any-key", 0)).toBe(false);
    });

    it("should be stable: same user+key always gets same result", () => {
      const result1 = isInRollout("user-abc", "campaign-xyz", 50);
      const result2 = isInRollout("user-abc", "campaign-xyz", 50);
      const result3 = isInRollout("user-abc", "campaign-xyz", 50);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it("should differ for different campaign keys", () => {
      // With enough keys, at least one should differ
      const results = Array.from({ length: 20 }, (_, i) =>
        isInRollout("user-test", `campaign-${i}`, 50),
      );
      const trueCount = results.filter(Boolean).length;
      // Statistically, should have some true and some false
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(20);
    });

    it("should reject campaign when user not in rollout", () => {
      // Find a user+key combo that's excluded at 1%
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ rollout_percentage: 0 }),
        makeContext(),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Trigger event ──

  describe("Trigger event", () => {
    it("should reject if trigger_event set but current event doesn't match", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ trigger_event: "order_created" }),
        makeContext({ currentEvent: "app_open" }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject if trigger_event set but no current event", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ trigger_event: "order_created" }),
        makeContext({ currentEvent: null }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if trigger_event matches current event", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ trigger_event: "order_created" }),
        makeContext({ currentEvent: "order_created" }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept if no trigger_event set (always eligible)", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ trigger_event: null }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Screens ──

  describe("Allowed/blocked screens", () => {
    it("should reject if screen not in allowed_screens", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ allowed_screens: ["products", "orders"] }),
        makeContext({ currentScreen: "(tabs)" }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if screen in allowed_screens", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ allowed_screens: ["(tabs)", "products"] }),
        makeContext({ currentScreen: "(tabs)" }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept if allowed_screens is empty (all screens)", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ allowed_screens: [] }),
        makeContext(),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if screen in blocked_screens", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ blocked_screens: ["(tabs)"] }),
        makeContext({ currentScreen: "(tabs)" }),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Critical flow ──

  describe("Critical flow", () => {
    it("should reject if in critical flow and do_not_show_during_critical_flow=true", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ do_not_show_during_critical_flow: true }),
        makeContext({ isInCriticalFlow: true }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if not in critical flow", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ do_not_show_during_critical_flow: true }),
        makeContext({ isInCriticalFlow: false }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should accept if in critical flow but do_not_show_during_critical_flow=false", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ do_not_show_during_critical_flow: false }),
        makeContext({ isInCriticalFlow: true }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Requires internet ──

  describe("Requires internet", () => {
    it("should reject if requires_internet but offline", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ requires_internet: true }),
        makeContext({ isOnline: false }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if requires_internet and online", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ requires_internet: true }),
        makeContext({ isOnline: true }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── User state conditions ──

  describe("User state conditions", () => {
    it("should reject show_only_if_feedback_not_submitted when feedback submitted", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_feedback_not_submitted: true }),
        makeContext({ feedbackSubmitted: true }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept show_only_if_feedback_not_submitted when feedback not submitted", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_feedback_not_submitted: true }),
        makeContext({ feedbackSubmitted: false }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject show_only_if_onboarding_not_completed when onboarding completed", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_onboarding_not_completed: true }),
        makeContext({ onboardingCompleted: true }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject show_only_if_not_premium for premium user", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_not_premium: true }),
        makeContext({ isPremium: true }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject show_only_if_premium for non-premium user", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_premium: true }),
        makeContext({ isPremium: false }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept show_only_if_premium for premium user", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ show_only_if_premium: true }),
        makeContext({ isPremium: true }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Activity conditions ──

  describe("Activity conditions", () => {
    it("should reject if min_days_since_signup not met", () => {
      const recent = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_days_since_signup: 7 }),
        makeContext({ signupAt: recent }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if min_days_since_signup met", () => {
      const old = new Date(Date.now() - 30 * 86400000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_days_since_signup: 7 }),
        makeContext({ signupAt: old }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if min_sessions not met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_sessions: 20 }),
        makeContext({ sessionsCount: 10 }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if min_sessions met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_sessions: 5 }),
        makeContext({ sessionsCount: 10 }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Usage conditions ──

  describe("Usage conditions", () => {
    it("should reject if min_products_created not met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_products_created: 10 }),
        makeContext({ productsCreatedCount: 5 }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject if min_orders_created not met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_orders_created: 10 }),
        makeContext({ ordersCreatedCount: 3 }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject if min_completed_orders not met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_completed_orders: 5 }),
        makeContext({ completedOrdersCount: 2 }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject if min_shopping_lists_created not met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ min_shopping_lists_created: 5 }),
        makeContext({ shoppingListsCreatedCount: 1 }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if all usage conditions met", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({
          min_products_created: 3,
          min_orders_created: 2,
          min_completed_orders: 1,
          min_shopping_lists_created: 1,
        }),
        makeContext({
          productsCreatedCount: 5,
          ordersCreatedCount: 3,
          completedOrdersCount: 2,
          shoppingListsCreatedCount: 1,
        }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Cooldown ──

  describe("Cooldown", () => {
    it("should reject if within cooldown_days_after_view", () => {
      const yesterday = new Date(Date.now() - 12 * 3600 * 1000).toISOString(); // 12 hours ago
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ cooldown_days_after_view: 3 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ last_viewed_at: yesterday }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if cooldown_days_after_view expired", () => {
      const longAgo = new Date(Date.now() - 10 * 86400000).toISOString(); // 10 days ago
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ cooldown_days_after_view: 3 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ last_viewed_at: longAgo }),
          },
        }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if within cooldown_days_after_dismiss", () => {
      const yesterday = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ cooldown_days_after_dismiss: 7 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ last_dismissed_at: yesterday }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Impression limits ──

  describe("Impression limits", () => {
    it("should reject if max_impressions_per_user reached", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_impressions_per_user: 5 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ impressions_total: 5 }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if max_impressions_per_user not reached", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_impressions_per_user: 5 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ impressions_total: 3 }),
          },
        }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if max_impressions_per_session reached", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_impressions_per_session: 2 }),
        makeContext({
          sessionImpressions: { test_campaign: 2 },
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should reject if max_impressions_per_day reached today", () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_impressions_per_day: 3 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({
              impressions_today: 3,
              impressions_today_date: today,
            }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if max_impressions_per_day reached on a different day", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_impressions_per_day: 3 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({
              impressions_today: 3,
              impressions_today_date: "2025-01-01", // old date
            }),
          },
        }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if max_clicks_per_user reached", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({ max_clicks_per_user: 1 }),
        makeContext({
          campaignStates: {
            test_campaign: makeCampaignState({ clicks_total: 1 }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });
  });

  // ── Campaign dependency ──

  describe("Campaign dependency", () => {
    it("should reject if dependency campaign not viewed", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({
          depends_on_campaign_id: "dep-campaign-id",
          depends_on_campaign_status: "viewed",
        }),
        makeContext({
          campaignStates: {
            "dep-campaign-id": makeCampaignState({ impressions_total: 0 }),
          },
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if dependency campaign was viewed", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({
          depends_on_campaign_id: "dep-campaign-id",
          depends_on_campaign_status: "viewed",
        }),
        makeContext({
          campaignStates: {
            "dep-campaign-id": makeCampaignState({ impressions_total: 1 }),
          },
        }),
      );
      expect(result.eligible).toBe(true);
    });

    it("should reject if dependency campaign has no state", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({
          depends_on_campaign_id: "dep-campaign-id",
          depends_on_campaign_status: "viewed",
        }),
        makeContext({ campaignStates: {} }),
      );
      expect(result.eligible).toBe(false);
    });

    it("should accept if dependency completed", () => {
      const result = ExperienceRuleEngine.evaluate(
        makeCampaign({
          depends_on_campaign_id: "dep-campaign-id",
          depends_on_campaign_status: "completed",
        }),
        makeContext({
          campaignStates: {
            "dep-campaign-id": makeCampaignState({ completed: true }),
          },
        }),
      );
      expect(result.eligible).toBe(true);
    });
  });

  // ── Unknown conditions ──

  describe("Unknown conditions", () => {
    it("should log warning for unknown fields but still evaluate", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const campaign = makeCampaign();
      (campaign as any).some_future_field = "value";
      const result = ExperienceRuleEngine.evaluate(campaign, makeContext());
      // Should still be eligible (unknown fields don't block)
      expect(result.eligible).toBe(true);
      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("RuleEngine"),
        expect.stringContaining("unknown_condition_received"),
      );
      warnSpy.mockRestore();
    });
  });
});

// ── CampaignSelectorService ──

describe("Session 3: CampaignSelectorService", () => {
  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  describe("Priority tiebreaking", () => {
    it("should select highest priority campaign", async () => {
      const campaigns = [
        makeCampaign({ campaign_key: "low", priority: 1 }),
        makeCampaign({ campaign_key: "high", priority: 100 }),
        makeCampaign({ campaign_key: "mid", priority: 50 }),
      ];

      // Pre-populate cache
      await CampaignSelectorService.clearCache();
      const { CacheManager } = await import("../lib/services/cache-manager");
      await CacheManager.set("campaigns", campaigns);

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).not.toBeNull();
      expect(result!.campaign_key).toBe("high");
    });

    it("should use created_at desc as tiebreaker for equal priority", async () => {
      const campaigns = [
        makeCampaign({
          campaign_key: "older",
          priority: 10,
          created_at: "2026-01-01T00:00:00Z",
        }),
        makeCampaign({
          campaign_key: "newer",
          priority: 10,
          created_at: "2026-06-01T00:00:00Z",
        }),
      ];

      await CampaignSelectorService.clearCache();
      const { CacheManager } = await import("../lib/services/cache-manager");
      await CacheManager.set("campaigns", campaigns);

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).not.toBeNull();
      expect(result!.campaign_key).toBe("newer");
    });

    it("should use campaign_key asc as final tiebreaker", async () => {
      const campaigns = [
        makeCampaign({
          campaign_key: "zzz_campaign",
          priority: 10,
          created_at: "2026-01-01T00:00:00Z",
        }),
        makeCampaign({
          campaign_key: "aaa_campaign",
          priority: 10,
          created_at: "2026-01-01T00:00:00Z",
        }),
      ];

      await CampaignSelectorService.clearCache();
      const { CacheManager } = await import("../lib/services/cache-manager");
      await CacheManager.set("campaigns", campaigns);

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).not.toBeNull();
      expect(result!.campaign_key).toBe("aaa_campaign");
    });
  });

  describe("Filtering", () => {
    it("should return null when no campaigns in cache", async () => {
      await CampaignSelectorService.clearCache();
      mockSupabaseSelect.mockResolvedValueOnce({ data: [], error: null });

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).toBeNull();
    });

    it("should filter out disabled campaigns", async () => {
      const campaigns = [
        makeCampaign({ campaign_key: "disabled", is_enabled: false }),
        makeCampaign({ campaign_key: "enabled", is_enabled: true }),
      ];

      await CampaignSelectorService.clearCache();
      const { CacheManager } = await import("../lib/services/cache-manager");
      await CacheManager.set("campaigns", campaigns);

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).not.toBeNull();
      expect(result!.campaign_key).toBe("enabled");
    });

    it("should return exactly one campaign even with multiple eligible", async () => {
      const campaigns = [
        makeCampaign({ campaign_key: "a", priority: 5 }),
        makeCampaign({ campaign_key: "b", priority: 10 }),
        makeCampaign({ campaign_key: "c", priority: 3 }),
      ];

      await CampaignSelectorService.clearCache();
      const { CacheManager } = await import("../lib/services/cache-manager");
      await CacheManager.set("campaigns", campaigns);

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      expect(result).not.toBeNull();
      // Should be exactly one
      expect(typeof result!.campaign_key).toBe("string");
    });
  });

  describe("Resilience", () => {
    it("should not throw on any error", async () => {
      await CampaignSelectorService.clearCache();
      mockSupabaseSelect.mockRejectedValueOnce(new Error("Network error"));

      const result = await CampaignSelectorService.selectCampaign(makeContext());
      // Should return null, not throw
      expect(result).toBeNull();
    });
  });
});

// ── CriticalFlowProvider ──

describe("Session 3: CriticalFlowProvider", () => {
  it("should export CriticalFlowProvider and useCriticalFlow", async () => {
    const mod = await import("../lib/critical-flow-context");
    expect(mod.CriticalFlowProvider).toBeDefined();
    expect(mod.useCriticalFlow).toBeDefined();
  });
});

// ── Rollout stability ──

describe("Session 3: Rollout stability", () => {
  it("should produce consistent results across 1000 calls", () => {
    const results = Array.from({ length: 1000 }, () =>
      isInRollout("stable-user", "stable-key", 50),
    );
    // All should be the same
    const first = results[0];
    expect(results.every((r) => r === first)).toBe(true);
  });

  it("should distribute roughly 50% at 50% rollout across many users", () => {
    let included = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (isInRollout(`user-${i}`, "test-campaign", 50)) {
        included++;
      }
    }
    // Should be roughly 50% (allow 35-65% range for statistical variance)
    expect(included).toBeGreaterThan(350);
    expect(included).toBeLessThan(650);
  });
});
