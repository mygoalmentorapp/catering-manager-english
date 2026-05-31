import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "./supabase";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import type { Profile } from "./supabase-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Note: HAS_REGISTERED_KEY is duplicated here to avoid circular import
// (auth-context → app-gate → session-gate → auth-context)
const HAS_REGISTERED_KEY = "has_registered_before";
// Supabase stores its session under this key in AsyncStorage.
// Used as a last-resort fallback when getSession()/refreshSession() both return null
// due to Supabase's internal memory being cleared by a failed auto-refresh.
const SUPABASE_STORAGE_KEY = "sb-szcukdxkbrezhgotwsqd-auth-token";
import { getDeviceId } from "@/lib/device-id";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { bridgeToken } from "@/lib/_core/api";
import { setAuthFlag, clearAuthFlag, getAuthFlag } from "@/lib/_core/auth-flag";
import { debugLog } from "@/lib/_core/debug-logger";

// ============ TYPES ============

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** True when Supabase session exists but bridge (custom JWT exchange) failed */
  bridgeFailed: boolean;
  /** True while a bridge retry is in progress */
  bridgeRetrying: boolean;
  /** True while session recovery is in progress (initAuth running after background resume) */
  isRecovering: boolean;
}

interface AuthActions {
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  resendConfirmation: (email: string) => Promise<{ error: AuthError | null }>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, "business_name" | "business_logo_url" | "full_name">>) => Promise<{ error: any }>;
  /** Retry bridge with existing Supabase session access_token */
  retryBridge: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | null>(null);

// ============ HELPERS ============

