import { describe, it, expect } from "vitest";

describe("SUPABASE_URL environment variable", () => {
  it("should be set and be a valid HTTPS URL", () => {
    const url = process.env.SUPABASE_URL;
    expect(url).toBeDefined();
    expect(url).not.toBe("");
    expect(url).toMatch(/^https:\/\/.+\.supabase\.co$/);
  });

  it("should be reachable (health check)", async () => {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("SUPABASE_URL not set");

    const resp = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
      },
    });
    // 401 or 200 means the REST API is reachable (401 = auth required but server is up)
    expect([200, 401]).toContain(resp.status);
  });
});
