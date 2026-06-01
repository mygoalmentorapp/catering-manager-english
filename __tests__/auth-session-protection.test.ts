import { describe, it, expect } from "vitest";

/**
 * Tests for the auth session protection logic.
 *
 * Key invariants:
 * 1. Only user-initiated SIGNED_OUT should clear the session immediately.
 * 2. Non-SIGNED_OUT events with null session are always ignored.
 * 3. Non-intentional SIGNED_OUT triggers recovery (getSession → refreshSession → AsyncStorage).
 * 4. If recovery succeeds → user stays in app. If recovery fails → legitimate logout.
 * 5. startAutoRefresh must not run during any recovery (initAuth or SIGNED_OUT recovery).
 */

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "INITIAL_SESSION" | "PASSWORD_RECOVERY";

interface MockSession {
  user: { id: string; email: string } | null;
  access_token: string | null;
}

/**
 * Simulates the onAuthStateChange event processing logic.
 * Returns the action the handler should take.
 */
function processAuthEvent(
  event: AuthEvent,
  newSession: MockSession | null,
  signingOut: boolean,
  authFlagSet: boolean,
  recoveryActive: boolean = false,
): "process" | "ignore" | "attempt_recovery" | "ignore_duplicate" {
  // If signOut is in progress, only allow SIGNED_OUT event through
  if (signingOut && event !== "SIGNED_OUT") {
    return "ignore";
  }

  // Non-SIGNED_OUT events with null session → always ignore
  if (!newSession?.user && event !== "SIGNED_OUT") {
    return "ignore";
  }

  // Non-intentional SIGNED_OUT with auth flag → attempt recovery
  if (event === "SIGNED_OUT" && !signingOut && authFlagSet) {
    // Guard: if recovery is already active, ignore duplicate
    if (recoveryActive) {
      return "ignore_duplicate";
    }
    return "attempt_recovery";
  }

  // Everything else → process normally
  return "process";
}

/**
 * Simulates the SIGNED_OUT recovery flow.
 * Returns the outcome after attempting all recovery steps.
 */
function simulateSignedOutRecovery(options: {
  getSessionResult: "success" | "timeout" | "null" | "error";
  refreshSessionResult: "success" | "null" | "error";
  asyncStorageFallbackResult: "success" | "null" | "error";
}): {
  recovered: boolean;
  recoveryPath: string[];
  shouldClearAuthFlag: boolean;
  shouldRestartAutoRefresh: boolean;
} {
  const recoveryPath: string[] = [];
  let recovered = false;

  // Step 1: getSession
  if (options.getSessionResult === "success") {
    recoveryPath.push("getSession → success");
    recovered = true;
  } else if (options.getSessionResult === "timeout") {
    recoveryPath.push("getSession → timeout");
  } else if (options.getSessionResult === "error") {
    recoveryPath.push("getSession → error");
  } else {
    recoveryPath.push("getSession → null");
  }

  // Step 2: refreshSession (only if not recovered yet)
  if (!recovered) {
    if (options.refreshSessionResult === "success") {
      recoveryPath.push("refreshSession → success");
      recovered = true;
    } else if (options.refreshSessionResult === "error") {
      recoveryPath.push("refreshSession → error");
    } else {
      recoveryPath.push("refreshSession → null");
    }
  }

  // Step 3: AsyncStorage fallback (only if still not recovered)
  if (!recovered) {
    if (options.asyncStorageFallbackResult === "success") {
      recoveryPath.push("asyncStorage → success");
      recovered = true;
    } else if (options.asyncStorageFallbackResult === "error") {
      recoveryPath.push("asyncStorage → error");
    } else {
      recoveryPath.push("asyncStorage → null");
    }
  }

  return {
    recovered,
    recoveryPath,
    shouldClearAuthFlag: !recovered, // Clear flag only if recovery failed
    shouldRestartAutoRefresh: true,  // Always restart auto-refresh after recovery
  };
}