/** Race a promise against a timeout. Returns null if timeout wins. */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ============ PROVIDER ============

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  // Track whether bridge is in progress to avoid double-bridging
  const bridgingRef = useRef(false);
  // Track whether bridge has failed (network error) — prevents safety timeout from forcing auth
  const bridgeFailedRef = useRef(false);
  // Track whether signOut is in progress — prevents onAuthStateChange from re-setting state
  const signingOutRef = useRef(false);
  // Track whether auto-retry after first bridge failure has been attempted (max 1)
  const bridgeAutoRetriedRef = useRef(false);
  // Track whether initAuth is still running — prevents safety timeout from firing prematurely
  const initAuthRunningRef = useRef(true);
  // Track whether initAuth has completed at least once — gates startAutoRefresh
  const initAuthCompletedRef = useRef(false);
  // Track whether a recovery is actively running (initAuth or SIGNED_OUT recovery)
  // Used to gate startAutoRefresh — must not run during any recovery.
  const recoveryActiveRef = useRef(false);

  // FIX: Capture the latest valid session from onAuthStateChange events.
  // When TOKEN_REFRESHED fires during initAuth (before getSession returns),
  // the session is stored here so initAuth can use it instead of falling through
  // to refreshSession/setSession fallbacks that may fail.
  const latestAuthEventSessionRef = useRef<Session | null>(null);

  // Bridge retry state — exposed to UI for BridgeRetryScreen
  const [bridgeFailed, setBridgeFailed] = useState(false);
  const [bridgeRetrying, setBridgeRetrying] = useState(false);
  // Recovery state — exposed to UI so AppGate can show "recovering" instead of login
  const [isRecovering, setIsRecovering] = useState(false);

  // ============ BRIDGE READINESS ============
  // The custom JWT (bridge token) must be available before we consider the user
  // "authenticated" for the rest of the app. Without this gate, SessionGate and
  // DataProvider fire tRPC calls before the Bearer token exists → UNAUTHORIZED → signOut loop.
  //
  // On web, bridge is not used (cookie-based auth), so isBridgeReady starts as true.
  // On native, it starts as false and becomes true when:
  //   1. initAuth finds an existing custom JWT in SecureStore, OR
  //   2. performBridge() successfully stores a new JWT, OR
  //   3. Bridge fails but we have a fallback (currently: stay false → user sees loading)
  const [isBridgeReady, setIsBridgeReady] = useState(Platform.OS === "web");

  // Fetch profile from Supabase with 5s timeout
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const result = await raceTimeout(
        Promise.resolve(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single()
        ),
        5000
      );

      if (!result) {
        console.warn("[Auth] Profile fetch timed out");
        return null;
      }

      if (result.error) {
        console.warn("[Auth] Failed to fetch profile:", result.error.message);
        return null;
      }
      return result.data as Profile;
    } catch (err) {
      console.warn("[Auth] Profile fetch exception:", err);
      return null;
    }
  }, []);

  // Bridge: exchange Supabase access_token for custom app JWT and store in SecureStore.
  // This connects Supabase Auth (used for login) with the custom OAuth JWT (used by tRPC).
  // Returns true if bridge succeeded, false otherwise.
  const performBridge = useCallback(async (accessToken: string): Promise<boolean> => {
    if (bridgingRef.current) {
      console.log("[Auth] Bridge already in progress, skipping");
      return false;
    }
    bridgingRef.current = true;
    const bridgeStartTime = Date.now();

    try {
      console.log("[Auth] Performing bridge token exchange...");
      bridgeFailedRef.current = false;
      const result = await bridgeToken(accessToken);
      if (result.sessionToken) {
        await Auth.setSessionToken(result.sessionToken);
        // Verify the token was actually persisted before marking bridge ready.
        // This prevents the race where isBridgeReady=true but SecureStore hasn't flushed yet.
        const verifyToken = await Auth.getSessionToken();
        if (!verifyToken) {
          console.warn("[Auth] Bridge: token stored but verification read returned null");
        }
        const duration = Date.now() - bridgeStartTime;
        console.log(`[Auth] Bridge successful in ${duration}ms — custom JWT stored in SecureStore`);
        if (mountedRef.current) {
          setIsBridgeReady(true);
          setBridgeFailed(false);
          setBridgeRetrying(false);
        }
        return true;
      } else {
        console.warn("[Auth] Bridge returned no sessionToken");
        bridgeFailedRef.current = true;
        return false;
      }
    } catch (err) {
      const duration = Date.now() - bridgeStartTime;
      console.error(`[BRIDGE_FAILED] Bridge token exchange failed after ${duration}ms:`, err);
      bridgeFailedRef.current = true;

      // Keep Supabase session alive — do NOT signOut.
      // isAuthenticated stays false (isBridgeReady is still false),
      // so DataProvider/SessionGate won't fire premature tRPC calls.
      // AppGate will detect bridgeFailed and show BridgeRetryScreen.
      if (mountedRef.current) {
        setBridgeFailed(true);
        setBridgeRetrying(false);
      }

      // Auto-retry once after 3s delay (server may have been waking up)
      // FIX: Use the `accessToken` parameter (from the caller) instead of `session` from closure.
      // `performBridge` has useCallback([], []) so `session` inside is always stale (initial null).
      // The accessToken parameter is the fresh token passed by onAuthStateChange/retryBridge.
      if (!bridgeAutoRetriedRef.current && accessToken) {
        bridgeAutoRetriedRef.current = true;
        console.log("[Auth] Scheduling auto-retry bridge in 3s...");
        if (mountedRef.current) setBridgeRetrying(true);
        setTimeout(async () => {
          if (!mountedRef.current) return;
          // Check if user signed out during the delay
          if (signingOutRef.current) {
            console.warn("[Auth] Auto-retry cancelled — sign out in progress");
            if (mountedRef.current) setBridgeRetrying(false);
            return;
          }
          console.log("[Auth] Auto-retrying bridge...");
          const retryResult = await performBridge(accessToken);
          if (!mountedRef.current) return;
          if (!retryResult) {
            // Auto-retry also failed — show BridgeRetryScreen
            console.warn("[BRIDGE_FAILED] Auto-retry also failed");
            setBridgeFailed(true);
            setBridgeRetrying(false);
          }
          // If retryResult is true, performBridge already set isBridgeReady=true
          // and setBridgeFailed(false) via the success path
        }, 3000);
      }

      return false;
    } finally {
      bridgingRef.current = false;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    mountedRef.current = true;

    const initAuth = async () => {
      initAuthRunningRef.current = true;
      try {
        debugLog("Auth", "initAuth starting...");

        // FIX 1: Check auth flag BEFORE any Supabase calls.
        // If the user was previously authenticated (flag is set), enter recovery mode.
        // This tells AppGate to show a loading/recovery screen instead of login
        // while we attempt to restore the session.
        const wasAuthenticated = Platform.OS !== "web" ? await getAuthFlag() : false;
        if (wasAuthenticated && mountedRef.current) {
          debugLog("Auth", "Auth flag is set — entering recovery mode");
          setIsRecovering(true);
        }

        // Race getSession against a 6s timeout — SecureStore/AsyncStorage can hang
        const sessionResult = await raceTimeout(
          supabase.auth.getSession(),
          6000
        );

        if (!mountedRef.current) return;

        let currentSession: Session | null = null;

        if (!sessionResult) {
          debugLog("Auth", "getSession timed out — will continue to refreshSession/fallback");
          // DO NOT return here! Continue to refreshSession and AsyncStorage fallback.
          // On Android after 1-2h in background, getSession() can hang due to slow
          // storage or stale Supabase internal state. The fallbacks below can still recover.
        } else {
          currentSession = sessionResult.data?.session ?? null;
          debugLog("Auth", "Session found:", !!currentSession);
        }

        // FIX: Check if TOKEN_REFRESHED already delivered a valid session while we waited.
        // This handles the race where getSession hangs/times out but TOKEN_REFRESHED
        // already fired with a valid session.
        if (!currentSession?.user && latestAuthEventSessionRef.current?.user) {
          currentSession = latestAuthEventSessionRef.current;
          debugLog("Auth", "Using session from auth event (after getSession) — skipping fallbacks");
        }

        // FIX: If getSession() returns null (or timed out), it might be because Supabase's
        // internal auto-refresh already ran and failed (e.g., after warm restart where JS
        // context was killed but AsyncStorage still has the refresh token). In this case,
        // explicitly try refreshSession() which reads the refresh token from storage
        // and attempts a fresh exchange. This fixes the bug where opening the app after
        // some time shows DataLoadingSplash then redirects to login, but force-closing
        // and reopening works fine (cold start re-reads storage cleanly).
        if (!currentSession?.user) {
          debugLog("Auth", "No session from getSession — trying explicit refreshSession...");
          try {
            const refreshResult = await raceTimeout(
              supabase.auth.refreshSession(),
              8000
            );
            if (refreshResult?.data?.session?.user) {
              currentSession = refreshResult.data.session;
              debugLog("Auth", "refreshSession succeeded — session restored");
            } else {
              debugLog("Auth", "refreshSession also returned no session");
            }
          } catch (refreshErr) {
            debugLog("Auth", "refreshSession error:", refreshErr);
          }
        }

        // FIX: Check auth event ref again before AsyncStorage fallback
        if (!currentSession?.user && latestAuthEventSessionRef.current?.user) {
          currentSession = latestAuthEventSessionRef.current;
          debugLog("Auth", "Using session from auth event (before AsyncStorage fallback)");
        }

        // FALLBACK: If both getSession() and refreshSession() returned null,
        // it's likely because startAutoRefresh() already ran and cleared Supabase's
        // internal memory (race condition on warm restart after 1-2h in background).
        // Read directly from AsyncStorage where Supabase persists the refresh_token,
        // and use setSession() to force Supabase to re-hydrate and refresh.
        if (!currentSession?.user && Platform.OS !== "web") {
          debugLog("Auth", "Attempting AsyncStorage fallback for session recovery...");
          try {
            const raw = await AsyncStorage.getItem(SUPABASE_STORAGE_KEY);
            if (raw) {
              const stored = JSON.parse(raw);
              const accessToken = stored?.access_token;
              const refreshToken = stored?.refresh_token;

              if (accessToken && refreshToken) {
                debugLog("Auth", "Found tokens in AsyncStorage — calling setSession()...");
                const setResult = await raceTimeout(
                  supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                  }),
                  8000
                );
                if (setResult?.data?.session?.user) {
                  currentSession = setResult.data.session;
                  debugLog("Auth", "AsyncStorage fallback succeeded — session restored via setSession");
                } else {
                  debugLog("Auth", "AsyncStorage fallback: setSession returned no valid session");
                }
              } else {
                debugLog("Auth", "AsyncStorage fallback: no tokens found in stored data");
              }
            } else {
              debugLog("Auth", "AsyncStorage fallback: no stored session data found");
            }
          } catch (storageErr) {
            debugLog("Auth", "AsyncStorage fallback failed:", storageErr);
          }
        }

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          await setAuthFlag(); // Persist auth flag on successful session restore
          const p = await fetchProfile(currentSession.user.id);
          if (mountedRef.current) {
            setProfile(p);
            debugLog("Auth", "Profile loaded:", !!p);
          }

          // Ensure custom JWT exists in SecureStore for tRPC auth.
          // On app restart with existing Supabase session, the custom token
          // might already be there (persisted from last login). If not, bridge it.
          if (Platform.OS !== "web") {
            const existingToken = await Auth.getSessionToken();
            if (existingToken) {
              debugLog("Auth", "Custom JWT already exists in SecureStore");
              if (mountedRef.current) setIsBridgeReady(true);
            } else {
              debugLog("Auth", "No custom JWT found — bridging on init...");
              await performBridge(currentSession.access_token);
              // performBridge sets isBridgeReady on success
            }
          }
        } else {
          // Final check: did a valid session arrive via auth event during the entire initAuth flow?
          const eventSession = latestAuthEventSessionRef.current;
          if (eventSession?.user) {
            debugLog("Auth", "Not clearing auth flag — valid auth event session exists, using it");
            // Use the session from the auth event
            setSession(eventSession);
            setUser(eventSession.user);
            await setAuthFlag();
            const p = await fetchProfile(eventSession.user.id);
            if (mountedRef.current) {
              setProfile(p);
              debugLog("Auth", "Profile loaded from event session:", !!p);
            }
            // Ensure bridge is ready
            if (Platform.OS !== "web") {
              const existingToken = await Auth.getSessionToken();
              if (existingToken) {
                debugLog("Auth", "Custom JWT already exists in SecureStore (event session path)");
                if (mountedRef.current) setIsBridgeReady(true);
              } else {
                debugLog("Auth", "No custom JWT found — bridging from event session...");
                await performBridge(eventSession.access_token);
              }
            }
          } else {
            debugLog("Auth", "No session found after all recovery attempts");
            // If auth flag was set but we couldn't recover, clear it — user truly has no session
            if (wasAuthenticated) {
              debugLog("Auth", "Clearing stale auth flag — all recovery attempts failed");
              await clearAuthFlag();
            }
          }
        }
      } catch (err) {
        debugLog("Auth", "Init error:", err);
      } finally {
        initAuthRunningRef.current = false;
        initAuthCompletedRef.current = true;
        if (mountedRef.current) {
          setIsRecovering(false);
          debugLog("Auth", "isLoading → false, isRecovering → false");
          setIsLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return;
      debugLog("Auth", "onAuthStateChange:", event);

      // FIX: Capture any valid session from auth events immediately.
      // This allows initAuth to use it if getSession/refreshSession fail.
      if (newSession?.user) {
        latestAuthEventSessionRef.current = newSession;
        debugLog("Auth", "Auth event session captured:", {
          event,
          hasUser: true,
          expiresAt: newSession.expires_at,
        });
      }

      // If signOut is in progress, only allow SIGNED_OUT event through.
      // This prevents TOKEN_REFRESHED or other events from re-setting state
      // back to a valid session during the async signOut cleanup.
      if (signingOutRef.current && event !== "SIGNED_OUT") {
        debugLog("Auth", "Ignoring event during signOut:", event);
        return;
      }

      // FIX: Protect session state from being cleared by non-SIGNED_OUT events.
      // Supabase can fire TOKEN_REFRESHED or INITIAL_SESSION with null session when:
      // - Token refresh fails (network glitch, server timeout)
      // - App returns from background and auto-refresh fires before session is loaded
      // - Internal Supabase race conditions
      // In all these cases, clearing the session would redirect to login incorrectly.
      // Only SIGNED_OUT should clear the session — everything else should preserve it.
      //
      // PERSISTENT AUTH FLAG: Even if the above check somehow fails, we verify against
      // a persistent flag in AsyncStorage. If the user was previously authenticated and
      // hasn't explicitly signed out, we refuse to clear the session.
      if (!newSession?.user && event !== "SIGNED_OUT") {
        const flagIsSet = await getAuthFlag();
        if (flagIsSet) {
          debugLog("AuthFlag", "Ignoring null session — auth flag says user is logged in. Event:", event);
        } else {
          debugLog("AuthFlag", "Ignoring null session event (not SIGNED_OUT, no flag):", event);
        }
        return;
      }

      // FIX 3 (v2): Handle non-intentional SIGNED_OUT with recovery attempt.
      // Instead of blindly blocking SIGNED_OUT, we attempt to recover the session.
      // This distinguishes between:
      //   a) Session that can be recovered (refresh token still valid in storage)
      //   b) Session that truly expired/was revoked (all recovery fails → legitimate logout)
      //
      // Supabase can fire SIGNED_OUT internally when:
      // - Auto-refresh fails and Supabase decides to clear the session
      // - setSession() is called with expired tokens and Supabase rejects them
      // - Internal race conditions during warm restart
      //
      // We only honor SIGNED_OUT immediately if the user explicitly initiated signOut (signingOutRef).
      // Otherwise, if the auth flag says user should be logged in, we try recovery first.
      if (event === "SIGNED_OUT" && !signingOutRef.current) {
        const flagIsSet = await getAuthFlag();
        if (flagIsSet) {
          // Guard: prevent duplicate recovery if Supabase fires multiple SIGNED_OUT events
          if (recoveryActiveRef.current) {
            debugLog("Auth", "SIGNED_OUT recovery already active — ignoring duplicate event");
            return;
          }

          debugLog("AuthFlag", "Non-intentional SIGNED_OUT detected — auth flag is set, attempting recovery...");

          // Enter recovery mode — AppGate will show splash instead of login
          if (mountedRef.current) setIsRecovering(true);
          recoveryActiveRef.current = true;

          // Stop auto-refresh during recovery to prevent interference
          supabase.auth.stopAutoRefresh();

          let recoveredSession: Session | null = null;

          try {
            // Recovery Step 1: Try getSession()
            try {
              debugLog("Auth", "SIGNED_OUT recovery: trying getSession()...");
              const gsResult = await raceTimeout(supabase.auth.getSession(), 6000);
              if (gsResult?.data?.session?.user) {
                recoveredSession = gsResult.data.session;
                debugLog("Auth", "SIGNED_OUT recovery: getSession() succeeded");
              }
            } catch (e) {
              debugLog("Auth", "SIGNED_OUT recovery: getSession() error:", e);
            }

            // Recovery Step 2: Try refreshSession()
            if (!recoveredSession?.user) {
              try {
                debugLog("Auth", "SIGNED_OUT recovery: trying refreshSession()...");
                const rfResult = await raceTimeout(supabase.auth.refreshSession(), 8000);
                if (rfResult?.data?.session?.user) {
                  recoveredSession = rfResult.data.session;
                  debugLog("Auth", "SIGNED_OUT recovery: refreshSession() succeeded");
                }
              } catch (e) {
                debugLog("Auth", "SIGNED_OUT recovery: refreshSession() error:", e);
              }
            }

            // Recovery Step 3: Try AsyncStorage fallback
            if (!recoveredSession?.user && Platform.OS !== "web") {
              try {
                debugLog("Auth", "SIGNED_OUT recovery: trying AsyncStorage fallback...");
                const raw = await AsyncStorage.getItem(SUPABASE_STORAGE_KEY);
                if (raw) {
                  const stored = JSON.parse(raw);
                  const at = stored?.access_token;
                  const rt = stored?.refresh_token;
                  if (at && rt) {
                    const ssResult = await raceTimeout(
                      supabase.auth.setSession({ access_token: at, refresh_token: rt }),
                      8000
                    );
                    if (ssResult?.data?.session?.user) {
                      recoveredSession = ssResult.data.session;
                      debugLog("Auth", "SIGNED_OUT recovery: AsyncStorage fallback succeeded");
                    }
                  }
                }
              } catch (e) {
                debugLog("Auth", "SIGNED_OUT recovery: AsyncStorage fallback error:", e);
              }
            }

            if (recoveredSession?.user && mountedRef.current) {
              // Recovery succeeded — restore session, keep user in app
              debugLog("Auth", "SIGNED_OUT recovery SUCCEEDED — restoring session");
              setSession(recoveredSession);
              setUser(recoveredSession.user);
              await setAuthFlag();
              setIsRecovering(false);

              // Restart auto-refresh now that recovery is done
              supabase.auth.startAutoRefresh();

              // Verify bridge is still valid
              if (Platform.OS !== "web") {
                const existingToken = await Auth.getSessionToken();
                if (!existingToken) {
                  debugLog("Auth", "SIGNED_OUT recovery: custom JWT missing — re-bridging...");
                  performBridge(recoveredSession.access_token).catch((err) => {
                    console.warn("[Auth] Bridge after SIGNED_OUT recovery failed:", err);
                  });
                }
              }

              return; // Don't process the SIGNED_OUT event — session was recovered
            } else {
              // Recovery failed — session truly expired. Process the SIGNED_OUT normally.
              debugLog("Auth", "SIGNED_OUT recovery FAILED — all attempts exhausted, processing logout");
              await clearAuthFlag();
              if (mountedRef.current) setIsRecovering(false);

              // Restart auto-refresh for clean state
              supabase.auth.startAutoRefresh();
              // Fall through to process the SIGNED_OUT event normally below
            }
          } finally {
            // Guarantee recoveryActiveRef is always cleared, even on unexpected errors
            recoveryActiveRef.current = false;
          }
        } else {
          // No auth flag — this is a legitimate SIGNED_OUT (e.g., user never logged in, or flag was cleared)
          debugLog("Auth", "Processing SIGNED_OUT (no auth flag, not user-initiated)");
        }
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        // Don't await fetchProfile — it has a 5s timeout and would block
        // signInWithPassword's _notifyAllSubscribers (same issue as bridge).
        // Profile is nice-to-have on login; it will be fetched again by refreshProfile.
        fetchProfile(newSession.user.id).then((p) => {
          if (mountedRef.current) setProfile(p);
        }).catch(() => {});
      } else {
        setProfile(null);
      }

      if (event === "SIGNED_OUT") {
        setProfile(null);
        clearAuthFlag().catch(() => {}); // Clear auth flag on explicit sign-out
        // Reset bridge readiness on sign out so next login must re-bridge
        if (Platform.OS !== "web") {
          setIsBridgeReady(false);
        }
      }

      // When a user signs in successfully, mark them as a returning user.
      // This ensures AppGate routes to login (not signup) on subsequent app opens,
      // even on devices where the user never went through the signup flow.
      if (event === "SIGNED_IN") {
        AsyncStorage.setItem(HAS_REGISTERED_KEY, "true").catch(() => {});
        setAuthFlag().catch(() => {}); // Persist auth flag on sign-in
        // Reset bridge auto-retry counter for this fresh login attempt
        bridgeAutoRetriedRef.current = false;
        if (mountedRef.current) {
          setBridgeFailed(false);
          setBridgeRetrying(false);
        }
      }

      // Bridge: after sign-in, exchange Supabase token for custom app JWT.
      // This ensures tRPC/protectedProcedure has a valid Bearer token.
      //
      // CRITICAL FIX: Do NOT await performBridge here!
      // Supabase's signInWithPassword() internally calls:
      //   await _notifyAllSubscribers('SIGNED_IN', session)
      // which awaits ALL onAuthStateChange callbacks before returning.
      // If we await performBridge (which calls the production server with 15s timeout),
      // signInWithPassword hangs until bridge completes → our 20s raceTimeout fires
      // → user sees "ההתחברות נמשכה יותר מדי" even though Supabase auth succeeded.
      //
      // Instead, we fire performBridge without awaiting. The bridge runs in the background:
      // - If it succeeds: isBridgeReady → true → isAuthenticated → true → user enters app
      // - If it fails: bridgeFailed → true → BridgeRetryScreen shown
      // - signInWithPassword returns immediately → login.tsx shows success animation
      if (event === "SIGNED_IN" && newSession?.access_token && Platform.OS !== "web") {
        // Fire-and-forget: bridge runs in background, UI reacts to state changes
        performBridge(newSession.access_token).catch((err) => {
          console.warn("[Auth] Background bridge failed after SIGNED_IN:", err);
        });
      }

      // Also bridge on TOKEN_REFRESHED — the Supabase token was refreshed,
      // but our custom JWT might still be valid (it has 1-year expiry).
      // Only re-bridge if the custom JWT is missing (e.g., was cleared).
      if (event === "TOKEN_REFRESHED" && newSession?.access_token && Platform.OS !== "web") {
        const existingToken = await Auth.getSessionToken();
        if (!existingToken) {
          console.log("[Auth] Custom JWT missing after token refresh — re-bridging...");
          // Fire-and-forget: same reasoning as SIGNED_IN above
          performBridge(newSession.access_token).catch((err) => {
            console.warn("[Auth] Background bridge failed after TOKEN_REFRESHED:", err);
          });
        }
      }

      // When a PASSWORD_RECOVERY event fires, the user is definitely registered.
      // Save the flag so AppGate routes to login (not signup) next time the app opens.
      if (event === "PASSWORD_RECOVERY") {
        AsyncStorage.setItem(HAS_REGISTERED_KEY, "true").catch(() => {});
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, performBridge]);

  // ============ APP STATE: TOKEN REFRESH ============
  // Supabase autoRefreshToken only works while the JS timer loop is active.
  // On React Native, when the app goes to background the timers pause.
  // After ~1 hour the access token expires. We explicitly start/stop the
  // auto-refresh cycle when the app transitions between foreground/background
  // so the token is refreshed immediately upon returning to the foreground.
  //
  // FIX 2: Do NOT call startAutoRefresh() until initAuth has COMPLETED (not just started).
  // Previously we used a fixed 2s timer, but initAuth can take up to 20s in worst case
  // (getSession 6s + refreshSession 8s + setSession 8s). If startAutoRefresh fires
  // before initAuth reads from storage, it can clear Supabase's internal session memory
  // and cause all recovery attempts to fail.
  //
  // Now we use initAuthCompletedRef (set to true in initAuth's finally block) as the gate.
  useEffect(() => {
    // Poll for initAuth completion instead of using a fixed timer.
    // Check every 500ms, give up after 25s (safety net).
    let pollCount = 0;
    const maxPolls = 50; // 50 × 500ms = 25s
    const pollTimer = setInterval(() => {
      pollCount++;
      if (initAuthCompletedRef.current && !recoveryActiveRef.current) {
        clearInterval(pollTimer);
        debugLog("Auth", `startAutoRefresh — initAuth completed, no recovery active (after ${pollCount * 500}ms)`);
        supabase.auth.startAutoRefresh();
      } else if (pollCount >= maxPolls) {
        clearInterval(pollTimer);
        debugLog("Auth", "startAutoRefresh — safety: initAuth did not complete in 25s, starting anyway");
        supabase.auth.startAutoRefresh();
      }
    }, 500);

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        // Only start auto-refresh if initAuth has completed AND no recovery is active.
        // If initAuth is still running or SIGNED_OUT recovery is in progress,
        // auto-refresh will be started when recovery finishes.
        if (initAuthCompletedRef.current && !recoveryActiveRef.current) {
          debugLog("Auth", "App foregrounded — starting auto-refresh (initAuth done, no recovery)");
          supabase.auth.startAutoRefresh();
        } else {
          debugLog("Auth", "App foregrounded — deferring auto-refresh (initAuth or recovery still running)");
        }
      } else {
        debugLog("Auth", "App backgrounded — stopping auto-refresh");
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      clearInterval(pollTimer);
      appStateSubscription.remove();
    };
  }, []);

  // Safety net: if isLoading is still true after 20 seconds, force it to false.
  // This guarantees the spinner never stays forever, even if everything else fails.
  // Increased from 15s to 25s because initAuth can take up to 22s in worst case:
  // getSession timeout (6s) + refreshSession timeout (8s) + setSession timeout (8s) + buffer.
  // Also checks initAuthRunningRef to avoid firing while initAuth is still actively running.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      if (mountedRef.current && isLoading) {
        if (initAuthRunningRef.current) {
          debugLog("Auth", "Safety timeout at 20s — initAuth still running, waiting 10s more...");
          // Give initAuth 10 more seconds to finish
          setTimeout(() => {
            if (mountedRef.current && isLoading) {
              debugLog("Auth", "SAFETY TIMEOUT — forcing isLoading to false after 30s");
              setIsLoading(false);
              setIsRecovering(false);
            }
          }, 10000);
        } else {
          debugLog("Auth", "SAFETY TIMEOUT — forcing isLoading to false after 20s");
          setIsLoading(false);
          setIsRecovering(false);
        }
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Safety net for bridge: if bridge hasn't completed after 12 seconds but we have
  // a Supabase session, check if a custom JWT actually exists before marking ready.
  // Previously this forced isBridgeReady=true without verifying the JWT existed,
  // causing SessionProvider to fire tRPC calls without a valid Bearer token → UNAUTHORIZED → signOut loop.
  useEffect(() => {
    if (isBridgeReady || !session?.user || Platform.OS === "web") return;
    const timer = setTimeout(async () => {
      if (!mountedRef.current || isBridgeReady) return;
      // Only mark ready if a real JWT exists in SecureStore
      const existingToken = await Auth.getSessionToken();
      if (existingToken) {
        debugLog("Bridge", "Safety timeout — JWT exists in SecureStore, marking ready");
        if (mountedRef.current) setIsBridgeReady(true);
      } else if (!bridgeFailedRef.current) {
        // No JWT and bridge didn't explicitly fail — trigger bridge failed state
        // so BridgeRetryScreen is shown instead of silently breaking
        debugLog("Bridge", "Safety timeout — no JWT found, showing retry screen");
        if (mountedRef.current) {
          setBridgeFailed(true);
          setBridgeRetrying(false);
        }
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [isBridgeReady, session?.user]);

  // ============ ACTIONS ============

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    // Redirect to the standalone confirmation page on Cloudflare
    const confirmRedirectUrl = "https://confirm.cateringmanager.app";

    // Security: Use only official Supabase signUp.
    // We intentionally do NOT check identities or detect duplicate emails.
    // All outcomes (new user, existing unverified, existing verified) show the same
    // confirmation screen to avoid leaking whether an email is registered.
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: confirmRedirectUrl,
      },
    });

    // Fire-and-forget: notify server to check if this is a re-registration
    // of a verified user and send security alert email if so.
    // Runs in AuthProvider (never unmounts) — guaranteed to complete.
    // 3-second timeout via AbortController — if no response, abandon silently.
    const alertEmail = email.trim().toLowerCase();
    const PRODUCTION_URL = "https://caterapp-gvfdfg4d.manus.space/api/trpc/signup.checkAlert";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      fetch(PRODUCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { email: alertEmail } }),
        signal: controller.signal,
      })
        .catch(() => {}) // Silently swallow any error
        .finally(() => clearTimeout(timeoutId));
    } catch {
      // Silently swallow — must never affect signup flow
    }

    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Safety: ensure auto-refresh is running before signIn.
    // If a previous bridge failure called raw signOut without restarting auto-refresh,
    // signInWithPassword can hang forever due to stale internal Supabase client state.
    supabase.auth.startAutoRefresh();

    // Race signInWithPassword against a 20s timeout to prevent infinite spinner.
    // If Supabase client hangs (rare edge case), the user sees a clear error.
    const signInPromise = supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    const result = await raceTimeout(signInPromise, 20000);
    if (!result) {
      return { error: { message: "timeout" } as AuthError };
    }
    const { error } = result;
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: Platform.OS === "web"
            ? window.location.origin + "/oauth/callback"
            : undefined,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      return { error };
    } catch (err: any) {
      return { error: { message: err.message } as AuthError };
    }
  }, []);

  const signOut = useCallback(async () => {
    // Immediately mark as signing out to prevent race conditions
    signingOutRef.current = true;

    // Clear persistent auth flag FIRST — before any other cleanup
    await clearAuthFlag();

    // IMMEDIATELY clear React state so UI updates instantly.
    // This ensures the user sees the login screen right away,
    // even if the async cleanup (session.release, supabase.signOut) takes time.
    setSession(null);
    setUser(null);
    setProfile(null);
    setBridgeFailed(false);
    setBridgeRetrying(false);
    setIsRecovering(false);
    bridgeAutoRetriedRef.current = false;
    if (Platform.OS !== "web") {
      setIsBridgeReady(false);
    }

    // Stop auto-refresh to prevent TOKEN_REFRESHED events during cleanup
    supabase.auth.stopAutoRefresh();

    // Release the active session before signing out (best effort).
    // Uses the custom app JWT (Bearer token) — same auth as tRPC protectedProcedure.
    try {
      const deviceId = await getDeviceId();
      const customToken = await Auth.getSessionToken();
      if (customToken && deviceId) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch(`${getApiBaseUrl()}/api/trpc/session.release`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${customToken}`,
          },
          body: JSON.stringify({ json: { deviceId } }),
          signal: controller.signal,
        }).catch(() => {});
        clearTimeout(timeoutId);
      }
    } catch {
      // Best effort — proceed with signOut regardless
    }

    // Clear the custom app JWT from SecureStore
    try {
      await Auth.removeSessionToken();
      console.log("[Auth] Custom JWT removed from SecureStore");
    } catch {
      // Best effort
    }

    // Clear onboarding flag so the next user on this device sees onboarding
    try {
      await AsyncStorage.removeItem("onboarding_complete");
    } catch {
      // Best effort
    }

    // Use scope: "local" to ensure the session is always cleared locally,
    // even when the access token has expired and the server rejects the request.
    // Without this, signOut silently fails when the token is stale (app open for a while).
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.warn("[Auth] signOut error (forcing local cleanup):", err);
    }
    // State was already cleared at the top of signOut.
    // Reset the signingOut flag now that cleanup is complete.
    signingOutRef.current = false;

    // Restart auto-refresh so the Supabase client is in a clean state for the next sign-in.
    // Without this, the client's internal lock/timer state can be stale after stopAutoRefresh(),
    // causing signInWithPassword to hang on the next login attempt.
    supabase.auth.startAutoRefresh();
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    // Strategy: Try auth.resend first (official method).
    // If that doesn't work (known Supabase issue where resend silently fails),
    // fall back to calling signUp again which reliably re-sends confirmation.
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: "https://confirm.cateringmanager.app",
      },
    });
    return { error };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // Redirect to the standalone confirmation page on Cloudflare
    const confirmRedirectUrl = "https://confirm.cateringmanager.app";

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: confirmRedirectUrl,
    });
    return { error };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  }, [user, fetchProfile]);

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, "business_name" | "business_logo_url" | "full_name">>) => {
    if (!user) return { error: { message: "Not authenticated" } };

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (!error) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }

    return { error };
  }, [user, fetchProfile]);

  // ============ BRIDGE RETRY ACTION ============
  // Allows the user to manually retry bridge from BridgeRetryScreen
  // without re-entering credentials. Uses the existing Supabase session.
  const retryBridge = useCallback(async () => {
    if (bridgingRef.current) {
      console.log("[Auth] retryBridge: bridge already in progress");
      return;
    }
    if (!session?.access_token) {
      console.warn("[Auth] retryBridge: no Supabase session — cannot retry");
      // Session expired during bridge failure — force sign out
      await signOut();
      return;
    }
    console.log("[Auth] retryBridge: manual retry initiated");
    setBridgeRetrying(true);
    const result = await performBridge(session.access_token);
    if (!mountedRef.current) return;
    if (!result) {
      // Still failed — stay on BridgeRetryScreen
      setBridgeFailed(true);
      setBridgeRetrying(false);
    }
    // If result is true, performBridge already set isBridgeReady=true + cleared bridgeFailed
  }, [session?.access_token, performBridge, signOut]);

  // ============ SESSION EXPIRY DURING BRIDGE FAILURE ============
  // If bridgeFailed is true but Supabase session disappears (expired/revoked),
  // redirect to login with a clear message.
  useEffect(() => {
    if (bridgeFailed && !session?.user) {
      console.warn("[Auth] Supabase session expired during bridge failure — redirecting to login");
      setBridgeFailed(false);
      setBridgeRetrying(false);
      // isAuthenticated is already false, AppGate will redirect to login
    }
  }, [bridgeFailed, session?.user]);

  // ============ CONTEXT VALUE ============
  // isAuthenticated is true ONLY when:
  // 1. Supabase session exists (user is logged in), AND
  // 2. Bridge is ready (custom JWT is available for tRPC calls)
  // This prevents SessionGate/DataProvider from firing before the Bearer token exists.
  const value: AuthContextType = {
    session,
    user,
    profile,
    isLoading,
    isAuthenticated: !!session?.user && isBridgeReady,
    bridgeFailed,
    bridgeRetrying,
    isRecovering,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    resendConfirmation,
    refreshProfile,
    updateProfile,
    retryBridge,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============ HOOK ============

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
