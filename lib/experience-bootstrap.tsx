/**
 * ExperienceBootstrap — wires Session 2 + 4 services into the app lifecycle.
 *
 * This component:
 * 1. Initializes SessionTracker (app_open + session_start events)
 * 2. Connects SessionTracker callbacks to UserExperienceStateService
 * 3. Tracks screen_viewed events via route segment changes
 * 4. Updates session_timeout_minutes from remote_config
 * 5. (Session 4) Evaluates campaigns via CampaignSelectorService when trigger events fire
 * 6. (Session 4) Renders CampaignRenderer when a campaign is selected
 *
 * ARCHITECTURE NOTE (Session 4 fix):
 * All Supabase DB operations (events, state, campaign state) are routed through
 * tRPC server endpoints (experience.*) which use service_role to bypass RLS.
 * This solves the auth mismatch where the app uses a custom JWT for tRPC but
 * Supabase RLS requires auth.uid() from a Supabase Auth session.
 *
 * Mount this component once inside ConfigProvider + AuthProvider + CriticalFlowProvider.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { useSegments } from "expo-router";
import { useAuth } from "./auth-context";
import { useConfig } from "./config-context";
import { useNetwork } from "./network-context";
import { useCriticalFlow } from "./critical-flow-context";
import { SessionTracker } from "./services/session-tracker";
import { ExperienceEventService } from "./services/experience-event-service";
import { UserExperienceStateService } from "./services/user-experience-state-service";
import { CampaignSelectorService } from "./services/campaign-selector-service";
import { trpc } from "./trpc";
import { devLog, warnLog, isProd } from "./services/environment";
import { CampaignRenderer } from "../components/campaign/campaign-renderer";
import type { RemoteCampaign, RuleContext, CampaignState } from "./services/experience-rule-engine";
import type { FeatureName } from "./services/feature-service";
import Constants from "expo-constants";
import { getLocales } from "expo-localization";
import { APP_KEY, APP_LANGUAGE } from "@/constants/app-identity";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const TAG = "ExperienceBoot";

/**
 * ExperienceBootstrap — invisible component that wires Session 2 + 4 services.
 * Renders CampaignRenderer only when a campaign is selected and eligible.
 */
