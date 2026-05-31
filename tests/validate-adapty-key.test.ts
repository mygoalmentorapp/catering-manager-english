import { describe, it, expect } from "vitest";

describe("EXPO_PUBLIC_ADAPTY_KEY", () => {
  it("should be set and have valid format (public_live_xxx)", () => {
    const key = process.env.EXPO_PUBLIC_ADAPTY_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    // Adapty public keys start with "public_live_" or "public_test_"
    expect(key).toMatch(/^public_(live|test)_/);
    // Should have reasonable length (at least 20 chars total)
    expect(key!.length).toBeGreaterThan(20);
  });
});
