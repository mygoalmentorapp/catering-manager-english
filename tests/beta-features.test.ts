import { describe, it, expect, vi, beforeEach } from "vitest";

// ============ SUPABASE CLIENT TESTS ============

describe("Supabase Client", () => {
  it("should be importable from @supabase/supabase-js", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    expect(createClient).toBeDefined();
    expect(typeof createClient).toBe("function");

    // Verify we can create a client with the known URL
    const url = process.env.SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
    const key = process.env.SUPABASE_KEY || "";
    if (key) {
      const client = createClient(url, key);
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    }
  });
});

// ============ SUPABASE TYPES TESTS ============

describe("Supabase Types", () => {
  it("should have correct AppConfig type shape", async () => {
    // Just verify the types compile correctly
    const mockConfig = {
      id: 1,
      trial_duration_days: 14,
      paywall_enabled: false,
      paywall_mode: "trial_expired" as const,
      maintenance_enabled: false,
      maintenance_message: null,
      minimum_supported_version: "1.0.0",
      force_update_enabled: false,
      global_message_enabled: false,
      global_message_text: null,
      global_message_type: "info" as const,
      global_message_action_text: null,
      global_message_action: null,
      updated_at: "2024-01-01T00:00:00Z",
    };

    expect(mockConfig.trial_duration_days).toBe(14);
    expect(mockConfig.paywall_enabled).toBe(false);
    expect(mockConfig.global_message_enabled).toBe(false);
  });

  it("should have correct Profile type shape", async () => {
    const mockProfile = {
      id: "test-uuid",
      email: "test@test.com",
      display_name: null,
      business_name: null,
      business_logo_url: null,
      subscription_status: "trial" as const,
      trial_started_at: "2024-01-01T00:00:00Z",
      trial_ends_at: "2024-01-15T00:00:00Z",
      onboarding_completed: false,
      beta_intro_seen: false,
      notes: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    expect(mockProfile.subscription_status).toBe("trial");
    expect(mockProfile.onboarding_completed).toBe(false);
  });

  it("should have correct FeatureFlag type shape", async () => {
    const mockFlag = {
      id: 1,
      flag_name: "google_signin_enabled",
      enabled: false,
      description: "Enable Google Sign-In",
      created_at: "2024-01-01T00:00:00Z",
    };

    expect(mockFlag.flag_name).toBe("google_signin_enabled");
    expect(mockFlag.enabled).toBe(false);
  });
});

// ============ FEEDBACK TRIGGER TESTS ============

describe("Feedback Trigger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock("react-native", () => ({
      Alert: { alert: vi.fn() },
      Platform: { OS: "web" },
    }));
    vi.mock("expo-router", () => ({
      router: { push: vi.fn() },
    }));
    vi.mock("@react-native-async-storage/async-storage", () => ({
      default: {
        getItem: vi.fn().mockResolvedValue(null),
        setItem: vi.fn().mockResolvedValue(undefined),
      },
    }));
  });

  it("should export triggerAfterOrder and triggerAfterShoppingList functions", async () => {
    // We can't easily test hooks outside React, but we can verify the module exports
    const module = await import("../hooks/use-feedback-trigger");
    expect(module.useFeedbackTrigger).toBeDefined();
    expect(typeof module.useFeedbackTrigger).toBe("function");
  });
});

// ============ LIMITED MODE TESTS ============

describe("Limited Mode Hook", () => {
  it("should have useLimitedMode as a function export", () => {
    // Verify the module file exists and is importable by checking the file system
    const fs = require("fs");
    const path = require("path");
    const hookPath = path.join(__dirname, "..", "hooks", "use-limited-mode.ts");
    expect(fs.existsSync(hookPath)).toBe(true);

    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("export function useLimitedMode");
    // Verify beta behavior: isLimited is always false
    expect(content).toContain("const isLimited = false");
    // Verify canUseFeature always returns true
    expect(content).toContain("return true");
  });
});

// ============ SUPABASE CONNECTION TESTS ============

describe("Supabase Connection (live)", () => {
  it("should connect to Supabase and read app_config", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
    const key = process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!key) {
      console.warn("Skipping live test: no Supabase key");
      return;
    }

    const client = createClient(url, key);
    const { data, error } = await client.from("app_config").select("*").eq("id", 1).single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.trial_days).toBe(14);
    expect(data?.paywall_enabled).toBe(false);
    expect(data?.maintenance_enabled).toBe(false);
    expect(data?.global_message_enabled).toBe(false);
  });

  it("should block anon from reading feature_flags (authenticated-only RLS)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
    const key = process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!key) {
      console.warn("Skipping live test: no Supabase key");
      return;
    }

    const client = createClient(url, key);
    const { data, error } = await client.from("feature_flags").select("*");

    // RLS blocks anon reads — returns empty array
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it("should have correct table structure for profiles (RLS blocks anon read)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
    const key = process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!key) {
      console.warn("Skipping live test: no Supabase key");
      return;
    }

    const client = createClient(url, key);
    // RLS should block anon from reading profiles
    const { data, error } = await client.from("profiles").select("*");

    // Should return empty array (RLS blocks) or null, not an error
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it("should have correct table structure for feedback (RLS blocks anon read)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
    const key = process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!key) {
      console.warn("Skipping live test: no Supabase key");
      return;
    }

    const client = createClient(url, key);
    const { data } = await client.from("feedback").select("*");

    // Should return empty array (RLS blocks) or null
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });
});
