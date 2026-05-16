import { useConfig } from "@/lib/config-context";
import { useAuth } from "@/lib/auth-context";

/**
 * Hook to check if the app is in limited mode.
 *
 * In BETA: Limited mode is ALWAYS disabled.
 * Trial never blocks the user, paywall is never shown.
 *
 * This hook is prepared for future use when:
 * - app_config.paywall_enabled = true
 * - app_config.paywall_mode = "trial_expired" or "hard"
 * - Trial has expired
 *
 * Returns:
 * - isLimited: false (always in beta)
 * - trialDaysRemaining: number of days left in trial
 * - trialExpired: whether trial has technically expired
 * - canUseFeature: function that always returns true in beta
 */
export function useLimitedMode() {
  const { trial, appConfig } = useConfig();
  const { profile } = useAuth();

  // In beta: NEVER limit the user
  const isLimited = false;

  const canUseFeature = (_featureName: string): boolean => {
    // In beta: all features are available
    return true;
  };

  return {
    isLimited,
    trialDaysRemaining: trial.daysRemaining,
    trialExpired: trial.isExpired,
    subscriptionStatus: profile?.subscription_status ?? "trial",
    canUseFeature };
}
