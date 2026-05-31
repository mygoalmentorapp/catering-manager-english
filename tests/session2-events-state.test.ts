/**
 * Session 2 Tests: Events + User State (tRPC architecture)
 *
 * Tests cover:
 * 1. ExperienceEventService — event logging via tRPC, metadata sanitization, session_id
 * 2. SessionTracker — session lifecycle, timeout, AppState transitions
 * 3. UserExperienceStateService — state init, counter increments, flag updates via tRPC
 * 4. Privacy — no sensitive data in metadata
 * 5. Resilience — failures don't crash the app
 * 6. No UI changes — services are invisible
 *
 * ARCHITECTURE NOTE:
 * All DB operations go through tRPC server endpoints (experience.*).
 * Tests inject mock tRPC clients via setTrpcClient() instead of mocking Supabase directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock app-identity (required by remote-config-service / user-experience-state-service) ──
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

// ── Mock AsyncStorage ──
const mockStorage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { mockStorage.delete(key); }),
    getAllKeys: vi.fn(async () => Array.from(mockStorage.keys())),
    multiRemove: vi.fn(async (keys: string[]) => { keys.forEach(k => mockStorage.delete(k)); }),
  },
}));

// ── Mock Supabase (still needed for other imports, but NOT used by experience services) ──
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      insert: vi.fn(() => ({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

// ── Mock react-native ──
const mockAppStateListeners: Array<(state: string) => void> = [];
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn((event: string, handler: (state: string) => void) => {
      mockAppStateListeners.push(handler);
      return { remove: vi.fn(() => {
        const idx = mockAppStateListeners.indexOf(handler);
        if (idx >= 0) mockAppStateListeners.splice(idx, 1);
      }) };
    }),
  },
}));

// ── Import services (after mocks) ──
import { ExperienceEventService, EVENT_NAMES } from "../lib/services/experience-event-service";
import { SessionTracker } from "../lib/services/session-tracker";
import { UserExperienceStateService } from "../lib/services/user-experience-state-service";

// ── tRPC Mock Factories ──

/** Create a mock tRPC client for ExperienceEventService */
function createMockEventTrpc() {
  return {
    logEvent: {
      mutate: vi.fn(async () => ({ success: true })),
    },
  };
}

/** Create a mock tRPC client for UserExperienceStateService */
function createMockStateTrpc() {
  return {
    upsertState: {
      mutate: vi.fn(async () => ({ success: true })),
    },
    getState: {
      query: vi.fn(async () => null),
    },
    incrementCounter: {
      mutate: vi.fn(async () => ({ success: true, newValue: 1 })),
    },
    getCampaignStates: {
      query: vi.fn(async () => []),
    },
    upsertCampaignState: {
      mutate: vi.fn(async () => ({ success: true })),
    },
  };
}

// ── Helpers ──

let mockEventTrpc: ReturnType<typeof createMockEventTrpc>;
let mockStateTrpc: ReturnType<typeof createMockStateTrpc>;

function resetMocks() {
  mockStorage.clear();
  vi.clearAllMocks();
  mockAppStateListeners.length = 0;
  SessionTracker._testing.reset();

  // Create fresh tRPC mocks and inject them
  mockEventTrpc = createMockEventTrpc();
  mockStateTrpc = createMockStateTrpc();
  ExperienceEventService.setTrpcClient(mockEventTrpc);
  UserExperienceStateService.setTrpcClient(mockStateTrpc);
}

// ════════════════════════════════════════════════
// 1. ExperienceEventService
// ════════════════════════════════════════════════

