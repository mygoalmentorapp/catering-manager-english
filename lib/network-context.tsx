/**
 * NetworkContext — Central network connectivity state.
 *
 * Provides:
 * - isOnline: device has internet (via expo-network)
 * - isServerReachable: our API server responds to /api/health
 * - isConnected: combined (isOnline && isServerReachable)
 * - checkConnectivity(): manual re-check
 *
 * Policy:
 * - On app open without internet → NetworkGate blocks (before data loads)
 * - After data loaded, if internet drops → view-only (mutations blocked)
 * - When internet returns → verify server + session before re-enabling mutations
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as Network from "expo-network";
import { getApiBaseUrl } from "@/constants/oauth";
import { getDeviceId } from "@/lib/device-id";
import * as Auth from "@/lib/_core/auth";
import { emitDeviceBlocked } from "@/lib/device-events";

// ============ TYPES ============

export interface NetworkContextType {
  /** Device has internet connectivity (NetInfo/expo-network) */
  isOnline: boolean;
  /** Our API server is reachable */
  isServerReachable: boolean;
  /** Combined: device online AND server reachable */
  isConnected: boolean;
  /** Manually trigger a connectivity check */
  checkConnectivity: () => Promise<boolean>;
  /** Whether the initial connectivity check has completed */
  isInitialized: boolean;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

// ============ CONSTANTS ============

/** Timeout for server health ping */
const HEALTH_PING_TIMEOUT = 8000;

// ============ PROVIDER ============

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true); // optimistic start
  const [isServerReachable, setIsServerReachable] = useState(true); // optimistic start
  const [isInitialized, setIsInitialized] = useState(false);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ============ SERVER PING ============

  const pingServer = useCallback(async (): Promise<boolean> => {
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        // On web with relative URL, server is same origin — assume reachable if online
        return true;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_PING_TIMEOUT);

      // Build headers — include device UUID and auth token for combined device check
      const headers: Record<string, string> = {};
      try {
        if (Platform.OS !== "web") {
          const [deviceUuid, authToken] = await Promise.all([
            getDeviceId(),
            Auth.getSessionToken(),
          ]);
          if (deviceUuid) headers["X-Device-UUID"] = deviceUuid;
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        }
      } catch {
        // Non-critical — health check still works without these
      }

      const response = await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
        headers });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Check device status from response
        try {
          const body = await response.json();
          if (body.deviceActive === false) {
            // Device is no longer active — emit block event
            emitDeviceBlocked();
          }
        } catch {
          // JSON parse failure — server is reachable, that's what matters
        }
      }

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // ============ FULL CONNECTIVITY CHECK ============

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      // Check device network state
      const networkState = await Network.getNetworkStateAsync();
      const deviceOnline =
        Platform.OS === "web"
          ? networkState.isConnected !== false
          : (networkState.isInternetReachable ?? networkState.isConnected) !== false;

      if (mountedRef.current) setIsOnline(deviceOnline);

      if (!deviceOnline) {
        if (mountedRef.current) setIsServerReachable(false);
        return false;
      }

      // Check server reachability
      const serverOk = await pingServer();
      if (mountedRef.current) setIsServerReachable(serverOk);

      return deviceOnline && serverOk;
    } catch {
      if (mountedRef.current) {
        setIsOnline(false);
        setIsServerReachable(false);
      }
      return false;
    }
  }, [pingServer]);

  // ============ NETWORK STATE SUBSCRIPTION ============

  useEffect(() => {
    mountedRef.current = true;

    // Initial check
    const init = async () => {
      await checkConnectivity();
      if (mountedRef.current) setIsInitialized(true);
    };
    init();

    return () => {
      mountedRef.current = false;
    };
  }, [checkConnectivity]);

  // Subscribe to expo-network state changes
  // expo-network's useNetworkState() is a hook, but we need the subscription
  // approach for the provider. We'll poll on app state changes instead.
  useEffect(() => {
    // Re-check connectivity when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active" && prevState !== "active") {
        // App returned to foreground — re-check connectivity
        checkConnectivity();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkConnectivity]);

  // Periodic connectivity check — always pings server regardless of NetInfo.
  // Some devices (e.g. Lenovo tablets) don't report network disconnect via NetInfo,
  // so we rely on actual server ping as the source of truth.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        // First check NetInfo (fast, local)
        const networkState = await Network.getNetworkStateAsync();
        const deviceOnline =
          Platform.OS === "web"
            ? networkState.isConnected !== false
            : (networkState.isInternetReachable ?? networkState.isConnected) !== false;

        // Always ping server — this is the real source of truth
        const serverOk = await pingServer();

        if (mountedRef.current) {
          // If server ping fails, treat as offline even if NetInfo says online
          setIsOnline(deviceOnline && serverOk ? true : serverOk ? deviceOnline : false);
          setIsServerReachable(serverOk);
        }
      } catch {
        if (mountedRef.current) {
          setIsOnline(false);
          setIsServerReachable(false);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [pingServer]);

  // ============ CONTEXT VALUE ============

  const isConnected = isOnline && isServerReachable;

  const value: NetworkContextType = {
    isOnline,
    isServerReachable,
    isConnected,
    checkConnectivity,
    isInitialized };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

// ============ HOOK ============

export function useNetwork(): NetworkContextType {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}
