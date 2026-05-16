import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Linking, Platform } from "react-native";
import { router, useSegments } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { useNetwork } from "@/lib/network-context";
import { DeviceProvider } from "@/lib/device-context";
import { DeviceGate } from "@/components/device-gate";

import Constants from "expo-constants";
import { DataLoadingSplash } from "@/components/data-loading-splash";
import { ConnectionErrorScreen } from "./connection-error-screen";
// ConnectionBanner removed — smooth UX, no network status banners
import { BridgeRetryScreen } from "./bridge-retry-screen";
import { ForceUpdateScreen } from "./force-update-screen";
import { useConfig } from "@/lib/config-context";
import { DS_COLORS } from "@/lib/design-system";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete";
const BETA_INTRO_SEEN_KEY = "beta_intro_seen";
export const HAS_REGISTERED_KEY = "has_registered_before";

/**
 * Check if a URL string contains a login hint (e.g., ?screen=login).
 */
function urlHasLoginHint(url: string | null): boolean {
  if (!url) return false;
  return url.includes("screen=login") || url.includes("/auth/login");
}

/**
 * AppGate handles the routing guard for the app launch flow:
 * 1. Onboarding (first time only)
 * 2. Auth (login/signup) — adaptive: signup for new users, login for returning users
 * 3. Beta Intro (first time after auth)
 * 4. Device binding check (one active device per user, email OTP for transfer)
 * 5. Home (tabs)
 *
 * Network policy:
 * - No internet on app open → Connection error screen
 * - After data loaded, offline → view-only (handled by mutation guards)
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, bridgeFailed, bridgeRetrying, retryBridge, signOut: authSignOut, session } = useAuth();
  const segments = useSegments();
  const [gateReady, setGateReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [betaIntroDone, setBetaIntroDone] = useState<boolean | null>(null);
  const [hasRegisteredBefore, setHasRegisteredBefore] = useState<boolean | null>(null);
  const [initialRedirectDone, setInitialRedirectDone] = useState(false);
  const initialRedirectRef = useRef(false);
  const [deepLinkLoginHint, setDeepLinkLoginHint] = useState<boolean | null>(null);

  const markInitialRedirectDone = useCallback(() => {
    if (!initialRedirectRef.current) {
      initialRedirectRef.current = true;
      setInitialRedirectDone(true);
    }
  }, []);

  // Check initial URL for login hint on mount
  useEffect(() => {
    let cancelled = false;

    async function checkInitialUrl() {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const hasHint = urlHasLoginHint(window.location.href);
          if (!cancelled) setDeepLinkLoginHint(hasHint);
        } else {
          const url = await Linking.getInitialURL();
          if (!cancelled) setDeepLinkLoginHint(urlHasLoginHint(url));
        }
      } catch {
        if (!cancelled) setDeepLinkLoginHint(false);
      }
    }

    checkInitialUrl();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (urlHasLoginHint(url)) {
        AsyncStorage.setItem(HAS_REGISTERED_KEY, "true").catch(() => {});
        setHasRegisteredBefore(true);
        setDeepLinkLoginHint(true);
        router.replace("/auth/login" as any);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // Track whether beta was dismissed in THIS session (prevents redirect loop)
  const betaDismissedThisSession = useRef(false);

  // Load/reload local flags
  const loadFlags = useCallback(async () => {
    try {
      const [ob, hr] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
        AsyncStorage.getItem(HAS_REGISTERED_KEY),
      ]);
      setOnboardingDone(ob === "true");
      // Beta screen shows on EVERY app open, but once dismissed this session, stay dismissed
      if (!betaDismissedThisSession.current) {
        setBetaIntroDone(false);
      }
      setHasRegisteredBefore(hr === "true");
      if (!gateReady) setGateReady(true);
    } catch {
      setOnboardingDone(false);
      if (!betaDismissedThisSession.current) {
        setBetaIntroDone(false);
      }
      setHasRegisteredBefore(false);
      if (!gateReady) setGateReady(true);
    }
  }, [gateReady]);

  useEffect(() => {
    loadFlags();
  }, [segments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Routing guard
  useEffect(() => {
    if (!gateReady || authLoading) return;
    if (onboardingDone === null || betaIntroDone === null || deepLinkLoginHint === null) return;

    const currentRoute = segments.join("/");

    if (!onboardingDone) {
      if (currentRoute !== "onboarding") {
        router.replace("/onboarding" as any);
      }
      markInitialRedirectDone();
      return;
    }

    if (!isAuthenticated) {
      // If bridge failed but Supabase session exists, don't redirect to login.
      // The BridgeRetryScreen (rendered in the JSX below) will handle this state.
      if (bridgeFailed && session?.user) {
        markInitialRedirectDone();
        return;
      }
      if (!currentRoute.startsWith("auth") && !currentRoute.startsWith("oauth") && currentRoute !== "confirm") {
        if (hasRegisteredBefore || deepLinkLoginHint) {
          if (deepLinkLoginHint && !hasRegisteredBefore) {
            AsyncStorage.setItem(HAS_REGISTERED_KEY, "true").catch(() => {});
          }
          router.replace("/auth/login" as any);
        } else {
          router.replace("/auth/signup" as any);
        }
      }
      markInitialRedirectDone();
      return;
    }

    if (!betaIntroDone) {
      // If user is already on tabs (dismissed beta), mark as done for this session
      if (currentRoute.startsWith("(tabs)")) {
        betaDismissedThisSession.current = true;
        setBetaIntroDone(true);
        markInitialRedirectDone();
        return;
      }
      if (currentRoute !== "beta-intro") {
        router.replace("/beta-intro" as any);
      }
      markInitialRedirectDone();
      return;
    }

    const isOnProtectedRoute =
      currentRoute.startsWith("auth") ||
      currentRoute === "onboarding" ||
      currentRoute === "beta-intro" ||
      currentRoute === "confirm" ||
      currentRoute.startsWith("oauth");

    if (isOnProtectedRoute) {
      router.replace("/(tabs)" as any);
    }

    markInitialRedirectDone();
  }, [gateReady, authLoading, isAuthenticated, onboardingDone, betaIntroDone, hasRegisteredBefore, deepLinkLoginHint, segments, markInitialRedirectDone, bridgeFailed, session?.user]);

  // Mark as returning user (used by AuthenticatedGate before signOut)
  const markAsReturningUser = useCallback(async () => {
    setHasRegisteredBefore(true);
    await AsyncStorage.setItem(HAS_REGISTERED_KEY, "true").catch(() => {});
  }, []);

  // Access data loading state
  const { loading: dataLoading } = useData();

  // ============ FORCE UPDATE GATE ============
  // Read remote config to check if force update is required.
  // useConfig() is safe here because ConfigProvider wraps AppGate in _layout.tsx.
  // Fail-safe: if remoteConfig is unavailable (safe defaults), force_update_enabled=false → never blocks.
  const { remoteConfig, remoteConfigReady } = useConfig();
  const currentVersionCode = Constants.expoConfig?.android?.versionCode ?? 1;
  const forceUpdateRequired =
    remoteConfigReady &&
    remoteConfig.force_update_enabled === true &&
    currentVersionCode < remoteConfig.minimum_supported_version_code;

  // Show DataLoadingSplash while gate flags load + auth initializes + initial redirect.
  // This replaces the previous white screen with spinner, giving a smooth branded transition.
  const noopSplashCallback = useCallback(() => {}, []);
  if (!gateReady || authLoading || !initialRedirectDone) {
    return <DataLoadingSplash onMinTimeComplete={noopSplashCallback} />;
  }

  // Force update blocks ALL usage — shown before any other gate.
  // Does NOT block if remote config is unavailable (fail-safe).
  if (forceUpdateRequired) {
    return (
      <ForceUpdateScreen
        title={remoteConfig.force_update_title}
        message={remoteConfig.force_update_message}
        buttonText={remoteConfig.force_update_button_text}
        googlePlayUrl={remoteConfig.google_play_url}
      />
    );
  }

  // ============ BRIDGE RETRY GATE ============
  // Supabase session exists but bridge (custom JWT exchange) failed.
  // Show retry screen instead of redirecting to login.
  // isAuthenticated is still false (isBridgeReady=false), so DataProvider
  // won't fire premature tRPC calls.
  if (bridgeFailed && session?.user) {
    return (
      <BridgeRetryScreen
        email={session.user.email ?? ""}
        isRetrying={bridgeRetrying}
        onRetry={retryBridge}
        onLogout={authSignOut}
      />
    );
  }

  // After authentication, wrap with DeviceProvider + DeviceGate
  // DeviceGate checks device binding before allowing app access.
  // SessionProvider is removed — device binding replaces session enforcement.
  if (isAuthenticated) {
    return (
      <DeviceProvider>
        <DeviceGate>
          <AuthenticatedGate dataLoading={dataLoading} markAsReturningUser={markAsReturningUser}>
            {children}
          </AuthenticatedGate>
        </DeviceGate>
      </DeviceProvider>
    );
  }

  return <>{children}</>;
}

/**
 * AuthenticatedGate — handles network state for authenticated users.
 * Device binding is handled by DeviceGate (parent).
 */