export function ExperienceBootstrap(): React.ReactElement | null {
  const { isAuthenticated, user, profile } = useAuth();
  const { remoteConfig, remoteConfigReady, isFeatureActive } = useConfig();
  const { isOnline } = useNetwork();
  const { isInCriticalFlow } = useCriticalFlow();
  const segments = useSegments();

  // tRPC client for experience endpoints
  const trpcUtils = trpc.useUtils();

  const prevSegmentsRef = useRef<string>("");
  const isInitializedRef = useRef(false);
  const isAuthInitRef = useRef(false);
  const trpcInjectedRef = useRef(false);

  // ── Session 4: Campaign state ──
  const [activeCampaign, setActiveCampaign] = useState<RemoteCampaign | null>(null);
  const [campaignVisible, setCampaignVisible] = useState(false);
  // In-memory session impression counter (resets on app restart)
  const sessionImpressionsRef = useRef<Record<string, number>>({});
  // Current screen ref for campaign context
  const currentScreenRef = useRef<string>("");

  // ── Refs to always have latest values (avoids stale closures in callbacks) ──
  const isFeatureActiveRef = useRef(isFeatureActive);
  isFeatureActiveRef.current = isFeatureActive;
  const campaignVisibleRef = useRef(campaignVisible);
  campaignVisibleRef.current = campaignVisible;
  const isInCriticalFlowRef = useRef(isInCriticalFlow);
  isInCriticalFlowRef.current = isInCriticalFlow;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  // Track the last trigger event for retry after features load
  const lastTriggerEventRef = useRef<string | null>(null);
  const lastTriggerTimeRef = useRef<number>(0);

  // ── Inject tRPC clients into services when authenticated ──
  useEffect(() => {
    if (!isAuthenticated || trpcInjectedRef.current) return;
    trpcInjectedRef.current = true;

    console.log(`[${TAG}] Injecting tRPC clients + marking services ready`);

    // Mark services as ready (they use vanillaTrpc directly in production)
    ExperienceEventService.setReady();
    UserExperienceStateService.setReady();
    CampaignSelectorService.setReady();

    // Inject tRPC client into ExperienceEventService
    ExperienceEventService.setTrpcClient({
      logEvent: {
        mutate: (input: Record<string, unknown>) =>
          trpcUtils.client.experience.logEvent.mutate(input as any),
      },
    });

    // Inject tRPC client into CampaignSelectorService
    CampaignSelectorService.setTrpcClient({
      getActiveCampaigns: {
        query: () => trpcUtils.client.experience.getActiveCampaigns.query(),
      },
    });

    // Inject tRPC client into UserExperienceStateService
    UserExperienceStateService.setTrpcClient({
      upsertState: {
        mutate: (input: { updates: Record<string, unknown> }) =>
          trpcUtils.client.experience.upsertState.mutate(input),
      },
      getState: {
        query: () => trpcUtils.client.experience.getState.query(),
      },
      incrementCounter: {
        mutate: (input: { field: string }) =>
          trpcUtils.client.experience.incrementCounter.mutate(input),
      },
      getCampaignStates: {
        query: () => trpcUtils.client.experience.getCampaignStates.query(),
      },
      upsertCampaignState: {
        mutate: (input: { campaign_key: string; updates: Record<string, unknown> }) =>
          trpcUtils.client.experience.upsertCampaignState.mutate(input),
      },
    });

    return () => {
      trpcInjectedRef.current = false;
      ExperienceEventService.setNotReady();
      ExperienceEventService.clearTrpcClient();
      UserExperienceStateService.setNotReady();
      UserExperienceStateService.clearTrpcClient();
      CampaignSelectorService.setNotReady();
      CampaignSelectorService.clearTrpcClient();
    };
  }, [isAuthenticated, trpcUtils]);

  // ── Build RuleContext for campaign evaluation ──
  const buildRuleContext = useCallback(async (
    triggerEvent: string | null,
  ): Promise<RuleContext | null> => {
    try {
      const userId = user?.id;
      if (!userId) return null;

      // Fetch user experience state via tRPC (service_role, bypasses RLS)
      const userState = await UserExperienceStateService.getState();

      // Fetch all campaign states via tRPC (service_role, bypasses RLS)
      const campaignStates: Record<string, CampaignState> = {};
      try {
        const rawStates = await UserExperienceStateService.getCampaignStates();
        if (rawStates) {
          for (const row of rawStates) {
            const key = row.campaign_key as string;
            if (!key) continue;
            campaignStates[key] = {
              impressions_total: (row.impressions_total as number) ?? 0,
              impressions_today: (row.impressions_today as number) ?? 0,
              impressions_today_date: (row.impressions_today_date as string) ?? null,
              impressions_this_session: (row.impressions_this_session as number) ?? 0,
              clicks_total: (row.clicks_total as number) ?? 0,
              last_viewed_at: (row.last_viewed_at as string) ?? null,
              last_clicked_at: (row.last_clicked_at as string) ?? null,
              last_dismissed_at: (row.last_dismissed_at as string) ?? null,
              dismissed_count: (row.dismissed_count as number) ?? 0,
              completed: (row.completed as boolean) ?? false,
            };
          }
        }
      } catch {
        // Campaign states unavailable — continue with empty
      }

      // Merge in-memory session impressions
      for (const [key, count] of Object.entries(sessionImpressionsRef.current)) {
        if (campaignStates[key]) {
          campaignStates[key].impressions_this_session = count;
        }
      }

      const ctx: RuleContext = {
        userId,
        currentScreen: currentScreenRef.current || "(tabs)",
        currentEvent: triggerEvent,
        isInCriticalFlow,
        isOnline,
        appVersion: APP_VERSION,
        appKey: APP_KEY, // Identifies which app product
        platform: Platform.OS, // "android" | "ios" | "web"
        language: APP_LANGUAGE, // App variant language (he/en), not device locale
        country: getDeviceCountry(),
        region: getDeviceRegion(),
        environment: isProd ? "prod" : "dev",
        // User state
        firstOpenAt: (userState as any)?.first_open_at ?? null,
        signupAt: (userState as any)?.signup_at ?? null,
        lastActiveAt: (userState as any)?.last_active_at ?? null,
        sessionsCount: (userState as any)?.sessions_count ?? 0,
        productsCreatedCount: (userState as any)?.products_created_count ?? 0,
        ordersCreatedCount: (userState as any)?.orders_created_count ?? 0,
        completedOrdersCount: (userState as any)?.completed_orders_count ?? 0,
        shoppingListsCreatedCount: (userState as any)?.shopping_lists_created_count ?? 0,
        onboardingCompleted: (userState as any)?.onboarding_completed ?? false,
        feedbackSubmitted: (userState as any)?.feedback_submitted ?? false,
        isPremium: profile?.subscription_status === "active" || profile?.subscription_status === "free_access",
        subscriptionStatus: profile?.subscription_status ?? "trial",
        // Campaign state
        campaignStates,
        sessionImpressions: { ...sessionImpressionsRef.current },
      };

      return ctx;
    } catch (err) {
      warnLog(TAG, "buildRuleContext error:", err);
      return null;
    }
  }, [user?.id, isInCriticalFlow, isOnline, profile?.subscription_status]);

  // ── Evaluate campaigns for a trigger event ──
  // Uses refs for gates to avoid stale closure issues in the event listener callback
  const evaluateCampaigns = useCallback(async (triggerEvent: string | null) => {
    console.log(`[${TAG}] evaluateCampaigns called with trigger: ${triggerEvent}`);

    // Gate: must be authenticated
    if (!isAuthenticatedRef.current || !userIdRef.current) {
      console.log(`[${TAG}] GATE: not authenticated (isAuth=${isAuthenticatedRef.current}, userId=${userIdRef.current})`);
      return;
    }

    // NOTE: Feature gates (remote_campaigns, feedback_popup) removed.
    // Server-side getActiveCampaigns already filters by is_enabled/is_archived.
    // Client-side feature flags were unreliable due to Supabase auth timing.

    // Gate: don't show during critical flow
    if (isInCriticalFlowRef.current) {
      console.log(`[${TAG}] GATE: In critical flow — skipping campaign evaluation`);
      return;
    }

    // Gate: don't show if a campaign is already visible
    if (campaignVisibleRef.current) {
      console.log(`[${TAG}] GATE: Campaign already visible — skipping evaluation`);
      return;
    }

    try {
      const ctx = await buildRuleContext(triggerEvent);
      if (!ctx) {
        console.log(`[${TAG}] buildRuleContext returned null`);
        return;
      }

      const campaign = await CampaignSelectorService.selectCampaign(ctx);
      if (campaign) {
        // NOTE: We no longer gate on isFeatureActive("feedback_popup") here.
        // The server already filters campaigns by is_enabled. If we need to disable
        // a specific campaign, we set is_enabled=false in the remote_campaigns table.
        // The client-side feature flag was unreliable due to Supabase auth timing.

        console.log(`[${TAG}] ✅ Campaign selected: ${campaign.campaign_key} (trigger: ${triggerEvent})`);
        // Campaign content is already in the correct language (server filters by app_language)
        setActiveCampaign(campaign);
        setCampaignVisible(true);
      } else {
        console.log(`[${TAG}] No eligible campaign for trigger: ${triggerEvent}`);
      }
    } catch (err) {
      console.error(`[${TAG}] evaluateCampaigns error:`, err);
    }
  }, [buildRuleContext]);

  // ── 1. Initialize SessionTracker once on mount ──
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Set app version for events
    ExperienceEventService.setAppVersion(APP_VERSION);

    // Register callbacks BEFORE init so cold-start events trigger them
    SessionTracker.onSessionStart(() => {
      devLog(TAG, "session_start callback → updating state");
      UserExperienceStateService.onSessionStart().catch(() => {});
    });

    SessionTracker.onAppOpen(() => {
      devLog(TAG, "app_open callback → updating state");
      UserExperienceStateService.onAppOpen(APP_VERSION).catch(() => {});
    });

    // Initialize tracker (fires cold-start app_open + session_start if needed)
    SessionTracker.init().catch(() => {});

    console.log(`[${TAG}] Initialized with app version: ${APP_VERSION}`);

    return () => {
      SessionTracker.destroy();
    };
  }, []);

  // ── 2. Update session timeout from remote_config ──
  useEffect(() => {
    if (!remoteConfigReady) return;
    const timeout = remoteConfig.session_timeout_minutes;
    if (typeof timeout === "number" && timeout > 0) {
      SessionTracker.setSessionTimeout(timeout);
    }
  }, [remoteConfigReady, remoteConfig]);

  // ── 3. Initialize user state when authenticated ──
  useEffect(() => {
    if (!isAuthenticated || isAuthInitRef.current) return;
    isAuthInitRef.current = true;

    console.log(`[${TAG}] User authenticated → initializing user state`);
    UserExperienceStateService.initForUser(APP_VERSION).catch(() => {});

    // CRITICAL FIX: SessionTracker fires session_start during cold start BEFORE
    // setReady() is called. So onSessionStart() no-ops and sessions_count stays 0.
    // We must increment it now that the service is ready.
    // This ensures the current session is always counted.
    UserExperienceStateService.onSessionStart().catch((err) => {
      console.error(`[${TAG}] Failed to increment sessions_count post-auth:`, err);
    });

    // Pre-load campaigns cache in background
    CampaignSelectorService.refresh().catch(() => {});

    // Reset on logout
    return () => {
      isAuthInitRef.current = false;
      // Clear session impressions on logout
      sessionImpressionsRef.current = {};
    };
  }, [isAuthenticated]);

  // ── 4. Track screen_viewed on route changes ──
  useEffect(() => {
    if (!isAuthenticated) return;

    const currentRoute = segments.join("/");
    if (!currentRoute || currentRoute === prevSegmentsRef.current) return;

    // Skip auth/onboarding/system routes
    if (
      currentRoute.startsWith("auth") ||
      currentRoute === "onboarding" ||
      currentRoute === "beta-intro" ||
      currentRoute === "confirm" ||
      currentRoute.startsWith("oauth")
    ) {
      prevSegmentsRef.current = currentRoute;
      return;
    }

    prevSegmentsRef.current = currentRoute;
    currentScreenRef.current = currentRoute;
    devLog(TAG, "screen_viewed:", currentRoute);
    ExperienceEventService.logScreenViewed(currentRoute).catch(() => {});

    // Session 4: Evaluate campaigns on screen_viewed (if trigger_event matches)
    // Use setTimeout to avoid blocking the navigation
    setTimeout(() => {
      evaluateCampaigns("screen_viewed").catch(() => {});
    }, 500);
  }, [segments, isAuthenticated, evaluateCampaigns]);

  // ── 5. Session 4: Listen for business events that may trigger campaigns ──
  // IMPORTANT: Does NOT depend on remoteConfigReady — the evaluateCampaigns function
  // uses refs to check feature gates at call time, and stores the trigger event for
  // retry if features aren't loaded yet.
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log(`[${TAG}] Effect #5: Registering event subscriber (isAuthenticated=true)`);

    // Subscribe to trigger events via ExperienceEventService callback
    const unsubscribe = ExperienceEventService.onEvent((eventName: string) => {
      console.log(`[${TAG}] onEvent received: ${eventName}`);
      // Only evaluate for business events that could be trigger_events
      const triggerableEvents = [
        "app_open",
        "session_start",
        "order_created",
        "order_completed",
        "product_created",
        "shopping_list_created",
        "feedback_submitted",
        "onboarding_completed",
      ];
      if (triggerableEvents.includes(eventName)) {
        // Small delay to let state updates propagate
        setTimeout(() => {
          evaluateCampaigns(eventName).catch(() => {});
        }, 1000);
      }
    });

    return unsubscribe;
  }, [isAuthenticated, evaluateCampaigns]);

  // ── 5b. Retry campaign evaluation when features become available ──
  // If a trigger event was missed because features weren't loaded yet,
  // retry evaluation once remoteConfigReady becomes true.
  useEffect(() => {
    if (!remoteConfigReady || !isAuthenticated) return;

    // Check if there was a recent trigger event that was blocked by feature gate
    const lastTrigger = lastTriggerEventRef.current;
    const lastTime = lastTriggerTimeRef.current;
    const elapsed = Date.now() - lastTime;

    if (lastTrigger && elapsed < 30000) {
      // Retry within 30 seconds of the original trigger
      console.log(`[${TAG}] Features now ready — retrying trigger: ${lastTrigger} (${elapsed}ms ago)`);
      lastTriggerEventRef.current = null;
      lastTriggerTimeRef.current = 0;
      setTimeout(() => {
        evaluateCampaigns(lastTrigger).catch(() => {});
      }, 500);
    }
  }, [remoteConfigReady, isAuthenticated, evaluateCampaigns]);

  // ── 6. Session 4: Campaign close handler ──
  const handleCampaignClose = useCallback(() => {
    console.log(`[${TAG}] Campaign closed`);
    setCampaignVisible(false);
    // Keep activeCampaign for a moment so exit animation can play
    setTimeout(() => {
      setActiveCampaign(null);
    }, 400);
  }, []);

  // ── 7. Session 4: Track campaign viewed (update session impressions) ──
  const handleCampaignViewed = useCallback((campaignKey: string) => {
    sessionImpressionsRef.current[campaignKey] =
      (sessionImpressionsRef.current[campaignKey] ?? 0) + 1;
    console.log(`[${TAG}] Session impressions for ${campaignKey}:`, sessionImpressionsRef.current[campaignKey]);
  }, []);

  // ── Render ──
  // Only render CampaignRenderer when there's an active campaign
  if (!activeCampaign) return null;

  return (
    <CampaignRenderer
      campaign={activeCampaign}
      visible={campaignVisible}
      userId={user?.id ?? ""}
      currentScreen={currentScreenRef.current}
      onClose={handleCampaignClose}
      onViewed={handleCampaignViewed}
    />
  );
}