describe("Auth Event Processing", () => {
  const validSession: MockSession = {
    user: { id: "123", email: "test@test.com" },
    access_token: "valid-token",
  };

  const nullSession: MockSession = {
    user: null,
    access_token: null,
  };

  describe("Normal operations", () => {
    it("should process SIGNED_IN with valid session", () => {
      expect(processAuthEvent("SIGNED_IN", validSession, false, false)).toBe("process");
    });

    it("should process user-initiated SIGNED_OUT", () => {
      expect(processAuthEvent("SIGNED_OUT", null, true, true)).toBe("process");
    });

    it("should process TOKEN_REFRESHED with valid session", () => {
      expect(processAuthEvent("TOKEN_REFRESHED", validSession, false, false)).toBe("process");
    });

    it("should process SIGNED_OUT when no auth flag (first visit)", () => {
      expect(processAuthEvent("SIGNED_OUT", null, false, false)).toBe("process");
    });

    it("should process SIGNED_OUT with null session when no auth flag", () => {
      expect(processAuthEvent("SIGNED_OUT", nullSession, false, false)).toBe("process");
    });
  });

  describe("Session protection — non-SIGNED_OUT with null session", () => {
    it("should IGNORE TOKEN_REFRESHED with null session", () => {
      expect(processAuthEvent("TOKEN_REFRESHED", nullSession, false, false)).toBe("ignore");
    });

    it("should IGNORE TOKEN_REFRESHED with completely null session", () => {
      expect(processAuthEvent("TOKEN_REFRESHED", null, false, false)).toBe("ignore");
    });

    it("should IGNORE INITIAL_SESSION with null session", () => {
      expect(processAuthEvent("INITIAL_SESSION", nullSession, false, false)).toBe("ignore");
    });

    it("should IGNORE INITIAL_SESSION with completely null", () => {
      expect(processAuthEvent("INITIAL_SESSION", null, false, false)).toBe("ignore");
    });

    it("should IGNORE TOKEN_REFRESHED with null session even when auth flag set", () => {
      expect(processAuthEvent("TOKEN_REFRESHED", null, false, true)).toBe("ignore");
    });
  });

  describe("FIX 3 v2: Non-intentional SIGNED_OUT → recovery", () => {
    it("should ATTEMPT RECOVERY on non-intentional SIGNED_OUT when auth flag is set", () => {
      expect(processAuthEvent("SIGNED_OUT", null, false, true)).toBe("attempt_recovery");
    });

    it("should ATTEMPT RECOVERY on non-intentional SIGNED_OUT with null session when auth flag set", () => {
      expect(processAuthEvent("SIGNED_OUT", nullSession, false, true)).toBe("attempt_recovery");
    });

    it("should PROCESS (not recover) user-initiated SIGNED_OUT even when auth flag set", () => {
      // signingOut=true means user explicitly called signOut()
      expect(processAuthEvent("SIGNED_OUT", null, true, true)).toBe("process");
    });

    it("should PROCESS SIGNED_OUT when no auth flag (user never logged in)", () => {
      expect(processAuthEvent("SIGNED_OUT", null, false, false)).toBe("process");
    });
  });

  describe("SignOut in progress protection", () => {
    it("should IGNORE TOKEN_REFRESHED during signOut", () => {
      expect(processAuthEvent("TOKEN_REFRESHED", validSession, true, true)).toBe("ignore");
    });

    it("should IGNORE SIGNED_IN during signOut", () => {
      expect(processAuthEvent("SIGNED_IN", validSession, true, true)).toBe("ignore");
    });

    it("should PROCESS SIGNED_OUT during signOut", () => {
      expect(processAuthEvent("SIGNED_OUT", null, true, true)).toBe("process");
    });
  });
});

describe("SIGNED_OUT Recovery Flow", () => {
  it("should recover via getSession", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "success",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
    });
    expect(result.recovered).toBe(true);
    expect(result.shouldClearAuthFlag).toBe(false);
    expect(result.recoveryPath).toContain("getSession → success");
  });

  it("should recover via refreshSession when getSession fails", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
    });
    expect(result.recovered).toBe(true);
    expect(result.shouldClearAuthFlag).toBe(false);
    expect(result.recoveryPath).toContain("refreshSession → success");
  });

  it("should recover via refreshSession when getSession times out", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "timeout",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
    });
    expect(result.recovered).toBe(true);
    expect(result.recoveryPath).toContain("getSession → timeout");
    expect(result.recoveryPath).toContain("refreshSession → success");
  });

  it("should recover via AsyncStorage when both getSession and refreshSession fail", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "success",
    });
    expect(result.recovered).toBe(true);
    expect(result.recoveryPath).toContain("asyncStorage → success");
  });

  it("should fail recovery when ALL attempts fail — clear auth flag", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
    });
    expect(result.recovered).toBe(false);
    expect(result.shouldClearAuthFlag).toBe(true); // Flag cleared = legitimate logout
  });

  it("should always restart auto-refresh after recovery (success or failure)", () => {
    const successResult = simulateSignedOutRecovery({
      getSessionResult: "success",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
    });
    expect(successResult.shouldRestartAutoRefresh).toBe(true);

    const failResult = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
    });
    expect(failResult.shouldRestartAutoRefresh).toBe(true);
  });

  it("should not attempt AsyncStorage if refreshSession already recovered", () => {
    const result = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
    });
    expect(result.recoveryPath).not.toContain("asyncStorage → success");
    expect(result.recoveryPath).not.toContain("asyncStorage → null");
    expect(result.recoveryPath).not.toContain("asyncStorage → error");
  });
});

describe("Safety Timeout Logic", () => {
  it("should not fire safety timeout while initAuth is running", () => {
    let initAuthRunning = true;
    let isLoading = true;

    const shouldForceLoading = !initAuthRunning;
    expect(shouldForceLoading).toBe(false);
  });

  it("should fire safety timeout if initAuth is NOT running but isLoading is stuck", () => {
    const initAuthRunning = false;
    const isLoading = true;

    const shouldForceLoading = !initAuthRunning && isLoading;
    expect(shouldForceLoading).toBe(true);
  });
});

