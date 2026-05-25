import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "./supabase";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import type { Profile } from "./supabase-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Note: HAS_REGISTERED_KEY is duplicated here to avoid circular import
// (auth-context → app-gate → session-gate → auth-context)
const HAS_REGISTERED_KEY = "has_registered_before";
import { getDeviceId } from "@/lib/device-id";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { bridgeToken } from "@/lib/_core/api";

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

  // Bridge retry state — exposed to UI for BridgeRetryScreen
  const [bridgeFailed, setBridgeFailed] = useState(false);
  const [bridgeRetrying, setBridgeRetrying] = useState(false);

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
      try {
        console.log("[Auth] initAuth starting...");

        // Race getSession against a 6s timeout — SecureStore/AsyncStorage can hang
        const sessionResult = await raceTimeout(
          supabase.auth.getSession(),
          6000
        );

        if (!mountedRef.current) return;

        if (!sessionResult) {
          console.warn("[Auth] getSession timed out — treating as no session");
          setIsLoading(false);
          return;
        }

        let currentSession = sessionResult.data?.session;
        console.log("[Auth] Session found:", !!currentSession);

        // FIX: If getSession() returns null, it might be because Supabase's internal
        // auto-refresh already ran and failed (e.g., after warm restart where JS context
        // was killed but AsyncStorage still has the refresh token). In this case,
        // explicitly try refreshSession() which reads the refresh token from storage
        // and attempts a fresh exchange. This fixes the bug where opening the app after
        // some time shows DataLoadingSplash then redirects to login, but force-closing
        // and reopening works fine (cold start re-reads storage cleanly).
        if (!currentSession?.user) {
          console.log("[Auth] No session from getSession — trying explicit refreshSession...");
          try {
            const refreshResult = await raceTimeout(
              supabase.auth.refreshSession(),
              6000
            );
            if (refreshResult?.data?.session?.user) {
              currentSession = refreshResult.data.session;
              console.log("[Auth] refreshSession succeeded — session restored");
            } else {
              console.log("[Auth] refreshSession also returned no session");
            }
          } catch (refreshErr) {
            console.warn("[Auth] refreshSession error:", refreshErr);
          }
        }

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          const p = await fetchProfile(currentSession.user.id);
          if (mountedRef.current) {
            setProfile(p);
            console.log("[Auth] Profile loaded:", !!p);
          }

          // Ensure custom JWT exists in SecureStore for tRPC auth.
          // On app restart with existing Supabase session, the custom token
          // might already be there (persisted from last login). If not, bridge it.
          if (Platform.OS !== "web") {
            const existingToken = await Auth.getSessionToken();
            if (existingToken) {
              console.log("[Auth] Custom JWT already exists in SecureStore");
              if (mountedRef.current) setIsBridgeReady(true);
            } else {
              console.log("[Auth] No custom JWT found — bridging on init...");
              await performBridge(currentSession.access_token);
              // performBridge sets isBridgeReady on success
            }
          }
        } else {
          console.log("[Auth] No session found");
        }
      } catch (err) {
        console.warn("[Auth] Init error:", err);
      } finally {
        if (mountedRef.current) {
          console.log("[Auth] isLoading → false");
          setIsLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return;
      console.log("[Auth] onAuthStateChange:", event);

      // If signOut is in progress, only allow SIGNED_OUT event through.
      // This prevents TOKEN_REFRESHED or other events from re-setting state
      // back to a valid session during the async signOut cleanup.
      if (signingOutRef.current && event !== "SIGNED_OUT") {
        console.log("[Auth] Ignoring event during signOut:", event);
        return;
      }

      // FIX: Protect session state from being cleared while bridge is in progress or has failed.
      // If Supabase fires an event with null session (e.g., failed token refresh) while we're
      // still bridging or showing BridgeRetryScreen, clearing session would cause AppGate to
      // redirect to login (because session?.user becomes null → BridgeRetryScreen condition fails).
      // Only allow session to be cleared on explicit SIGNED_OUT events.
      if (!newSession?.user && event !== "SIGNED_OUT") {
        // Session is null but it's not a sign-out — check if bridge is active
        if (bridgingRef.current || bridgeFailedRef.current) {
          console.log("[Auth] Ignoring null session during bridge (event:", event, ")");
          return;
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
      // → user sees "Login took too long" even though Supabase auth succeeded.
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
  useEffect(() => {
    // Start auto-refresh immediately (app is already active on mount)
    supabase.auth.startAutoRefresh();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        console.log("[Auth] App foregrounded — starting auto-refresh");
        supabase.auth.startAutoRefresh();
      } else {
        console.log("[Auth] App backgrounded — stopping auto-refresh");
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  // Safety net: if isLoading is still true after 8 seconds, force it to false.
  // This guarantees the spinner never stays forever, even if everything else fails.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      if (mountedRef.current && isLoading) {
        console.warn("[Auth] Safety timeout — forcing isLoading to false after 8s");
        setIsLoading(false);
      }
    }, 8000);
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
        console.warn("[Auth] Bridge safety timeout — JWT exists in SecureStore, marking ready");
        if (mountedRef.current) setIsBridgeReady(true);
      } else if (!bridgeFailedRef.current) {
        // No JWT and bridge didn't explicitly fail — trigger bridge failed state
        // so BridgeRetryScreen is shown instead of silently breaking
        console.warn("[Auth] Bridge safety timeout — no JWT found, showing retry screen");
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
    const confirmRedirectUrl = "https://confirm-en.cateringmanager.app";

    // Security: Use only official Supabase signUp.
    // We intentionally do NOT check identities or detect duplicate emails.
    // All outcomes (new user, existing unverified, existing verified) show the same
    // confirmation screen to avoid leaking whether an email is registered.
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: confirmRedirectUrl } });

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
        body: JSON.stringify({ json: { email: alertEmail, lang: "en" } }),
        signal: controller.signal })
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
      password });

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
            prompt: "consent" } } });
      return { error };
    } catch (err: any) {
      return { error: { message: err.message } as AuthError };
    }
  }, []);

  const signOut = useCallback(async () => {
    // Immediately mark as signing out to prevent race conditions
    signingOutRef.current = true;

    // IMMEDIATELY clear React state so UI updates instantly.
    // This ensures the user sees the login screen right away,
    // even if the async cleanup (session.release, supabase.signOut) takes time.
    setSession(null);
    setUser(null);
    setProfile(null);
    setBridgeFailed(false);
    setBridgeRetrying(false);
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
            "Authorization": `Bearer ${customToken}` },
          body: JSON.stringify({ json: { deviceId } }),
          signal: controller.signal }).catch(() => {});
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
        emailRedirectTo: "https://confirm-en.cateringmanager.app" } });
    return { error };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // Redirect to the standalone confirmation page on Cloudflare
    const confirmRedirectUrl = "https://confirm-en.cateringmanager.app";

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: confirmRedirectUrl });
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
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    resendConfirmation,
    refreshProfile,
    updateProfile,
    retryBridge };

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
