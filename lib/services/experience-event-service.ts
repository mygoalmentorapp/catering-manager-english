/**
 * ExperienceEventService — unified event logging to user_experience_events.
 *
 * All events follow the naming convention from REMOTE_EXPERIENCE_SPEC.md v1.1 §14.
 * Events are fire-and-forget: failures are silently logged, never crash the app.
 * No sensitive data is stored in metadata (see §26 — Privacy).
 *
 * ARCHITECTURE NOTE (Session 4 fix):
 * Events are logged via tRPC server (experience.logEvent) which uses Supabase
 * service_role to bypass RLS. The vanilla tRPC client is used directly (no React
 * hooks/context dependency) so this service works reliably from any context.
 */

import { devLog, warnLog } from "./environment";
import { vanillaTrpc } from "../trpc";

// ── Event names (source of truth from spec §14) ──

export const EVENT_NAMES = {
  // App lifecycle
  APP_OPEN: "app_open",
  SESSION_START: "session_start",

  // Auth
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN_COMPLETED: "login_completed",

  // Onboarding (future)
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_SCREEN_VIEWED: "onboarding_screen_viewed",
  ONBOARDING_COMPLETED: "onboarding_completed",

  // Navigation
  SCREEN_VIEWED: "screen_viewed",

  // Business actions
  PRODUCT_CREATED: "product_created",
  PRODUCT_UPDATED: "product_updated",
  ORDER_CREATED: "order_created",
  ORDER_UPDATED: "order_updated",
  ORDER_COMPLETED: "order_completed",
  SHOPPING_LIST_CREATED: "shopping_list_created",

  // Feedback
  FEEDBACK_POPUP_VIEWED: "feedback_popup_viewed",
  FEEDBACK_POPUP_DISMISSED: "feedback_popup_dismissed",
  FEEDBACK_RATING_SELECTED: "feedback_rating_selected",
  FEEDBACK_SUBMITTED: "feedback_submitted",

  // Campaigns (future)
  CAMPAIGN_VIEWED: "campaign_viewed",
  CAMPAIGN_CLICKED: "campaign_clicked",
  CAMPAIGN_DISMISSED: "campaign_dismissed",

  // Premium / Paywall
  PREMIUM_FEATURE_CLICKED: "premium_feature_clicked",
  PAYWALL_VIEWED: "paywall_viewed",
  PAYWALL_DISMISSED: "paywall_dismissed",
  PAYWALL_CTA_CLICKED: "paywall_cta_clicked",
  PURCHASE_STARTED: "purchase_started",
  PURCHASE_COMPLETED: "purchase_completed",
  PURCHASE_FAILED: "purchase_failed",
  RESTORE_STARTED: "restore_started",
  RESTORE_COMPLETED: "restore_completed",
  RESTORE_FAILED: "restore_failed",
  ENTITLEMENT_CHECKED: "entitlement_checked",
  ENTITLEMENT_ACTIVE: "entitlement_active",
  ENTITLEMENT_MISSING: "entitlement_missing",

  // System
  ERROR_ENCOUNTERED: "error_encountered",
  PERMISSION_REQUESTED: "permission_requested",
  PERMISSION_GRANTED: "permission_granted",
  PERMISSION_DENIED: "permission_denied",
  APP_REVIEW_REQUESTED: "app_review_requested",
  EXTERNAL_URL_OPENED: "external_url_opened",
  UNKNOWN_ACTION_RECEIVED: "unknown_action_received",
  UNKNOWN_CONDITION_RECEIVED: "unknown_condition_received",
  EXTERNAL_URL_BLOCKED: "external_url_blocked",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

// ── Allowed metadata keys (privacy whitelist — §26) ──

const ALLOWED_METADATA_KEYS = new Set([
  "screen_name",
  "screen_key",
  "campaign_key",
  "flow_key",
  "action",
  "type",
  "placement",
  "rating",
  "source",
  "error_type",
  "permission_type",
  "url",
  "domain",
  "reason",
  "condition",
  "feature",
  "product_id",
  "placement_key",
  "entitlement_id",
  "offering_id",
  "subscription_status",
  "error_message",
]);

// ── Types ──

export interface EventPayload {
  event_name: EventName;
  screen_key?: string;
  campaign_key?: string;
  flow_key?: string;
  action?: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * tRPC caller type — injected via setTrpcClient() for testing.
 * In production, vanillaTrpc is used directly.
 */
interface TrpcExperienceCaller {
  logEvent: { mutate: (input: Record<string, unknown>) => Promise<{ success: boolean }> };
}

// ── Service ──

/** Current session ID — generated on each session_start */
let currentSessionId: string = generateSessionId();

/** App version — read once */
let appVersion: string = "1.0.0";

/** Override tRPC client for testing */
let testTrpcClient: TrpcExperienceCaller | null = null;

/** Whether the service is ready (auth token available) */
let isReady = false;

/** Pending events queue — events logged before service is ready */
interface PendingEvent {
  payload: EventPayload;
  timestamp: number;
}
const pendingEvents: PendingEvent[] = [];
const MAX_PENDING_EVENTS = 50;
const PENDING_EVENT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/** Event subscribers for trigger-based campaign evaluation */
type EventListener = (eventName: string) => void;
const eventListeners: Set<EventListener> = new Set();

function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${ts}-${rand}`;
}

/**
 * Sanitize metadata: only allow whitelisted keys, strip any sensitive data.
 * Values are coerced to string/number/boolean only.
 */
function sanitizeMetadata(
  raw?: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  if (!raw) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_METADATA_KEYS.has(key)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        clean[key] = value;
      }
    }
  }
  return clean;
}

/**
 * Flush pending events that were queued before service was ready.
 */
async function flushPendingEvents(): Promise<void> {
  if (pendingEvents.length === 0) return;

  const now = Date.now();
  const toFlush = pendingEvents.splice(0, pendingEvents.length);

  for (const { payload, timestamp } of toFlush) {
    // Skip events that are too old
    if (now - timestamp > PENDING_EVENT_MAX_AGE_MS) {
      devLog("ExperienceEvent", "Dropping stale pending event:", payload.event_name);
      continue;
    }
    // Re-log through the normal path
    await ExperienceEventService.logEvent(payload);
  }
}

/**
 * Call the tRPC logEvent endpoint.
 * Uses testTrpcClient if set (for tests), otherwise vanillaTrpc.
 */
async function callLogEvent(row: Record<string, unknown>): Promise<{ success: boolean }> {
  if (testTrpcClient) {
    return testTrpcClient.logEvent.mutate(row);
  }
  return vanillaTrpc.experience.logEvent.mutate(row as any);
}

export const ExperienceEventService = {
  /**
   * Set the tRPC client override for testing.
   * In production, vanillaTrpc is used directly — no injection needed.
   */
  setTrpcClient(client: TrpcExperienceCaller): void {
    testTrpcClient = client;
    devLog("ExperienceEvent", "Test tRPC client set");
  },

  /**
   * Clear the test tRPC client.
   */
  clearTrpcClient(): void {
    testTrpcClient = null;
  },

  /**
   * Mark the service as ready (user is authenticated, token available).
   * Called by ExperienceBootstrap after auth is confirmed.
   * Flushes any pending events.
   */
  setReady(): void {
    if (isReady) return;
    isReady = true;
    console.log("[ExperienceEvent] Service ready — flushing pending events", { pendingCount: pendingEvents.length });
    flushPendingEvents().catch(() => {});
  },

  /**
   * Mark the service as not ready (e.g., on sign out).
   */
  setNotReady(): void {
    isReady = false;
    pendingEvents.length = 0;
  },

  /**
   * Set the app version (called once on startup).
   */
  setAppVersion(version: string): void {
    appVersion = version;
  },

  /**
   * Start a new session — generates a new session_id.
   * Called by SessionTracker on session_start.
   */
  startNewSession(): string {
    currentSessionId = generateSessionId();
    devLog("ExperienceEvent", "New session started:", currentSessionId);
    return currentSessionId;
  },

  /**
   * Get the current session ID.
   */
  getSessionId(): string {
    return currentSessionId;
  },

  /**
   * Log an event to user_experience_events via tRPC server.
   *
   * Fire-and-forget: never throws, never blocks the caller.
   * If service is not ready, events are queued and flushed later.
   */
  async logEvent(payload: EventPayload): Promise<void> {
    try {
      if (!isReady && !testTrpcClient) {
        // Queue the event for later flushing
        if (pendingEvents.length < MAX_PENDING_EVENTS) {
          pendingEvents.push({ payload, timestamp: Date.now() });
          console.log(`[ExperienceEvent] Queued (not ready yet): ${payload.event_name} (pending=${pendingEvents.length})`);
        }
        return;
      }

      // NOTE: platform, language, app_version are set SERVER-SIDE from request headers.
      // Client sends only event data — no device info, no user_id.
      const row = {
        event_name: payload.event_name,
        screen_key: payload.screen_key ?? null,
        campaign_key: payload.campaign_key ?? null,
        flow_key: payload.flow_key ?? null,
        action: payload.action ?? null,
        session_id: currentSessionId,
        metadata: sanitizeMetadata(payload.metadata),
      };

      console.log(`[ExperienceEvent] Sending to server: ${payload.event_name}`);
      const result = await callLogEvent(row as unknown as Record<string, unknown>);

      if (!result.success) {
        console.warn(`[ExperienceEvent] Server rejected event "${payload.event_name}": ${JSON.stringify(result)}`);
      } else {
        console.log(`[ExperienceEvent] ✅ Logged: ${payload.event_name} (listeners=${eventListeners.size})`);
        // Notify listeners (for campaign trigger evaluation)
        for (const listener of eventListeners) {
          try {
            listener(payload.event_name);
          } catch {
            // Listener errors should never affect event logging
          }
        }
      }
    } catch (err) {
      // Log with console.error so it's visible even in production for debugging
      console.error(`[ExperienceEvent] Error logging "${payload.event_name}":`, err);
    }
  },

  /**
   * Subscribe to event notifications.
   * Returns an unsubscribe function.
   * Used by ExperienceBootstrap to trigger campaign evaluation on business events.
   */
  onEvent(listener: EventListener): () => void {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },

  // ── Convenience methods for common events ──

  async logAppOpen(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.APP_OPEN });
  },

  async logSessionStart(): Promise<void> {
    this.startNewSession();
    return this.logEvent({ event_name: EVENT_NAMES.SESSION_START });
  },

  async logScreenViewed(screenName: string): Promise<void> {
    return this.logEvent({
      event_name: EVENT_NAMES.SCREEN_VIEWED,
      screen_key: screenName,
      metadata: { screen_name: screenName },
    });
  },

  async logProductCreated(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.PRODUCT_CREATED });
  },

  async logProductUpdated(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.PRODUCT_UPDATED });
  },

  async logOrderCreated(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.ORDER_CREATED });
  },

  async logOrderUpdated(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.ORDER_UPDATED });
  },

  async logOrderCompleted(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.ORDER_COMPLETED });
  },

  async logShoppingListCreated(): Promise<void> {
    return this.logEvent({ event_name: EVENT_NAMES.SHOPPING_LIST_CREATED });
  },

  async logFeedbackSubmitted(source?: string): Promise<void> {
    return this.logEvent({
      event_name: EVENT_NAMES.FEEDBACK_SUBMITTED,
      metadata: source ? { source } : undefined,
    });
  },
};
