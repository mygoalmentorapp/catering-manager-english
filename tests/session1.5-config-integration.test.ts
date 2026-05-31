/**
 * Session 1.5 Integration Tests
 *
 * Verifies that ConfigContext correctly integrates with Session 1 services:
 * - RemoteConfigService + FeatureFlagService are loaded on startup
 * - Safe defaults are used when services fail
 * - isFeatureActive uses combined remote_config × feature_flags
 * - No UI changes — existing appConfig/featureFlags API preserved
 * - Fast startup: cache-first, non-blocking
 *
 * After Session 5 migration: RemoteConfigService uses tRPC (not direct Supabase).
 * FeatureFlagService still uses Supabase directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock app-identity (required by remote-config-service) ──
vi.mock("@/constants/app-identity", () => ({
  APP_KEY: "catering_manager_pro",
  APP_LANGUAGE: "he",
}));

// ── Mock tRPC (RemoteConfigService now uses tRPC) ──
const mockGetRemoteConfigQuery = vi.fn();
vi.mock("@/lib/trpc", () => ({
  getVanillaTrpc: vi.fn(() => ({
    config: {
      getRemoteConfig: {
        query: mockGetRemoteConfigQuery,
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

// ── Mock Supabase (still used by FeatureFlagService) ──
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../lib/supabase", () => ({
  supabase: { from: (table: string) => (mockFrom as any)(table) },
}));

// ── Mock react-native ──
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

// ── Import services (after mocks) ──
import { CacheManager } from "../lib/services/cache-manager";
import { RemoteConfigService, SAFE_DEFAULTS as RC_SAFE_DEFAULTS } from "../lib/services/remote-config-service";
import { FeatureFlagService, FLAG_SAFE_DEFAULTS } from "../lib/services/feature-flag-service";
import { FeatureService } from "../lib/services/feature-service";

/** Helper: make tRPC return an error for remote config */
function mockTrpcFail(msg = "offline") {
  mockGetRemoteConfigQuery.mockRejectedValue(new Error(msg));
}

/** Helper: make Supabase return an error for feature flags */
function mockSupabaseFail(msg = "offline") {
  mockSingle.mockResolvedValue({ data: null, error: { message: msg } });
  mockSelect.mockReturnValue({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: { message: msg } }) })) });
}

