/**
 * Device Context — Manages device binding state.
 *
 * Handles:
 * - Device registration on first login
 * - Device status check on every app open
 * - Local cache for offline support
 * - skipAutoBackupThisSession flag (after verification/restore)
 *
 * Must be placed INSIDE AuthProvider and tRPC provider, but OUTSIDE AppGate.
 *
 * IMPORTANT: checkDevice uses a ref for the mutation to avoid dependency loops.
 * The tRPC useMutation hook returns a new object every render, which would
 * cause checkDevice to be recreated endlessly if included in deps.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Platform, AppState, AppStateStatus, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId, getDeviceInfo } from "@/lib/device-id";
import { onDeviceBlocked as subscribeDeviceBlocked } from "@/lib/device-events";
import { useAuth } from "./auth-context";
import { trpc } from "./trpc";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// ============ TYPES ============

export type DeviceGateStatus =
  | "loading"              // Checking device status
  | "active"               // Device is active — proceed normally
  | "requires_verification" // Device needs re-verification (another device is active)
  | "offline_active"       // Offline but cache says active
  | "offline_blocked"      // Offline and cache says not active (or no cache)
  | "error";               // Network/server error

interface DeviceState {
  gateStatus: DeviceGateStatus;
  deviceUuid: string | null;
  skipAutoBackupThisSession: boolean;
  isChecking: boolean;
}

interface DeviceActions {
  recheckDevice: () => Promise<void>;
  setSkipAutoBackup: (skip: boolean) => void;
  onVerificationComplete: () => void;
  onDeviceBlocked: () => void;
}

type DeviceContextType = DeviceState & DeviceActions;

const DeviceContext = createContext<DeviceContextType | null>(null);

// ============ CACHE ============

const DEVICE_STATUS_CACHE_KEY = "@device_status_cache";

interface DeviceStatusCache {
  status: "active" | "not_active";
  checkedAt: string;
}

async function readCache(): Promise<DeviceStatusCache | null> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_STATUS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DeviceStatusCache;
  } catch {
    return null;
  }
}

async function writeCache(status: "active" | "not_active"): Promise<void> {
  try {
    const cache: DeviceStatusCache = {
      status,
      checkedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(DEVICE_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Non-critical
  }
}

export async function clearDeviceCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_STATUS_CACHE_KEY);
  } catch {
    // Non-critical
  }
}

// ============ PROVIDER ============

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [gateStatus, setGateStatus] = useState<DeviceGateStatus>("loading");
  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);
  const [skipAutoBackupThisSession, setSkipAutoBackup] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const mountedRef = useRef(true);
  const hasCheckedRef = useRef(false);
  const isCheckingRef = useRef(false); // Prevent concurrent checks

  const registerMutation = trpc.device.register.useMutation();
  // Store mutation in a ref so checkDevice doesn't depend on it
  const registerMutationRef = useRef(registerMutation);
  registerMutationRef.current = registerMutation;

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  /**
   * Main device check flow.
   * Uses registerMutationRef to avoid dependency on the mutation object.
   */
  // Track if this is a background resume (not cold start)
  const wasActiveRef = useRef(false);

  const checkDevice = useCallback(async (silent = false) => {
    // Web clients skip device binding entirely
    if (Platform.OS === "web") {
      setGateStatus("active");
      setDeviceUuid("web-client");
      return;
    }

    // Prevent concurrent checks
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    // Only show loading state on cold start (not silent background checks)
    if (!silent) {
      setIsChecking(true);
    }

    try {
      const uuid = await getDeviceId();
      if (!mountedRef.current) return;
      setDeviceUuid(uuid);

      const { deviceName, deviceOs } = getDeviceInfo();
      const result = await registerMutationRef.current.mutateAsync({
        deviceUuid: uuid,
        deviceName,
        deviceOs,
        appVersion,
      });

      if (!mountedRef.current) return;

      if (result.status === "active") {
        setGateStatus("active");
        wasActiveRef.current = true;
        await writeCache("active");
      } else {
        setGateStatus("requires_verification");
        wasActiveRef.current = false;
        await writeCache("not_active");
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.warn("[DeviceContext] Device check failed:", err?.message);

      // Network error — try cache
      const cache = await readCache();
      if (cache?.status === "active") {
        setGateStatus("offline_active");
        wasActiveRef.current = true;
      } else if (cache?.status === "not_active") {
        // If silent check and was previously active, keep active (don't block on network error)
        if (!silent || !wasActiveRef.current) {
          setGateStatus("offline_blocked");
        }
      } else {
        // No cache at all — could be first install with no internet
        if (!silent || !wasActiveRef.current) {
          setGateStatus("offline_blocked");
        }
      }
    } finally {
      if (mountedRef.current && !silent) {
        setIsChecking(false);
      }
      isCheckingRef.current = false;
    }
  }, [appVersion]); // Only depends on appVersion (stable string)

  const recheckDevice = useCallback(async () => {
    hasCheckedRef.current = false;
    await checkDevice();
  }, [checkDevice]);

  const onVerificationComplete = useCallback(() => {
    setGateStatus("active");
    setSkipAutoBackup(true);
    writeCache("active");
    hasCheckedRef.current = true;
  }, []);

  /**
   * Called when a server mutation returns DEVICE_NOT_ACTIVE error,
   * or when Broadcast/health-ping detects the device was deactivated.
   * Shows an alert explaining the situation, then blocks the device.
   */
  const onDeviceBlocked = useCallback(() => {
    // Only show alert if we were previously active (avoid duplicate alerts)
    const wasActive = gateStatus === "active" || gateStatus === "offline_active";

    setGateStatus("requires_verification");
    writeCache("not_active");
    hasCheckedRef.current = false;

    if (wasActive && Platform.OS !== "web") {
      Alert.alert(
        "מכשיר חדש זוהה",
        "החשבון שלך הופעל במכשיר אחר. כדי להמשיך להשתמש במכשיר הנוכחי, שלח קוד אימות למייל.",
        [{ text: "הבנתי", style: "default" }],
      );
    }
  }, [gateStatus]);

  // Listen for device-blocked events from DataProvider (which is outside DeviceProvider)
  useEffect(() => {
    const unsubscribe = subscribeDeviceBlocked(() => {
      console.log("[DeviceContext] Received device-blocked event from mutation");
      onDeviceBlocked();
    });
    return unsubscribe;
  }, [onDeviceBlocked]);

  // Run device check when auth becomes ready
  useEffect(() => {
    mountedRef.current = true;

    if (authLoading) return;

    if (!isAuthenticated) {
      setGateStatus("loading");
      hasCheckedRef.current = false;
      return;
    }

    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkDevice();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isAuthenticated, authLoading, checkDevice]);

  // Reset skip flag when auth changes
  useEffect(() => {
    if (!isAuthenticated) {
      setSkipAutoBackup(false);
    }
  }, [isAuthenticated]);

  // Re-check device status when app returns to foreground
  // This ensures the OLD device gets kicked out after a new device verifies
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!isAuthenticated || authLoading) return;

    let lastBackground = 0;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        lastBackground = Date.now();
      } else if (nextState === "active") {
        const elapsed = Date.now() - lastBackground;
        // Short background (< 5 min, e.g. sharing): silent check, no UI disruption
        // Long background (> 5 min): also silent check (Broadcast + middleware protect anyway)
        if (elapsed > 10_000) { // Only recheck if was in background > 10 seconds
          hasCheckedRef.current = false;
          checkDevice(true); // silent = true → no loading screen
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [isAuthenticated, authLoading, checkDevice]);

  // Supabase Realtime Broadcast: listen for device-kick events
  // When a new device is verified, the server broadcasts to this channel.
  // This gives instant kick (<1 second) without any polling.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!isAuthenticated || authLoading) return;
    if (gateStatus !== "active" && gateStatus !== "offline_active") return;
    if (!deviceUuid || !user?.id) return;

    const channelName = `device-kick:${user.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "device_kicked" }, (payload: any) => {
        const newDeviceUuid = payload?.payload?.newDeviceUuid;
        // Only block if the kicked device is NOT us (we are the old device)
        if (newDeviceUuid && newDeviceUuid !== deviceUuid) {
          console.log("[DeviceContext] Received broadcast kick — blocking device");
          onDeviceBlocked();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, authLoading, gateStatus, deviceUuid, user?.id, onDeviceBlocked]);

  const value: DeviceContextType = {
    gateStatus,
    deviceUuid,
    skipAutoBackupThisSession,
    isChecking,
    recheckDevice,
    setSkipAutoBackup,
    onVerificationComplete,
    onDeviceBlocked,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

// ============ HOOK ============

export function useDevice(): DeviceContextType {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