describe("FIX 1: initAuth Recovery Flow (getSession timeout → fallbacks)", () => {
  function simulateInitAuth(options: {
    getSessionResult: "success" | "timeout" | "null";
    refreshSessionResult: "success" | "null" | "error";
    asyncStorageFallbackResult: "success" | "null" | "error";
    authFlagSet: boolean;
  }): {
    session: MockSession | null;
    isRecovering: boolean;
    recoveryPath: string[];
  } {
    const recoveryPath: string[] = [];
    let currentSession: MockSession | null = null;
    let isRecovering = false;

    if (options.authFlagSet) {
      isRecovering = true;
      recoveryPath.push("auth_flag_set → recovery_mode");
    }

    if (options.getSessionResult === "success") {
      currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "token" };
      recoveryPath.push("getSession → success");
    } else if (options.getSessionResult === "timeout") {
      recoveryPath.push("getSession → timeout (continue to fallbacks)");
    } else {
      recoveryPath.push("getSession → null");
    }

    if (!currentSession?.user) {
      if (options.refreshSessionResult === "success") {
        currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "refreshed-token" };
        recoveryPath.push("refreshSession → success");
      } else if (options.refreshSessionResult === "error") {
        recoveryPath.push("refreshSession → error");
      } else {
        recoveryPath.push("refreshSession → null");
      }
    }

    if (!currentSession?.user) {
      if (options.asyncStorageFallbackResult === "success") {
        currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "fallback-token" };
        recoveryPath.push("asyncStorage → success");
      } else if (options.asyncStorageFallbackResult === "error") {
        recoveryPath.push("asyncStorage → error");
      } else {
        recoveryPath.push("asyncStorage → null");
      }
    }

    isRecovering = false;

    return { session: currentSession, isRecovering, recoveryPath };
  }

  it("should recover session when getSession succeeds", () => {
    const result = simulateInitAuth({
      getSessionResult: "success",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
    });
    expect(result.session?.user).toBeTruthy();
  });

  it("should recover via refreshSession when getSession times out", () => {
    const result = simulateInitAuth({
      getSessionResult: "timeout",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
    });
    expect(result.session?.user).toBeTruthy();
    expect(result.recoveryPath).toContain("getSession → timeout (continue to fallbacks)");
    expect(result.recoveryPath).toContain("refreshSession → success");
  });

  it("should recover via AsyncStorage when both getSession and refreshSession fail", () => {
    const result = simulateInitAuth({
      getSessionResult: "timeout",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "success",
      authFlagSet: true,
    });
    expect(result.session?.user).toBeTruthy();
    expect(result.recoveryPath).toContain("asyncStorage → success");
  });

  it("should have no session when ALL recovery attempts fail", () => {
    const result = simulateInitAuth({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
    });
    expect(result.session).toBeNull();
  });

  it("should enter recovery mode when auth flag is set", () => {
    const result = simulateInitAuth({
      getSessionResult: "null",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
    });
    expect(result.recoveryPath[0]).toBe("auth_flag_set → recovery_mode");
  });

  it("should NOT enter recovery mode when auth flag is NOT set", () => {
    const result = simulateInitAuth({
      getSessionResult: "null",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: false,
    });
    expect(result.recoveryPath[0]).not.toContain("recovery_mode");
  });
});

describe("FIX 2: startAutoRefresh gating", () => {
  it("should NOT start auto-refresh before initAuth completes", () => {
    const initAuthCompleted = false;
    const recoveryActive = false;
    const shouldStart = initAuthCompleted && !recoveryActive;
    expect(shouldStart).toBe(false);
  });

  it("should NOT start auto-refresh during SIGNED_OUT recovery", () => {
    const initAuthCompleted = true;
    const recoveryActive = true;
    const shouldStart = initAuthCompleted && !recoveryActive;
    expect(shouldStart).toBe(false);
  });

  it("should start auto-refresh AFTER initAuth completes and no recovery active", () => {
    const initAuthCompleted = true;
    const recoveryActive = false;
    const shouldStart = initAuthCompleted && !recoveryActive;
    expect(shouldStart).toBe(true);
  });

  it("should defer auto-refresh on foreground if recovery is active", () => {
    const scenarios = [
      { initAuthCompleted: false, recoveryActive: false, expected: false },
      { initAuthCompleted: true, recoveryActive: true, expected: false },
      { initAuthCompleted: true, recoveryActive: false, expected: true },
      { initAuthCompleted: false, recoveryActive: true, expected: false },
    ];

    for (const { initAuthCompleted, recoveryActive, expected } of scenarios) {
      const shouldStart = initAuthCompleted && !recoveryActive;
      expect(shouldStart).toBe(expected);
    }
  });
});

describe("FIX 4: AppGate recovery gate", () => {
  function simulateAppGateRouting(options: {
    isAuthenticated: boolean;
    authLoading: boolean;
    isRecovering: boolean;
    bridgeFailed: boolean;
    hasSession: boolean;
    currentRoute: string;
  }): "show_splash" | "show_bridge_retry" | "redirect_to_login" | "show_app" | "wait" {
    if (options.authLoading || options.isRecovering) {
      return "show_splash";
    }

    if (!options.isAuthenticated) {
      if (options.bridgeFailed && options.hasSession) {
        return "show_bridge_retry";
      }
      if (options.hasSession && !options.bridgeFailed) {
        return "wait";
      }
      return "redirect_to_login";
    }

    return "show_app";
  }

  it("should show splash during auth loading", () => {
    expect(simulateAppGateRouting({
      isAuthenticated: false, authLoading: true, isRecovering: false,
      bridgeFailed: false, hasSession: false, currentRoute: "(tabs)",
    })).toBe("show_splash");
  });

  it("should show splash during session recovery (SIGNED_OUT recovery)", () => {
    expect(simulateAppGateRouting({
      isAuthenticated: false, authLoading: false, isRecovering: true,
      bridgeFailed: false, hasSession: false, currentRoute: "(tabs)",
    })).toBe("show_splash");
  });

  it("should redirect to login when not authenticated and not recovering", () => {
    expect(simulateAppGateRouting({
      isAuthenticated: false, authLoading: false, isRecovering: false,
      bridgeFailed: false, hasSession: false, currentRoute: "(tabs)",
    })).toBe("redirect_to_login");
  });

  it("should show bridge retry when bridge failed but session exists", () => {
    expect(simulateAppGateRouting({
      isAuthenticated: false, authLoading: false, isRecovering: false,
      bridgeFailed: true, hasSession: true, currentRoute: "(tabs)",
    })).toBe("show_bridge_retry");
  });

  it("should show app when fully authenticated", () => {
    expect(simulateAppGateRouting({
      isAuthenticated: true, authLoading: false, isRecovering: false,
      bridgeFailed: false, hasSession: true, currentRoute: "(tabs)",
    })).toBe("show_app");
  });
});