describe("Session 1.5: ConfigContext Integration", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    // Default: tRPC fails (safe for most tests)
    mockTrpcFail();
    // Default: Supabase fails (safe for feature flag tests)
    mockSupabaseFail();
  });

  // ────────────────────────────────────────────
  // 1. Startup behavior
  // ────────────────────────────────────────────

  describe("Startup: cache-first, non-blocking", () => {
    it("should return safe defaults when no cache and server fails", async () => {
      const config = await RemoteConfigService.getConfig();
      expect(config).toEqual(RC_SAFE_DEFAULTS);

      const flags = await FeatureFlagService.getFlags();
      expect(flags).toEqual(FLAG_SAFE_DEFAULTS);
    });

    it("should use cached data when available (fast startup)", async () => {
      // Pre-populate cache
      await CacheManager.set("remote_config", {
        ...RC_SAFE_DEFAULTS,
        paywall_enabled: true,
        global_message_enabled: true,
      });
      await CacheManager.set("feature_flags", {
        ...FLAG_SAFE_DEFAULTS,
        paywall: true,
        global_message: true,
      });

      const config = await RemoteConfigService.getConfig();
      expect(config.paywall_enabled).toBe(true);
      expect(config.global_message_enabled).toBe(true);

      const flags = await FeatureFlagService.getFlags();
      expect(flags.paywall).toBe(true);
      expect(flags.global_message).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // 2. isFeatureActive combined logic
  // ────────────────────────────────────────────

  describe("isFeatureActive: remote_config × feature_flags", () => {
    it("should return false when both master and flag are OFF", async () => {
      const result = await FeatureService.isFeatureActive("paywall");
      expect(result).toBe(false);
    });

    it("should return false when master is ON but flag is OFF", async () => {
      await CacheManager.set("remote_config", { ...RC_SAFE_DEFAULTS, paywall_enabled: true });
      await CacheManager.set("feature_flags", { ...FLAG_SAFE_DEFAULTS, paywall: false });

      const result = await FeatureService.isFeatureActive("paywall");
      expect(result).toBe(false);
    });

    it("should return false when master is OFF but flag is ON", async () => {
      await CacheManager.set("remote_config", { ...RC_SAFE_DEFAULTS, paywall_enabled: false });
      await CacheManager.set("feature_flags", { ...FLAG_SAFE_DEFAULTS, paywall: true });

      const result = await FeatureService.isFeatureActive("paywall");
      expect(result).toBe(false);
    });

    it("should return true ONLY when both master AND flag are ON", async () => {
      await CacheManager.set("remote_config", { ...RC_SAFE_DEFAULTS, paywall_enabled: true });
      await CacheManager.set("feature_flags", { ...FLAG_SAFE_DEFAULTS, paywall: true });

      const result = await FeatureService.isFeatureActive("paywall");
      expect(result).toBe(true);
    });

    it("should check each feature independently", async () => {
      await CacheManager.set("remote_config", {
        ...RC_SAFE_DEFAULTS,
        paywall_enabled: true,
        global_message_enabled: true,
        feedback_popup_enabled: false,
      });
      await CacheManager.set("feature_flags", {
        ...FLAG_SAFE_DEFAULTS,
        paywall: true,
        global_message: false,
        feedback_popup: true,
      });

      expect(await FeatureService.isFeatureActive("paywall")).toBe(true);       // both ON
      expect(await FeatureService.isFeatureActive("global_message")).toBe(false); // flag OFF
      expect(await FeatureService.isFeatureActive("feedback_popup")).toBe(false); // master OFF
      expect(await FeatureService.isFeatureActive("revenuecat")).toBe(false);     // both OFF
    });
  });

  // ────────────────────────────────────────────
  // 3. All features default to OFF
  // ────────────────────────────────────────────

  describe("Safe defaults: all features OFF", () => {
    it("should have all features OFF in remote config safe defaults", () => {
      expect(RC_SAFE_DEFAULTS.paywall_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.revenuecat_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.remote_campaigns_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.feedback_popup_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.global_message_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.external_urls_enabled).toBe(false);
    });

    it("should have all feature flags OFF in safe defaults", () => {
      expect(FLAG_SAFE_DEFAULTS.paywall).toBe(false);
      expect(FLAG_SAFE_DEFAULTS.revenuecat).toBe(false);
      expect(FLAG_SAFE_DEFAULTS.remote_campaigns).toBe(false);
      expect(FLAG_SAFE_DEFAULTS.feedback_popup).toBe(false);
      expect(FLAG_SAFE_DEFAULTS.global_message).toBe(false);
      expect(FLAG_SAFE_DEFAULTS.external_urls).toBe(false);
    });

    it("should have all isFeatureActive return false with safe defaults", async () => {
      const features = ["paywall", "revenuecat", "remote_campaigns", "feedback_popup", "global_message", "external_urls"] as const;
      for (const feature of features) {
        expect(await FeatureService.isFeatureActive(feature)).toBe(false);
      }
    });
  });

  // ────────────────────────────────────────────
  // 4. Server/Supabase unavailable → no crash
  // ────────────────────────────────────────────

  describe("Resilience: server unavailable", () => {
    it("should not throw when tRPC returns network error", async () => {
      mockTrpcFail("network error");

      const config = await RemoteConfigService.getConfig();
      expect(config).toBeDefined();
      expect(config.schema_version).toBe(1);

      const flags = await FeatureFlagService.getFlags();
      expect(flags).toBeDefined();
    });

    it("should not throw when tRPC throws exception", async () => {
      mockGetRemoteConfigQuery.mockRejectedValue(new Error("Connection refused"));

      const config = await RemoteConfigService.getConfig();
      expect(config).toEqual(RC_SAFE_DEFAULTS);
    });
  });

  // ────────────────────────────────────────────
  // 5. Cache validity
  // ────────────────────────────────────────────

  describe("Cache behavior", () => {
    it("should use cache when server fails on subsequent calls", async () => {
      // First: populate cache
      await CacheManager.set("remote_config", {
        ...RC_SAFE_DEFAULTS,
        paywall_enabled: true,
      });

      // Then: tRPC fails
      mockTrpcFail();

      const config = await RemoteConfigService.getConfig();
      expect(config.paywall_enabled).toBe(true); // from cache
    });

    it("should return safe defaults when cache is expired and server fails", async () => {
      // Set cache with 0 TTL (immediately expired)
      await CacheManager.set("remote_config", { ...RC_SAFE_DEFAULTS, paywall_enabled: true }, 0);

      // Wait a tick for expiry
      await new Promise(r => setTimeout(r, 10));

      const config = await RemoteConfigService.getConfig();
      // Should be safe defaults since cache expired and tRPC fails
      expect(config.paywall_enabled).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // 6. No UI change verification
  // ────────────────────────────────────────────

  describe("No UI change: existing API preserved", () => {
    it("ConfigContext should export ConfigProvider and useConfig", async () => {
      const configModule = await import("../lib/config-context");
      expect(configModule.ConfigProvider).toBeDefined();
      expect(configModule.useConfig).toBeDefined();
    });

    it("safe defaults should not enable any visible feature", () => {
      expect(RC_SAFE_DEFAULTS.paywall_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.global_message_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.feedback_popup_enabled).toBe(false);
      expect(RC_SAFE_DEFAULTS.remote_campaigns_enabled).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // 7. External URL safety
  // ────────────────────────────────────────────

  describe("External URL safety", () => {
    it("should block all external URLs when feature is OFF", async () => {
      const allowed = await FeatureService.isExternalUrlAllowed("https://example.com");
      expect(allowed).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // 8. App startup speed
  // ────────────────────────────────────────────

  describe("Startup speed: non-blocking", () => {
    it("should resolve getConfig quickly even without network", async () => {
      mockTrpcFail();

      const start = Date.now();
      await RemoteConfigService.getConfig();
      const elapsed = Date.now() - start;

      // Should resolve in under 1 second (cache miss + safe defaults)
      expect(elapsed).toBeLessThan(1000);
    });

    it("should resolve getFlags quickly even without network", async () => {
      mockSupabaseFail();

      const start = Date.now();
      await FeatureFlagService.getFlags();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });
  });
});
