/**
 * Seed remote_config row using Supabase service_role key (bypasses RLS).
 * The anon key can read but not insert. We need the service_role key from env.
 * Run with: npx tsx scripts/seed-via-supabase.ts
 */
import "../scripts/load-env.js";
import { createClient } from "@supabase/supabase-js";

// Use the env vars which should have the service_role key
const supabaseUrl = process.env.SUPABASE_URL || "https://szcukdxkbrezhgotwsqd.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "";

console.log("SUPABASE_URL:", supabaseUrl);
console.log("SUPABASE_KEY type:", supabaseKey ? `${supabaseKey.substring(0, 30)}...` : "MISSING");

// Check if this is a service_role key (contains "service_role" in the JWT payload)
try {
  const payload = JSON.parse(Buffer.from(supabaseKey.split(".")[1], "base64").toString());
  console.log("Key role:", payload.role);
} catch {
  console.log("Could not decode key payload");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Step 1: Check existing rows
  console.log("\n=== Step 1: Check existing rows ===\n");
  const { data: existing, error: existErr } = await supabase
    .from("remote_config")
    .select("*");

  if (existErr) {
    console.error("Read error:", existErr.message);
  } else {
    console.log(`Found ${existing?.length ?? 0} rows`);
    if (existing && existing.length > 0) {
      for (const row of existing) {
        console.log(`  Row: app_key=${row.app_key}, app_language=${row.app_language}`);
      }
    }
  }

  // Step 2: Try to insert
  console.log("\n=== Step 2: Insert row ===\n");
  
  const rowData = {
    app_key: "catering_manager_pro",
    app_language: "he",
    schema_version: 1,
    paywall_enabled: false,
    revenuecat_enabled: false,
    remote_campaigns_enabled: true,
    feedback_popup_enabled: true,
    global_message_enabled: false,
    external_urls_enabled: true,
    cache_ttl_minutes: 30,
    force_update_enabled: false,
    minimum_supported_version_code: 0,
    latest_version_code: 0,
    force_update_title: "עדכון נדרש",
    force_update_message: "גרסה חדשה זמינה. יש לעדכן כדי להמשיך להשתמש באפליקציה.",
    force_update_button_text: "עדכן עכשיו",
    google_play_url: "",
    maintenance_enabled: false,
    maintenance_title: "תחזוקה מתוכננת",
    maintenance_message: "האפליקציה בתחזוקה. נחזור בקרוב.",
    maintenance_action_text: "נסה שוב",
    global_message_title: "",
    global_message_text: "",
    global_message_type: "info",
    global_message_action: "",
    global_message_action_text: "",
    global_message_dismissible: true,
    session_timeout_minutes: 30,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("remote_config")
    .insert(rowData)
    .select();

  if (insertErr) {
    console.error("Insert error:", insertErr.message, insertErr.code);
    console.log("\nThe SUPABASE_KEY env var appears to be an anon key (read-only).");
    console.log("To insert, we need the service_role key or an RLS policy that allows insert.");
  } else {
    console.log("✅ Row inserted successfully!");
    console.log("Data:", JSON.stringify(inserted, null, 2));
  }
}

main().catch(console.error);
