import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function diagnose() {
  console.log("=== STEP 1: Check env vars ===");
  console.log("SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
  console.log("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "SET (length: " + SUPABASE_SERVICE_ROLE_KEY.length + ")" : "MISSING");
  console.log("RESEND_API_KEY:", RESEND_API_KEY ? "SET (starts with: " + RESEND_API_KEY.substring(0, 6) + ")" : "MISSING");

  console.log("\n=== STEP 2: Check Supabase admin user lookup ===");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.log("ERROR listing users:", error.message);
    return;
  }
  console.log("Total users found:", data.users.length);

  const email = "shamir1234@gmail.com";
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.log("User NOT FOUND:", email);
    return;
  }
  console.log("User found:", user.email);
  console.log("email_confirmed_at:", user.email_confirmed_at);
  console.log("Is verified:", !!user.email_confirmed_at);

  console.log("\n=== STEP 3: Send email via Resend ===");
  const resend = new Resend(RESEND_API_KEY);
  const result = await resend.emails.send({
    from: "Catering Manager <support@cateringmanager.app>",
    to: email,
    subject: "Diagnostic test - " + new Date().toISOString(),
    html: '<div dir="rtl"><h2>בדיקת אבחון</h2><p>אם אתה רואה את המייל הזה, השליחה עובדת.</p></div>',
  });
  console.log("Resend result:", JSON.stringify(result, null, 2));

  if (result.data?.id) {
    console.log("\n=== SUCCESS: Email sent with ID:", result.data.id, "===");
  } else {
    console.log("\n=== FAILED: Email not sent ===");
  }
}

diagnose().catch((e) => console.error("FATAL:", e));