// ── Helpers ──

/**
 * Determine if a campaign is a feedback campaign.
 * A campaign is considered feedback-related if:
 *   - primary_button_action is "open_feedback", OR
 *   - secondary_button_action is "open_feedback"
 *
 * This is used to gate feedback campaigns behind the feedback_popup feature flag,
 * so that feedback popups can be disabled independently of other remote campaigns.
 */
function _isFeedbackCampaign(campaign: RemoteCampaign): boolean {
  return (
    campaign.primary_button_action === "open_feedback" ||
    campaign.secondary_button_action === "open_feedback"
  );
}

/**
 * Get device language code (e.g., "he", "en", "ar").
 * Falls back to "he" if detection fails.
 */
function getDeviceLanguage(): string {
  try {
    const locales = getLocales();
    return locales[0]?.languageCode ?? "he";
  } catch {
    return "he";
  }
}

/**
 * Get device country code (e.g., "IL", "US", "GB").
 * Falls back to "IL" if detection fails.
 */
function getDeviceCountry(): string {
  try {
    const locales = getLocales();
    return locales[0]?.regionCode ?? "IL";
  } catch {
    return "IL";
  }
}

/**
 * Get device region (empty string if unavailable).
 */
function getDeviceRegion(): string {
  try {
    const locales = getLocales();
    return locales[0]?.regionCode ?? "";
  } catch {
    return "";
  }
}
