/**
 * Session Router — Single Active Session enforcement.
 *
 * Policy: "Last device wins" — the most recent device to call claim
 * always becomes the active session. Old devices discover they lost
 * the session via verify/heartbeat.
 *
 * Authentication: Uses ctx.user from the tRPC context.
 * The user is identified by their openId.
 *
 * Endpoints:
 * - session.claim: Become the active session (always succeeds)
 * - session.verify: Check if this device is still the active session (read-only)
 * - session.heartbeat: Keep session alive + verify ownership
 * - session.release: Explicitly release session (on signOut)
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { SUPABASE_URL as SUPABASE_URL_RESOLVED, SUPABASE_SERVICE_ROLE_KEY as SUPABASE_SERVICE_ROLE_KEY_RESOLVED } from './supabase-config';

// ============ HELPERS ============

function getAdminClient() {
  const url = SUPABASE_URL_RESOLVED;
  const key = SUPABASE_SERVICE_ROLE_KEY_RESOLVED;
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

// ============ CONSTANTS ============

/** Session TTL in seconds */
const SESSION_TTL_SECONDS = 90;

// ============ ROUTER ============

export const sessionRouter = router({
  /**
   * Claim: Become the active session.
   * ALWAYS succeeds — last device wins.
   * Uses atomic RPC (claim_session) which does UPSERT.
   */
  claim: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
        deviceName: z.string().optional(),
        deviceOs: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.openId;
      const admin = getAdminClient();

      const { data, error } = await admin.rpc("claim_session", {
        p_user_id: userId,
        p_device_id: input.deviceId,
        p_device_name: input.deviceName || null,
        p_device_os: input.deviceOs || null,
        p_ttl_seconds: SESSION_TTL_SECONDS,
      });

      if (error) {
        if (error.message?.includes("function") || error.code === "42883") {
          return await claimFallback(admin, userId, input);
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Session claim failed: ${error.message}`,
        });
      }

      return {
        granted: data?.granted ?? true,
        activeDeviceName: data?.active_device_name ?? null,
      };
    }),

  /**
   * Verify: Check if this device is still the active session.
   * Read-only — does NOT update last_seen_at or expires_at.
   * Used for: foreground check, edit guard, mutation guard.
   */
  verify: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.user.openId;
      const admin = getAdminClient();

      const { data, error } = await admin
        .from("active_sessions")
        .select("device_id, device_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Session verify failed: ${error.message}`,
        });
      }

      if (!data) {
        return { valid: false, activeDeviceName: null };
      }

      const isOwner = data.device_id === input.deviceId;
      return {
        valid: isOwner,
        activeDeviceName: isOwner ? null : (data.device_name || null),
      };
    }),

  /**
   * Heartbeat: Keep the current session alive.
   * Updates last_seen_at and extends expires_at.
   * Returns { valid: false } if session was taken by another device.
   */
  heartbeat: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.openId;
      const admin = getAdminClient();

      const { data, error } = await admin
        .from("active_sessions")
        .update({
          last_seen_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
        })
        .eq("user_id", userId)
        .eq("device_id", input.deviceId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Heartbeat failed: ${error.message}`,
        });
      }

      return { valid: !!data };
    }),

  /**
   * Release: Explicitly release the session (on signOut or app close).
   */
  release: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.openId;
      const admin = getAdminClient();

      const { error } = await admin
        .from("active_sessions")
        .update({
          expires_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq("user_id", userId)
        .eq("device_id", input.deviceId);

      if (error) {
        console.error("[session.release] Error:", error.message);
      }

      return { released: true };
    }),
});

// ============ FALLBACK (without RPC) ============

/**
 * Fallback claim logic — always UPSERT (last device wins).
 */
async function claimFallback(
  admin: any,
  userId: string,
  input: { deviceId: string; deviceName?: string; deviceOs?: string }
): Promise<{ granted: boolean; activeDeviceName: string | null }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  const { error: upsertErr } = await admin
    .from("active_sessions")
    .upsert(
      {
        user_id: userId,
        device_id: input.deviceId,
        device_name: input.deviceName || null,
        device_os: input.deviceOs || null,
        last_seen_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertErr) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Session upsert failed: ${upsertErr.message}`,
    });
  }

  return { granted: true, activeDeviceName: null };
}