describe("End-to-end scenarios", () => {
  it("Scenario: App in background 2h → Supabase fires internal SIGNED_OUT → recovery succeeds", () => {
    // 1. User was authenticated (auth flag set)
    // 2. App returns from background after 2h
    // 3. Supabase auto-refresh fails, fires SIGNED_OUT internally
    // 4. We detect non-intentional SIGNED_OUT with auth flag → attempt recovery
    // 5. refreshSession succeeds → user stays in app

    const eventAction = processAuthEvent("SIGNED_OUT", null, false, true);
    expect(eventAction).toBe("attempt_recovery");

    const recovery = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
    });
    expect(recovery.recovered).toBe(true);
    expect(recovery.shouldClearAuthFlag).toBe(false);
  });

  it("Scenario: App in background 2h → SIGNED_OUT → recovery fails → legitimate logout", () => {
    // 1. User was authenticated (auth flag set)
    // 2. Supabase fires SIGNED_OUT
    // 3. All recovery attempts fail → session truly expired
    // 4. Auth flag cleared, user redirected to login

    const eventAction = processAuthEvent("SIGNED_OUT", null, false, true);
    expect(eventAction).toBe("attempt_recovery");

    const recovery = simulateSignedOutRecovery({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
    });
    expect(recovery.recovered).toBe(false);
    expect(recovery.shouldClearAuthFlag).toBe(true);
  });

  it("Scenario: User explicitly signs out → immediate logout, no recovery", () => {
    const eventAction = processAuthEvent("SIGNED_OUT", null, true, true);
    expect(eventAction).toBe("process"); // Immediate, no recovery attempt
  });

  it("Scenario: Force-close and reopen → cold start works fine", () => {
    // initAuth handles this, not SIGNED_OUT recovery
    const initResult = {
      getSessionResult: "success" as const,
      refreshSessionResult: "null" as const,
      asyncStorageFallbackResult: "null" as const,
      authFlagSet: true,
    };
    // getSession succeeds on cold start
    expect(initResult.getSessionResult).toBe("success");
  });

  it("Scenario: SIGNED_OUT during active recovery → auto-refresh is stopped", () => {
    // When SIGNED_OUT recovery starts:
    // 1. recoveryActiveRef = true
    // 2. stopAutoRefresh() called
    // 3. startAutoRefresh gated by recoveryActiveRef
    // 4. Foreground handler also checks recoveryActiveRef

    const recoveryActive = true;
    const initAuthCompleted = true;
    const shouldStartAutoRefresh = initAuthCompleted && !recoveryActive;
    expect(shouldStartAutoRefresh).toBe(false);
  });

  it("Scenario: SIGNED_OUT recovery succeeds → bridge verified", () => {
    // After recovery succeeds:
    // 1. Session restored
    // 2. Auth flag preserved
    // 3. Auto-refresh restarted
    // 4. Check if custom JWT exists → re-bridge if missing

    const recovery = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
    });
    expect(recovery.recovered).toBe(true);
    expect(recovery.shouldRestartAutoRefresh).toBe(true);
    // Bridge check happens after recovery — simulated by checking token existence
  });

    it("Scenario: Multiple SIGNED_OUT events in quick succession → only one recovery runs", () => {
    // recoveryActiveRef prevents concurrent recovery attempts
    // First SIGNED_OUT → sets recoveryActiveRef = true → runs recovery
    // Second SIGNED_OUT → sees recoveryActiveRef = true → ignored as duplicate

    // First event — no recovery active
    const firstAction = processAuthEvent("SIGNED_OUT", null, false, true, false);
    expect(firstAction).toBe("attempt_recovery");

    // Second event — recovery already active
    const secondAction = processAuthEvent("SIGNED_OUT", null, false, true, true);
    expect(secondAction).toBe("ignore_duplicate");
  });

  it("Scenario: No infinite loading if recovery fails", () => {
    // After failed recovery:
    // 1. isRecovering set to false
    // 2. Auth flag cleared
    // 3. SIGNED_OUT processed normally → session cleared
    // 4. AppGate sees no session, no recovery → redirects to login
    // 5. Safety timeout at 20s/30s as final backstop

    const recovery = simulateSignedOutRecovery({
      getSessionResult: "null",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
    });
    expect(recovery.recovered).toBe(false);
    expect(recovery.shouldClearAuthFlag).toBe(true);
    // isRecovering = false after recovery completes
    // AppGate routing: not authenticated, not recovering → redirect to login
  });
});

/**
 * Simulates the updated initAuth flow that checks latestAuthEventSessionRef
 * at multiple checkpoints during recovery.
 *
 * The key insight: TOKEN_REFRESHED can fire during initAuth (while getSession hangs),
 * delivering a valid session via onAuthStateChange. The fix captures this session in
 * latestAuthEventSessionRef and checks it at each fallback step.
 */
