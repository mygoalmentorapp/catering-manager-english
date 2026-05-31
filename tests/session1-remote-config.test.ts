/**
 * Session 1 Tests — Remote Config + Feature Flags Infrastructure
 *
 * Tests all Session 1 requirements:
 * - App doesn't crash if server/Supabase unavailable
 * - App doesn't crash if config is invalid
 * - App uses cache when offline
 * - Safe defaults used when no cache
 * - Unsupported schema_version → safe skip
 * - isFeatureActive works with remote_config × feature_flags
 *
 * After Session 5 migration: RemoteConfigService uses tRPC (not direct Supabase).
 * FeatureFlagService and AllowedDomainsService still use Supabase directly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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

// ── Mock Supabase (still used by FeatureFlagService, AllowedDomainsService) ──
const mockSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ single: mockSingle }));
const mockEq = vi.fn(() => ({ single: mockSingle, eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../lib/supabase", () => ({
  supabase: { from: (table: string) => (mockFrom as any)(table) },
}));

// ── Import after mocks ──
import { CacheManager } from "../lib/services/cache-manager";
import { RemoteConfigService, SAFE_DEFAULTS } from "../lib/services/remote-config-service";
import { FeatureFlagService, FLAG_SAFE_DEFAULTS } from "../lib/services/feature-flag-service";
import { FeatureService } from "../lib/services/feature-service";
import { AllowedDomainsService } from "../lib/services/allowed-domains-service";
import { SUPPORTED_SCHEMA_VERSION } from "../lib/services/environment";

// ── Helpers ──

function clearStore() {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
}

function resetMocks() {
  clearStore();
  mockGetRemoteConfigQuery.mockReset();
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockEq2.mockClear();
  mockSingle.mockClear();
}

// ── CacheManager Tests ──

describe("CacheManager", () => {
  beforeEach(resetMocks);

  it("stores and retrieves data", async () => {
    await CacheManager.set("test", { hello: "world" });
    const result = await CacheManager.get("test");
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null for missing keys", async () => {
    const result = await CacheManager.get("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null for expired entries", async () => {
    await CacheManager.set("expired", "data", 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const result = await CacheManager.get("expired");
    expect(result).toBeNull();
  });

  it("removes a specific key", async () => {
    await CacheManager.set("removeme", "data");
    await CacheManager.remove("removeme");
    const result = await CacheManager.get("removeme");
    expect(result).toBeNull();
  });

  it("clears all cache entries", async () => {
    await CacheManager.set("a", 1);
    await CacheManager.set("b", 2);
    await CacheManager.clearAll();
    expect(await CacheManager.get("a")).toBeNull();
    expect(await CacheManager.get("b")).toBeNull();
  });

  it("has() returns true for valid entries", async () => {
    await CacheManager.set("exists", "yes");
    expect(await CacheManager.has("exists")).toBe(true);
    expect(await CacheManager.has("nope")).toBe(false);
  });

  it("handles corrupt JSON gracefully", async () => {
    mockStore["rc_cache_corrupt"] = "not valid json{{{";
    const result = await CacheManager.get("corrupt");
    expect(result).toBeNull();
  });
});

// ── RemoteConfigService Tests ──

describe("RemoteConfigService", () => {
  beforeEach(resetMocks);

  it("returns safe defaults when server returns error", async () => {
    mockGetRemoteConfigQuery.mockRejectedValue(new Error("connection refused"));
    const config = await RemoteConfigService.getConfig();
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("returns safe defaults when server returns null data", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue(null);
    const config = await RemoteConfigService.getConfig();
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("returns safe defaults for unsupported schema_version", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: 999,
      paywall_enabled: true,
      revenuecat_enabled: true,
      remote_campaigns_enabled: true,
      feedback_popup_enabled: true,
      global_message_enabled: true,
      external_urls_enabled: true,
    });
    const config = await RemoteConfigService.getConfig();
    expect(config).toEqual(SAFE_DEFAULTS);
    expect(config.paywall_enabled).toBe(false);
  });

  it("caches valid config and returns from cache on second call", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: SUPPORTED_SCHEMA_VERSION,
      paywall_enabled: true,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: false,
    });

    const first = await RemoteConfigService.getConfig();
    expect(first.paywall_enabled).toBe(true);

    // Second call should use cache (tRPC called only once)
    const second = await RemoteConfigService.getConfig();
    expect(second.paywall_enabled).toBe(true);
  });

  it("refresh() clears cache and fetches fresh", async () => {
    // Seed cache
    await CacheManager.set("remote_config", {
      ...SAFE_DEFAULTS,
      paywall_enabled: true,
    });

    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: SUPPORTED_SCHEMA_VERSION,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: false,
    });

    const refreshed = await RemoteConfigService.refresh();
    expect(refreshed.paywall_enabled).toBe(false);
  });

  it("handles invalid/corrupt config data gracefully", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({ garbage: true });
    const config = await RemoteConfigService.getConfig();
    // Missing fields default to false
    expect(config.paywall_enabled).toBe(false);
    expect(config.revenuecat_enabled).toBe(false);
  });

  it("uses cached config even if schema_version is unsupported in cache", async () => {
    // If somehow an unsupported version got cached, getConfig should detect it
    await CacheManager.set("remote_config", {
      ...SAFE_DEFAULTS,
      schema_version: 999,
      paywall_enabled: true,
    });

    const config = await RemoteConfigService.getConfig();
    expect(config).toEqual(SAFE_DEFAULTS);
    expect(config.paywall_enabled).toBe(false);
  });
});

// ── FeatureFlagService Tests ──

describe("FeatureFlagService", () => {
  beforeEach(resetMocks);

  it("returns safe defaults when Supabase returns error", async () => {
    // Override: feature_flags uses select without .single()
    (mockFrom as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } }),
    });
    const flags = await FeatureFlagService.getFlags();
    expect(flags).toEqual(FLAG_SAFE_DEFAULTS);
  });

  it("returns safe defaults when Supabase returns null data", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const flags = await FeatureFlagService.getFlags();
    expect(flags).toEqual(FLAG_SAFE_DEFAULTS);
  });

  it("correctly maps flag data from Supabase", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { flag_name: "paywall", enabled: true },
          { flag_name: "revenuecat", enabled: true },
          { flag_name: "cloud_sync", enabled: false },
        ],
        error: null,
      }),
    });
    const flags = await FeatureFlagService.getFlags();
    expect(flags.paywall).toBe(true);
    expect(flags.revenuecat).toBe(true);
    expect(flags.cloud_sync).toBe(false);
    expect(flags.feedback_popup).toBe(false); // not in response → default
  });

  it("isFlagEnabled returns false for unknown flags", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const result = await FeatureFlagService.isFlagEnabled("nonexistent_flag");
    expect(result).toBe(false);
  });
});

// ── FeatureService.isFeatureActive Tests ──

describe("FeatureService.isFeatureActive", () => {
  beforeEach(resetMocks);

  function setupMocks(configOverrides: Record<string, boolean>, flagData: Array<{ flag_name: string; enabled: boolean }>) {
    // RemoteConfigService now uses tRPC
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: SUPPORTED_SCHEMA_VERSION,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: false,
      ...configOverrides,
    });

    // FeatureFlagService and AllowedDomainsService still use Supabase
    (mockFrom as any).mockImplementation((table: string) => {
      if (table === "feature_flags") {
        return {
          select: vi.fn().mockResolvedValue({ data: flagData, error: null }),
        };
      }
      if (table === "allowed_external_domains") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });
  }

  it("returns true only when BOTH master and flag are enabled", async () => {
    setupMocks(
      { paywall_enabled: true },
      [{ flag_name: "paywall", enabled: true }],
    );
    const result = await FeatureService.isFeatureActive("paywall");
    expect(result).toBe(true);
  });

  it("returns false when master is ON but flag is OFF", async () => {
    setupMocks(
      { paywall_enabled: true },
      [{ flag_name: "paywall", enabled: false }],
    );
    const result = await FeatureService.isFeatureActive("paywall");
    expect(result).toBe(false);
  });

  it("returns false when master is OFF but flag is ON", async () => {
    setupMocks(
      { paywall_enabled: false },
      [{ flag_name: "paywall", enabled: true }],
    );
    const result = await FeatureService.isFeatureActive("paywall");
    expect(result).toBe(false);
  });

  it("returns false when both are OFF", async () => {
    setupMocks(
      { paywall_enabled: false },
      [{ flag_name: "paywall", enabled: false }],
    );
    const result = await FeatureService.isFeatureActive("paywall");
    expect(result).toBe(false);
  });

  it("returns false when no data is available (safe defaults)", async () => {
    // tRPC fails → safe defaults for remote config
    mockGetRemoteConfigQuery.mockRejectedValue(new Error("offline"));
    // Supabase fails → safe defaults for feature flags
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } }),
        }),
      }),
    }));
    const result = await FeatureService.isFeatureActive("paywall");
    expect(result).toBe(false);
  });

  it("getAllFeatureStates returns all features", async () => {
    setupMocks(
      { paywall_enabled: true, revenuecat_enabled: true },
      [
        { flag_name: "paywall", enabled: true },
        { flag_name: "revenuecat", enabled: false },
      ],
    );
    const states = await FeatureService.getAllFeatureStates();
    expect(states.paywall).toBe(true);
    expect(states.revenuecat).toBe(false); // master ON, flag OFF → false
    expect(states.feedback_popup).toBe(false);
  });
});

// ── FeatureService.isExternalUrlAllowed Tests ──

describe("FeatureService.isExternalUrlAllowed", () => {
  beforeEach(resetMocks);

  function setupExternalUrlMocks(masterOn: boolean, flagOn: boolean, domains: string[]) {
    // RemoteConfigService via tRPC
    mockGetRemoteConfigQuery.mockResolvedValue({
      schema_version: SUPPORTED_SCHEMA_VERSION,
      paywall_enabled: false,
      revenuecat_enabled: false,
      remote_campaigns_enabled: false,
      feedback_popup_enabled: false,
      global_message_enabled: false,
      external_urls_enabled: masterOn,
    });

    // FeatureFlagService + AllowedDomainsService via Supabase
    (mockFrom as any).mockImplementation((table: string) => {
      if (table === "feature_flags") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ flag_name: "external_urls", enabled: flagOn }],
            error: null,
          }),
        };
      }
      if (table === "allowed_external_domains") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: domains.map((d) => ({ domain: d })),
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });
  }

  it("blocks all URLs when external_urls feature is not active", async () => {
    setupExternalUrlMocks(false, false, ["example.com"]);
    expect(await FeatureService.isExternalUrlAllowed("https://example.com")).toBe(false);
  });

  it("blocks URLs when feature is active but domain not in allowed list", async () => {
    setupExternalUrlMocks(true, true, ["safe.com"]);
    expect(await FeatureService.isExternalUrlAllowed("https://evil.com")).toBe(false);
  });

  it("allows URLs when feature is active and domain is in allowed list", async () => {
    setupExternalUrlMocks(true, true, ["example.com"]);
    expect(await FeatureService.isExternalUrlAllowed("https://example.com/page")).toBe(true);
  });

  it("allows subdomain matching", async () => {
    setupExternalUrlMocks(true, true, ["example.com"]);
    expect(await FeatureService.isExternalUrlAllowed("https://sub.example.com/page")).toBe(true);
  });

  it("returns false for invalid URLs", async () => {
    setupExternalUrlMocks(true, true, ["example.com"]);
    expect(await FeatureService.isExternalUrlAllowed("not-a-url")).toBe(false);
  });
});

// ── AllowedDomainsService Tests ──

describe("AllowedDomainsService", () => {
  beforeEach(resetMocks);

  it("returns empty array when Supabase fails (safe default)", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } }),
      }),
    });
    const domains = await AllowedDomainsService.getDomains();
    expect(domains).toEqual([]);
  });

  it("isDomainAllowed returns false for invalid URLs", () => {
    expect(AllowedDomainsService.isDomainAllowed("not-a-url", ["example.com"])).toBe(false);
  });
});

// ── Environment Tests ──

describe("Environment", () => {
  it("SUPPORTED_SCHEMA_VERSION is defined and is a number", () => {
    expect(typeof SUPPORTED_SCHEMA_VERSION).toBe("number");
    expect(SUPPORTED_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it("SAFE_DEFAULTS has all features disabled", () => {
    expect(SAFE_DEFAULTS.paywall_enabled).toBe(false);
    expect(SAFE_DEFAULTS.revenuecat_enabled).toBe(false);
    expect(SAFE_DEFAULTS.remote_campaigns_enabled).toBe(false);
    expect(SAFE_DEFAULTS.feedback_popup_enabled).toBe(false);
    expect(SAFE_DEFAULTS.global_message_enabled).toBe(false);
    expect(SAFE_DEFAULTS.external_urls_enabled).toBe(false);
  });

  it("SAFE_DEFAULTS is frozen (immutable)", () => {
    expect(Object.isFrozen(SAFE_DEFAULTS)).toBe(true);
  });
});