describe("ExperienceEventService", () => {
  beforeEach(resetMocks);

  describe("Event logging", () => {
    it("should log an event via tRPC with correct fields", async () => {
      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.SCREEN_VIEWED,
        screen_key: "(tabs)",
        metadata: { screen_name: "(tabs)" },
      });

      expect(mockEventTrpc.logEvent.mutate).toHaveBeenCalledTimes(1);
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("screen_viewed");
      expect(payload.screen_key).toBe("(tabs)");
      expect(payload.session_id).toBeDefined();
      expect(typeof payload.session_id).toBe("string");
      // Client should NOT send user_id, platform, language, app_version
      expect(payload.user_id).toBeUndefined();
      expect(payload.platform).toBeUndefined();
      expect(payload.language).toBeUndefined();
      expect(payload.app_version).toBeUndefined();
    });

    it("should queue event when tRPC client is not set", async () => {
      ExperienceEventService.clearTrpcClient();

      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.APP_OPEN,
      });

      // Should not call tRPC (no client)
      expect(mockEventTrpc.logEvent.mutate).not.toHaveBeenCalled();
    });

    it("should not throw when tRPC mutate fails", async () => {
      mockEventTrpc.logEvent.mutate.mockRejectedValue(new Error("Network error"));

      // Should not throw
      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.APP_OPEN,
      });
    });

    it("should not throw when tRPC returns success=false", async () => {
      mockEventTrpc.logEvent.mutate.mockResolvedValue({ success: false });

      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.APP_OPEN,
      });
      // Should not throw
    });
  });

  describe("Session ID management", () => {
    it("should generate a new session ID on startNewSession", () => {
      const id1 = ExperienceEventService.getSessionId();
      const id2 = ExperienceEventService.startNewSession();
      expect(id2).not.toBe(id1);
      expect(ExperienceEventService.getSessionId()).toBe(id2);
    });

    it("should include session_id in logged events", async () => {
      const sessionId = ExperienceEventService.startNewSession();

      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.SCREEN_VIEWED,
      });

      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.session_id).toBe(sessionId);
    });
  });

  describe("Metadata sanitization (privacy)", () => {
    it("should strip non-whitelisted metadata keys", async () => {
      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.SCREEN_VIEWED,
        metadata: {
          screen_name: "home",
          customer_name: "John Doe",  // NOT allowed
          price: 100,                  // NOT allowed
          token: "secret123",          // NOT allowed
          source: "organic",           // allowed
        } as any,
      });

      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, unknown>;
      expect(metadata.screen_name).toBe("home");
      expect(metadata.source).toBe("organic");
      expect(metadata.customer_name).toBeUndefined();
      expect(metadata.price).toBeUndefined();
      expect(metadata.token).toBeUndefined();
    });

    it("should handle empty metadata", async () => {
      await ExperienceEventService.logEvent({
        event_name: EVENT_NAMES.APP_OPEN,
      });

      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.metadata).toEqual({});
    });
  });

  describe("Convenience methods", () => {
    it("logAppOpen should log app_open event", async () => {
      await ExperienceEventService.logAppOpen();
      expect(mockEventTrpc.logEvent.mutate).toHaveBeenCalledTimes(1);
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("app_open");
    });

    it("logScreenViewed should log screen_viewed with screen_key", async () => {
      await ExperienceEventService.logScreenViewed("(tabs)/orders");
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("screen_viewed");
      expect(payload.screen_key).toBe("(tabs)/orders");
    });

    it("logProductCreated should log product_created", async () => {
      await ExperienceEventService.logProductCreated();
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("product_created");
    });

    it("logOrderCreated should log order_created", async () => {
      await ExperienceEventService.logOrderCreated();
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("order_created");
    });

    it("logOrderCompleted should log order_completed", async () => {
      await ExperienceEventService.logOrderCompleted();
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("order_completed");
    });

    it("logShoppingListCreated should log shopping_list_created", async () => {
      await ExperienceEventService.logShoppingListCreated();
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("shopping_list_created");
    });

    it("logFeedbackSubmitted should log feedback_submitted with source", async () => {
      await ExperienceEventService.logFeedbackSubmitted("after_first_order");
      const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
      expect(payload.event_name).toBe("feedback_submitted");
      expect((payload.metadata as Record<string, unknown>).source).toBe("after_first_order");
    });
  });

  describe("Event names", () => {
    it("should have all required event names defined", () => {
      expect(EVENT_NAMES.APP_OPEN).toBe("app_open");
      expect(EVENT_NAMES.SESSION_START).toBe("session_start");
      expect(EVENT_NAMES.SCREEN_VIEWED).toBe("screen_viewed");
      expect(EVENT_NAMES.PRODUCT_CREATED).toBe("product_created");
      expect(EVENT_NAMES.PRODUCT_UPDATED).toBe("product_updated");
      expect(EVENT_NAMES.ORDER_CREATED).toBe("order_created");
      expect(EVENT_NAMES.ORDER_UPDATED).toBe("order_updated");
      expect(EVENT_NAMES.ORDER_COMPLETED).toBe("order_completed");
      expect(EVENT_NAMES.SHOPPING_LIST_CREATED).toBe("shopping_list_created");
      expect(EVENT_NAMES.FEEDBACK_SUBMITTED).toBe("feedback_submitted");
      expect(EVENT_NAMES.SIGNUP_COMPLETED).toBe("signup_completed");
      expect(EVENT_NAMES.LOGIN_COMPLETED).toBe("login_completed");
    });
  });
});

