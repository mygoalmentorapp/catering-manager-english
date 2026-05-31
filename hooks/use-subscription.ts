/**
 * useSubscription — React hook for subscription status.
 *
 * Provides:
 * - isPremium: whether the user has an active premium subscription
 * - isLoading: whether the subscription status is still being fetched
 * - subscriptionStatus: full status object
 * - refresh: manually refresh subscription status
 *
 * Automatically refreshes when the Adapty profile updates.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import * as AdaptyService from "@/lib/services/adapty-service";
import type { SubscriptionStatus } from "@/lib/services/adapty-service";

const DEFAULT_STATUS: SubscriptionStatus = {
  isPremium: false,
  accessLevel: null,
  productId: null,
  expiresAt: null,
  isLifetime: false,
  willRenew: false,
};

export function useSubscription() {
  const [status, setStatus] = useState<SubscriptionStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await AdaptyService.getSubscriptionStatus();
      if (mountedRef.current) {
        setStatus(result);
      }
    } catch {
      // Keep current status on error
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    refresh();

    // Subscribe to profile updates
    const unsubscribe = AdaptyService.onProfileUpdated(() => {
      refresh();
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [refresh]);

  return {
    isPremium: status.isPremium,
    isLoading,
    subscriptionStatus: status,
    refresh,
  };
}
