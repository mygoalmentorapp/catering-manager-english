/**
 * Check remote_config columns and seed initial row.
 * Run with: npx tsx scripts/check-and-seed.ts
 */
import "../scripts/load-env.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Step 1: Check what columns exist by selecting with specific column names
  console.log("=== Checking columns via select ===\n");
  
  const allCols = [
    "id", "app_key", "app_language", "schema_version",
    "paywall_enabled", "revenuecat_enabled", "remote_campaigns_enabled",
    "feedback_popup_enabled", "global_message_enabled", "external_urls_enabled",
    "cache_ttl_minutes",
    "force_update_enabled", "minimum_supported_version_code", "latest_version_code",
    "force_update_title", "force_update_message", "force_update_button_text", "google_play_url",
    "maintenance_enabled", "maintenance_title", "maintenance_message", "maintenance_action_text",
    "global_message_title", "global_message_text", "global_message_type",
    "global_message_action", "global_message_action_text", "global_message_dismissible",
    "session_timeout_minutes",
    "created_at", "updated_at",
  ];

  const existingCols: string[] = [];
  const missingCols: string[] = [];

  for (const col of allCols) {
    const { error } = await supabase.from("remote_config").select(col).limit(0);
    if (error) {
      missingCols.push(col);
      console.log(`  ❌ ${col} — ${error.message}`);
    } else {
      existingCols.push(col);
      console.log(`  ✅ ${col}`);
    }
  }

  console.log(`\nExisting: ${existingCols.length}, Missing: ${missingCols.length}`);
  if (missingCols.length > 0) {
    console.log("Missing columns:", missingCols.join(", "));
  }

  // Step 2: Check RLS policies - try to read
  console.log("\n=== Checking RLS (read) ===\n");
  const { data: readData, error: readErr } = await supabase
    .from("remote_config")
    .select("*");
  
  if (readErr) {
    console.log("Read error:", readErr.message, readErr.code);
  } else {
    console.log(`Read OK: ${readData?.length ?? 0} rows`);
  }

  // Step 3: Check RLS policies - try to insert
  console.log("\n=== Checking RLS (insert) ===\n");
  
  // Build insert data with only existing columns
  const insertData: Record<string, any> = {};
  const colDefaults: Record<string, any> = {
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

  for (const col of existingCols) {
    if (col in colDefaults) {
      insertData[col] = colDefaults[col];
    }
  }

  console.log("Insert data keys:", Object.keys(insertData).join(", "));
  
  const { data: insertResult, error: insertErr } = await supabase
    .from("remote_config")
    .insert(insertData)
    .select();

  if (insertErr) {
    console.log("Insert error:", insertErr.message, insertErr.code);
    console.log("This is likely an RLS issue. The row needs to be inserted via service_role or SQL.");
  } else {
    console.log("✅ Insert successful!");
    console.log("Inserted:", JSON.stringify(insertResult, null, 2));
  }
}

main().catch(console.error);
