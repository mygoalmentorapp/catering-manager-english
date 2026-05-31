/**
 * Insert English remote_config row with explicit id=2.
 * The id column defaults to 1 (no sequence), so we must specify id=2 explicitly.
 * Run with: npx tsx scripts/insert-english-row-v2.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // First check what IDs exist
  const { data: existing } = await supabase
    .from("remote_config")
    .select("id, app_key, app_language");

  console.log("Existing rows:", existing);

  // Find the next available id
  const maxId = existing?.reduce((max, row) => Math.max(max, row.id), 0) ?? 0;
  const newId = maxId + 1;
  console.log(`Next id: ${newId}`);

  // Check if English row already exists
  const englishExists = existing?.some(r => r.app_language === "en");
  if (englishExists) {
    console.log("English row already exists. Done.");
    return;
  }

  const { data, error } = await supabase.from("remote_config").insert({
    id: newId,
    app_key: "catering_manager_pro",
    app_language: "en",
    schema_version: 1,
    paywall_enabled: false,
    revenuecat_enabled: false,
    remote_campaigns_enabled: true,
    feedback_popup_enabled: true,
    global_message_enabled: false,
    external_urls_enabled: false,
    cache_ttl_minutes: 30,
    session_timeout_minutes: 30,
    force_update_enabled: false,
    minimum_supported_version_code: 1,
    latest_version_code: 1,
    force_update_title: "A required update is available",
    force_update_message: "To continue using the app, please update it from Google Play.",
    force_update_button_text: "Update now",
    google_play_url: "",
    maintenance_enabled: false,
    maintenance_title: "Maintenance in progress",
    maintenance_message: "We are making improvements. Please try again shortly.",
    maintenance_action_text: "Try again",
    global_message_title: null,
    global_message_text: null,
    global_message_type: "info",
    global_message_action: null,
    global_message_action_text: null,
    global_message_dismissible: true,
  }).select();

  if (error) {
    console.error("INSERT error:", error.message, error.details, error.hint);
    process.exit(1);
  }

  console.log("English row inserted successfully:", data?.[0]?.id);

  // Verify both rows
  const { data: allRows } = await supabase
    .from("remote_config")
    .select("id, app_key, app_language, force_update_title, maintenance_title")
    .eq("app_key", "catering_manager_pro");

  console.log("\nAll rows:");
  allRows?.forEach((row) => {
    console.log(`  [${row.app_language}] id=${row.id} force_update_title="${row.force_update_title}" maintenance_title="${row.maintenance_title}"`);
  });
}

main().catch(console.error);
