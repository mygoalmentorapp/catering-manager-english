import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { FeatureFlag } from "./supabase-types";
import { RemoteConfigService, type RemoteConfig, SAFE_DEFAULTS as RC_SAFE_DEFAULTS } from "./services/remote-config-service";
import { FeatureFlagService, type FeatureFlags, FLAG_SAFE_DEFAULTS } from "./services/feature-flag-service";
import { FeatureService, type FeatureName } from "./services/feature-service";
import { AllowedDomainsService } from "./services/allowed-domains-service";
import { devLog, warnLog } from "./services/environment";

// ============ TYPES ============

interface TrialState {
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
  /** In beta, trial NEVER blocks the user — this is always false */
  shouldBlock: false;
}

interface ConfigState {
  /** Legacy feature_flags map — still fetched for backward compat */
  featureFlags: Record<string, boolean>;
  trial: TrialState;
  isLoading: boolean;
  isMaintenanceMode: boolean;

  // ── Session 1.5: new remote config state ──
  /** Remote config master switches (from remote_config table via tRPC) */
  remoteConfig: RemoteConfig;
  /** Feature flags from the new FeatureFlagService (cache-first) */
  serviceFlags: FeatureFlags;
  /** Combined feature states: true only when BOTH master + flag are ON */
  featureStates: Record<FeatureName, boolean>;
  /** Whether remote config has been loaded at least once (from cache or network) */
  remoteConfigReady: boolean;
}

interface ConfigActions {
  refreshConfig: () => Promise<void>;
  isFeatureEnabled: (flagName: string) => boolean;

  // ── Session 1.5: new actions ──
  /** Check if a feature is active (master + flag). Sync — uses last loaded state. */
  isFeatureActive: (feature: FeatureName) => boolean;
  /** Check if an external URL is allowed (async — needs domain lookup). */
  isExternalUrlAllowed: (url: string) => Promise<boolean>;
  /** Force refresh all remote config + feature flags + domains. */
  refreshRemoteConfig: () => Promise<void>;
}

type ConfigContextType = ConfigState & ConfigActions;

const ConfigContext = createContext<ConfigContextType | null>(null);

// ============ CACHE KEYS ============

const CACHE_FEATURE_FLAGS = "cache_feature_flags";
const CACHE_TRIAL_STATE = "cache_trial_state";

// ============ SAFE DEFAULT FEATURE STATES ============

const SAFE_FEATURE_STATES: Record<FeatureName, boolean> = {
  paywall: false,
  revenuecat: false,
  remote_campaigns: false,
  feedback_popup: false,
  global_message: false,
  external_urls: false,
  dynamic_onboarding: false,
};

