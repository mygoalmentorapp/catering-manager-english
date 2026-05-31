/**
 * Seed remote_config row using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 * Run with: npx tsx scripts/seed-remote-config-admin.ts
 */
import "../scripts/load-env.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Decode key to verify it's service_role
try {
  const payload = JSON.parse(Buffer.from(serviceRoleKey.split(".")[1], "base64").toString());
  console.log("Key role:", payload.role);
  if (payload.role !== "service_role") {
    console.warn("WARNING: Key is not service_role, insert may fail due to RLS");
  }
} catch {
  console.log("Could not decode key payload");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Step 1: Check existing rows
  console.log("\n=== Check existing rows ===\n");
  const { data: existing, error: existErr } = await admin
    .from("remote_config")
    .select("app_key, app_language, maintenance_enabled, global_message_enabled, session_timeout_minutes");

  if (existErr) {
    console.error("Read error:", existErr.message);
  } else {
    console.log(`Found ${existing?.length ?? 0} rows`);
    if (existing && existing.length > 0) {
      for (const row of existing) {
        console.log(`  Row: app_key=${row.app_key}, app_language=${row.app_language}, maintenance=${row.maintenance_enabled}, global_msg=${row.global_message_enabled}, session_timeout=${row.session_timeout_minutes}`);
      }
      console.log("\nRow already exists. Skipping insert.");
      return;
    }
  }

  // Step 2: Insert
  console.log("\n=== Inserting remote_config row ===\n");
  
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

  const { data: inserted, error: insertErr } = await admin
    .from("remote_config")
    .insert(rowData)
    .select();

  if (insertErr) {
    console.error("Insert error:", insertErr.message, insertErr.code, insertErr.details);
    process.exit(1);
  }

  console.log("✅ Row inserted successfully!");
  console.log("Data:", JSON.stringify(inserted![0], null, 2));

  // Step 3: Verify read-back with anon key
  console.log("\n=== Verify with anon key (app perspective) ===\n");
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Y3VrZHhrYnJlemhnb3R3c3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDE5MTAsImV4cCI6MjA5MjQ3NzkxMH0.lbqM61U0qUrHLzy4x5UerX31d17tHJLHK9BCtABa_M8";
  const anonClient = createClient(supabaseUrl, anonKey);
  
  const { data: anonData, error: anonErr } = await anonClient
    .from("remote_config")
    .select("*")
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "he")
    .single();

  if (anonErr) {
    console.error("Anon read error:", anonErr.message);
  } else {
    console.log("✅ Anon read successful! App can read remote_config.");
    console.log("Key fields:");
    console.log(`  maintenance_enabled: ${anonData.maintenance_enabled}`);
    console.log(`  maintenance_title: ${anonData.maintenance_title}`);
    console.log(`  global_message_enabled: ${anonData.global_message_enabled}`);
    console.log(`  global_message_title: ${anonData.global_message_title}`);
    console.log(`  session_timeout_minutes: ${anonData.session_timeout_minutes}`);
  }
}

main().catch(console.error);