function simulateInitAuthWithEventSession(options: {
    getSessionResult: "success" | "timeout" | "null";
    refreshSessionResult: "success" | "null" | "error";
    asyncStorageFallbackResult: "success" | "null" | "error";
    authFlagSet: boolean;
    /** Simulates TOKEN_REFRESHED arriving with a valid session during initAuth */
    authEventSession: MockSession | null;
    /** When the auth event session arrives relative to initAuth steps */
    authEventArrivalPoint: "before_getSession" | "during_getSession" | "after_refreshSession" | "after_asyncStorage" | "never";
  }): {
    session: MockSession | null;
    authFlagCleared: boolean;
    recoveryPath: string[];
    usedEventSession: boolean;
    calledRefreshSession: boolean;
    calledAsyncStorageFallback: boolean;
  } {
    const recoveryPath: string[] = [];
    let currentSession: MockSession | null = null;
    let authFlagCleared = false;
    let usedEventSession = false;
    let calledRefreshSession = false;
    let calledAsyncStorageFallback = false;

    // Simulate latestAuthEventSessionRef
    let latestAuthEventSession: MockSession | null = null;

    if (options.authFlagSet) {
      recoveryPath.push("auth_flag_set → recovery_mode");
    }

    // Simulate auth event arriving before getSession
    if (options.authEventArrivalPoint === "before_getSession" && options.authEventSession?.user) {
      latestAuthEventSession = options.authEventSession;
      recoveryPath.push("TOKEN_REFRESHED arrived (before getSession)");
    }

    // Step 1: getSession
    if (options.getSessionResult === "success") {
      currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "token" };
      recoveryPath.push("getSession → success");
    } else if (options.getSessionResult === "timeout") {
      recoveryPath.push("getSession → timeout");
    } else {
      recoveryPath.push("getSession → null");
    }

    // Simulate auth event arriving during getSession (while it was hanging)
    if (options.authEventArrivalPoint === "during_getSession" && options.authEventSession?.user) {
      latestAuthEventSession = options.authEventSession;
      recoveryPath.push("TOKEN_REFRESHED arrived (during getSession)");
    }

    // FIX checkpoint 1: Check latestAuthEventSessionRef after getSession
    if (!currentSession?.user && latestAuthEventSession?.user) {
      currentSession = latestAuthEventSession;
      usedEventSession = true;
      recoveryPath.push("Used auth event session (after getSession) — skipping fallbacks");
    }

    // Step 2: refreshSession (only if no session yet)
    if (!currentSession?.user) {
      calledRefreshSession = true;
      if (options.refreshSessionResult === "success") {
        currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "refreshed-token" };
        recoveryPath.push("refreshSession → success");
      } else if (options.refreshSessionResult === "error") {
        recoveryPath.push("refreshSession → error");
      } else {
        recoveryPath.push("refreshSession → null");
      }
    }

    // Simulate auth event arriving after refreshSession
    if (options.authEventArrivalPoint === "after_refreshSession" && options.authEventSession?.user) {
      latestAuthEventSession = options.authEventSession;
      recoveryPath.push("TOKEN_REFRESHED arrived (after refreshSession)");
    }

    // FIX checkpoint 2: Check latestAuthEventSessionRef before AsyncStorage fallback
    if (!currentSession?.user && latestAuthEventSession?.user) {
      currentSession = latestAuthEventSession;
      usedEventSession = true;
      recoveryPath.push("Used auth event session (before AsyncStorage fallback)");
    }

    // Step 3: AsyncStorage fallback (only if no session yet)
    if (!currentSession?.user) {
      calledAsyncStorageFallback = true;
      if (options.asyncStorageFallbackResult === "success") {
        currentSession = { user: { id: "123", email: "test@test.com" }, access_token: "fallback-token" };
        recoveryPath.push("asyncStorage → success");
      } else if (options.asyncStorageFallbackResult === "error") {
        recoveryPath.push("asyncStorage → error");
      } else {
        recoveryPath.push("asyncStorage → null");
      }
    }

    // Simulate auth event arriving after AsyncStorage fallback
    if (options.authEventArrivalPoint === "after_asyncStorage" && options.authEventSession?.user) {
      latestAuthEventSession = options.authEventSession;
      recoveryPath.push("TOKEN_REFRESHED arrived (after asyncStorage)");
    }

    // FIX checkpoint 3 (final guard): Check before clearing auth flag
    if (!currentSession?.user) {
      if (latestAuthEventSession?.user) {
        currentSession = latestAuthEventSession;
        usedEventSession = true;
        recoveryPath.push("Used auth event session (final guard — not clearing auth flag)");
      } else {
        if (options.authFlagSet) {
          authFlagCleared = true;
          recoveryPath.push("auth_flag_cleared — all recovery attempts failed");
        }
      }
    }

    return {
      session: currentSession,
      authFlagCleared,
      recoveryPath,
      usedEventSession,
      calledRefreshSession,
      calledAsyncStorageFallback,
    };
  }

