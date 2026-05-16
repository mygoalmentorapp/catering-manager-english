/**
 * SessionTracker — manages experience session lifecycle.
 *
 * A new session starts when the app comes to foreground after 30+ minutes
 * of inactivity (configurable via remote_config.session_timeout_minutes).
 *
 * Uses AsyncStorage for last_active_at persistence across app restarts.
 * Uses AppState listener to detect foreground/background transitions.
 *
 * This is separate from the device-session ownership system in session-context.tsx.
 */

import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog, warnLog } from "./environment";
import { ExperienceEventService } from "./experience-event-service";

const LAST_ACTIVE_KEY = "@experience_last_active_at";
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;

// ── State ──

let isInitialized = false;
let sessionTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let lastKnownState: AppStateStatus = AppState.currentState;

// Callbacks for external consumers (UserExperienceStateService)
type SessionCallback = () => void;
let onSessionStartCallback: SessionCallback | null = null;
let onAppOpenCallback: SessionCallback | null = null;

// ── Helpers ──

async function getLastActiveAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

async function setLastActiveAt(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  } catch (err) {
    warnLog("SessionTracker", "Failed to save last_active_at:", err);
  }
}

async function isNewSession(): Promise<boolean> {
  const lastActive = await getLastActiveAt();
  if (lastActive === null) {
    // First ever open — treat as new session
    return true;
  }
  const elapsed = Date.now() - lastActive;
  const timeoutMs = sessionTimeoutMinutes * 60 * 1000;
  return elapsed >= timeoutMs;
}

// ── AppState handler ──

async function handleAppStateChange(nextState: AppStateStatus): Promise<void> {
  const prevState = lastKnownState;
  lastKnownState = nextState;

  if (nextState === "active" && prevState !== "active") {
    // App came to foreground
    devLog("SessionTracker", "App came to foreground");

    const newSession = await isNewSession();
    if (newSession) {
      devLog("SessionTracker", "New session detected (timeout exceeded)");
      // Fire session_start event (also generates new session_id)
      ExperienceEventService.logSessionStart().catch(() => {});
      // Notify external consumers
      if (onSessionStartCallback) {
        try { onSessionStartCallback(); } catch {}
      }
    }

    // Always log app_open on foreground
    ExperienceEventService.logAppOpen().catch(() => {});
    if (onAppOpenCallback) {
      try { onAppOpenCallback(); } catch {}
    }

    // Update last_active_at
    await setLastActiveAt();
  } else if (nextState === "background" || nextState === "inactive") {
    // App going to background — save last_active_at
    devLog("SessionTracker", "App going to background");
    await setLastActiveAt();
  }
}

// ── Public API ──

export const SessionTracker = {
  /**
   * Initialize the tracker. Should be called once on app mount.
   * Non-blocking: errors are caught silently.
   *
   * @param timeoutMinutes - Session timeout from remote_config (default: 30)
   */
  async init(timeoutMinutes?: number): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;

    if (timeoutMinutes !== undefined && timeoutMinutes > 0) {
      sessionTimeoutMinutes = timeoutMinutes;
    }

    devLog("SessionTracker", `Initialized with timeout: ${sessionTimeoutMinutes}min`);

    try {
      // Check if this is a new session on cold start
      const newSession = await isNewSession();
      if (newSession) {
        devLog("SessionTracker", "Cold start — new session");
        ExperienceEventService.logSessionStart().catch(() => {});
        if (onSessionStartCallback) {
          try { onSessionStartCallback(); } catch {}
        }
      }

      // Always log app_open on cold start
      ExperienceEventService.logAppOpen().catch(() => {});
      if (onAppOpenCallback) {
        try { onAppOpenCallback(); } catch {}
      }

      // Save current time
      await setLastActiveAt();
    } catch (err) {
      warnLog("SessionTracker", "Init error:", err);
    }

    // Subscribe to AppState changes
    appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
  },

  /**
   * Update session timeout (e.g., when remote_config loads a new value).
   */
  setSessionTimeout(minutes: number): void {
    if (minutes > 0) {
      sessionTimeoutMinutes = minutes;
      devLog("SessionTracker", `Timeout updated to ${minutes}min`);
    }
  },

  /**
   * Register callback for session_start events.
   * Used by UserExperienceStateService to increment sessions_count.
   */
  onSessionStart(callback: SessionCallback): void {
    onSessionStartCallback = callback;
  },

  /**
   * Register callback for app_open events.
   * Used by UserExperienceStateService to update last_active_at etc.
   */
  onAppOpen(callback: SessionCallback): void {
    onAppOpenCallback = callback;
  },

  /**
   * Get the current session timeout in minutes.
   */
  getSessionTimeout(): number {
    return sessionTimeoutMinutes;
  },

  /**
   * Clean up the tracker (for testing or unmount).
   */
  destroy(): void {
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
    isInitialized = false;
    onSessionStartCallback = null;
    onAppOpenCallback = null;
    lastKnownState = "active";
    sessionTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES;
  },

  /** Exposed for testing only */
  _testing: {
    isNewSession,
    setLastActiveAt,
    getLastActiveAt,
    handleAppStateChange,
    reset(): void {
      isInitialized = false;
      onSessionStartCallback = null;
      onAppOpenCallback = null;
      lastKnownState = "active";
      sessionTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES;
      appStateSubscription = null;
    } } };
