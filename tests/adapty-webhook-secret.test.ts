/**
 * Validates that ADAPTY_WEBHOOK_SECRET is configured correctly.
 */
import { describe, it, expect } from "vitest";

describe("ADAPTY_WEBHOOK_SECRET validation", () => {
  it("ADAPTY_WEBHOOK_SECRET is set in environment", () => {
    const secret = process.env.ADAPTY_WEBHOOK_SECRET;
    expect(secret).toBeDefined();
    expect(secret).not.toBe("");
    expect(secret!.length).toBeGreaterThan(10);
  });

  it("ADAPTY_WEBHOOK_SECRET matches expected value", () => {
    const secret = process.env.ADAPTY_WEBHOOK_SECRET;
    expect(secret).toBe("cater-webhook-2026-secure-key");
  });

  it("ADAPTY_WEBHOOK_SECRET is not exposed as EXPO_PUBLIC_", () => {
    // Ensure the webhook secret is NOT available as a public env var
    expect(process.env.EXPO_PUBLIC_ADAPTY_WEBHOOK_SECRET).toBeUndefined();
  });
});