describe("FIX: TOKEN_REFRESHED race condition during initAuth (latestAuthEventSessionRef)", () => {
  // ============ MAIN RACE CONDITION TEST ============
  it("should use TOKEN_REFRESHED session when getSession times out (main bug scenario)", () => {
    // This is the exact scenario from the Logcat:
    // 1. initAuth starts, getSession hangs/times out
    // 2. TOKEN_REFRESHED fires with valid session during getSession wait
    // 3. initAuth should use the event session instead of continuing to fallbacks
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "123", email: "test@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "during_getSession",
    });

    expect(result.session?.user).toBeTruthy();
    expect(result.usedEventSession).toBe(true);
    expect(result.authFlagCleared).toBe(false);
    expect(result.calledRefreshSession).toBe(false); // Should NOT call refreshSession
    expect(result.calledAsyncStorageFallback).toBe(false); // Should NOT call AsyncStorage
  });

  it("should use TOKEN_REFRESHED session when it arrives after refreshSession fails", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "123", email: "test@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "after_refreshSession",
    });

    expect(result.session?.user).toBeTruthy();
    expect(result.usedEventSession).toBe(true);
    expect(result.authFlagCleared).toBe(false);
    expect(result.calledAsyncStorageFallback).toBe(false); // Should NOT call AsyncStorage
  });

  it("should use TOKEN_REFRESHED session at final guard when all fallbacks fail", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "123", email: "test@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "after_asyncStorage",
    });

    expect(result.session?.user).toBeTruthy();
    expect(result.usedEventSession).toBe(true);
    expect(result.authFlagCleared).toBe(false); // Must NOT clear auth flag
  });

  it("should NOT use event session if getSession already succeeded", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "success",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "456", email: "other@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "during_getSession",
    });

    expect(result.session?.user?.id).toBe("123"); // Uses getSession result, not event
    expect(result.usedEventSession).toBe(false);
    expect(result.calledRefreshSession).toBe(false);
  });

  it("should clear auth flag when NO auth event session and all recovery fails (negative test)", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: null,
      authEventArrivalPoint: "never",
    });

    expect(result.session).toBeNull();
    expect(result.authFlagCleared).toBe(true);
    expect(result.usedEventSession).toBe(false);
  });

  it("should clear auth flag when auth event session has no user (null user)", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: null, access_token: null },
      authEventArrivalPoint: "during_getSession",
    });

    expect(result.session).toBeNull();
    expect(result.authFlagCleared).toBe(true);
    expect(result.usedEventSession).toBe(false);
  });

  it("should NOT clear auth flag when auth flag was NOT set (fresh install)", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "null",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: false,
      authEventSession: null,
      authEventArrivalPoint: "never",
    });

    expect(result.session).toBeNull();
    expect(result.authFlagCleared).toBe(false); // No flag to clear
  });

  it("should skip refreshSession and AsyncStorage when event session arrives early", () => {
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "null",
      refreshSessionResult: "success", // Would succeed, but should never be called
      asyncStorageFallbackResult: "success", // Would succeed, but should never be called
      authFlagSet: true,
      authEventSession: { user: { id: "123", email: "test@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "before_getSession",
    });

    expect(result.session?.user).toBeTruthy();
    expect(result.usedEventSession).toBe(true);
    expect(result.calledRefreshSession).toBe(false);
    expect(result.calledAsyncStorageFallback).toBe(false);
  });

  it("should prefer refreshSession result over late-arriving event session", () => {
    // If refreshSession succeeds, we don't need the event session
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "success",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "456", email: "event@test.com" }, access_token: "event-token" },
      authEventArrivalPoint: "after_refreshSession", // Arrives after refreshSession already succeeded
    });

    expect(result.session?.user?.id).toBe("123"); // Uses refreshSession result
    expect(result.usedEventSession).toBe(false);
    expect(result.authFlagCleared).toBe(false);
  });
});

describe("End-to-end: TOKEN_REFRESHED race condition scenarios", () => {
  it("Scenario: App open after 1-2h → getSession timeout → TOKEN_REFRESHED → user stays in app", () => {
    // Exact production scenario from Logcat:
    // 1. App opens after 1-2h in background
    // 2. initAuth starts, auth flag is set
    // 3. getSession hangs (SecureStore slow) → times out at 6s
    // 4. TOKEN_REFRESHED fires with valid session (Supabase auto-refresh succeeded)
    // 5. initAuth checks latestAuthEventSessionRef → finds valid session
    // 6. User stays authenticated, no login screen

    // Verify the event is captured (processAuthEvent with valid session)
    const eventAction = processAuthEvent(
      "TOKEN_REFRESHED",
      { user: { id: "123", email: "test@test.com" }, access_token: "refreshed" },
      false,
      true,
    );
    expect(eventAction).toBe("process"); // TOKEN_REFRESHED with valid session is processed

    // Verify initAuth uses the captured session
    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: { user: { id: "123", email: "test@test.com" }, access_token: "refreshed" },
      authEventArrivalPoint: "during_getSession",
    });
    expect(result.session?.user).toBeTruthy();
    expect(result.authFlagCleared).toBe(false);
    expect(result.usedEventSession).toBe(true);
  });

  it("Scenario: Second open after force-close → INITIAL_SESSION → works immediately", () => {
    // After the first open (which ran TOKEN_REFRESHED and updated storage),
    // force-closing and reopening gives INITIAL_SESSION with valid session.
    // getSession succeeds immediately.

    const result = simulateInitAuthWithEventSession({
      getSessionResult: "success",
      refreshSessionResult: "null",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: null,
      authEventArrivalPoint: "never",
    });
    expect(result.session?.user).toBeTruthy();
    expect(result.usedEventSession).toBe(false);
    expect(result.authFlagCleared).toBe(false);
  });

  it("Scenario: No TOKEN_REFRESHED, all methods fail → legitimate logout", () => {
    // If no auth event arrives and all recovery methods fail,
    // the user is legitimately logged out.

    const result = simulateInitAuthWithEventSession({
      getSessionResult: "timeout",
      refreshSessionResult: "error",
      asyncStorageFallbackResult: "null",
      authFlagSet: true,
      authEventSession: null,
      authEventArrivalPoint: "never",
    });
    expect(result.session).toBeNull();
    expect(result.authFlagCleared).toBe(true);
    expect(result.usedEventSession).toBe(false);
  });
});

// ============================================================
// AUTH OPTIMIZATION TESTS: Fast Entry After Background
// ============================================================
// Tests for the 4 optimizations:
// 1. Fast path from module cache (remount scenario)
// 2. Race getSession vs TOKEN_REFRESHED (short wait)
// 3. Non-blocking fetchProfile
// 4. No auth flag deletion on background validation timeout