function AuthenticatedGate({
  children,
  dataLoading,
  markAsReturningUser }: {
  children: React.ReactNode;
  dataLoading: boolean;
  markAsReturningUser: () => Promise<void>;
}) {
  const { signOut } = useAuth();
  const { isConnected, isInitialized: networkInitialized } = useNetwork();

  // Minimum splash time gate: splash must show at least 2 phrases (3s each = 6s)
  // before allowing the app to render, even if data loads faster.
  // Use a ref to persist across re-renders so splash doesn't re-show on background return.
  const splashShownRef = useRef(false);
  const [splashMinTimeDone, setSplashMinTimeDone] = useState(splashShownRef.current);
  const handleSplashMinTimeComplete = useCallback(() => {
    splashShownRef.current = true;
    setSplashMinTimeDone(true);
  }, []);

  // ============ NETWORK GATE (before data loads) ============
  // With offline-first: if we haven't loaded data yet AND there's no connection,
  // the DataProvider will try to load from cache. Only show error if cache is also empty.
  // The DataProvider handles this internally — if cache exists, dataLoading becomes false.
  // If both server and cache fail, dataLoading stays true and we show the error screen.
  if (dataLoading && networkInitialized && !isConnected) {
    // Give the cache a chance to load (DataProvider tries cache in useEffect)
    // If after a short time data is still loading, show error
    return (
      <ConnectionErrorScreen
        onRetry={() => {}}
        onLogout={signOut}
        isRetrying={false}
      />
    );
  }

  // ============ DATA LOADING / SPLASH GATE ============
  // Show splash while data is loading OR minimum splash time hasn't elapsed.
  // This ensures the user sees at least 2 motivational phrases (3s each)
  // before the app opens, even if cloud data loads quickly.
  if (dataLoading || !splashMinTimeDone) {
    return <DataLoadingSplash onMinTimeComplete={handleSplashMinTimeComplete} />;
  }

  // ============ ALL GOOD — render app ============
  return (
    <View style={{ flex: 1, backgroundColor: DS_COLORS.background }}>
      {children}
    </View>
  );
}
