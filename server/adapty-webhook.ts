/**
 * Adapty Webhook Handler
 *
 * Receives subscription lifecycle events from Adapty and:
 * 1. Verifies the Authorization header (shared secret)
 * 2. Deduplicates events using profile_event_id
 * 3. Updates subscription_status in both `profiles` and `user_entitlements_cache` tables
 * 4. Logs the event to `user_experience_events` for analytics
 * 5. Responds quickly (within 10s) to avoid Adapty retries
 *
 * Setup in Adapty Dashboard:
 * - URL: https://<your-domain>/api/webhooks/adapty
 * - Authorization header value: <ADAPTY_WEBHOOK_SECRET env var>
 * - Enable desired event types
 *
 * Security:
 * - Uses SUPABASE_SERVICE_ROLE_KEY (server-only, never exposed to client)
 * - Validates Authorization header before processing
 * - RLS bypassed via service_role for server-side writes
 */

import { Router, Request, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdaptyEventProperties {
  store?: string;
  currency?: string;
  price_usd?: number;
  environment?: string;
  purchase_date?: string;
  event_datetime?: string;
  profile_event_id?: string;
  vendor_product_id?: string;
  subscription_expires_at?: string;
  profile_has_access_level?: boolean;
  profile_total_revenue_usd?: number;
  transaction_id?: string;
  original_transaction_id?: string;
  consecutive_payments?: number;
  cancellation_reason?: string;
  [key: string]: unknown;
}

interface AdaptyWebhookPayload {
  profile_id?: string;
  customer_user_id?: string;
  event_type?: string;
  event_properties?: AdaptyEventProperties;
  event_api_version?: number;
  integration_ids?: Record<string, string>;
  user_attributes?: Record<string, unknown>;
  attributions?: Record<string, unknown>;
}

// ─── Event Type → Subscription Status Mapping ────────────────────────────────

type SubscriptionStatusValue = "active" | "expired" | "limited" | "trial";

const EVENT_TO_STATUS: Record<string, SubscriptionStatusValue> = {
  // Active subscription events
  subscription_started: "active",
  subscription_renewed: "active",
  subscription_renewal_reactivated: "active",
  trial_converted: "active",
  non_subscription_purchase: "active",

  // Trial events
  trial_started: "trial",
  trial_renewal_reactivated: "trial", // Trial auto-renewal turned back on

  // Cancellation (still has access until expiry)
  subscription_renewal_cancelled: "active", // Still active until expires_at
  trial_renewal_cancelled: "trial", // Still in trial until expires_at

  // Paused (Android only — still has access until pause takes effect)
  subscription_paused: "active", // Subscription paused, still active until pause date

  // Expired / lost access
  subscription_expired: "expired",
  trial_expired: "expired",
  subscription_refunded: "expired",
  non_subscription_purchase_refunded: "expired", // One-time purchase refunded

  // Billing issues (grace period — still has access)
  billing_issue_detected: "active",
  entered_grace_period: "active",
};

// ─── Helper: Get Supabase Admin Client ───────────────────────────────────────

function getAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("[AdaptyWebhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Helper: Verify Authorization Header ─────────────────────────────────────

function verifyAuth(req: Request): boolean {
  const secret = process.env.ADAPTY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[AdaptyWebhook] ADAPTY_WEBHOOK_SECRET not configured");
    return false;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  // Adapty sends the value directly (no "Bearer " prefix typically, but handle both)
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return token === secret;
}

// ─── Helper: Check Idempotency ───────────────────────────────────────────────

async function isEventProcessed(
  supabase: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("adapty_webhook_events")
    .select("id")
    .eq("event_id", eventId)
    .limit(1)
    .single();
  return !!data;
}

async function markEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  userId: string | null,
  eventType: string,
  payload: AdaptyWebhookPayload
): Promise<void> {
  await supabase.from("adapty_webhook_events").insert({
    event_id: eventId,
    user_id: userId,
    event_type: eventType,
    payload: payload,
    processed_at: new Date().toISOString(),
  });
}

// ─── Helper: Update Subscription Status ──────────────────────────────────────

async function updateSubscriptionStatus(
  supabase: SupabaseClient,
  userId: string,
  newStatus: SubscriptionStatusValue,
  eventProps: AdaptyEventProperties
): Promise<void> {
  // 1. Update profiles table
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    console.warn("[AdaptyWebhook] Failed to update profiles:", profileError.message);
  }

  // 2. Update user_entitlements_cache table (upsert)
  const entitlements = eventProps.profile_has_access_level
    ? ["premium_access"]
    : [];

  const { error: cacheError } = await supabase
    .from("user_entitlements_cache")
    .upsert(
      {
        user_id: userId,
        subscription_status: newStatus,
        active_entitlements: entitlements,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (cacheError) {
    console.warn("[AdaptyWebhook] Failed to update user_entitlements_cache:", cacheError.message);
  }
}

// ─── Helper: Log Event to Analytics ──────────────────────────────────────────

async function logWebhookEvent(
  supabase: SupabaseClient,
  userId: string | null,
  eventType: string,
  eventProps: AdaptyEventProperties
): Promise<void> {
  if (!userId) return;

  const metadata: Record<string, string | number | boolean> = {
    source: "adapty_webhook",
    adapty_event_type: eventType,
  };

  if (eventProps.vendor_product_id) metadata.product_id = eventProps.vendor_product_id;
  if (eventProps.price_usd !== undefined) metadata.price_usd = eventProps.price_usd;
  if (eventProps.store) metadata.store = eventProps.store;
  if (eventProps.environment) metadata.environment = eventProps.environment;
  if (eventProps.subscription_expires_at) metadata.expires_at = eventProps.subscription_expires_at;
  if (eventProps.cancellation_reason) metadata.cancellation_reason = eventProps.cancellation_reason;
  if (eventProps.consecutive_payments !== undefined) metadata.consecutive_payments = eventProps.consecutive_payments;

  const { error } = await supabase.from("user_experience_events").insert({
    user_id: userId,
    event_name: `adapty_${eventType}`,
    screen_key: "webhook",
    campaign_key: null,
    flow_key: "subscription",
    action: eventType,
    platform: eventProps.store === "play_store" ? "android" : eventProps.store === "app_store" ? "ios" : "unknown",
    language: null,
    app_version: null,
    session_id: `webhook_${Date.now()}`,
    metadata,
  });

  if (error) {
    console.warn("[AdaptyWebhook] Failed to log event:", error.message);
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createAdaptyWebhookRouter(): Router {
  const router = Router();

  /**
   * POST /api/webhooks/adapty
   *
   * Handles all Adapty webhook events.
   * Also handles the verification request (empty body `{}`).
   */
  router.post("/", async (req: Request, res: Response) => {
    // 1. Verify Authorization
    if (!verifyAuth(req)) {
      console.warn("[AdaptyWebhook] Unauthorized request");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as AdaptyWebhookPayload;

    // 2. Handle verification request (empty body or no event_type)
    if (!body || !body.event_type || Object.keys(body).length === 0) {
      console.log("[AdaptyWebhook] Verification request received — responding OK");
      res.status(200).json({ status: "ok", message: "Webhook verified" });
      return;
    }

    // 3. Extract key fields
    const eventType = body.event_type;
    const customerUserId = body.customer_user_id || null;
    const eventProps = body.event_properties || {};
    const eventId = eventProps.profile_event_id || `${eventType}_${Date.now()}`;

    console.log(
      `[AdaptyWebhook] Event: ${eventType} | User: ${customerUserId || "unknown"} | EventID: ${eventId}`
    );

    // 4. Get Supabase admin client
    const supabase = getAdminClient();
    if (!supabase) {
      // Can't process without DB — respond 500 so Adapty retries
      res.status(500).json({ error: "Database not configured" });
      return;
    }

    // 5. Idempotency check
    try {
      const alreadyProcessed = await isEventProcessed(supabase, eventId);
      if (alreadyProcessed) {
        console.log(`[AdaptyWebhook] Event ${eventId} already processed — skipping`);
        res.status(200).json({ status: "ok", message: "Already processed" });
        return;
      }
    } catch (err: any) {
      // If idempotency table doesn't exist yet, continue processing
      console.warn("[AdaptyWebhook] Idempotency check failed:", err?.message);
    }

    // 6. Determine new subscription status
    const newStatus = EVENT_TO_STATUS[eventType];

    // 7. Update subscription status if we have a user and a mapped status
    if (customerUserId && newStatus) {
      try {
        await updateSubscriptionStatus(supabase, customerUserId, newStatus, eventProps);
        console.log(`[AdaptyWebhook] Updated ${customerUserId} → ${newStatus}`);
      } catch (err: any) {
        console.error("[AdaptyWebhook] Status update failed:", err?.message);
      }
    }

    // 8. Log event to analytics
    try {
      await logWebhookEvent(supabase, customerUserId, eventType, eventProps);
    } catch (err: any) {
      console.warn("[AdaptyWebhook] Event logging failed:", err?.message);
    }

    // 9. Mark event as processed (idempotency)
    try {
      await markEventProcessed(supabase, eventId, customerUserId, eventType, body);
    } catch (err: any) {
      console.warn("[AdaptyWebhook] Idempotency mark failed:", err?.message);
    }

    // 10. Respond success
    res.status(200).json({
      status: "ok",
      event_type: eventType,
      user_id: customerUserId,
      new_status: newStatus || "unmapped",
    });
  });

  return router;
}
