/**
 * Admin Router — Admin Dashboard endpoints (Phase 4A + 4B).
 *
 * All endpoints use adminProcedure which:
 * 1. Requires authenticated user (401 if not)
 * 2. Requires user.role === "admin" (403 if not)
 * 3. Uses service_role to query Supabase (bypasses RLS)
 *
 * Phase 4A: Read-only queries.
 * Phase 4B: Safe mutations with audit logging.
 */
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase credentials not configured",
    });
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============ AUDIT LOG WRAPPER ============

interface AuditLogParams<T> {
  ctx: TrpcContext;
  app_key: string;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  /** Function that reads the current (before) value from DB */
  readBefore: () => Promise<unknown>;
  /** Function that performs the actual mutation */
  mutate: () => Promise<T>;
  /** Function that reads the new (after) value from DB */
  readAfter: () => Promise<unknown>;
}

/**
 * Safe mutation wrapper that:
 * 1. Reads before_value from DB
 * 2. Executes the mutation
 * 3. Reads after_value from DB
 * 4. Writes synchronous audit log to admin_audit_logs
 * 5. Returns mutation result
 *
 * If audit log write fails, the entire operation is considered failed.
 */
async function withAuditLog<T>(params: AuditLogParams<T>): Promise<T> {
  const { ctx, app_key, module, action, entity_type, entity_id, readBefore, mutate, readAfter } = params;
  const admin = getAdminClient();

  // Step 1: Read before value
  const before_value = await readBefore();

  // Step 2: Execute mutation
  const result = await mutate();

  // Step 3: Read after value
  const after_value = await readAfter();

  // Step 4: Write audit log synchronously
  const ip_address = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || ctx.req.socket?.remoteAddress
    || "unknown";
  const user_agent = (ctx.req.headers["user-agent"] as string) || "unknown";

  const { error: auditError } = await admin.from("admin_audit_logs").insert({
    admin_user_id: ctx.user!.openId,
    admin_email: ctx.user!.email ?? null,
    app_key,
    module,
    action,
    entity_type,
    entity_id,
    before_value: before_value as object,
    after_value: after_value as object,
    ip_address,
    user_agent,
  });

  if (auditError) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to write audit log. Mutation was applied but audit trail is incomplete.",
    });
  }

  // Step 5: Return result
  return result;
}

// ============ ZOD SCHEMAS FOR MUTATIONS ============

const capabilityItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
});

const conditionFieldSchema = capabilityItemSchema.extend({
  type: z.string().min(1),
});

const updateAppCapabilitiesInput = z.object({
  app_key: z.string().min(1),
  supported_events: z.array(capabilityItemSchema).optional(),
  supported_actions: z.array(capabilityItemSchema).optional(),
  supported_placements: z.array(capabilityItemSchema).optional(),
  supported_entitlements: z.array(capabilityItemSchema).optional(),
  premium_features: z.array(capabilityItemSchema).optional(),
  condition_fields: z.array(conditionFieldSchema).optional(),
});

// ---- Campaign CRUD schemas (Phase 4C) ----