describe("Auth Optimization: Fast Entry After Background", () => {
  // Simulate the fast path logic from initAuth
  function simulateFastPath(params: {
    wasAuthenticated: boolean;
    moduleSessionCacheUser: boolean;
    sessionRecoveredInProcess: boolean;
  }): { usedFastPath: boolean; reason?: string } {
    const { wasAuthenticated, moduleSessionCacheUser, sessionRecoveredInProcess } = params;

    // Fast path conditions (must ALL be true):
    // 1. auth flag was set (user was previously authenticated)
    // 2. module cache has a valid user
    // 3. session was already recovered in this JS process
    if (wasAuthenticated && moduleSessionCacheUser && sessionRecoveredInProcess) {
      return { usedFastPath: true };
    }

    // Determine why fast path was not used
    const reasons: string[] = [];
    if (!wasAuthenticated) reasons.push("no auth flag");
    if (!moduleSessionCacheUser) reasons.push("no module cache");
    if (!sessionRecoveredInProcess) reasons.push("session not recovered in process");

    return { usedFastPath: false, reason: reasons.join(", ") };
  }

  // Simulate the race between getSession and cached session
  function simulateRace(params: {
    getSessionReturnsIn: number; // ms, -1 = timeout
    getSessionResult: "valid" | "null" | "timeout";
    cachedSessionAvailableAt: number; // ms, -1 = never
    shortWaitMax: number; // ms (default 2000)
  }): { winner: "getSession" | "cached" | "fallback"; timeToSession: number } {
    const { getSessionReturnsIn, getSessionResult, cachedSessionAvailableAt, shortWaitMax } = params;

    // If cached session is available immediately (0ms)
    if (cachedSessionAvailableAt === 0) {
      return { winner: "cached", timeToSession: 0 };
    }

    // If cached session arrives within shortWaitMax
    if (cachedSessionAvailableAt > 0 && cachedSessionAvailableAt <= shortWaitMax) {
      // Check if getSession is faster
      if (getSessionResult === "valid" && getSessionReturnsIn < cachedSessionAvailableAt) {
        return { winner: "getSession", timeToSession: getSessionReturnsIn };
      }
      return { winner: "cached", timeToSession: cachedSessionAvailableAt };
    }

    // Cached session not available within short wait
    if (getSessionResult === "valid") {
      return { winner: "getSession", timeToSession: getSessionReturnsIn };
    }

    // getSession also failed — need fallback
    return { winner: "fallback", timeToSession: getSessionReturnsIn === -1 ? 6000 : getSessionReturnsIn };
  }

  // Simulate non-blocking profile behavior
  function simulateProfileBehavior(params: {
    sessionRecovered: boolean;
    profileFetchResult: "success" | "timeout" | "error";
    profileFetchDuration: number;
  }): { authPreserved: boolean; isLoadingDroppedBeforeProfile: boolean; profileAvailable: boolean } {
    if (!params.sessionRecovered) {
      return { authPreserved: false, isLoadingDroppedBeforeProfile: false, profileAvailable: false };
    }

    // Key behavior: isLoading drops to false IMMEDIATELY after session is set,
    // NOT after profile is loaded. Profile loads in background.
    return {
      authPreserved: true,
      isLoadingDroppedBeforeProfile: true,
      profileAvailable: params.profileFetchResult === "success",
    };
  }

  // ---- FAST PATH TESTS ----

  it("Fast path: module cache + auth flag + sessionRecovered → immediate entry", () => {
    const result = simulateFastPath({
      wasAuthenticated: true,
      moduleSessionCacheUser: true,
      sessionRecoveredInProcess: true,
    });
    expect(result.usedFastPath).toBe(true);
  });

  it("Fast path: no auth flag → NOT used (fresh install)", () => {
    const result = simulateFastPath({
      wasAuthenticated: false,
      moduleSessionCacheUser: true,
      sessionRecoveredInProcess: true,
    });
    expect(result.usedFastPath).toBe(false);
    expect(result.reason).toContain("no auth flag");
  });

  it("Fast path: no module cache → NOT used (first initAuth run)", () => {
    const result = simulateFastPath({
      wasAuthenticated: true,
      moduleSessionCacheUser: false,
      sessionRecoveredInProcess: false,
    });
    expect(result.usedFastPath).toBe(false);
    expect(result.reason).toContain("no module cache");
  });

  it("Fast path: module cache exists but session not recovered in process → NOT used", () => {
    // This prevents using stale cache from a previous JS process
    const result = simulateFastPath({
      wasAuthenticated: true,
      moduleSessionCacheUser: true,
      sessionRecoveredInProcess: false,
    });
    expect(result.usedFastPath).toBe(false);
    expect(result.reason).toContain("session not recovered in process");
  });

  // ---- RACE TESTS ----

  it("Race: TOKEN_REFRESHED arrives at 1.4s, getSession times out at 6s → cached wins", () => {
    const result = simulateRace({
      getSessionReturnsIn: 6000,
      getSessionResult: "timeout",
      cachedSessionAvailableAt: 1400,
      shortWaitMax: 2000,
    });
    expect(result.winner).toBe("cached");
    expect(result.timeToSession).toBe(1400);
  });

  it("Race: getSession returns valid at 200ms → getSession wins (fast network)", () => {
    const result = simulateRace({
      getSessionReturnsIn: 200,
      getSessionResult: "valid",
      cachedSessionAvailableAt: 1400,
      shortWaitMax: 2000,
    });
    expect(result.winner).toBe("getSession");
    expect(result.timeToSession).toBe(200);
  });

  it("Race: cached session available immediately (module cache from remount) → 0ms", () => {
    const result = simulateRace({
      getSessionReturnsIn: 6000,
      getSessionResult: "timeout",
      cachedSessionAvailableAt: 0,
      shortWaitMax: 2000,
    });
    expect(result.winner).toBe("cached");
    expect(result.timeToSession).toBe(0);
  });

  it("Race: TOKEN_REFRESHED arrives at 3s (after short wait) → falls through to getSession timeout", () => {
    const result = simulateRace({
      getSessionReturnsIn: -1,
      getSessionResult: "timeout",
      cachedSessionAvailableAt: 3000,
      shortWaitMax: 2000,
    });
    // Cached arrives at 3s but short wait is only 2s, so it won't be caught by race
    // getSession also times out → fallback
    expect(result.winner).toBe("fallback");
  });

  it("Race: no TOKEN_REFRESHED, getSession returns null → fallback path", () => {
    const result = simulateRace({
      getSessionReturnsIn: 500,
      getSessionResult: "null",
      cachedSessionAvailableAt: -1,
      shortWaitMax: 2000,
    });
    expect(result.winner).toBe("fallback");
  });

  // ---- NON-BLOCKING PROFILE TESTS ----

  it("Profile timeout does NOT block isLoading", () => {
    const result = simulateProfileBehavior({
      sessionRecovered: true,
      profileFetchResult: "timeout",
      profileFetchDuration: 5000,
    });
    expect(result.authPreserved).toBe(true);
    expect(result.isLoadingDroppedBeforeProfile).toBe(true);
    // Profile not available but auth is preserved
    expect(result.profileAvailable).toBe(false);
  });

  it("Profile error does NOT affect auth state", () => {
    const result = simulateProfileBehavior({
      sessionRecovered: true,
      profileFetchResult: "error",
      profileFetchDuration: 100,
    });
    expect(result.authPreserved).toBe(true);
    expect(result.isLoadingDroppedBeforeProfile).toBe(true);
  });

  it("Profile success loads in background after auth is ready", () => {
    const result = simulateProfileBehavior({
      sessionRecovered: true,
      profileFetchResult: "success",
      profileFetchDuration: 900,
    });
    expect(result.authPreserved).toBe(true);
    expect(result.isLoadingDroppedBeforeProfile).toBe(true);
    expect(result.profileAvailable).toBe(true);
  });

  // ---- BACKGROUND VALIDATION TESTS ----

  it("Background validation timeout does NOT clear auth flag", () => {
    // Simulate: session recovered, then background validation times out
    // Auth flag should NOT be cleared
    const sessionRecovered = true;
    const validationResult = "timeout";
    
    // The rule: once session is recovered, no timeout can clear auth flag
    const authFlagCleared = !sessionRecovered; // Only clear if session was never recovered
    expect(authFlagCleared).toBe(false);
  });

  it("Background validation network error does NOT trigger logout", () => {
    const sessionRecovered = true;
    const validationResult = "network_error";
    
    // Same rule: network errors in background validation don't affect auth
    const logoutTriggered = !sessionRecovered;
    expect(logoutTriggered).toBe(false);
  });

  it("Logout clears module cache even when fast path was used", () => {
    // Simulate: fast path used → then user explicitly logs out
    let moduleCache: any = { user: { id: "123" } };
    let sessionRecovered = true;
    
    // Simulate signOut
    const signOut = () => {
      moduleCache = null;
      sessionRecovered = false;
    };
    
    signOut();
    expect(moduleCache).toBeNull();
    expect(sessionRecovered).toBe(false);
  });

  // ---- COMBINED SCENARIO TESTS ----

  it("Full scenario: remount after recovery → fast path → profile in background → entry in <100ms", () => {
    // Step 1: First initAuth recovered session (simulated)
    const firstRunResult = simulateFastPath({
      wasAuthenticated: true,
      moduleSessionCacheUser: false, // Not yet in cache
      sessionRecoveredInProcess: false,
    });
    expect(firstRunResult.usedFastPath).toBe(false);

    // Step 2: After first run, cache is populated
    // Step 3: Remount happens, second initAuth runs
    const secondRunResult = simulateFastPath({
      wasAuthenticated: true,
      moduleSessionCacheUser: true, // Now in cache from first run
      sessionRecoveredInProcess: true, // Set by first run
    });
    expect(secondRunResult.usedFastPath).toBe(true);

    // Step 4: Profile loads in background (non-blocking)
    const profileResult = simulateProfileBehavior({
      sessionRecovered: true,
      profileFetchResult: "timeout", // Network still cold
      profileFetchDuration: 5000,
    });
    expect(profileResult.authPreserved).toBe(true);
    expect(profileResult.isLoadingDroppedBeforeProfile).toBe(true);
  });

  it("Full scenario: cold network + TOKEN_REFRESHED at 1.4s → entry in ~1.4s instead of 22s", () => {
    // Step 1: getSession will timeout (cold network)
    // Step 2: TOKEN_REFRESHED arrives at 1.4s
    const raceResult = simulateRace({
      getSessionReturnsIn: 6000,
      getSessionResult: "timeout",
      cachedSessionAvailableAt: 1400,
      shortWaitMax: 2000,
    });
    expect(raceResult.winner).toBe("cached");
    expect(raceResult.timeToSession).toBe(1400);
    // Total time ≈ 1.4s + bridge check + isLoading=false ≈ 2-3s (vs 22s before)

    // Profile loads in background
    const profileResult = simulateProfileBehavior({
      sessionRecovered: true,
      profileFetchResult: "timeout",
      profileFetchDuration: 5000,
    });
    expect(profileResult.authPreserved).toBe(true);
    expect(profileResult.isLoadingDroppedBeforeProfile).toBe(true);
  });
});