// ════════════════════════════════════════════════
// 2. SessionTracker
// ════════════════════════════════════════════════

describe("SessionTracker", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    SessionTracker.destroy();
  });

  describe("Initialization", () => {
    it("should initialize without errors", async () => {
      await SessionTracker.init();
      // Should not throw
    });

    it("should only initialize once (idempotent)", async () => {
      await SessionTracker.init();
      await SessionTracker.init(); // second call should be no-op
      // No error
    });

    it("should fire app_open and session_start on cold start", async () => {
      // No previous last_active_at → new session
      await SessionTracker.init();

      // SessionTracker calls ExperienceEventService.logAppOpen() and logSessionStart()
      // which go through the tRPC mock
      expect(mockEventTrpc.logEvent.mutate).toHaveBeenCalled();
    });
  });

  describe("Session timeout", () => {
    it("should default to 30 minutes", () => {
      expect(SessionTracker.getSessionTimeout()).toBe(30);
    });

    it("should update timeout via setSessionTimeout", () => {
      SessionTracker.setSessionTimeout(45);
      expect(SessionTracker.getSessionTimeout()).toBe(45);
    });

    it("should accept timeout from init parameter", async () => {
      await SessionTracker.init(15);
      expect(SessionTracker.getSessionTimeout()).toBe(15);
    });

    it("should ignore invalid timeout values", () => {
      SessionTracker.setSessionTimeout(0);
      expect(SessionTracker.getSessionTimeout()).toBe(30); // unchanged
      SessionTracker.setSessionTimeout(-5);
      expect(SessionTracker.getSessionTimeout()).toBe(30); // unchanged
    });
  });

  describe("Session detection", () => {
    it("should detect new session when no last_active_at exists", async () => {
      const isNew = await SessionTracker._testing.isNewSession();
      expect(isNew).toBe(true);
    });

    it("should detect new session when last_active_at is older than timeout", async () => {
      const thirtyOneMinAgo = Date.now() - (31 * 60 * 1000);
      await SessionTracker._testing.setLastActiveAt();
      mockStorage.set("@experience_last_active_at", thirtyOneMinAgo.toString());

      const isNew = await SessionTracker._testing.isNewSession();
      expect(isNew).toBe(true);
    });

    it("should NOT detect new session when last_active_at is recent", async () => {
      const fiveMinAgo = Date.now() - (5 * 60 * 1000);
      mockStorage.set("@experience_last_active_at", fiveMinAgo.toString());

      const isNew = await SessionTracker._testing.isNewSession();
      expect(isNew).toBe(false);
    });
  });

  describe("Callbacks", () => {
    it("should call onSessionStart callback on new session", async () => {
      const callback = vi.fn();
      SessionTracker.onSessionStart(callback);

      await SessionTracker.init(); // cold start = new session

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should call onAppOpen callback on init", async () => {
      const callback = vi.fn();
      SessionTracker.onAppOpen(callback);

      await SessionTracker.init();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cleanup", () => {
    it("should clean up on destroy", async () => {
      await SessionTracker.init();
      SessionTracker.destroy();

      // Should be able to re-init after destroy
      await SessionTracker.init();
    });
  });
});

// ════════════════════════════════════════════════
// 3. UserExperienceStateService (tRPC)
// ════════════════════════════════════════════════

