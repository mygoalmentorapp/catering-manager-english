/**
 * Device Router — Server-side device binding endpoints.
 *
 * Manages device registration, verification code flow, and device transfer.
 * Uses protectedProcedure → ctx.user.openId (which is the Supabase user ID)
 * for user identification. Email is fetched via Supabase admin API.
 *
 * Tables (in Supabase):
 * - user_devices: one active device per user
 * - transfer_codes: OTP codes for device transfer (SHA-256 hashed)
 * - transfer_audit: audit log of all transfer requests
 *
 * No monthly limit on transfers (removed by design).
 * Rate limit: 5 code requests per hour.
 * Code expiry: 15 minutes. Max 5 attempts per code.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { createHash, randomInt } from "crypto";
import { Resend } from "resend";
import { SUPABASE_URL as SUPABASE_URL_RESOLVED, SUPABASE_SERVICE_ROLE_KEY as SUPABASE_SERVICE_ROLE_KEY_RESOLVED } from './supabase-config';

const FROM_EMAIL = "support@cateringmanager.app";
const FROM_NAME = "Catering Manager Pro";
const APP_SCHEME = "manusen20260411205951";

/**
 * Send a Supabase Realtime Broadcast to kick the old device.
 * Channel name: `device-kick:{userId}` — the old device listens on this channel.
 * Event: "device_kicked" with the new device UUID.
 * This is fire-and-forget — if the old device is offline, the server middleware
 * will catch it on the next mutation attempt.
 */
async function broadcastDeviceKick(userId: string, newDeviceUuid: string): Promise<void> {
  try {
    const url = SUPABASE_URL_RESOLVED;
    const key = SUPABASE_SERVICE_ROLE_KEY_RESOLVED;
    if (!url || !key) return;

    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const channelName = `device-kick:${userId}`;
    const channel = admin.channel(channelName);

    // Subscribe first, then broadcast
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "device_kicked",
      payload: { newDeviceUuid, kickedAt: new Date().toISOString() },
    });

    // Unsubscribe after sending (server doesn't need to stay connected)
    await admin.removeChannel(channel);
    console.log(`[device-broadcast] Sent kick event to channel ${channelName}`);
  } catch (err) {
    // Non-critical — middleware is the safety net
    console.error("[device-broadcast] Failed to send kick:", err);
  }
}

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

/**
 * Get the authenticated user's Supabase user ID from the tRPC context.
 * ctx.user.openId IS the Supabase user.id (set during bridge).
 */
function getUserId(ctx: { user: { openId: string } }): string {
  return ctx.user.openId;
}

/**
 * Get user email from Supabase Auth admin API using the user's openId.
 */
async function getUserEmail(userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unable to retrieve the email address",
    });
  }
  return data.user.email;
}

// ============ DEVICE ROUTER ============

