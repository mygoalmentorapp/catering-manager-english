import { describe, it, expect } from "vitest";

describe("Secrets Validation", () => {
  it("should have RESEND_API_KEY set", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("re_")).toBe(true);
  });

  it("should validate Resend API key by calling API", async () => {
    const key = process.env.RESEND_API_KEY;
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    // 200 = valid key, we just need to confirm it's not 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("should have SUPABASE_SERVICE_ROLE_KEY set", () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("eyJ")).toBe(true);
  });

  it("should validate Supabase service_role key by listing users", async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url).toBeDefined();
    expect(key).toBeDefined();

    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key!,
      },
    });
    // 200 = valid service_role key with admin access
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("users");
  });
});
