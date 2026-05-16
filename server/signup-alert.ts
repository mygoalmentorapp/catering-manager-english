/**
 * Signup Alert Service
 *
 * When a verified user attempts to re-register, sends a security alert email
 * via Resend. Uses Supabase service_role to check email status server-side.
 *
 * Features:
 * - Hashed email logging (never stores raw email in logs or DB)
 * - Audit trail in signup_alert_log table
 * - Detailed server-side console logging with timestamps
 *
 * SECURITY: This module runs entirely server-side. No information about
 * email existence or verification status is ever returned to the client.
 *
 * NOTE: Environment variables are read lazily inside functions (not at
 * module-level) to ensure dotenv has loaded them before first use.
 */

import { createHash } from "crypto";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL as SUPABASE_URL_RESOLVED, SUPABASE_SERVICE_ROLE_KEY as SUPABASE_SERVICE_ROLE_KEY_RESOLVED } from './supabase-config';

const FROM_EMAIL = "support@cateringmanager.app";
const FROM_NAME = "Catering Manager Pro";

// Deep link scheme for the app
const APP_SCHEME = "manusen20260411205951";

/**
 * Read env vars lazily so dotenv/config has time to populate them.
 */
function getEnv() {
  return {
    supabaseUrl: SUPABASE_URL_RESOLVED,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY_RESOLVED,
    resendApiKey: process.env.RESEND_API_KEY ?? "",
  };
}

/**
 * Hash an email address for logging/audit purposes.
 * Uses SHA-256 — irreversible, safe to store.
 */
function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

/**
 * Create a Supabase admin client with service_role key.
 */
function getAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      `Missing Supabase credentials: URL=${supabaseUrl ? "SET" : "MISSING"}, KEY=${supabaseServiceRoleKey ? "SET" : "MISSING"}`,
    );
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Log an alert attempt to the signup_alert_log table.
 */
async function logAlertAttempt(
  emailHash: string,
  status: "success" | "failed" | "skipped",
): Promise<void> {
  try {
    const admin = getAdminClient();
    const { error } = await admin.from("signup_alert_log").insert({
      email_hash: emailHash,
      status,
    });
    if (error) {
      console.error(
        `[signup-alert] [${new Date().toISOString()}] DB insert error:`,
        error.message,
      );
    } else {
      console.log(
        `[signup-alert] [${new Date().toISOString()}] Logged to DB: status=${status}, hash=${emailHash.substring(0, 12)}...`,
      );
    }
  } catch (err) {
    // Don't let logging failure affect the main flow
    console.error(
      `[signup-alert] [${new Date().toISOString()}] Failed to log to DB:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Check if an email is already registered and verified in Supabase Auth.
 */
async function isEmailVerified(email: string): Promise<boolean> {
  const { supabaseUrl, supabaseServiceRoleKey } = getEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error(`[signup-alert] [${new Date().toISOString()}] Missing Supabase credentials`);
    return false;
  }

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      console.error(
        `[signup-alert] [${new Date().toISOString()}] Supabase admin listUsers error:`,
        error.message,
      );
      return false;
    }

    const users = data?.users || [];
    const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      return false;
    }

    return !!user.email_confirmed_at;
  } catch (err) {
    console.error(`[signup-alert] [${new Date().toISOString()}] Error checking email:`, err);
    return false;
  }
}

/**
 * Send a security alert email to a verified user who attempted to re-register.
 */
async function sendAlertEmail(email: string): Promise<boolean> {
  const { resendApiKey } = getEnv();
  if (!resendApiKey) {
    console.error(`[signup-alert] [${new Date().toISOString()}] Missing Resend API key`);
    return false;
  }

  const resend = new Resend(resendApiKey);
  const loginUrl = `${APP_SCHEME}://?screen=login`;

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
      background: #FEF3C7;
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
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }
    .cta-button {
      display: block;
      width: 100%;
      max-width: 280px;
      margin: 24px auto 0;
      padding: 14px 24px;
      background: #3AAFA9;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
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
        <span style="font-size: 32px;">&#9888;&#65039;</span>
      </div>
    </div>
    
    <h1>Sign up attempt for your existing account</h1>
    
    <p>Hello,</p>
    <p>We received a new sign up attempt with this email address, but you already have an active account in the app.</p>
    
    <p><strong>If this was you</strong> — Sign in through the login screen. Forgot your password? Tap "Forgot password".</p>
    
    <p><strong>If this was not you</strong> — You can ignore this email. No action was taken on your account.</p>
    
    <hr class="divider">
    
    <a href="${loginUrl}" class="cta-button">Sign in to account</a>
    
    <div class="footer">
      <p>This message was sent automatically from Catering Manager Pro</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: email.trim(),
      subject: `Registration attempt for your existing account [${Date.now().toString(36)}]`,
      headers: {
        "X-Entity-Ref-ID": `signup-alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      html: htmlContent,
    });

    if (result.error) {
      console.error(
        `[signup-alert] [${new Date().toISOString()}] Resend error:`,
        result.error,
      );
      return false;
    }

    console.log(
      `[signup-alert] [${new Date().toISOString()}] Alert email sent, resend_id: ${result.data?.id}`,
    );
    return true;
  } catch (err) {
    console.error(`[signup-alert] [${new Date().toISOString()}] Error sending email:`, err);
    return false;
  }
}

/**
 * Main handler: Check if email is verified and send alert if so.
 * Logs every attempt to console and DB (with hashed email).
 * NEVER returns any information about email existence to the caller.
 */
export async function handleSignupAlert(email: string): Promise<void> {
  const emailHash = hashEmail(email);
  const ts = new Date().toISOString();

  console.log(
    `[signup-alert] [${ts}] Alert check requested | email_hash: ${emailHash.substring(0, 12)}...`,
  );

  try {
    const verified = await isEmailVerified(email);

    if (verified) {
      console.log(
        `[signup-alert] [${ts}] Email is verified, sending alert | email_hash: ${emailHash.substring(0, 12)}...`,
      );
      const sent = await sendAlertEmail(email);
      const status = sent ? "success" : "failed";
      console.log(
        `[signup-alert] [${ts}] Alert result: ${status} | email_hash: ${emailHash.substring(0, 12)}...`,
      );
      await logAlertAttempt(emailHash, status);
    } else {
      console.log(
        `[signup-alert] [${ts}] Email not verified or not found, skipping | email_hash: ${emailHash.substring(0, 12)}...`,
      );
      await logAlertAttempt(emailHash, "skipped");
    }
  } catch (err) {
    console.error(`[signup-alert] [${ts}] Unhandled error:`, err);
    await logAlertAttempt(emailHash, "failed");
  }
}
