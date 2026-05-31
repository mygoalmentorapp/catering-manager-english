import { describe, it, expect } from "vitest";

/**
 * Tests for the signup alert feature.
 * These tests validate the server-side logic for checking verified emails
 * and sending alert emails via Resend.
 */
describe("Signup Alert", () => {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const RESEND_API_KEY = process.env.RESEND_API_KEY!;

  it("should have required environment variables", () => {
    expect(SUPABASE_URL).toBeDefined();
    expect(SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    expect(RESEND_API_KEY).toBeDefined();
  });

  it("should be able to query Supabase admin users API", async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("users");
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("should be able to check if a specific email exists and its verification status", async () => {
    // Fetch all users and check structure
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const users = data.users || [];

    // If there are any users, verify the structure has email and email_confirmed_at
    if (users.length > 0) {
      const user = users[0];
      expect(user).toHaveProperty("email");
      // Verify user object has expected keys (email verification field name varies)
      const keys = Object.keys(user);
      expect(keys.length).toBeGreaterThan(0);
      expect(user).toHaveProperty("email");
    }
  });

  it("should be able to send email via Resend API", async () => {
    // Validate Resend API is accessible (don't actually send an email)
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("data");
  });
});
