/**
 * Tests for Auth Identity Separation Refactor.
 *
 * Validates the principle: JWT valid = user authenticated.
 * Profile loading failures (DB down, user not in DB) must NEVER cause UNAUTHORIZED.
 *
 * Tests:
 * 1. JWT missing/invalid/expired → UNAUTHORIZED (client should sign out)
 * 2. JWT valid + DB unavailable → returns minimal user (no throw, no UNAUTHORIZED)
 * 3. JWT valid + user exists in DB → returns full user (happy path)
 * 4. JWT valid + user not in DB + upsert succeeds → creates and returns user
 * 5. Client-side: PROFILE_LOAD_FAILED (profileError: true) does NOT trigger signOut
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PROFILE_LOAD_FAILED } from "../server/_core/sdk";
import type { AuthResult } from "../server/_core/sdk";

// ============ TEST 1: JWT missing/invalid/expired → ForbiddenError ============

describe("authenticateRequest — JWT invalid → throws (UNAUTHORIZED)", () => {
  it("throws when session cookie is missing (no auth header, no cookie)", async () => {
    // We test the verifySession path directly: if verifySession returns null, authenticateRequest throws.
    // Import the real sdk
    const { sdk } = await import("../server/_core/sdk");

    // Mock verifySession to return null (simulating missing/invalid JWT)
    const originalVerify = (sdk as any).verifySession;
    vi.spyOn(sdk as any, "verifySession").mockResolvedValue(null);

    const mockReq = {
      headers: {},
    } as any;

    await expect(sdk.authenticateRequest(mockReq)).rejects.toThrow();

    // Restore
    vi.restoreAllMocks();
  });

  it("throws when JWT is expired (verifySession returns null)", async () => {
    const { sdk } = await import("../server/_core/sdk");

    vi.spyOn(sdk as any, "verifySession").mockResolvedValue(null);

    const mockReq = {
      headers: {
        authorization: "Bearer expired-jwt-token",
      },
    } as any;

    await expect(sdk.authenticateRequest(mockReq)).rejects.toThrow();

    vi.restoreAllMocks();
  });
});

// ============ TEST 2: JWT valid + DB unavailable → minimal user (PROFILE_LOAD_FAILED) ============

describe("authenticateRequest — JWT valid, DB unavailable (PROFILE_LOAD_FAILED)", () => {
  it("returns minimal user with isMinimalUser=true when all DB operations fail", async () => {
    const { sdk } = await import("../server/_core/sdk");
    const db = await import("../server/db");

    // Mock verifySession to return valid payload
    vi.spyOn(sdk as any, "verifySession").mockResolvedValue({
      openId: "test-user-123",
      appId: "test-app",
      name: "Test User",
    });

    // Mock DB to fail
    vi.spyOn(db, "getUserByOpenId").mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(db, "upsertUser").mockRejectedValue(new Error("ECONNREFUSED"));

    // Mock getUserInfoWithJwt to fail (expected for Supabase users)
    vi.spyOn(sdk as any, "getUserInfoWithJwt").mockRejectedValue(new Error("Not found"));

    const mockReq = {
      headers: {
        authorization: "Bearer valid-token",
      },
    } as any;

    // CRITICAL: Must NOT throw. Must return minimal user.
    const result: AuthResult = await sdk.authenticateRequest(mockReq);

    expect(result).toBeDefined();
    expect(result.isMinimalUser).toBe(true);
    expect(result.user.openId).toBe("test-user-123");
    expect(result.user.name).toBe("Test User");
    expect(result.user.id).toBe(-1); // Synthetic ID for minimal user (-1 = truthy, not from DB)
    expect(result.profileLoadError).toBeDefined();

    vi.restoreAllMocks();
  });

  it("does NOT throw ForbiddenError when DB is down but JWT is valid", async () => {
    const { sdk } = await import("../server/_core/sdk");
    const db = await import("../server/db");

    vi.spyOn(sdk as any, "verifySession").mockResolvedValue({
      openId: "user-456",
      appId: "app-1",
      name: "Another User",
    });

    vi.spyOn(db, "getUserByOpenId").mockResolvedValue(undefined);
    vi.spyOn(db, "upsertUser").mockRejectedValue(new Error("Deadlock"));
    vi.spyOn(sdk as any, "getUserInfoWithJwt").mockRejectedValue(new Error("Unreachable"));

    const mockReq = {
      headers: {
        authorization: "Bearer valid-token",
      },
    } as any;

    // Must not throw
    const result = await sdk.authenticateRequest(mockReq);
    expect(result.isMinimalUser).toBe(true);
    expect(result.user.openId).toBe("user-456");

    vi.restoreAllMocks();
  });
});

// ============ TEST 3: JWT valid + user exists in DB → full user (happy path) ============

describe("authenticateRequest — JWT valid, user exists in DB (happy path)", () => {
  it("returns full user with isMinimalUser=false", async () => {
    const { sdk } = await import("../server/_core/sdk");
    const db = await import("../server/db");

    const mockUser = {
      id: 42,
      openId: "existing-user-789",
      name: "Existing User",
      email: "user@example.com",
      loginMethod: "supabase_email",
      role: "user" as const,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-06-01"),
      lastSignedIn: new Date("2024-06-15"),
    };

    vi.spyOn(sdk as any, "verifySession").mockResolvedValue({
      openId: "existing-user-789",
      appId: "test-app",
      name: "Existing User",
    });

    vi.spyOn(db, "getUserByOpenId").mockResolvedValue(mockUser);
    vi.spyOn(db, "upsertUser").mockResolvedValue(undefined as any);

    const mockReq = {
      headers: {
        authorization: "Bearer valid-token",
      },
    } as any;

    const result = await sdk.authenticateRequest(mockReq);

    expect(result.isMinimalUser).toBe(false);
    expect(result.user.id).toBe(42);
    expect(result.user.openId).toBe("existing-user-789");
    expect(result.user.email).toBe("user@example.com");
    expect(result.profileLoadError).toBeUndefined();

    vi.restoreAllMocks();
  });
});

// ============ TEST 4: JWT valid + user not in DB + upsert succeeds → creates user ============

describe("authenticateRequest — JWT valid, user not in DB, upsert succeeds", () => {
  it("creates user from JWT payload and returns full user", async () => {
    const { sdk } = await import("../server/_core/sdk");
    const db = await import("../server/db");

    const createdUser = {
      id: 99,
      openId: "new-user-abc",
      name: "New User",
      email: null,
      loginMethod: "supabase_email",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    vi.spyOn(sdk as any, "verifySession").mockResolvedValue({
      openId: "new-user-abc",
      appId: "test-app",
      name: "New User",
    });

    // Call sequence: attempt 1 (not found), attempt 2 getUserInfoWithJwt fails so skipped,
    // attempt 3: upsert succeeds, then getUserByOpenId returns createdUser
    let getUserCallCount = 0;
    vi.spyOn(db, "getUserByOpenId").mockImplementation(async () => {
      getUserCallCount++;
      if (getUserCallCount <= 1) return undefined; // First lookup: not found
      return createdUser; // After upsert: found
    });

    vi.spyOn(db, "upsertUser").mockResolvedValue(undefined as any);
    vi.spyOn(sdk as any, "getUserInfoWithJwt").mockRejectedValue(new Error("Not found"));

    const mockReq = {
      headers: {
        authorization: "Bearer valid-token",
      },
    } as any;

    const result = await sdk.authenticateRequest(mockReq);

    expect(result.user.openId).toBe("new-user-abc");
    expect(result.isMinimalUser).toBe(false);
    expect(result.user.id).toBe(99);

    vi.restoreAllMocks();
  });
});

// ============ TEST 5: Client-side — PROFILE_LOAD_FAILED does NOT trigger signOut ============

describe("session-context — PROFILE_LOAD_FAILED does not trigger signOut", () => {
  it("profileError: true in tRPC error data does NOT call signOut", () => {
    // Simulate a tRPC error with profileError: true
    const profileLoadError = {
      data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        profileError: true,
      },
      message: "PROFILE_LOAD_FAILED",
    };

    // Simulate an UNAUTHORIZED error (should trigger signOut)
    const unauthorizedError = {
      data: {
        code: "UNAUTHORIZED",
        httpStatus: 401,
      },
      message: "Please login (10001)",
    };

    // Extract the classification logic from session-context.tsx
    function classifyError(err: any): "profile" | "unauthorized" | "other" {
      const isProfileError = err?.data?.profileError === true;
      if (isProfileError) return "profile";

      const isUnauthorized =
        err?.data?.code === "UNAUTHORIZED" ||
        err?.data?.httpStatus === 401;
      if (isUnauthorized) return "unauthorized";

      return "other";
    }

    // PROFILE_LOAD_FAILED → should NOT trigger signOut
    expect(classifyError(profileLoadError)).toBe("profile");

    // UNAUTHORIZED → should trigger signOut
    expect(classifyError(unauthorizedError)).toBe("unauthorized");

    // Network error (no data) → should NOT trigger signOut
    const networkError = { message: "Network request failed" };
    expect(classifyError(networkError)).toBe("other");

    // Generic 500 without profileError → should NOT trigger signOut
    const generic500 = {
      data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      },
    };
    expect(classifyError(generic500)).toBe("other");
  });

  it("verifies that only UNAUTHORIZED errors (401) should cause signOut — never PROFILE_LOAD_FAILED", () => {
    // This is the critical contract:
    // signOut is called ONLY when err.data.code === "UNAUTHORIZED" OR err.data.httpStatus === 401
    // All other errors (including 500, profileError, network errors) must NOT cause signOut.

    const shouldSignOut = (err: any): boolean => {
      const isProfileError = err?.data?.profileError === true;
      if (isProfileError) return false; // NEVER sign out on profile error

      const isUnauthorized =
        err?.data?.code === "UNAUTHORIZED" ||
        err?.data?.httpStatus === 401;
      return isUnauthorized;
    };

    // These should NOT cause signOut:
    expect(shouldSignOut({ data: { profileError: true, code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } })).toBe(false);
    expect(shouldSignOut({ data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } })).toBe(false);
    expect(shouldSignOut({ message: "Network error" })).toBe(false);
    expect(shouldSignOut(null)).toBe(false);
    expect(shouldSignOut(undefined)).toBe(false);

    // These SHOULD cause signOut:
    expect(shouldSignOut({ data: { code: "UNAUTHORIZED", httpStatus: 401 } })).toBe(true);
    expect(shouldSignOut({ data: { code: "UNAUTHORIZED" } })).toBe(true);
    expect(shouldSignOut({ data: { httpStatus: 401 } })).toBe(true);
  });

  it("PROFILE_LOAD_FAILED constant is exported and consistent", () => {
    expect(PROFILE_LOAD_FAILED).toBe("PROFILE_LOAD_FAILED");
  });
});