const campaignBaseFields = {
  campaign_key: z.string().min(1, "campaign_key is required"),
  name: z.string().nullish(),
  type: z.string().min(1).default("circle_popup"),
  app_key: z.string().min(1, "app_key is required"),
  app_language: z.string().min(1, "app_language is required"),
  is_enabled: z.boolean().default(false),
  priority: z.number().int().default(0),
  // Display / Content
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  message: z.string().nullish(),
  icon: z.string().nullish(),
  image_url: z.string().nullish(),
  primary_button_text: z.string().nullish(),
  primary_button_action: z.string().nullish(),
  primary_button_payload: z.record(z.string(), z.unknown()).nullish(),
  secondary_button_text: z.string().nullish(),
  secondary_button_action: z.string().nullish(),
  secondary_button_payload: z.record(z.string(), z.unknown()).nullish(),
  dismissible: z.boolean().nullish(),
  // Targeting / Trigger
  trigger_event: z.string().nullish(),
  target_audience: z.string().nullish(),
  platform: z.string().nullish(),
  start_at: z.string().nullish(),
  end_at: z.string().nullish(),
  rollout_percentage: z.number().int().min(0).max(100).default(100),
  min_app_version: z.string().nullish(),
  max_app_version: z.string().nullish(),
  // Advanced Rules
  cooldown_days_after_view: z.number().int().nullish(),
  cooldown_days_after_dismiss: z.number().nullish(),
  max_impressions_per_user: z.number().int().nullish(),
  max_impressions_per_session: z.number().int().nullish(),
  max_impressions_per_day: z.number().int().nullish(),
  max_clicks_per_user: z.number().int().nullish(),
  min_days_since_signup: z.number().int().nullish(),
  min_days_since_first_open: z.number().int().nullish(),
  min_sessions: z.number().int().nullish(),
  min_products_created: z.number().int().nullish(),
  min_orders_created: z.number().int().nullish(),
  min_shopping_lists_created: z.number().int().nullish(),
  min_completed_orders: z.number().int().nullish(),
  days_since_last_active: z.number().int().nullish(),
  show_only_if_not_premium: z.boolean().nullish(),
  show_only_if_premium: z.boolean().nullish(),
  show_only_if_feedback_not_submitted: z.boolean().nullish(),
  show_only_if_onboarding_not_completed: z.boolean().nullish(),
  requires_internet: z.boolean().nullish(),
  do_not_show_during_critical_flow: z.boolean().nullish(),
};

const createCampaignInput = z.object(campaignBaseFields);

const updateCampaignInput = z.object({
  campaign_id: z.string().uuid("Invalid campaign ID"),
  ...Object.fromEntries(
    Object.entries(campaignBaseFields)
      .filter(([k]) => k !== "campaign_key" && k !== "app_key" && k !== "app_language")
      .map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])
  ),
});

const archiveCampaignInput = z.object({
  campaign_id: z.string().uuid("Invalid campaign ID"),
  app_key: z.string().min(1),
});

/**
 * Validate that trigger_event and button actions exist in the app's capabilities.
 * Only validates non-null values. Stores technical keys only (not Hebrew labels).
 */
async function validateCampaignCapabilities(
  admin: ReturnType<typeof getAdminClient>,
  app_key: string,
  fields: { trigger_event?: string | null; primary_button_action?: string | null; secondary_button_action?: string | null }
) {
  const { data: app, error } = await admin
    .from("apps")
    .select("supported_events, supported_actions")
    .eq("app_key", app_key)
    .single();

  if (error || !app) {
    throw new TRPCError({ code: "NOT_FOUND", message: `App '${app_key}' not found` });
  }

  const appData = app as Record<string, unknown>;
  const eventKeys = ((appData.supported_events as Array<{ key: string }>) ?? []).map((e) => e.key);
  const actionKeys = ((appData.supported_actions as Array<{ key: string }>) ?? []).map((a) => a.key);

  if (fields.trigger_event && !eventKeys.includes(fields.trigger_event)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `trigger_event '${fields.trigger_event}' is not in supported_events for this app. Valid: ${eventKeys.join(", ")}`,
    });
  }
  if (fields.primary_button_action && !actionKeys.includes(fields.primary_button_action)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `primary_button_action '${fields.primary_button_action}' is not in supported_actions for this app. Valid: ${actionKeys.join(", ")}`,
    });
  }
  if (fields.secondary_button_action && !actionKeys.includes(fields.secondary_button_action)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `secondary_button_action '${fields.secondary_button_action}' is not in supported_actions for this app. Valid: ${actionKeys.join(", ")}`,
    });
  }
}

// ============ ROUTER ============

