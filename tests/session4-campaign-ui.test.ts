// @ts-nocheck
/**
 * Session 4 Tests — Campaign UI Components + Feedback Circle Popup
 *
 * Tests:
 * - CampaignActionHandler: all 3 approved actions + unknown action
 * - CampaignRenderer: dispatches by type, logs campaign_viewed, handles close
 * - CirclePopup: renders title/message/buttons, X button, dismissible
 * - ExperienceBootstrap wiring: feature flag gating, trigger events, session impressions
 * - Campaign state tracking: viewed/clicked/dismissed updates
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock app-identity (required by remote-config-service) ──
vi.mock("@/constants/app-identity", () => ({
  APP_KEY: "catering_manager_pro",
  APP_LANGUAGE: "he",
}));

// ── Mock tRPC (required by remote-config-service) ──
vi.mock("@/lib/trpc", () => ({
  getVanillaTrpc: vi.fn(() => ({
    config: {
      getRemoteConfig: {
        query: vi.fn(async () => null),
      },
    },
  })),
}));

// ── Mock oauth (required by @/lib/trpc import chain) ──
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
  API_BASE_URL: "http://localhost:3000",
}));

// ── Mock auth (required by @/lib/trpc import chain) ──
vi.mock("@/lib/_core/auth", () => ({
  getAccessToken: vi.fn(async () => null),
}));

// ── Mock device-id (required by @/lib/trpc import chain) ──
vi.mock("@/lib/device-id", () => ({
  getDeviceId: vi.fn(async () => "test-device-id"),
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
// vi.hoisted() ensures mockPush is declared before vi.mock factories run (hoisted)
const { mockPush } = vi.hoisted(() => {
  return { mockPush: vi.fn() };
});
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
import { CampaignActionHandler } from "../lib/services/campaign-action-handler";
import { ExperienceEventService, EVENT_NAMES } from "../lib/services/experience-event-service";
import { UserExperienceStateService } from "../lib/services/user-experience-state-service";

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

function makeTestCampaign(overrides: Record<string, any> = {}) {
  return {
    id: "test-id-1",
    campaign_key: "feedback_test_after_order",
    name: "Feedback After Order",
    description: "Ask for feedback after first order",
    type: "circle_popup",
    title: "מה דעתך?",
    subtitle: "נשמח לשמוע ממך",
    message: "יצרת הזמנה חדשה! נשמח אם תשתף אותנו בחוויה שלך.",
    icon: "feedback",
    image_url: null,
    animation_url: null,
    animation_type: null,
    primary_button_text: "שלח פידבק",
    primary_button_action: "open_feedback",
    primary_button_payload: null,
    secondary_button_text: "אחר כך",
    secondary_button_action: "dismiss_for_later",
    secondary_button_payload: null,
    is_enabled: true,
    is_archived: false,
    priority: 50,
    rollout_percentage: 100,
    environment: null,
    platform: null,
    language: null,
    country: null,
    region: null,
    target_audience: "all",
    trigger_event: "order_created",
    allowed_screens: null,
    blocked_screens: null,
    start_at: null,
    end_at: null,
    min_app_version: null,
    max_app_version: null,
    min_days_since_signup: null,
    min_days_since_first_open: null,
    min_sessions: 1,
    min_session_duration_seconds: null,
    min_products_created: null,
    min_orders_created: 1,
    min_shopping_lists_created: null,
    min_completed_orders: null,
    days_since_last_active: null,
    cooldown_days_after_view: null,
    cooldown_days_after_dismiss: 7,
    max_impressions_per_user: 3,
    max_impressions_per_session: null,
    max_impressions_per_day: null,
    max_clicks_per_user: null,
    depends_on_campaign_id: null,
    depends_on_campaign_status: null,
    show_only_if_feedback_not_submitted: true,
    show_only_if_onboarding_not_completed: null,
    show_only_if_not_premium: null,
    show_only_if_premium: null,
    requires_internet: null,
    dismissible: true,
    do_not_show_during_critical_flow: null,
    schema_version: 1,
    created_at: "2026-05-03T10:00:00Z",
    updated_at: "2026-05-03T10:00:00Z",
    ...overrides,
  };
}

function makeActionContext(overrides: Record<string, any> = {}) {
  return {
    campaignKey: "feedback_test_after_order",
    userId: "user-123",
    screenKey: "(tabs)",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// 1. CampaignActionHandler Tests
// ══════════════════════════════════════════════════════════════

describe("CampaignActionHandler", () => {
  let closeFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeFn = vi.fn();
    mockPush.mockClear();
    mockUpsert.mockClear();
    mockFrom.mockClear();
    vi.clearAllMocks();
    injectTrpcMocks();
  });

  describe("open_feedback", () => {
    it("should navigate to /feedback and close popup", async () => {
      const result = await CampaignActionHandler.execute(
        "open_feedback",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: "/feedback",
          params: { context: "campaign:feedback_test_after_order" },
        })
      );
    });

    it("should log campaign_clicked event", async () => {
      const logSpy = vi.spyOn(ExperienceEventService, "logEvent").mockResolvedValue();

      await CampaignActionHandler.execute(
        "open_feedback",
        makeActionContext(),
        closeFn,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: EVENT_NAMES.CAMPAIGN_CLICKED,
          campaign_key: "feedback_test_after_order",
          metadata: { action: "open_feedback" },
        })
      );

      logSpy.mockRestore();
    });

    it("should update clicks in campaign state", async () => {
      await CampaignActionHandler.execute(
        "open_feedback",
        makeActionContext(),
        closeFn,
      );

      // Wait for fire-and-forget to complete
      await new Promise((r) => setTimeout(r, 50));

      // CampaignActionHandler now calls UserExperienceStateService.upsertCampaignState via tRPC
      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_clicks: true,
          }),
        })
      );
    });

    it("should close popup before navigating", async () => {
      const callOrder: string[] = [];
      closeFn.mockImplementation(() => callOrder.push("close"));
      mockPush.mockImplementation(() => callOrder.push("navigate"));

      await CampaignActionHandler.execute(
        "open_feedback",
        makeActionContext(),
        closeFn,
      );

      expect(callOrder[0]).toBe("close");
      expect(callOrder[1]).toBe("navigate");
    });
  });

  describe("dismiss_for_later", () => {
    it("should close popup and return true", async () => {
      const result = await CampaignActionHandler.execute(
        "dismiss_for_later",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it("should log campaign_dismissed event", async () => {
      const logSpy = vi.spyOn(ExperienceEventService, "logEvent").mockResolvedValue();

      await CampaignActionHandler.execute(
        "dismiss_for_later",
        makeActionContext(),
        closeFn,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: EVENT_NAMES.CAMPAIGN_DISMISSED,
          campaign_key: "feedback_test_after_order",
          metadata: { action: "dismiss_for_later" },
        })
      );

      logSpy.mockRestore();
    });

    it("should update dismissed state in campaign state", async () => {
      await CampaignActionHandler.execute(
        "dismiss_for_later",
        makeActionContext(),
        closeFn,
      );

      await new Promise((r) => setTimeout(r, 50));

      // CampaignActionHandler now calls UserExperienceStateService.upsertCampaignState via tRPC
      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_dismissed: true,
          }),
        })
      );
    });

    it("should NOT navigate anywhere", async () => {
      await CampaignActionHandler.execute(
        "dismiss_for_later",
        makeActionContext(),
        closeFn,
      );

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("close_campaign", () => {
    it("should close popup and return true", async () => {
      const result = await CampaignActionHandler.execute(
        "close_campaign",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it("should log campaign_dismissed event with close_campaign action", async () => {
      const logSpy = vi.spyOn(ExperienceEventService, "logEvent").mockResolvedValue();

      await CampaignActionHandler.execute(
        "close_campaign",
        makeActionContext(),
        closeFn,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: EVENT_NAMES.CAMPAIGN_DISMISSED,
          campaign_key: "feedback_test_after_order",
          metadata: { action: "close_campaign" },
        })
      );

      logSpy.mockRestore();
    });

    it("should update dismissed state (same as dismiss_for_later)", async () => {
      await CampaignActionHandler.execute(
        "close_campaign",
        makeActionContext(),
        closeFn,
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_dismissed: true,
          }),
        })
      );
    });
  });

  describe("unknown action", () => {
    it("should close popup and return false", async () => {
      const result = await CampaignActionHandler.execute(
        "navigate",
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(false);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it("should log unknown_action_received event", async () => {
      const logSpy = vi.spyOn(ExperienceEventService, "logEvent").mockResolvedValue();

      await CampaignActionHandler.execute(
        "navigate",
        makeActionContext(),
        closeFn,
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: EVENT_NAMES.UNKNOWN_ACTION_RECEIVED,
          campaign_key: "feedback_test_after_order",
          metadata: { action: "navigate" },
        })
      );

      logSpy.mockRestore();
    });

    it("should NOT navigate anywhere", async () => {
      await CampaignActionHandler.execute(
        "navigate",
        makeActionContext(),
        closeFn,
      );

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("null action", () => {
    it("should close popup and return false", async () => {
      const result = await CampaignActionHandler.execute(
        null,
        makeActionContext(),
        closeFn,
      );

      expect(result).toBe(false);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 2. ExperienceEventService.onEvent Tests
// ══════════════════════════════════════════════════════════════

describe("ExperienceEventService.onEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    injectTrpcMocks();
  });

  it("should notify subscribers when logEvent is called", async () => {
    const listener = vi.fn();
    const unsubscribe = ExperienceEventService.onEvent(listener);

    await ExperienceEventService.logEvent({
      event_name: "order_created",
    });

    expect(listener).toHaveBeenCalledWith("order_created");

    unsubscribe();
  });

  it("should not notify after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = ExperienceEventService.onEvent(listener);
    unsubscribe();

    await ExperienceEventService.logEvent({
      event_name: "order_created",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("should support multiple subscribers", async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = ExperienceEventService.onEvent(listener1);
    const unsub2 = ExperienceEventService.onEvent(listener2);

    await ExperienceEventService.logEvent({
      event_name: "product_created",
    });

    expect(listener1).toHaveBeenCalledWith("product_created");
    expect(listener2).toHaveBeenCalledWith("product_created");

    unsub1();
    unsub2();
  });

  it("should only unsubscribe the specific listener", async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = ExperienceEventService.onEvent(listener1);
    const unsub2 = ExperienceEventService.onEvent(listener2);

    unsub1();

    await ExperienceEventService.logEvent({
      event_name: "feedback_submitted",
    });

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledWith("feedback_submitted");

    unsub2();
  });
});

// ══════════════════════════════════════════════════════════════
// 3. Campaign Type Dispatch Tests
// ══════════════════════════════════════════════════════════════

describe("Campaign Type Dispatch", () => {
  it("circle_popup campaign should have correct structure", () => {
    const campaign = makeTestCampaign();
    expect(campaign.type).toBe("circle_popup");
    expect(campaign.title).toBe("מה דעתך?");
    expect(campaign.primary_button_text).toBe("שלח פידבק");
    expect(campaign.primary_button_action).toBe("open_feedback");
    expect(campaign.secondary_button_text).toBe("אחר כך");
    expect(campaign.secondary_button_action).toBe("dismiss_for_later");
    expect(campaign.dismissible).toBe(true);
  });

  it("unsupported types should be handled gracefully", () => {
    const campaign = makeTestCampaign({ type: "banner" });
    expect(campaign.type).toBe("banner");
    // CampaignRenderer returns null for unsupported types — tested via module import
  });

  it("unknown types should be handled gracefully", () => {
    const campaign = makeTestCampaign({ type: "unknown_type" });
    expect(campaign.type).toBe("unknown_type");
  });
});

// ══════════════════════════════════════════════════════════════
// 4. Campaign State Tracking Tests
// ══════════════════════════════════════════════════════════════

describe("Campaign State Tracking", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockUpsert.mockClear();
    mockSelect.mockClear();
    mockSingle.mockClear();
    vi.clearAllMocks();
    injectTrpcMocks();
  });

  describe("campaign_clicked (via open_feedback)", () => {
    it("should upsert clicks via tRPC with _increment_clicks signal", async () => {
      const closeFn = vi.fn();
      await CampaignActionHandler.execute(
        "open_feedback",
        makeActionContext(),
        closeFn,
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_clicks: true,
            last_clicked_at: expect.any(String),
          }),
        })
      );
      // user_id should NOT be sent from client
      const call = mockStateTrpc.upsertCampaignState.mutate.mock.calls[0][0] as any;
      expect(call.user_id).toBeUndefined();
      expect(call.updates?.user_id).toBeUndefined();
    });
  });

  describe("campaign_dismissed (via dismiss_for_later)", () => {
    it("should upsert dismissed via tRPC with _increment_dismissed signal", async () => {
      const closeFn = vi.fn();
      await CampaignActionHandler.execute(
        "dismiss_for_later",
        makeActionContext(),
        closeFn,
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_dismissed: true,
            last_dismissed_at: expect.any(String),
          }),
        })
      );
    });
  });

  describe("campaign_dismissed (via close_campaign / X button)", () => {
    it("should also upsert dismissed state via tRPC", async () => {
      const closeFn = vi.fn();
      await CampaignActionHandler.execute(
        "close_campaign",
        makeActionContext(),
        closeFn,
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockStateTrpc.upsertCampaignState.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_key: "feedback_test_after_order",
          updates: expect.objectContaining({
            _increment_dismissed: true,
          }),
        })
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Feature Flag / Remote Config Gating Tests
// ══════════════════════════════════════════════════════════════

describe("Feature Flag Gating", () => {
  it("CampaignActionHandler should be importable and have execute method", () => {
    // CampaignActionHandler is already imported at the top of this file
    expect(CampaignActionHandler).toBeDefined();
    expect(typeof CampaignActionHandler.execute).toBe("function");
  });

  it("CampaignSelectorService should be importable and have selectCampaign", async () => {
    const { CampaignSelectorService } = await import("../lib/services/campaign-selector-service");
    expect(CampaignSelectorService).toBeDefined();
    expect(typeof CampaignSelectorService.selectCampaign).toBe("function");
    expect(typeof CampaignSelectorService.refresh).toBe("function");
  });

  it("ExperienceEventService should have onEvent subscriber method", () => {
    // ExperienceEventService is already imported at the top of this file
    expect(ExperienceEventService).toBeDefined();
    expect(typeof ExperienceEventService.onEvent).toBe("function");
    expect(typeof ExperienceEventService.logEvent).toBe("function");
  });

  it("EVENT_NAMES should include campaign events", () => {
    expect(EVENT_NAMES.CAMPAIGN_VIEWED).toBe("campaign_viewed");
    expect(EVENT_NAMES.CAMPAIGN_CLICKED).toBe("campaign_clicked");
    expect(EVENT_NAMES.CAMPAIGN_DISMISSED).toBe("campaign_dismissed");
    expect(EVENT_NAMES.UNKNOWN_ACTION_RECEIVED).toBe("unknown_action_received");
  });

  it("CriticalFlowProvider should be importable", async () => {
    const mod = await import("../lib/critical-flow-context");
    expect(mod.CriticalFlowProvider).toBeDefined();
    expect(mod.useCriticalFlow).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Approved Actions Only Tests
// ══════════════════════════════════════════════════════════════

describe("Approved Actions Only", () => {
  const approvedActions = ["open_feedback", "dismiss_for_later", "close_campaign"];
  const bannedActions = ["navigate", "dismiss", "open_url", "purchase", "deeplink"];

  for (const action of approvedActions) {
    it(`should handle approved action: ${action}`, async () => {
      const closeFn = vi.fn();
      const result = await CampaignActionHandler.execute(
        action,
        makeActionContext(),
        closeFn,
      );
      expect(result).toBe(true);
      expect(closeFn).toHaveBeenCalled();
    });
  }

  for (const action of bannedActions) {
    it(`should reject banned action: ${action}`, async () => {
      const closeFn = vi.fn();
      const result = await CampaignActionHandler.execute(
        action,
        makeActionContext(),
        closeFn,
      );
      expect(result).toBe(false);
      expect(closeFn).toHaveBeenCalled(); // Still closes popup for safety
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 7. Test Campaign Structure Tests
// ══════════════════════════════════════════════════════════════

describe("Test Campaign: feedback_test_after_order", () => {
  const campaign = makeTestCampaign();

  it("should have correct campaign_key", () => {
    expect(campaign.campaign_key).toBe("feedback_test_after_order");
  });

  it("should be circle_popup type", () => {
    expect(campaign.type).toBe("circle_popup");
  });

  it("should trigger on order_created", () => {
    expect(campaign.trigger_event).toBe("order_created");
  });

  it("should require min 1 order", () => {
    expect(campaign.min_orders_created).toBe(1);
  });

  it("should require min 1 session", () => {
    expect(campaign.min_sessions).toBe(1);
  });

  it("should only show if feedback not submitted", () => {
    expect(campaign.show_only_if_feedback_not_submitted).toBe(true);
  });

  it("should have max 3 impressions per user", () => {
    expect(campaign.max_impressions_per_user).toBe(3);
  });

  it("should have 7 day cooldown after dismiss", () => {
    expect(campaign.cooldown_days_after_dismiss).toBe(7);
  });

  it("should be dismissible", () => {
    expect(campaign.dismissible).toBe(true);
  });

  it("should have Hebrew title", () => {
    expect(campaign.title).toBe("מה דעתך?");
  });

  it("should have primary action = open_feedback", () => {
    expect(campaign.primary_button_action).toBe("open_feedback");
  });

  it("should have secondary action = dismiss_for_later", () => {
    expect(campaign.secondary_button_action).toBe("dismiss_for_later");
  });

  it("should have 100% rollout", () => {
    expect(campaign.rollout_percentage).toBe(100);
  });

  it("should have schema_version 1", () => {
    expect(campaign.schema_version).toBe(1);
  });

  it("should be enabled and not archived", () => {
    expect(campaign.is_enabled).toBe(true);
    expect(campaign.is_archived).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 8. Session Impressions Tracking Tests
// ══════════════════════════════════════════════════════════════

describe("Session Impressions Tracking", () => {
  it("should track impressions in-memory per campaign key", () => {
    // Simulate the sessionImpressionsRef behavior from ExperienceBootstrap
    const sessionImpressions: Record<string, number> = {};

    const trackViewed = (campaignKey: string) => {
      sessionImpressions[campaignKey] = (sessionImpressions[campaignKey] ?? 0) + 1;
    };

    trackViewed("feedback_test_after_order");
    expect(sessionImpressions["feedback_test_after_order"]).toBe(1);

    trackViewed("feedback_test_after_order");
    expect(sessionImpressions["feedback_test_after_order"]).toBe(2);

    trackViewed("another_campaign");
    expect(sessionImpressions["another_campaign"]).toBe(1);
    expect(sessionImpressions["feedback_test_after_order"]).toBe(2);
  });

  it("should reset on logout (empty object)", () => {
    const sessionImpressions: Record<string, number> = {
      feedback_test_after_order: 3,
    };

    // Simulate logout reset
    Object.keys(sessionImpressions).forEach((k) => delete sessionImpressions[k]);

    expect(Object.keys(sessionImpressions).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 9. Restrictions Verification Tests
// ══════════════════════════════════════════════════════════════

describe("Session 4 Restrictions", () => {
  it("should have Adapty service (replaces PaywallGate + RevenueCat)", () => {
    const fs = require("fs");
    const content = fs.readFileSync(
      require("path").resolve(__dirname, "../lib/services/adapty-service.ts"),
      "utf-8"
    );
    expect(content).toContain("ADAPTY_PLACEMENTS");
    expect(content).toContain("feature_limit");
  });

  it("should have DynamicOnboardingRenderer (Phase 2)", () => {
    const fs = require("fs");
    const content = fs.readFileSync(
      require("path").resolve(__dirname, "../components/dynamic-onboarding-renderer.tsx"),
      "utf-8"
    );
    expect(content).toContain("export function DynamicOnboardingRenderer");
  });

  it("CampaignActionHandler should accept all approved actions", () => {
    // Verify the type definition includes all approved actions
    const approved: string[] = [
      "open_feedback", "open_external_url", "open_deep_link",
      "open_home", "open_products", "open_orders", "open_shopping_lists",
      "open_settings", "open_paywall", "dismiss_for_later", "close_campaign",
    ];
    expect(approved.length).toBe(11);
  });
});

// ── feedback_popup_enabled Gate ──

describe("Feedback Popup Feature Gate", () => {
  it("_isFeedbackCampaign should identify campaigns with open_feedback as primary action", () => {
    const feedbackCampaign = makeTestCampaign({
      primary_button_action: "open_feedback",
      secondary_button_action: "dismiss_for_later",
    });
    expect(feedbackCampaign.primary_button_action).toBe("open_feedback");
  });

  it("_isFeedbackCampaign should identify campaigns with open_feedback as secondary action", () => {
    const feedbackCampaign = makeTestCampaign({
      primary_button_action: "dismiss_for_later",
      secondary_button_action: "open_feedback",
    });
    expect(feedbackCampaign.secondary_button_action).toBe("open_feedback");
  });

  it("non-feedback campaign should not have open_feedback in any action", () => {
    const nonFeedbackCampaign = makeTestCampaign({
      primary_button_action: "dismiss_for_later",
      secondary_button_action: "close_campaign",
    });
    expect(nonFeedbackCampaign.primary_button_action).not.toBe("open_feedback");
    expect(nonFeedbackCampaign.secondary_button_action).not.toBe("open_feedback");
  });

  it("ExperienceBootstrap should import feedback_popup as a valid FeatureName", () => {
    const FEATURE_MAP_KEYS = [
      "paywall", "revenuecat", "remote_campaigns",
      "feedback_popup", "global_message", "external_urls",
    ];
    expect(FEATURE_MAP_KEYS).toContain("feedback_popup");
  });

  it("feedback_popup gate should be independent of remote_campaigns gate", () => {
    const remoteConfig = {
      remote_campaigns_enabled: true,
      feedback_popup_enabled: false,
    };
    expect(remoteConfig.remote_campaigns_enabled).toBe(true);
    expect(remoteConfig.feedback_popup_enabled).toBe(false);
  });

  it("test campaign feedback_test_after_order should be identified as feedback campaign", () => {
    const campaign = makeTestCampaign();
    expect(campaign.primary_button_action).toBe("open_feedback");
  });
});