describe("UserExperienceStateService", () => {
  beforeEach(resetMocks);

  describe("Initialization", () => {
    it("should initialize state for authenticated user via tRPC", async () => {
      await UserExperienceStateService.initForUser("1.0.0");

      expect(mockStateTrpc.upsertState.mutate).toHaveBeenCalledTimes(1);
      const call = (mockStateTrpc.upsertState.mutate as any).mock.calls[0][0] as { updates: Record<string, unknown> };
      expect(call.updates.current_app_version).toBe("1.0.0");
      expect(call.updates.first_open_at).toBeDefined();
      expect(call.updates.last_active_at).toBeDefined();
    });

    it("should skip when tRPC client is not set", async () => {
      UserExperienceStateService.clearTrpcClient();

      await UserExperienceStateService.initForUser("1.0.0");

      expect(mockStateTrpc.upsertState.mutate).not.toHaveBeenCalled();
    });

    it("should not throw on error", async () => {
      mockStateTrpc.upsertState.mutate.mockRejectedValue(new Error("DB error"));

      await UserExperienceStateService.initForUser("1.0.0");
      // Should not throw
    });
  });

  describe("Counter increments", () => {
    it("onSessionStart should call incrementCounter with sessions_count", async () => {
      await UserExperienceStateService.onSessionStart();

      expect(mockStateTrpc.incrementCounter.mutate).toHaveBeenCalledWith({ field: "sessions_count" });
    });

    it("onProductCreated should increment products_created_count", async () => {
      await UserExperienceStateService.onProductCreated();

      expect(mockStateTrpc.incrementCounter.mutate).toHaveBeenCalledWith({ field: "products_created_count" });
    });

    it("onOrderCreated should increment orders_created_count", async () => {
      await UserExperienceStateService.onOrderCreated();

      expect(mockStateTrpc.incrementCounter.mutate).toHaveBeenCalledWith({ field: "orders_created_count" });
    });

    it("onOrderCompleted should increment completed_orders_count", async () => {
      await UserExperienceStateService.onOrderCompleted();

      expect(mockStateTrpc.incrementCounter.mutate).toHaveBeenCalledWith({ field: "completed_orders_count" });
    });

    it("onShoppingListCreated should increment shopping_lists_created_count", async () => {
      await UserExperienceStateService.onShoppingListCreated();

      expect(mockStateTrpc.incrementCounter.mutate).toHaveBeenCalledWith({ field: "shopping_lists_created_count" });
    });

    it("should skip increment when tRPC client is not set", async () => {
      UserExperienceStateService.clearTrpcClient();

      await UserExperienceStateService.onSessionStart();

      expect(mockStateTrpc.incrementCounter.mutate).not.toHaveBeenCalled();
    });
  });

  describe("Flag updates", () => {
    it("onOnboardingCompleted should set onboarding_completed=true", async () => {
      await UserExperienceStateService.onOnboardingCompleted();

      expect(mockStateTrpc.upsertState.mutate).toHaveBeenCalled();
      const call = (mockStateTrpc.upsertState.mutate as any).mock.calls[0][0] as { updates: Record<string, unknown> };
      expect(call.updates.onboarding_completed).toBe(true);
      expect(call.updates.onboarding_completed_at).toBeDefined();
    });

    it("onFeedbackSubmitted should set feedback_submitted=true", async () => {
      await UserExperienceStateService.onFeedbackSubmitted();

      expect(mockStateTrpc.upsertState.mutate).toHaveBeenCalled();
      const call = (mockStateTrpc.upsertState.mutate as any).mock.calls[0][0] as { updates: Record<string, unknown> };
      expect(call.updates.feedback_submitted).toBe(true);
      expect(call.updates.feedback_submitted_at).toBeDefined();
    });
  });

  describe("App open state update", () => {
    it("onAppOpen should update last_active_at and app info via tRPC", async () => {
      await UserExperienceStateService.onAppOpen("1.2.0");

      expect(mockStateTrpc.upsertState.mutate).toHaveBeenCalled();
      const call = (mockStateTrpc.upsertState.mutate as any).mock.calls[0][0] as { updates: Record<string, unknown> };
      expect(call.updates.last_active_at).toBeDefined();
      expect(call.updates.current_app_version).toBe("1.2.0");
      expect(call.updates.platform).toBe("ios");
      expect(call.updates.language).toBe("he");
    });
  });

  describe("Resilience", () => {
    it("should not throw when upsertState fails", async () => {
      mockStateTrpc.upsertState.mutate.mockRejectedValue(new Error("DB error"));

      await UserExperienceStateService.onAppOpen("1.0.0");
      // Should not throw
    });

    it("should not throw when incrementCounter fails", async () => {
      mockStateTrpc.incrementCounter.mutate.mockRejectedValue(new Error("DB error"));

      await UserExperienceStateService.onSessionStart();
      // Should not throw
    });
  });
});

// ════════════════════════════════════════════════
// 4. Privacy: no sensitive data
// ════════════════════════════════════════════════

