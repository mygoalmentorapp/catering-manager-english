import { describe, it, expect } from "vitest";

describe("MASTER_USER_ID environment variable", () => {
  it("should be set and be a valid UUID", () => {
    const masterUserId = process.env.MASTER_USER_ID;
    expect(masterUserId).toBeDefined();
    expect(masterUserId).not.toBe("");
    // Should be a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(masterUserId).toMatch(uuidRegex);
  });

  it("isOwnerUser should return true for MASTER_USER_ID", async () => {
    const { isOwnerUser } = await import("../server/_core/env");
    const masterUserId = process.env.MASTER_USER_ID!;
    expect(isOwnerUser(masterUserId)).toBe(true);
  });

  it("isOwnerUser should return true for OWNER_OPEN_ID", async () => {
    const { isOwnerUser } = await import("../server/_core/env");
    const ownerOpenId = process.env.OWNER_OPEN_ID!;
    if (ownerOpenId) {
      expect(isOwnerUser(ownerOpenId)).toBe(true);
    }
  });

  it("isOwnerUser should return false for random user", async () => {
    const { isOwnerUser } = await import("../server/_core/env");
    expect(isOwnerUser("random-user-id-12345")).toBe(false);
  });
});