export const adminRouter = router({
  /**
   * Get all registered apps
   */
  getApps: adminProcedure.query(async () => {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("apps")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return data ?? [];
  }),

  /**
   * Get dashboard stats for a specific app
   */
  getDashboardStats: adminProcedure
    .input(z.object({ app_key: z.string() }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      const { app_key } = input;

      // Run all count queries in parallel
      const [campaigns, flows, placements, rules, gates, flags, events7d] = await Promise.all([
        admin.from("remote_campaigns").select("id", { count: "exact", head: true }).eq("app_key", app_key),
        admin.from("onboarding_flows").select("id", { count: "exact", head: true }).eq("app_key", app_key),
        admin.from("paywall_placements").select("id", { count: "exact", head: true }).eq("app_key", app_key),
        admin.from("paywall_rules").select("id", { count: "exact", head: true }).eq("app_key", app_key),
        admin.from("premium_feature_gates").select("id", { count: "exact", head: true }).eq("app_key", app_key),
        admin.from("feature_flags").select("id", { count: "exact", head: true }),
        admin.from("user_experience_events").select("id", { count: "exact", head: true })
          .eq("app_key", app_key)
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      return {
        campaigns: campaigns.count ?? 0,
        onboarding_flows: flows.count ?? 0,
        paywall_placements: placements.count ?? 0,
        paywall_rules: rules.count ?? 0,
        feature_gates: gates.count ?? 0,
        feature_flags: flags.count ?? 0,
        events_last_7d: events7d.count ?? 0,
      };
    }),

  /**
   * Get remote config for a specific app + language
   */
  getRemoteConfig: adminProcedure
    .input(z.object({ app_key: z.string(), app_language: z.string() }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("remote_config")
        .select("*")
        .eq("app_key", input.app_key)
        .eq("app_language", input.app_language)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /**
   * Get all feature flags (global, no app_key filter in Phase 4A)
   */
  getFeatureFlags: adminProcedure.query(async () => {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return data ?? [];
  }),

  /**
   * Get campaigns for a specific app, optionally filtered by language and status
   */
  getCampaigns: adminProcedure
    .input(z.object({
      app_key: z.string(),
      app_language: z.string().optional(),
      status: z.enum(["active", "archived", "all"]).optional().default("all"),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("remote_campaigns")
        .select("*")
        .eq("app_key", input.app_key)
        .order("created_at", { ascending: false });

      if (input.app_language) {
        query = query.eq("app_language", input.app_language);
      }
      if (input.status === "active") {
        query = query.eq("is_archived", false);
      } else if (input.status === "archived") {
        query = query.eq("is_archived", true);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data ?? [];
    }),

  /**
   * Get onboarding flows for a specific app
   */
  getOnboardingFlows: adminProcedure
    .input(z.object({
      app_key: z.string(),
      app_language: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("onboarding_flows")
        .select("*")
        .eq("app_key", input.app_key)
        .order("created_at", { ascending: false });

      if (input.app_language) {
        query = query.eq("app_language", input.app_language);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data ?? [];
    }),

  /**
   * Get a single onboarding flow with its screens
   */
  getOnboardingFlow: adminProcedure
    .input(z.object({ flow_id: z.string() }))
    .query(async ({ input }) => {
      const admin = getAdminClient();

      const { data: flow, error: flowError } = await admin
        .from("onboarding_flows")
        .select("*")
        .eq("id", input.flow_id)
        .maybeSingle();

      if (flowError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: flowError.message });
      }
      if (!flow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Flow not found" });
      }

      const { data: screens, error: screensError } = await admin
        .from("onboarding_screens")
        .select("*")
        .eq("flow_id", input.flow_id)
        .order("sort_order", { ascending: true });

      if (screensError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: screensError.message });
      }

      return { ...flow, screens: screens ?? [] };
    }),

  /**
   * Get paywall placements for a specific app
   */
  getPaywallPlacements: adminProcedure
    .input(z.object({
      app_key: z.string(),
      app_language: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("paywall_placements")
        .select("*")
        .eq("app_key", input.app_key)
        .order("created_at", { ascending: false });

      if (input.app_language) {
        query = query.eq("app_language", input.app_language);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data ?? [];
    }),

  /**
   * Get paywall rules for a specific app
   */
  getPaywallRules: adminProcedure
    .input(z.object({
      app_key: z.string(),
      placement_id: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("paywall_rules")
        .select("*")
        .eq("app_key", input.app_key)
        .order("priority", { ascending: true });

      if (input.placement_id) {
        query = query.eq("placement_id", input.placement_id);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data ?? [];
    }),

  /**
   * Get premium feature gates for a specific app
   */
  getFeatureGates: adminProcedure
    .input(z.object({
      app_key: z.string(),
      app_language: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("premium_feature_gates")
        .select("*")
        .eq("app_key", input.app_key)
        .order("created_at", { ascending: false });

      if (input.app_language) {
        query = query.eq("app_language", input.app_language);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data ?? [];
    }),

  /**
   * Get experience events (paginated)
   */
  getEvents: adminProcedure
    .input(z.object({
      app_key: z.string().optional(),
      event_name: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("user_experience_events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.app_key) {
        query = query.eq("app_key", input.app_key);
      }
      if (input.event_name) {
        query = query.eq("event_name", input.event_name);
      }

      const { data, error, count } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { items: data ?? [], total: count ?? 0 };
    }),

  /**
   * Get audit logs (paginated)
   */
  getAuditLogs: adminProcedure
    .input(z.object({
      app_key: z.string().optional(),
      module: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      let query = admin
        .from("admin_audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.app_key) {
        query = query.eq("app_key", input.app_key);
      }
      if (input.module) {
        query = query.eq("module", input.module);
      }

      const { data, error, count } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { items: data ?? [], total: count ?? 0 };
    }),

  // ============ QUERIES (Phase 4C) ============

  /**
   * Get a single campaign by ID
   */
  getCampaign: adminProcedure
    .input(z.object({ campaign_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("remote_campaigns")
        .select("*")
        .eq("id", input.campaign_id)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }
      return data;
    }),

  // ============ MUTATIONS (Phase 4B) ============

  /**
   * Update app capabilities (JSONB fields on apps table).
   * Only updates the fields that are provided in the input.
   * Writes a synchronous audit log with before/after values.
   */
  updateAppCapabilities: adminProcedure
    .input(updateAppCapabilitiesInput)
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { app_key, ...capabilities } = input;

      // Build update object with only provided fields
      const updateFields: Record<string, unknown> = {};
      if (capabilities.supported_events !== undefined) updateFields.supported_events = capabilities.supported_events;
      if (capabilities.supported_actions !== undefined) updateFields.supported_actions = capabilities.supported_actions;
      if (capabilities.supported_placements !== undefined) updateFields.supported_placements = capabilities.supported_placements;
      if (capabilities.supported_entitlements !== undefined) updateFields.supported_entitlements = capabilities.supported_entitlements;
      if (capabilities.premium_features !== undefined) updateFields.premium_features = capabilities.premium_features;
      if (capabilities.condition_fields !== undefined) updateFields.condition_fields = capabilities.condition_fields;

      if (Object.keys(updateFields).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one capability field must be provided",
        });
      }

      // Add updated_at timestamp
      updateFields.updated_at = new Date().toISOString();

      const readCapabilities = async () => {
        const { data, error } = await admin
          .from("apps")
          .select("supported_events, supported_actions, supported_placements, supported_entitlements, premium_features, condition_fields")
          .eq("app_key", app_key)
          .single();
        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        }
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "apps",
        action: "update_capabilities",
        entity_type: "app",
        entity_id: app_key,
        readBefore: readCapabilities,
        mutate: async () => {
          const { data, error } = await admin
            .from("apps")
            .update(updateFields)
            .eq("app_key", app_key)
            .select("*")
            .single();

          if (error) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          if (!data) {
            throw new TRPCError({ code: "NOT_FOUND", message: `App '${app_key}' not found` });
          }
          return data;
        },
        readAfter: readCapabilities,
      });

      return result;
    }),

  // ============ MUTATIONS (Phase 4C — Campaigns CRUD) ============

  /**
   * Create a new campaign.
   * Validates trigger_event and button actions against app capabilities.
   * Writes audit log with before_value=null, after_value=new campaign.
   */
  createCampaign: adminProcedure
    .input(createCampaignInput)
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      // Validate capabilities
      await validateCampaignCapabilities(admin, input.app_key, {
        trigger_event: input.trigger_event,
        primary_button_action: input.primary_button_action,
        secondary_button_action: input.secondary_button_action,
      });

      // Prepare insert data — strip undefined/null optional fields, keep explicit nulls
      const insertData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          insertData[key] = value;
        }
      }
      // Ensure is_archived is false for new campaigns
      insertData.is_archived = false;

      let newCampaignId: string;

      const result = await withAuditLog({
        ctx,
        app_key: input.app_key,
        module: "campaigns",
        action: "create",
        entity_type: "campaign",
        entity_id: "", // will be set after insert
        readBefore: async () => null,
        mutate: async () => {
          const { data, error } = await admin
            .from("remote_campaigns")
            .insert(insertData)
            .select("*")
            .single();

          if (error) {
            // Check for unique constraint violation
            if (error.code === "23505") {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Campaign with key '${input.campaign_key}' already exists for this app and language`,
              });
            }
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          if (!data) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create campaign" });
          }
          newCampaignId = data.id;
          return data;
        },
        readAfter: async () => {
          const { data } = await admin
            .from("remote_campaigns")
            .select("*")
            .eq("id", newCampaignId)
            .single();
          return data;
        },
      });

      return result;
    }),

  /**
   * Update an existing campaign.
   * Validates trigger_event and button actions against app capabilities.
   * Writes audit log with before/after values.
   */
  updateCampaign: adminProcedure
    .input(updateCampaignInput)
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { campaign_id, ...updateFields } = input;

      // First, get the existing campaign to know its app_key
      const { data: existing, error: fetchError } = await admin
        .from("remote_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      // Cannot update archived campaigns
      if (existing.is_archived) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update an archived campaign" });
      }

      const app_key = existing.app_key as string;

      // Validate capabilities for fields being updated
      const existingData = existing as Record<string, unknown>;
      const uf = updateFields as Record<string, unknown>;
      await validateCampaignCapabilities(admin, app_key, {
        trigger_event: (uf.trigger_event as string | undefined) ?? (existingData.trigger_event as string | null),
        primary_button_action: (uf.primary_button_action as string | undefined) ?? (existingData.primary_button_action as string | null),
        secondary_button_action: (uf.secondary_button_action as string | undefined) ?? (existingData.secondary_button_action as string | null),
      });

      // Build update object with only provided fields
      const dbUpdate: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateFields)) {
        if (value !== undefined) {
          dbUpdate[key] = value;
        }
      }

      if (Object.keys(dbUpdate).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      dbUpdate.updated_at = new Date().toISOString();

      const readCampaign = async () => {
        const { data } = await admin
          .from("remote_campaigns")
          .select("*")
          .eq("id", campaign_id)
          .single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "campaigns",
        action: "update",
        entity_type: "campaign",
        entity_id: campaign_id,
        readBefore: readCampaign,
        mutate: async () => {
          const { data, error } = await admin
            .from("remote_campaigns")
            .update(dbUpdate)
            .eq("id", campaign_id)
            .select("*")
            .single();

          if (error) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          return data;
        },
        readAfter: readCampaign,
      });

      return result;
    }),

  /**
   * Archive a campaign (soft delete).
   * Sets is_archived=true and is_enabled=false.
   * Writes audit log with before/after values.
   */
  archiveCampaign: adminProcedure
    .input(archiveCampaignInput)
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { campaign_id, app_key } = input;

      // Verify campaign exists and belongs to the app
      const { data: existing, error: fetchError } = await admin
        .from("remote_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .eq("app_key", app_key)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found for this app" });
      }

      if (existing.is_archived) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign is already archived" });
      }

      const readCampaign = async () => {
        const { data } = await admin
          .from("remote_campaigns")
          .select("*")
          .eq("id", campaign_id)
          .single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "campaigns",
        action: "archive",
        entity_type: "campaign",
        entity_id: campaign_id,
        readBefore: readCampaign,
        mutate: async () => {
          const { data, error } = await admin
            .from("remote_campaigns")
            .update({
              is_archived: true,
              is_enabled: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaign_id)
            .select("*")
            .single();

          if (error) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          return data;
        },
        readAfter: readCampaign,
      });

      return result;
    }),

  // ============ MUTATIONS (Phase 5 — Remote Config, Feature Flags, Onboarding, Paywall) ============

  /**
   * Upsert remote config for a specific app + language.
   * Creates the row if it doesn't exist, updates if it does.
   * Writes audit log with before/after values.
   */
  upsertRemoteConfig: adminProcedure
    .input(z.object({
      app_key: z.string().min(1),
      app_language: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { app_key, app_language, config } = input;

      const readConfig = async () => {
        const { data } = await admin.from("remote_config")
          .select("*").eq("app_key", app_key).eq("app_language", app_language).maybeSingle();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "remote_config",
        action: "upsert",
        entity_type: "remote_config",
        entity_id: `${app_key}:${app_language}`,
        readBefore: readConfig,
        mutate: async () => {
          const { data, error } = await admin.from("remote_config")
            .upsert({ app_key, app_language, ...config }, { onConflict: "app_key,app_language" })
            .select("*")
            .single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: readConfig,
      });
      return result;
    }),

  /**
   * Create a new feature flag.
   */
  createFeatureFlag: adminProcedure
    .input(z.object({
      flag_name: z.string().min(1),
      is_enabled: z.boolean().default(false),
      description: z.string().optional(),
      rollout_percentage: z.number().int().min(0).max(100).optional().default(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      const result = await withAuditLog({
        ctx,
        app_key: "global",
        module: "feature_flags",
        action: "create",
        entity_type: "feature_flag",
        entity_id: input.flag_name,
        readBefore: async () => null,
        mutate: async () => {
          const { data, error } = await admin.from("feature_flags")
            .insert({
              flag_name: input.flag_name,
              is_enabled: input.is_enabled,
              description: input.description ?? null,
              rollout_percentage: input.rollout_percentage ?? 100,
            })
            .select("*")
            .single();
          if (error) {
            if (error.code === "23505") {
              throw new TRPCError({ code: "CONFLICT", message: `Flag '${input.flag_name}' already exists` });
            }
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          return data;
        },
        readAfter: async () => {
          const { data } = await admin.from("feature_flags").select("*").eq("flag_name", input.flag_name).single();
          return data;
        },
      });
      return result;
    }),

  /**
   * Update a feature flag (toggle, description, rollout %).
   */
  updateFeatureFlag: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      is_enabled: z.boolean().optional(),
      description: z.string().optional(),
      rollout_percentage: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { id, ...updates } = input;

      const readFlag = async () => {
        const { data } = await admin.from("feature_flags").select("*").eq("id", id).single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key: "global",
        module: "feature_flags",
        action: "update",
        entity_type: "feature_flag",
        entity_id: id,
        readBefore: readFlag,
        mutate: async () => {
          const updateObj: Record<string, unknown> = {};
          if (updates.is_enabled !== undefined) updateObj.is_enabled = updates.is_enabled;
          if (updates.description !== undefined) updateObj.description = updates.description;
          if (updates.rollout_percentage !== undefined) updateObj.rollout_percentage = updates.rollout_percentage;
          updateObj.updated_at = new Date().toISOString();

          const { data, error } = await admin.from("feature_flags")
            .update(updateObj).eq("id", id).select("*").single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: readFlag,
      });
      return result;
    }),

  /**
   * Delete a feature flag.
   */
  deleteFeatureFlag: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      const readFlag = async () => {
        const { data } = await admin.from("feature_flags").select("*").eq("id", input.id).maybeSingle();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key: "global",
        module: "feature_flags",
        action: "delete",
        entity_type: "feature_flag",
        entity_id: input.id,
        readBefore: readFlag,
        mutate: async () => {
          const { error } = await admin.from("feature_flags").delete().eq("id", input.id);
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return { deleted: true };
        },
        readAfter: async () => null,
      });
      return result;
    }),

  /**
   * Create a new onboarding flow.
   */
  createOnboardingFlow: adminProcedure
    .input(z.object({
      app_key: z.string().min(1),
      app_language: z.string().min(1),
      flow_key: z.string().min(1),
      title: z.string().min(1),
      is_enabled: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      const result = await withAuditLog({
        ctx,
        app_key: input.app_key,
        module: "onboarding",
        action: "create_flow",
        entity_type: "onboarding_flow",
        entity_id: input.flow_key,
        readBefore: async () => null,
        mutate: async () => {
          const { data, error } = await admin.from("onboarding_flows")
            .insert({
              app_key: input.app_key,
              app_language: input.app_language,
              flow_key: input.flow_key,
              title: input.title,
              is_enabled: input.is_enabled,
            })
            .select("*")
            .single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: async () => {
          const { data } = await admin.from("onboarding_flows").select("*").eq("flow_key", input.flow_key).eq("app_key", input.app_key).single();
          return data;
        },
      });
      return result;
    }),

  /**
   * Update an onboarding flow (title, enabled status).
   */
  updateOnboardingFlow: adminProcedure
    .input(z.object({
      flow_id: z.string().uuid(),
      app_key: z.string().min(1),
      title: z.string().optional(),
      is_enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { flow_id, app_key, ...updates } = input;

      const readFlow = async () => {
        const { data } = await admin.from("onboarding_flows").select("*").eq("id", flow_id).single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "onboarding",
        action: "update_flow",
        entity_type: "onboarding_flow",
        entity_id: flow_id,
        readBefore: readFlow,
        mutate: async () => {
          const updateObj: Record<string, unknown> = {};
          if (updates.title !== undefined) updateObj.title = updates.title;
          if (updates.is_enabled !== undefined) updateObj.is_enabled = updates.is_enabled;
          updateObj.updated_at = new Date().toISOString();

          const { data, error } = await admin.from("onboarding_flows")
            .update(updateObj).eq("id", flow_id).select("*").single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: readFlow,
      });
      return result;
    }),

  /**
   * Create/update onboarding screens for a flow (bulk upsert).
   * Replaces all screens for the flow with the provided array.
   */
  upsertOnboardingScreens: adminProcedure
    .input(z.object({
      flow_id: z.string().uuid(),
      app_key: z.string().min(1),
      screens: z.array(z.object({
        id: z.string().uuid().optional(),
        sort_order: z.number().int().min(0),
        title: z.string().min(1),
        body: z.string().optional(),
        icon: z.string().optional(),
        image_url: z.string().optional(),
        background_color: z.string().optional(),
        button_text: z.string().optional(),
        skip_button_text: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { flow_id, app_key, screens } = input;

      const readScreens = async () => {
        const { data } = await admin.from("onboarding_screens")
          .select("*").eq("flow_id", flow_id).order("sort_order", { ascending: true });
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "onboarding",
        action: "upsert_screens",
        entity_type: "onboarding_screens",
        entity_id: flow_id,
        readBefore: readScreens,
        mutate: async () => {
          // Delete existing screens for this flow
          await admin.from("onboarding_screens").delete().eq("flow_id", flow_id);
          // Insert new screens
          if (screens.length > 0) {
            const rows = screens.map((s, i) => ({
              flow_id,
              sort_order: s.sort_order ?? i,
              title: s.title,
              body: s.body ?? null,
              icon: s.icon ?? null,
              image_url: s.image_url ?? null,
              background_color: s.background_color ?? null,
              button_text: s.button_text ?? null,
              skip_button_text: s.skip_button_text ?? null,
            }));
            const { error } = await admin.from("onboarding_screens").insert(rows);
            if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          }
          return { updated: screens.length };
        },
        readAfter: readScreens,
      });
      return result;
    }),

  /**
   * Create a paywall placement.
   */
  createPaywallPlacement: adminProcedure
    .input(z.object({
      app_key: z.string().min(1),
      app_language: z.string().optional(),
      placement_key: z.string().min(1),
      display_name: z.string().min(1),
      description: z.string().optional(),
      is_enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      const result = await withAuditLog({
        ctx,
        app_key: input.app_key,
        module: "paywall",
        action: "create_placement",
        entity_type: "paywall_placement",
        entity_id: input.placement_key,
        readBefore: async () => null,
        mutate: async () => {
          const { data, error } = await admin.from("paywall_placements")
            .insert({
              app_key: input.app_key,
              app_language: input.app_language ?? null,
              placement_key: input.placement_key,
              display_name: input.display_name,
              description: input.description ?? null,
              is_enabled: input.is_enabled,
            })
            .select("*")
            .single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: async () => {
          const { data } = await admin.from("paywall_placements").select("*")
            .eq("app_key", input.app_key).eq("placement_key", input.placement_key).single();
          return data;
        },
      });
      return result;
    }),

  /**
   * Update a paywall placement.
   */
  updatePaywallPlacement: adminProcedure
    .input(z.object({
      id: z.number().int(),
      app_key: z.string().min(1),
      display_name: z.string().optional(),
      description: z.string().optional(),
      is_enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { id, app_key, ...updates } = input;

      const readPlacement = async () => {
        const { data } = await admin.from("paywall_placements").select("*").eq("id", id).single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "paywall",
        action: "update_placement",
        entity_type: "paywall_placement",
        entity_id: String(id),
        readBefore: readPlacement,
        mutate: async () => {
          const updateObj: Record<string, unknown> = {};
          if (updates.display_name !== undefined) updateObj.display_name = updates.display_name;
          if (updates.description !== undefined) updateObj.description = updates.description;
          if (updates.is_enabled !== undefined) updateObj.is_enabled = updates.is_enabled;
          updateObj.updated_at = new Date().toISOString();

          const { data, error } = await admin.from("paywall_placements")
            .update(updateObj).eq("id", id).select("*").single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: readPlacement,
      });
      return result;
    }),

  /**
   * Create a premium feature gate.
   */
  createFeatureGate: adminProcedure
    .input(z.object({
      app_key: z.string().min(1),
      app_language: z.string().optional(),
      feature_key: z.string().min(1),
      display_name: z.string().min(1),
      required_entitlement: z.string().min(1),
      is_enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();

      const result = await withAuditLog({
        ctx,
        app_key: input.app_key,
        module: "paywall",
        action: "create_feature_gate",
        entity_type: "premium_feature_gate",
        entity_id: input.feature_key,
        readBefore: async () => null,
        mutate: async () => {
          const { data, error } = await admin.from("premium_feature_gates")
            .insert({
              app_key: input.app_key,
              app_language: input.app_language ?? null,
              feature_key: input.feature_key,
              display_name: input.display_name,
              required_entitlement: input.required_entitlement,
              is_enabled: input.is_enabled,
            })
            .select("*")
            .single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: async () => {
          const { data } = await admin.from("premium_feature_gates").select("*")
            .eq("app_key", input.app_key).eq("feature_key", input.feature_key).single();
          return data;
        },
      });
      return result;
    }),

  /**
   * Update a premium feature gate.
   */
  updateFeatureGate: adminProcedure
    .input(z.object({
      id: z.number().int(),
      app_key: z.string().min(1),
      display_name: z.string().optional(),
      required_entitlement: z.string().optional(),
      is_enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const admin = getAdminClient();
      const { id, app_key, ...updates } = input;

      const readGate = async () => {
        const { data } = await admin.from("premium_feature_gates").select("*").eq("id", id).single();
        return data;
      };

      const result = await withAuditLog({
        ctx,
        app_key,
        module: "paywall",
        action: "update_feature_gate",
        entity_type: "premium_feature_gate",
        entity_id: String(id),
        readBefore: readGate,
        mutate: async () => {
          const updateObj: Record<string, unknown> = {};
          if (updates.display_name !== undefined) updateObj.display_name = updates.display_name;
          if (updates.required_entitlement !== undefined) updateObj.required_entitlement = updates.required_entitlement;
          if (updates.is_enabled !== undefined) updateObj.is_enabled = updates.is_enabled;
          updateObj.updated_at = new Date().toISOString();

          const { data, error } = await admin.from("premium_feature_gates")
            .update(updateObj).eq("id", id).select("*").single();
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
          return data;
        },
        readAfter: readGate,
      });
      return result;
    }),
});