export const deviceRouter = router({
  /**
   * Register or check-in a device.
   *
   * Logic:
   * - If no active device exists → create new active device (first time)
   * - If this device is already active → update last_active_at
   * - If another device is active → return requires_verification
   * - Web clients always get "active" (no device binding for web)
   */
  register: protectedProcedure
    .input(
      z.object({
        deviceUuid: z.string().min(1),
        deviceName: z.string().default(""),
        deviceOs: z.string().default(""),
        appVersion: z.string().default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      console.log(`[device-register] userId=${userId}, deviceUuid=${input.deviceUuid.substring(0, 8)}...`);
      const admin = getAdminClient();

      // Check if there's any active device for this user
      const { data: activeDevice } = await admin
        .from("user_devices")
        .select("id, device_uuid, status, last_active_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      // Case 1: No active device → first registration, auto-activate
      if (!activeDevice) {
        // Upsert: create or reactivate
        const { data: existingDevice } = await admin
          .from("user_devices")
          .select("id")
          .eq("user_id", userId)
          .eq("device_uuid", input.deviceUuid)
          .maybeSingle();

        if (existingDevice) {
          await admin
            .from("user_devices")
            .update({
              status: "active",
              device_name: input.deviceName,
              device_os: input.deviceOs,
              app_version: input.appVersion,
              last_active_at: new Date().toISOString(),
            })
            .eq("id", existingDevice.id);
        } else {
          await admin.from("user_devices").insert({
            user_id: userId,
            device_uuid: input.deviceUuid,
            device_name: input.deviceName,
            device_os: input.deviceOs,
            app_version: input.appVersion,
            status: "active",
          });
        }
        return { status: "active" as const };
      }

      // Case 2: This device is the active one → update last_active_at
      if (activeDevice.device_uuid === input.deviceUuid) {
        await admin
          .from("user_devices")
          .update({
            last_active_at: new Date().toISOString(),
            device_name: input.deviceName,
            device_os: input.deviceOs,
            app_version: input.appVersion,
          })
          .eq("id", activeDevice.id);
        return { status: "active" as const };
      }

      // Case 3: Another device is active → requires verification
      console.log(`[device-register] requires_verification — active device: ${activeDevice.device_uuid.substring(0, 8)}..., requesting device: ${input.deviceUuid.substring(0, 8)}...`);

      // Create an inactive record for this device if it doesn't exist yet
      const { data: existingInactive } = await admin
        .from("user_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("device_uuid", input.deviceUuid)
        .maybeSingle();

      if (!existingInactive) {
        await admin.from("user_devices").insert({
          user_id: userId,
          device_uuid: input.deviceUuid,
          device_name: input.deviceName,
          device_os: input.deviceOs,
          app_version: input.appVersion,
          status: "inactive",
        });
      } else {
        // Update device info even if record exists
        await admin
          .from("user_devices")
          .update({
            device_name: input.deviceName,
            device_os: input.deviceOs,
            app_version: input.appVersion,
          })
          .eq("id", existingInactive.id);
      }

      return { status: "requires_verification" as const };
    }),

  /**
   * Request a verification code for device transfer.
   *
   * - Rate limit: 5 requests per hour
   * - Generates a 6-digit code
   * - Stores SHA-256 hash in transfer_codes
   * - Sends code via email using Resend
   * - Invalidates any previous codes for this user
   */
  requestVerificationCode: protectedProcedure
    .input(
      z.object({
        deviceUuid: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      console.log(`[device-verify] requestVerificationCode called for userId=${userId}`);
      const email = await getUserEmail(userId);
      console.log(`[device-verify] User email resolved: ${email.substring(0, 3)}***`);
      const admin = getAdminClient();

      // Check rate limit: 5 requests per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentCodes } = await admin
        .from("transfer_codes")
        .select("id")
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo);

      if (recentCodes && recentCodes.length >= 5) {
        return {
          success: false,
          limitReached: true,
          message: "Too many requests. Please try again in an hour.",
        };
      }

      // Invalidate all previous codes for this user
      await admin
        .from("transfer_codes")
        .update({ used: true })
        .eq("user_id", userId)
        .eq("used", false);

      // Generate 6-digit code
      const code = String(randomInt(100000, 999999));
      const codeHash = createHash("sha256").update(code).digest("hex");

      // Store code hash (expires in 15 minutes)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await admin.from("transfer_codes").insert({
        user_id: userId,
        code_hash: codeHash,
        new_device_uuid: input.deviceUuid,
        expires_at: expiresAt.toISOString(),
      });

      // Create audit record
      await admin.from("transfer_audit").insert({
        user_id: userId,
        new_device_uuid: input.deviceUuid,
        status: "requested",
      });

      // Send verification code via Resend
      try {
        await sendVerificationCodeEmail(email, code);
        console.log(`[device-verify] Verification code sent to ${email.substring(0, 3)}***`);
      } catch (emailErr) {
        console.error("[device-verify] Email send error:", emailErr);
        // Log the code as fallback so admin can retrieve it
        console.log(`[device-verify] FALLBACK — code for ${email}: ${code}`);
      }

      return {
        success: true,
        limitReached: false,
        message: "A verification code was sent to your email.",
      };
    }),

  /**
   * Verify a transfer code and activate the new device.
   *
   * - Validates the code against stored hash
   * - Checks expiration and attempt limits (5 max)
   * - On success: deactivates old device, activates new device
   * - Sends confirmation email
   */
  verifyCode: protectedProcedure
    .input(
      z.object({
        deviceUuid: z.string().min(1),
        code: z.string().length(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx);
      const admin = getAdminClient();

      // Find the latest unused, non-expired code for this user
      const { data: transferCode } = await admin
        .from("transfer_codes")
        .select("*")
        .eq("user_id", userId)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!transferCode) {
        return {
          success: false,
          expired: true,
          tooManyAttempts: false,
          attemptsLeft: 0,
          message: "Code expired. Please send a new code.",
        };
      }

      // Check attempt limit
      if (transferCode.attempts >= 5) {
        await admin
          .from("transfer_codes")
          .update({ used: true })
          .eq("id", transferCode.id);
        return {
          success: false,
          expired: false,
          tooManyAttempts: true,
          attemptsLeft: 0,
          message: "Too many incorrect attempts. Please send a new code.",
        };
      }

      // Verify code hash
      const inputHash = createHash("sha256").update(input.code).digest("hex");
      if (inputHash !== transferCode.code_hash) {
        const newAttempts = transferCode.attempts + 1;
        await admin
          .from("transfer_codes")
          .update({ attempts: newAttempts })
          .eq("id", transferCode.id);
        return {
          success: false,
          expired: false,
          tooManyAttempts: newAttempts >= 5,
          attemptsLeft: 5 - newAttempts,
          message: `Incorrect code. ${5 - newAttempts} attempts remaining.`,
        };
      }

      // ========== CODE IS CORRECT — PERFORM DEVICE TRANSFER ==========

      // 1. Mark code as used
      await admin
        .from("transfer_codes")
        .update({ used: true })
        .eq("id", transferCode.id);

      // 2. Get old active device info for audit
      const { data: oldDevices } = await admin
        .from("user_devices")
        .select("id, device_uuid")
        .eq("user_id", userId)
        .eq("status", "active");
      const oldDeviceUuid = oldDevices?.[0]?.device_uuid ?? null;

      // 3. Deactivate all current active devices
      await admin
        .from("user_devices")
        .update({ status: "inactive" })
        .eq("user_id", userId)
        .eq("status", "active");

      // 4. Activate the new device (upsert)
      const { data: existingNewDevice } = await admin
        .from("user_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("device_uuid", input.deviceUuid)
        .maybeSingle();

      if (existingNewDevice) {
        await admin
          .from("user_devices")
          .update({
            status: "active",
            last_active_at: new Date().toISOString(),
          })
          .eq("id", existingNewDevice.id);
      } else {
        await admin.from("user_devices").insert({
          user_id: userId,
          device_uuid: input.deviceUuid,
          status: "active",
        });
      }

      // 5. Update transfer_audit
      await admin
        .from("transfer_audit")
        .update({
          status: "completed",
          old_device_uuid: oldDeviceUuid,
          completed_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("new_device_uuid", input.deviceUuid)
        .eq("status", "requested")
        .order("created_at", { ascending: false })
        .limit(1);

      // 6. Broadcast kick event to old device (non-blocking, instant)
      broadcastDeviceKick(userId, input.deviceUuid);

      // 7. Send confirmation email (non-blocking)
      try {
        const email = await getUserEmail(userId);
        await sendTransferConfirmationEmail(email);
        console.log(`[device-verify] Transfer confirmation sent to ${email.substring(0, 3)}***`);
      } catch (confirmErr) {
        console.error("[device-verify] Confirmation email error:", confirmErr);
      }

      return {
        success: true,
        expired: false,
        tooManyAttempts: false,
        attemptsLeft: 5,
        message: "Device verified successfully!",
      };
    }),
});

// ============ EMAIL HELPERS ============

async function sendVerificationCodeEmail(email: string, code: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  const resend = new Resend(resendApiKey);

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      direction: rtl;
    }
    .container {
      max-width: 520px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .icon {
      text-align: center;
      margin-bottom: 24px;
    }
    .icon-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #EDE9FE;
    }
    h1 {
      font-size: 22px;
      color: #1a1a1a;
      text-align: center;
      margin: 0 0 16px;
    }
    p {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin: 0 0 12px;
    }
    .code-box {
      text-align: center;
      margin: 24px 0;
      padding: 20px;
      background: #F8F8FC;
      border-radius: 12px;
      border: 2px dashed #6C63FF;
    }
    .code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #6C63FF;
      font-family: 'Courier New', monospace;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }
    .warning {
      font-size: 13px;
      color: #9ca3af;
      text-align: center;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <div class="icon-circle">
        <span style="font-size: 32px;">&#128272;</span>
      </div>
    </div>
    <h1>Verification code for new device</h1>
    <p>Hello,</p>
    <p>We received a request to transfer your account to a new device. Here is your verification code:</p>
    <div class="code-box">
      <span class="code">${code}</span>
    </div>
    <p class="warning">The code is valid for 15 minutes only. If you did not request a transfer, ignore this message.</p>
    <hr class="divider">
    <div class="footer">
      <p>This message was sent automatically from ${FROM_NAME}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const result = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: email.trim(),
    subject: `Verification code: ${code} [${Date.now().toString(36)}]`,
    headers: {
      "X-Entity-Ref-ID": `device-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    html: htmlContent,
  });

  if (result.error) {
    throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
  }
}

async function sendTransferConfirmationEmail(email: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  if (!resendApiKey) {
    console.warn("[device-verify] Missing RESEND_API_KEY, skipping confirmation email");
    return;
  }
  const resend = new Resend(resendApiKey);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      direction: rtl;
    }
    .container {
      max-width: 520px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      padding: 40px 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .icon {
      text-align: center;
      margin-bottom: 24px;
    }
    .icon-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #D1FAE5;
    }
    h1 {
      font-size: 22px;
      color: #1a1a1a;
      text-align: center;
      margin: 0 0 16px;
    }
    p {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin: 0 0 12px;
    }
    .info-box {
      margin: 20px 0;
      padding: 16px;
      background: #F0FDF4;
      border-radius: 12px;
      border: 1px solid #BBF7D0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .info-label {
      color: #6b7280;
      font-weight: 500;
    }
    .info-value {
      color: #1a1a1a;
      font-weight: 600;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }
    .warning {
      font-size: 13px;
      color: #EF4444;
      background: #FEF2F2;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
      margin: 16px 0;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <div class="icon-circle">
        <span style="font-size: 32px;">&#9989;</span>
      </div>
    </div>
    <h1>Account transferred to new device</h1>
    <p>Hello,</p>
    <p>Your account was successfully transferred to a new device.</p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${dateStr}</span>
      </div>
    </div>
    <p class="warning">If you did not make this transfer, someone else may be using your account. Change your password immediately.</p>
    <hr class="divider">
    <div class="footer">
      <p>This message was sent automatically from ${FROM_NAME}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const result = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: email.trim(),
    subject: `Your account was moved to a new device [${Date.now().toString(36)}]`,
    headers: {
      "X-Entity-Ref-ID": `device-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    html: htmlContent,
  });

  if (result.error) {
    console.error("[device-verify] Confirmation email error:", result.error);
  }
}