describe("Privacy: metadata whitelist", () => {
  beforeEach(resetMocks);

  it("should only allow whitelisted keys in metadata", async () => {
    await ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.PRODUCT_CREATED,
      metadata: {
        screen_name: "products",
        campaign_key: "summer_sale",
        rating: 5,
        source: "organic",
        // These should be stripped:
        customer_name: "John",
        phone: "0501234567",
        email: "john@example.com",
        order_total: 1500,
        password: "secret",
        jwt_token: "eyJ...",
      } as any,
    });

    const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    expect(Object.keys(metadata)).toEqual(
      expect.arrayContaining(["screen_name", "campaign_key", "rating", "source"])
    );
    expect(metadata.customer_name).toBeUndefined();
    expect(metadata.phone).toBeUndefined();
    expect(metadata.email).toBeUndefined();
    expect(metadata.order_total).toBeUndefined();
    expect(metadata.password).toBeUndefined();
    expect(metadata.jwt_token).toBeUndefined();
  });

  it("event rows should not contain any PII fields", async () => {
    await ExperienceEventService.logEvent({
      event_name: EVENT_NAMES.ORDER_CREATED,
    });

    const payload = (mockEventTrpc.logEvent.mutate as any).mock.calls[0][0] as Record<string, unknown>;
    // Client payload should only have these fields (no user_id, platform, language, app_version):
    const allowedFields = [
      "event_name", "screen_key", "campaign_key",
      "flow_key", "action", "session_id", "metadata",
    ];
    for (const key of Object.keys(payload)) {
      expect(allowedFields).toContain(key);
    }
  });
});

// ════════════════════════════════════════════════
// 5. No UI changes
// ════════════════════════════════════════════════

// Define __DEV__ global (required by expo-modules-core)
(globalThis as any).__DEV__ = false;

// Mock expo-modules-core to avoid native module errors
vi.mock("expo-modules-core", () => ({
  requireNativeModule: vi.fn(() => ({})),
  EventEmitter: vi.fn(() => ({ addListener: vi.fn(), removeAllListeners: vi.fn() })),
  NativeModule: vi.fn(),
  requireOptionalNativeModule: vi.fn(() => null),
}));

// Mock expo-router for ExperienceBootstrap import
vi.mock("expo-router", () => ({
  useSegments: vi.fn(() => []),
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  useLocalSearchParams: vi.fn(() => ({})),
}));

// Mock expo-constants
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0" } },
}));

// Mock trpc (ExperienceBootstrap imports it; trpc.ts imports @/constants/oauth which Vitest can't resolve)
vi.mock("../lib/trpc", () => ({
  trpc: { experience: {} },
}));

// Mock config-context
vi.mock("../lib/config-context", () => ({
  useConfig: vi.fn(() => ({
    remoteConfig: {},
    remoteConfigReady: false,
    isFeatureActive: vi.fn(() => false),
  })),
}));

// Mock auth-context
vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false, user: null, profile: null })),
}));

// Mock network-context (ExperienceBootstrap uses useNetwork)
vi.mock("../lib/network-context", () => ({
  useNetwork: vi.fn(() => ({ isOnline: true })),
}));

// Mock critical-flow-context (ExperienceBootstrap uses useCriticalFlow)
vi.mock("../lib/critical-flow-context", () => ({
  useCriticalFlow: vi.fn(() => ({ isInCriticalFlow: false })),
}));

// Mock campaign-renderer (ExperienceBootstrap imports it)
vi.mock("../components/campaign/campaign-renderer", () => ({
  CampaignRenderer: vi.fn(() => null),
}));

describe("No UI changes", () => {
  it("ExperienceBootstrap should export a function", async () => {
    const mod = await import("../lib/experience-bootstrap");
    expect(mod.ExperienceBootstrap).toBeDefined();
    expect(typeof mod.ExperienceBootstrap).toBe("function");
  });

  it("ExperienceEventService should be a pure service (no React components)", () => {
    expect(typeof ExperienceEventService.logEvent).toBe("function");
    expect(typeof ExperienceEventService.logAppOpen).toBe("function");
    expect(typeof ExperienceEventService.logScreenViewed).toBe("function");
  });

  it("SessionTracker should be a pure service (no React components)", () => {
    expect(typeof SessionTracker.init).toBe("function");
    expect(typeof SessionTracker.destroy).toBe("function");
    expect(typeof SessionTracker.setSessionTimeout).toBe("function");
  });

  it("UserExperienceStateService should be a pure service (no React components)", () => {
    expect(typeof UserExperienceStateService.initForUser).toBe("function");
    expect(typeof UserExperienceStateService.onSessionStart).toBe("function");
    expect(typeof UserExperienceStateService.onAppOpen).toBe("function");
  });
});

// ════════════════════════════════════════════════
// 6. Barrel exports
// ════════════════════════════════════════════════

describe("Barrel exports", () => {
  it("services/index.ts should export all Session 2 services", async () => {
    const mod = await import("../lib/services/index");
    expect(mod.ExperienceEventService).toBeDefined();
    expect(mod.SessionTracker).toBeDefined();
    expect(mod.UserExperienceStateService).toBeDefined();
    expect(mod.EVENT_NAMES).toBeDefined();
  });
});
