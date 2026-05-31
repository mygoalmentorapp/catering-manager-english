import { describe, it, expect } from "vitest";

describe("Cloudflare API Token", () => {
  it("should be valid and authenticate successfully", async () => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);

    const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json() as any;
    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.result.status).toBe("active");
  });
});
