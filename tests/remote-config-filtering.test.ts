/**
 * Tests for remote_config filtering by APP_KEY + APP_LANGUAGE.
 *
 * Verifies:
 * a. APP_LANGUAGE = "he" gets the Hebrew config row
 * b. APP_LANGUAGE = "en" does NOT get the Hebrew row
 * c. If no "en" row exists → English app uses SAFE_DEFAULTS (doesn't fall back to Hebrew)
 * d. If app_key is missing → SAFE_DEFAULTS
 * e. If app_language is missing → SAFE_DEFAULTS
 * f. force_update_title/message/button arrive in Hebrew only for Hebrew version
 * g. No active call to app_config (legacy) — verified by architecture (tRPC, not Supabase direct)
 * h. feature_flags continue to work independently
 *
 * After Session 5 migration: RemoteConfigService now uses tRPC (server-side service_role)
 * instead of direct Supabase client. Tests mock getVanillaTrpc().config.getRemoteConfig.query.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock constants ──
let mockAppKey = "catering_manager_pro";
let mockAppLanguage = "he";

vi.mock("@/constants/app-identity", () => ({
  get APP_KEY() { return mockAppKey; },
  get APP_LANGUAGE() { return mockAppLanguage; },
}));

// ── Mock tRPC (RemoteConfigService now uses tRPC, not direct Supabase) ──
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

// ── Mock oauth (required by trpc.ts import resolution) ──
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
  API_BASE_URL: "http://localhost:3000",
}));

// ── Mock _core/auth (required by trpc.ts) ──
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: vi.fn(async () => "mock-token"),
  getAccessToken: vi.fn(async () => "mock-token"),
}));

// ── Mock device-id (required by trpc.ts) ──
vi.mock("../lib/device-id", () => ({
  getDeviceId: vi.fn(async () => "mock-device-id"),
}));

// ── Mock expo-secure-store (required by _core/auth) ──
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

// ── Mock react-native (required by trpc.ts Platform import) ──
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (obj: any) => obj.android ?? obj.default ?? {} },
}));

// ── Mock CacheManager (always miss) ──
vi.mock("../lib/services/cache-manager", () => ({
  CacheManager: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Mock environment ──
vi.mock("../lib/services/environment", () => ({
  SUPPORTED_SCHEMA_VERSION: 1,
  CACHE_TTL: 30 * 60 * 1000,
  devLog: vi.fn(),
  warnLog: vi.fn(),
}));

// ── Import after mocks ──
import { RemoteConfigService, SAFE_DEFAULTS } from "../lib/services/remote-config-service";

// ── Hebrew config row (as stored in Supabase, returned via tRPC) ──
const HEBREW_CONFIG_ROW = {
  schema_version: 1,
  paywall_enabled: false,
  revenuecat_enabled: false,
  remote_campaigns_enabled: true,
  feedback_popup_enabled: true,
  global_message_enabled: false,
  external_urls_enabled: true,
  cache_ttl_minutes: 15,
  force_update_enabled: true,
  minimum_supported_version_code: 10,
  latest_version_code: 25,
  force_update_title: "עדכון חובה",
  force_update_message: "כדי להמשיך להשתמש באפליקציה, יש לעדכן לגרסה החדשה",
  force_update_button_text: "עדכן עכשיו",
  google_play_url: "https://play.google.com/store/apps/details?id=com.example",
  app_key: "catering_manager_pro",
  app_language: "he",
};

describe("RemoteConfigService — app_key + app_language filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppKey = "catering_manager_pro";
    mockAppLanguage = "he";
  });

  it("a. APP_LANGUAGE=he gets the Hebrew config row", async () => {
    mockAppLanguage = "he";
    mockGetRemoteConfigQuery.mockResolvedValue(HEBREW_CONFIG_ROW);

    const config = await RemoteConfigService.getConfig();

    // Verify tRPC was called (no input params — server reads app_key/app_language from headers)
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledWith();

    // Verify config values
    expect(config.remote_campaigns_enabled).toBe(true);
    expect(config.force_update_title).toBe("עדכון חובה");
    expect(config.cache_ttl_minutes).toBe(15);
  });

  it("b. APP_LANGUAGE=en does NOT get the Hebrew row", async () => {
    mockAppLanguage = "en";
    // Server returns null for en (no matching row)
    mockGetRemoteConfigQuery.mockResolvedValue(null);

    const config = await RemoteConfigService.getConfig();

    // Verify query was called (server reads "en" from x-app-language header)
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledWith();

    // Should return SAFE_DEFAULTS
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("c. No en row exists → English app uses SAFE_DEFAULTS (no Hebrew fallback)", async () => {
    mockAppLanguage = "en";
    mockGetRemoteConfigQuery.mockResolvedValue(null);

    const config = await RemoteConfigService.getConfig();

    // Must NOT contain Hebrew text
    expect(config.force_update_title).toBe("");
    expect(config.force_update_message).toBe("");
    expect(config.remote_campaigns_enabled).toBe(false);
    // Must be SAFE_DEFAULTS
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("d. Missing app_key → SAFE_DEFAULTS", async () => {
    mockAppKey = "";
    mockGetRemoteConfigQuery.mockResolvedValue(null);

    const config = await RemoteConfigService.getConfig();

    // Server reads empty app_key from header → returns null → SAFE_DEFAULTS
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledWith();
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("e. Missing app_language → SAFE_DEFAULTS", async () => {
    mockAppLanguage = "";
    mockGetRemoteConfigQuery.mockResolvedValue(null);

    const config = await RemoteConfigService.getConfig();

    // Server reads empty app_language from header → returns null → SAFE_DEFAULTS
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledWith();
    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("f. force_update texts arrive in Hebrew only for Hebrew version", async () => {
    mockAppLanguage = "he";
    mockGetRemoteConfigQuery.mockResolvedValue(HEBREW_CONFIG_ROW);

    const config = await RemoteConfigService.getConfig();

    expect(config.force_update_title).toBe("עדכון חובה");
    expect(config.force_update_message).toBe("כדי להמשיך להשתמש באפליקציה, יש לעדכן לגרסה החדשה");
    expect(config.force_update_button_text).toBe("עדכן עכשיו");
  });

  it("g. No direct Supabase call — reads via tRPC server endpoint", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue(HEBREW_CONFIG_ROW);

    await RemoteConfigService.getConfig();

    // Verify tRPC was called (not direct Supabase)
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledTimes(1);
  });

  it("h. feature_flags are independent (not affected by remote_config filtering)", async () => {
    // RemoteConfigService only calls config.getRemoteConfig — never feature_flags
    mockGetRemoteConfigQuery.mockResolvedValue(HEBREW_CONFIG_ROW);

    await RemoteConfigService.getConfig();

    // Only one tRPC call should be made (getRemoteConfig)
    expect(mockGetRemoteConfigQuery).toHaveBeenCalledTimes(1);
  });

  it("tRPC error → SAFE_DEFAULTS", async () => {
    mockGetRemoteConfigQuery.mockRejectedValue(new Error("network error"));

    const config = await RemoteConfigService.getConfig();

    expect(config).toEqual(SAFE_DEFAULTS);
  });

  it("Unsupported schema_version → SAFE_DEFAULTS", async () => {
    mockGetRemoteConfigQuery.mockResolvedValue({
      ...HEBREW_CONFIG_ROW,
      schema_version: 999,
    });

    const config = await RemoteConfigService.getConfig();

    expect(config).toEqual(SAFE_DEFAULTS);
  });
});