// ============ PROVIDER ============

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  // ── State ──
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [trial, setTrial] = useState<TrialState>({
    trialStartedAt: null,
    trialEndsAt: null,
    daysRemaining: 14,
    isExpired: false,
    shouldBlock: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // ── Session 1.5: new state ──
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>({ ...RC_SAFE_DEFAULTS });
  const [serviceFlags, setServiceFlags] = useState<FeatureFlags>({ ...FLAG_SAFE_DEFAULTS });
  const [featureStates, setFeatureStates] = useState<Record<FeatureName, boolean>>({ ...SAFE_FEATURE_STATES });
  const [remoteConfigReady, setRemoteConfigReady] = useState(false);

  // Track whether user is authenticated for gating Supabase fetches
  const isAuthenticatedRef = useRef(false);

  // ── Load cached data first ──
  const loadCachedData = useCallback(async () => {
    try {
      const [cachedFlags, cachedTrial] = await Promise.all([
        AsyncStorage.getItem(CACHE_FEATURE_FLAGS),
        AsyncStorage.getItem(CACHE_TRIAL_STATE),
      ]);

      if (cachedFlags) {
        setFeatureFlags(JSON.parse(cachedFlags));
      }
      if (cachedTrial) {
        setTrial({ ...JSON.parse(cachedTrial), shouldBlock: false });
      }
    } catch (err) {
      warnLog("Config", "Cache load error:", err);
    }
  }, []);

  // ── Fetch feature flags from Supabase (authenticated-only) ──
  const fetchFeatureFlags = useCallback(async () => {
    try {
      if (isAuthenticatedRef.current) {
        const { data: flagsData, error: flagsError } = await supabase
          .from("feature_flags")
          .select("flag_name, enabled");

        if (flagsData && !flagsError) {
          const flagMap: Record<string, boolean> = {};
          for (const flag of flagsData) {
            flagMap[flag.flag_name] = flag.enabled;
          }
          setFeatureFlags(flagMap);
          await AsyncStorage.setItem(CACHE_FEATURE_FLAGS, JSON.stringify(flagMap));
        }
      }
    } catch (err) {
      warnLog("Config", "Feature flags fetch error:", err);
    }
  }, []);

  // ── Session 1.5: Load remote config services (non-blocking) ──
  const loadRemoteServices = useCallback(async () => {
    try {
      devLog("Config", "Loading remote config services...");

      // These services use cache-first strategy internally.
      // RemoteConfigService now uses tRPC (server-side service_role) to bypass RLS.
      const [config, flags] = await Promise.all([
        RemoteConfigService.getConfig(),
        FeatureFlagService.getFlags(),
      ]);

      setRemoteConfig(config);
      setServiceFlags(flags);

      // Compute combined feature states
      const states: Record<string, boolean> = {};
      const FEATURE_MAP: Record<FeatureName, { masterKey: keyof Omit<RemoteConfig, "schema_version">; flagName: string }> = {
        paywall: { masterKey: "paywall_enabled", flagName: "paywall" },
        revenuecat: { masterKey: "revenuecat_enabled", flagName: "revenuecat" },
        remote_campaigns: { masterKey: "remote_campaigns_enabled", flagName: "remote_campaigns" },
        feedback_popup: { masterKey: "feedback_popup_enabled", flagName: "feedback_popup" },
        global_message: { masterKey: "global_message_enabled", flagName: "global_message" },
        external_urls: { masterKey: "external_urls_enabled", flagName: "external_urls" },
        dynamic_onboarding: { masterKey: "dynamic_onboarding_enabled", flagName: "dynamic_onboarding" },
      };

      for (const [feature, mapping] of Object.entries(FEATURE_MAP)) {
        states[feature] = config[mapping.masterKey] === true && flags[mapping.flagName] === true;
      }

      setFeatureStates(states as Record<FeatureName, boolean>);
      setRemoteConfigReady(true);

      console.log("[Config] Remote config loaded:", {
        configKeys: Object.keys(config),
        activeFeatures: Object.entries(states).filter(([, v]) => v).map(([k]) => k),
        allStates: states,
      });
    } catch (err) {
      warnLog("Config", "Remote services load error (using safe defaults):", err);
      // Safe defaults are already set in initial state
      setRemoteConfigReady(true);
    }
  }, []);

  // ── Session 1.5: Refresh all remote config ──
  const refreshRemoteConfig = useCallback(async () => {
    try {
      await FeatureService.refreshAll();
      await loadRemoteServices();
    } catch (err) {
      warnLog("Config", "Remote config refresh error:", err);
    }
  }, [loadRemoteServices]);

  // ── Session 1.5: Sync isFeatureActive (uses local state, not async) ──
  const isFeatureActive = useCallback((feature: FeatureName): boolean => {
    return featureStates[feature] ?? false;
  }, [featureStates]);

  // ── Session 1.5: Async external URL check ──
  const isExternalUrlAllowed = useCallback(async (url: string): Promise<boolean> => {
    return FeatureService.isExternalUrlAllowed(url);
  }, []);

  // Update trial state from profile
  const updateTrialFromProfile = useCallback(async (profile: { trial_started_at?: string; trial_ends_at?: string } | null) => {
    if (!profile?.trial_started_at || !profile?.trial_ends_at) {
      return;
    }

    const now = new Date();
    const endsAt = new Date(profile.trial_ends_at);
    const diffMs = endsAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const isExpired = diffMs <= 0;

    const trialState: TrialState = {
      trialStartedAt: profile.trial_started_at,
      trialEndsAt: profile.trial_ends_at,
      daysRemaining,
      isExpired,
      shouldBlock: false, // BETA: NEVER block the user
    };

    setTrial(trialState);
    await AsyncStorage.setItem(CACHE_TRIAL_STATE, JSON.stringify(trialState));
  }, []);

  // ── Initialize on mount ──
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 1. Load cached data instantly (fast startup)
      await loadCachedData();

      // 2. Load remote services (cache-first, non-blocking)
      //    RemoteConfigService now uses tRPC → server → service_role → Supabase
      await loadRemoteServices();

      // 3. Fetch feature flags (needs auth for RLS)
      await fetchFeatureFlags();

      if (mounted) setIsLoading(false);
    };

    init();

    return () => { mounted = false; };
  }, [loadCachedData, fetchFeatureFlags, loadRemoteServices]);

  // ── Listen for auth changes ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const wasAuthenticated = isAuthenticatedRef.current;
      isAuthenticatedRef.current = !!session?.user;

      if (session?.user) {
        // User just logged in — fetch profile for trial
        const { data: profile } = await supabase
          .from("profiles")
          .select("trial_started_at, trial_ends_at")
          .eq("id", session.user.id)
          .single();

        await updateTrialFromProfile(profile);

        // If user just became authenticated, refresh remote config
        // (now we have auth to read authenticated-only tables)
        if (!wasAuthenticated) {
          devLog("Config", "User authenticated — refreshing remote config");
          await refreshRemoteConfig();
          await fetchFeatureFlags();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [updateTrialFromProfile, refreshRemoteConfig, fetchFeatureFlags]);

  // ── refreshConfig ──
  const refreshConfig = useCallback(async () => {
    await fetchFeatureFlags();
    await refreshRemoteConfig();
  }, [fetchFeatureFlags, refreshRemoteConfig]);

  // ── isFeatureEnabled (legacy feature_flags) ──
  const isFeatureEnabled = useCallback((flagName: string): boolean => {
    return featureFlags[flagName] ?? false;
  }, [featureFlags]);

  // Maintenance mode reads from remote_config (not legacy app_config).
  // Safe default: false (maintenance_enabled=false in SAFE_DEFAULTS).
  const isMaintenanceMode = remoteConfig.maintenance_enabled ?? false;

  const value: ConfigContextType = {
    // State
    featureFlags,
    trial,
    isLoading,
    isMaintenanceMode,

    // Session 1.5 state
    remoteConfig,
    serviceFlags,
    featureStates,
    remoteConfigReady,

    // Actions
    refreshConfig,
    isFeatureEnabled,

    // Session 1.5 actions
    isFeatureActive,
    isExternalUrlAllowed,
    refreshRemoteConfig,
  };

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

// ============ HOOK ============

export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
