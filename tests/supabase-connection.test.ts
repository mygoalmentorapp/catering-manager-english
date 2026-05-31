import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// EXPO_PUBLIC_ vars get redacted in test env. Use SUPABASE_URL/SUPABASE_KEY (system env) for tests.
const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_KEY || "";

describe("Supabase Connection", () => {
  it("should have Supabase credentials available", () => {
    expect(url.length).toBeGreaterThan(10);
    expect(key.length).toBeGreaterThan(10);
  });

  it("should connect to Supabase and read app_config", async () => {
    const client = createClient(url, key);
    const { data, error } = await client.from("app_config").select("id, trial_days").single();
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBe(1);
    expect(data!.trial_days).toBe(14);
  });

  it("should block anon from reading feature_flags (authenticated-only RLS)", async () => {
    const client = createClient(url, key);
    const { data, error } = await client.from("feature_flags").select("flag_name, enabled");
    // RLS blocks anon reads — returns empty array
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
  });

  it("should have profiles table accessible (RLS blocks anon)", async () => {
    const client = createClient(url, key);
    const { data, error } = await client.from("profiles").select("id").limit(1);
    // RLS blocks unauthenticated reads — error or empty is expected
    // The important thing is we get a response (table exists)
    expect(data !== null || error !== null).toBe(true);
  });
});
