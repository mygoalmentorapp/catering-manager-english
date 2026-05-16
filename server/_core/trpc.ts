import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { PROFILE_LOAD_FAILED } from "./sdk";
import { SUPABASE_URL as SUPABASE_URL_RESOLVED, SUPABASE_SERVICE_ROLE_KEY as SUPABASE_SERVICE_ROLE_KEY_RESOLVED } from '../supabase-config';

/**
 * Custom error class for profile-loading failures.
 * Used as the `cause` of a TRPCError so the errorFormatter can detect it
 * and add `profileError: true` to the response data.
 */
export class ProfileLoadError extends Error {
  public readonly profileError = true;
  constructor(message: string) {
    super(message);
    this.name = PROFILE_LOAD_FAILED;
  }
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * Custom error formatter that adds `profileError: true` to the error data
   * when the cause is a ProfileLoadError. This allows the client to distinguish
   * between a true auth failure (UNAUTHORIZED → sign out) and a profile-loading
   * issue (INTERNAL_SERVER_ERROR + profileError → show friendly error, no sign out).
   *
   * Client access path: err.data.profileError === true
   */
  errorFormatter({ shape, error }) {
    const isProfileError =
      error.cause instanceof ProfileLoadError ||
      (error.cause && "profileError" in error.cause && (error.cause as any).profileError === true);

    return {
      ...shape,
      data: {
        ...shape.data,
        ...(isProfileError ? { profileError: true } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * requireUser middleware:
 *
 * - ctx.user === null → JWT was invalid/missing → throw UNAUTHORIZED (client will sign out)
 * - ctx.user exists (full or minimal) → user is authenticated → proceed
 *
 * IMPORTANT: This middleware does NOT throw on minimal users (id=0).
 * Minimal users have a valid JWT but their profile couldn't be loaded from DB.
 * Individual procedures that require full profile data should check ctx.isMinimalUser
 * and throw INTERNAL_SERVER_ERROR with ProfileLoadError cause if needed.
 */
const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Device-active middleware:
 * Checks that the requesting device is the active device for this user.
 * Used on all write/mutation endpoints that modify business data.
 * 
 * Reads the X-Device-UUID header from the request and verifies it matches
 * the active device in user_devices table.
 * 
 * If no header is present (web client), the check is skipped.
 * If the device is NOT active, throws FORBIDDEN with a special code
 * so the client can show the device-blocked screen.
 */
const requireActiveDevice = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  // Must have a user (this middleware is used after requireUser)
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const deviceUuid = ctx.req.headers["x-device-uuid"] as string | undefined;

  // Web clients don't send device UUID — skip check
  if (!deviceUuid) {
    return next({ ctx });
  }

  // Check if this device is the active one
  const { createClient } = await import("@supabase/supabase-js");
  const url = SUPABASE_URL_RESOLVED;
  const key = SUPABASE_SERVICE_ROLE_KEY_RESOLVED;

  if (!url || !key) {
    // Can't validate — allow through (fail open for config issues)
    return next({ ctx });
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: activeDevice } = await admin
    .from("user_devices")
    .select("device_uuid")
    .eq("user_id", ctx.user.openId)
    .eq("status", "active")
    .maybeSingle();

  // If there's an active device and it's NOT this one → block
  if (activeDevice && activeDevice.device_uuid !== deviceUuid) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "DEVICE_NOT_ACTIVE",
    });
  }

  return next({ ctx });
});

/**
 * Protected procedure that also validates device ownership.
 * Use this for all mutations that modify business data (save, edit, delete).
 * Read-only queries can use regular protectedProcedure.
 */
export const deviceProtectedProcedure = t.procedure.use(requireUser).use(requireActiveDevice);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    // Admin check requires full profile (role is in DB)
    if (ctx.isMinimalUser) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: PROFILE_LOAD_FAILED,
        cause: new ProfileLoadError("Cannot verify admin role: profile not loaded from DB"),
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
