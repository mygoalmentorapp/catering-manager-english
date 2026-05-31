/**
 * Session 5 Tests — Maintenance Gate, Global Message Migration, Session Timeout,
 * Navigation Actions, and Cooldown Bug Fix
 *
 * Tests:
 * 1. RemoteConfig SAFE_DEFAULTS include all new fields (maintenance, global_message, session_timeout)
 * 2. RemoteConfig row mapping populates new fields correctly
 * 3. CampaignActionHandler: named navigation actions (open_home, open_products, etc.)
 * 4. CampaignActionHandler: open_deep_link with custom route
 * 5. Cooldown bug fix: fractional days allow re-show after short cooldown
 * 6. Cooldown: still blocks just before expiry
 * 7. Cooldown: allows after exact expiry for sub-day cooldowns
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoisted mocks (must be declared before vi.mock factories) ──
const { mockPush, mockOpenURL } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockOpenURL: vi.fn().mockResolvedValue(true),
}));

// ── Mock app-identity ──
vi.mock("@/constants/app-identity", () => ({
  APP_KEY: "catering_manager_pro",
  APP_LANGUAGE: "he",
}));

// ── Mock oauth (required by trpc.ts) ──
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
  API_BASE_URL: "http://localhost:3000",
}));

// ── Mock tRPC (required by experience services + RemoteConfigService) ──
const { mockGetRemoteConfigQuery } = vi.hoisted(() => ({
  mockGetRemoteConfigQuery: vi.fn().mockResolvedValue(null),
}));
// Mock both relative and alias paths for trpc
vi.mock("../lib/trpc", () => ({
  trpc: {},
  vanillaTrpc: {
    experience: {
      logEvent: { mutate: vi.fn(async () => ({ success: true })) },
      upsertState: { mutate: vi.fn(async () => ({ success: true })) },
      getState: { query: vi.fn(async () => null) },
      incrementCounter: { mutate: vi.fn(async () => ({ success: true, newValue: 1 })) },
      getCampaignStates: { query: vi.fn(async () => []) },
      upsertCampaignState: { mutate: vi.fn(async () => ({ success: true })) },
    },
  },
  getVanillaTrpc: vi.fn(() => ({
    experience: {
      logEvent: { mutate: vi.fn(async () => ({ success: true })) },
    },
    config: {
      getRemoteConfig: {
        query: mockGetRemoteConfigQuery,
      },
    },
  })),
}));

// ── Mock @/lib/trpc alias (used by remote-config-service) ──
vi.mock("@/lib/trpc", () => ({
  getVanillaTrpc: vi.fn(() => ({
    config: {
      getRemoteConfig: {
        query: mockGetRemoteConfigQuery,
      },
    },
  })),
}));

// ── Mock _core/auth (required by trpc.ts) ──
vi.mock("../lib/_core/auth", () => ({
  getAccessToken: vi.fn(async () => "mock-token"),
}));

// ── Mock device-id (required by trpc.ts) ──
vi.mock("../lib/device-id", () => ({
  getDeviceId: vi.fn(async () => "mock-device-id"),
}));

// ── Mock AsyncStorage ──
const mockStore: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(mockStore))),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStore[k]);
      return Promise.resolve();
    }),
  },
}));

// ── Mock Supabase ──
const mockUpsert = vi.fn(() => Promise.resolve({ error: null }));
const mockSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
const mockEq3 = vi.fn(() => ({ single: mockSingle }));
const mockEq2 = vi.fn(() => ({ single: mockSingle, eq: mockEq3 }));
const mockEq = vi.fn(() => ({ single: mockSingle, eq: mockEq2, data: [], error: null }));
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockInsert = vi.fn(() => ({ error: null }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
  insert: mockInsert,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: (table: string) => (mockFrom as any)(table),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "test-user-123", email: "test@example.com" } },
      })),
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "test-user-123", email: "test@example.com" } } },
      })),
    },
  },
}));

// ── Mock expo-router ──
vi.mock("expo-router", () => ({
  router: { push: mockPush },
  useSegments: vi.fn(() => []),
}));

// ── Mock expo-constants ──
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { version: "1.2.0" },
  },
}));

// ── Mock expo-secure-store (required by _core/auth) ──
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

// ── Mock react-native ──
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (obj: any) => obj.android ?? obj.default ?? {} },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  StyleSheet: {
    create: (styles: any) => styles,
    absoluteFillObject: {},
  },
  Animated: {
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    View: "Animated.View",
    timing: vi.fn(() => ({ start: vi.fn() })),
    parallel: vi.fn(() => ({ start: vi.fn() })),
  },
  Modal: "Modal",
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  Linking: {
    openURL: mockOpenURL,
    getInitialURL: vi.fn().mockResolvedValue(null),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    currentState: "active",
  },
}));

// ── Mock MaterialIcons ──
vi.mock("@expo/vector-icons/MaterialIcons", () => ({
  default: "MaterialIcons",
}));

// ── Mock design-system ──
vi.mock("../lib/design-system", () => ({
  DS_COLORS: {
    accent: "#007AFF",
    accentLight: "#E6F4FE",
    card: "#FFFFFF",
    background: "#F5F5F5",
    textPrimary: "#1A1A1A",
    textSecondary: "#666666",
    white: "#FFFFFF",
  },
  DS_FONT: { titleLarge: 22, body: 16, bodySmall: 14 },
  DS_WEIGHT: { bold: "700", semibold: "600", medium: "500", regular: "400" },
  DS_SPACING: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  DS_RADIUS: { md: 12, xl: 24 },
  DS_SHADOW: { card: {} },
}));

// ── Import after mocks ──
import { SAFE_DEFAULTS, RemoteConfigService } from "../lib/services/remote-config-service";
import { CampaignActionHandler } from "../lib/services/campaign-action-handler";
import { ExperienceEventService, EVENT_NAMES } from "../lib/services/experience-event-service";
import { UserExperienceStateService } from "../lib/services/user-experience-state-service";
import {
  ExperienceRuleEngine,
  type RemoteCampaign,
  type RuleContext,
  type CampaignState,
} from "../lib/services/experience-rule-engine";

// ── tRPC Mock Factories ──
function createMockEventTrpc() {
  return {
    logEvent: {
      mutate: vi.fn(async () => ({ success: true })),
    },
  };
}

function createMockStateTrpc() {
  return {
    upsertState: { mutate: vi.fn(async () => ({ success: true })) },
    getState: { query: vi.fn(async () => null) },
    incrementCounter: { mutate: vi.fn(async () => ({ success: true, newValue: 1 })) },
    getCampaignStates: { query: vi.fn(async () => []) },
    upsertCampaignState: { mutate: vi.fn(async () => ({ success: true })) },
  };
}

let mockEventTrpc: ReturnType<typeof createMockEventTrpc>;
let mockStateTrpc: ReturnType<typeof createMockStateTrpc>;

// ── Helpers ──

function clearStore() {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
}

function injectTrpcMocks() {
  mockEventTrpc = createMockEventTrpc();
  mockStateTrpc = createMockStateTrpc();
  ExperienceEventService.setTrpcClient(mockEventTrpc);
  UserExperienceStateService.setTrpcClient(mockStateTrpc);
}

function makeActionContext(overrides: Record<string, any> = {}) {
  return {
    campaignKey: "test_campaign",
    userId: "user-123",
    screenKey: "(tabs)",
    ...overrides,
  };
}

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
    app_key: "catering_manager_pro",
    app_language: "he",
    is_enabled: true,
    is_archived: false,
    priority: 10,
    rollout_percentage: 100,
    environment: "prod",
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

// ══════════════════════════════════════════════════════════════
// 1. RemoteConfig SAFE_DEFAULTS — New Fields
// ══════════════════════════════════════════════════════════════

describe("RemoteConfig SAFE_DEFAULTS — new fields", () => {
  it("maintenance_enabled defaults to false", () => {
    expect(SAFE_DEFAULTS.maintenance_enabled).toBe(false);
  });

  it("maintenance_title defaults to empty string", () => {
    expect(SAFE_DEFAULTS.maintenance_title).toBe("");
  });

  it("maintenance_message defaults to empty string", () => {
    expect(SAFE_DEFAULTS.maintenance_message).toBe("");
  });

  it("maintenance_action_text defaults to empty string", () => {
    expect(SAFE_DEFAULTS.maintenance_action_text).toBe("");
  });

  it("global_message_title defaults to empty string", () => {
    expect(SAFE_DEFAULTS.global_message_title).toBe("");
  });

  it("global_message_text defaults to empty string", () => {
    expect(SAFE_DEFAULTS.global_message_text).toBe("");
  });

  it("global_message_type defaults to 'info'", () => {
    expect(SAFE_DEFAULTS.global_message_type).toBe("info");
  });

  it("global_message_action defaults to empty string", () => {
    expect(SAFE_DEFAULTS.global_message_action).toBe("");
  });

  it("global_message_action_text defaults to empty string", () => {
    expect(SAFE_DEFAULTS.global_message_action_text).toBe("");
  });

  it("global_message_dismissible defaults to true", () => {
    expect(SAFE_DEFAULTS.global_message_dismissible).toBe(true);
  });

  it("session_timeout_minutes defaults to 30", () => {
    expect(SAFE_DEFAULTS.session_timeout_minutes).toBe(30);
  });

  it("SAFE_DEFAULTS is frozen (immutable)", () => {
    expect(Object.isFrozen(SAFE_DEFAULTS)).toBe(true);
  });

  it("maintenance gate is safe: maintenance_enabled=false means app is never blocked by default", () => {
    expect(SAFE_DEFAULTS.maintenance_enabled).toBe(false);
    expect(SAFE_DEFAULTS.force_update_enabled).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. RemoteConfig Row Mapping — New Fields
// ══════════════════════════════════════════════════════════════

describe("RemoteConfig row mapping — new fields", () => {
  beforeEach(() => {
    clearStore();
    vi.clearAllMocks();
  });

  it("maps maintenance fields from tRPC response", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: 1,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: false,
      maintenance_enabled: true,
      maintenance_title: "תחזוקה מתוכננת",
      maintenance_message: "נחזור בקרוב",
      maintenance_action_text: "נסה שוב",
    });

    const config = await RemoteConfigService.getConfig();
    expect(config.maintenance_enabled).toBe(true);
    expect(config.maintenance_title).toBe("תחזוקה מתוכננת");
    expect(config.maintenance_message).toBe("נחזור בקרוב");
    expect(config.maintenance_action_text).toBe("נסה שוב");
  });

  it("maps global_message fields from tRPC response", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: 1,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: true,
      external_urls_enabled: false,
      global_message_title: "הודעה חשובה",
      global_message_text: "שימו לב לעדכון חדש",
      global_message_type: "warning",
      global_message_action: "open_settings",
      global_message_action_text: "פתח הגדרות",
      global_message_dismissible: false,
    });

    const config = await RemoteConfigService.getConfig();
    expect(config.global_message_enabled).toBe(true);
    expect(config.global_message_title).toBe("הודעה חשובה");
    expect(config.global_message_text).toBe("שימו לב לעדכון חדש");
    expect(config.global_message_type).toBe("warning");
    expect(config.global_message_action).toBe("open_settings");
    expect(config.global_message_action_text).toBe("פתח הגדרות");
    expect(config.global_message_dismissible).toBe(false);
  });

  it("maps session_timeout_minutes from tRPC response", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: 1,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: false,
      session_timeout_minutes: 15,
    });

    const config = await RemoteConfigService.getConfig();
    expect(config.session_timeout_minutes).toBe(15);
  });

  it("defaults missing maintenance fields to safe values", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({ schema_version: 1 });

    const config = await RemoteConfigService.getConfig();
    expect(config.maintenance_enabled).toBe(false);
    expect(config.maintenance_title).toBe("");
    expect(config.maintenance_message).toBe("");
    expect(config.maintenance_action_text).toBe("");
  });

  it("defaults missing global_message fields to safe values", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({ schema_version: 1 });

    const config = await RemoteConfigService.getConfig();
    expect(config.global_message_title).toBe("");
    expect(config.global_message_text).toBe("");
    expect(config.global_message_type).toBe("info");
    expect(config.global_message_action).toBe("");
    expect(config.global_message_action_text).toBe("");
    expect(config.global_message_dismissible).toBe(true);
  });

  it("defaults missing session_timeout_minutes to 30", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({ schema_version: 1 });

    const config = await RemoteConfigService.getConfig();
    expect(config.session_timeout_minutes).toBe(30);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. CampaignActionHandler — Named Navigation Actions
// ══════════════════════════════════════════════════════════════

describe("CampaignActionHandler — named navigation actions", () => {
  let closeFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeFn = vi.fn();
    mockPush.mockClear();
    mockOpenURL.mockClear();
    vi.clearAllMocks();
    injectTrpcMocks();
  });

  describe("open_home", () => {
    it("should navigate to /(tabs) and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_home",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/(tabs)");
    });

    it("should log campaign_clicked event", async () => {
      const logSpy = vi.spyOn(ExperienceEventService, "logEvent").mockResolvedValue();

      await CampaignActionHandler.execute(
        "open_home",
        makeActionContext(),
        closeFn,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
          campaign_key: "test_campaign",
          metadata: expect.objectContaining({ action: "open_home" }),
        })
      );

      logSpy.mockRestore();
    });

    it("should close popup before navigating", async () => {
      const callOrder: string[] = [];
      closeFn.mockImplementation(() => callOrder.push("close"));
      mockPush.mockImplementation(() => callOrder.push("navigate"));

      await CampaignActionHandler.execute(
        "open_home",
        makeActionContext(),
        closeFn,
      );

      expect(callOrder[0]).toBe("close");
      expect(callOrder[1]).toBe("navigate");
    });
  });

  describe("open_products", () => {
    it("should navigate to /products and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_products",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/products");
    });
  });

  describe("open_orders", () => {
    it("should navigate to /orders and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_orders",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/orders");
    });
  });

  describe("open_shopping_lists", () => {
    it("should navigate to /shopping-lists and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_shopping_lists",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/shopping-lists");
    });
  });

  describe("open_settings", () => {
    it("should navigate to /about and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_settings",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/about");
    });
  });

  describe("open_deep_link", () => {
    it("should navigate to custom route and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_deep_link",
        makeActionContext({ actionRoute: "/custom-screen" }),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/custom-screen");
    });

    it("should return false if no actionRoute provided", async () => {
      const result = await CampaignActionHandler.execute(
        "open_deep_link",
        makeActionContext({ actionRoute: undefined }),
        closeFn,
      );

      expect(result).toBe(false);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("open_external_url", () => {
    it("should return false if no actionUrl provided", async () => {
      const result = await CampaignActionHandler.execute(
        "open_external_url",
        makeActionContext({ actionUrl: undefined }),
        closeFn,
      );

      expect(result).toBe(false);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("all named navigation actions update campaign state", () => {
    const actions = ["open_home", "open_products", "open_orders", "open_shopping_lists", "open_settings"];

    for (const action of actions) {
      it(`${action} should update clicks in campaign state`, async () => {
        await CampaignActionHandler.execute(
          action,
          makeActionContext(),
          closeFn,
        );

        await new Promise((r) => setTimeout(r, 50));

        expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            campaign_key: "test_campaign",
            updates: expect.objectContaining({
              _increment_clicks: true,
            }),
          })
        );
      });
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Cooldown Bug Fix — Fractional Days
// ══════════════════════════════════════════════════════════════

describe("Cooldown bug fix — fractional days precision", () => {
  it("should REJECT when dismissed 5 minutes ago with cooldown_days_after_dismiss=1", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 1 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: fiveMinutesAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("cooldown_after_dismiss");
  });

  it("should ACCEPT when dismissed 25 hours ago with cooldown_days_after_dismiss=1", () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 1 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: twentyFiveHoursAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("should REJECT when dismissed 23 hours ago with cooldown_days_after_dismiss=1", () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 3600 * 1000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 1 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: twentyThreeHoursAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it("BUG REGRESSION: should ACCEPT when dismissed 10 minutes ago with cooldown_days_after_dismiss=0.003 (~4.3 min)", () => {
    // This was the original bug: a sub-day cooldown (e.g., 5 minutes = ~0.003 days)
    // would never expire because Math.floor(0.006) = 0, and 0 < 0.003 was false.
    // After fix: 10 minutes = 0.00694 days, which is > 0.003 days → should be eligible.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 0.003 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: tenMinutesAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("BUG REGRESSION: should REJECT when dismissed 2 minutes ago with cooldown_days_after_dismiss=0.003 (~4.3 min)", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 0.003 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: twoMinutesAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it("should ACCEPT when viewed 4 days ago with cooldown_days_after_view=3", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_view: 3 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_viewed_at: fourDaysAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("should REJECT when viewed 2.5 days ago with cooldown_days_after_view=3", () => {
    const twoAndHalfDaysAgo = new Date(Date.now() - 2.5 * 86400000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_view: 3 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_viewed_at: twoAndHalfDaysAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it("should handle null last_dismissed_at (no cooldown applies)", () => {
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 7 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: null }),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("should handle no campaign state at all (no cooldown applies)", () => {
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 7 }),
      makeContext({
        campaignStates: {},
      }),
    );
    expect(result.eligible).toBe(true);
  });

  it("should ACCEPT when dismissed exactly 7 days ago with cooldown_days_after_dismiss=7", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const result = ExperienceRuleEngine.evaluate(
      makeCampaign({ cooldown_days_after_dismiss: 7 }),
      makeContext({
        campaignStates: {
          test_campaign: makeCampaignState({ last_dismissed_at: sevenDaysAgo }),
        },
      }),
    );
    expect(result.eligible).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Session Timeout — SAFE_DEFAULTS Validation
// ══════════════════════════════════════════════════════════════

describe("Session timeout configuration", () => {
  it("SAFE_DEFAULTS.session_timeout_minutes is 30 (standard session timeout)", () => {
    expect(SAFE_DEFAULTS.session_timeout_minutes).toBe(30);
  });

  it("session_timeout_minutes is a number type in SAFE_DEFAULTS", () => {
    expect(typeof SAFE_DEFAULTS.session_timeout_minutes).toBe("number");
  });
});
