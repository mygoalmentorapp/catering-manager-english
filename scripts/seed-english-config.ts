/**
 * Seed English remote_config row in Supabase.
 *
 * Creates a remote_config row for app_key="catering_manager_pro", app_language="en"
 * with English user-facing texts. Technical settings are copied from the Hebrew row.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedEnglishConfig() {
  console.log("Checking if English config row already exists...");

  // Check if row already exists
  const { data: existing } = await admin
    .from("remote_config")
    .select("id")
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "en")
    .single();

  if (existing) {
    console.log("✅ English config row already exists (id:", existing.id, "). Updating texts...");

    // Update with English texts
    const { error } = await admin
      .from("remote_config")
      .update({
        // Technical settings (same as Hebrew)
        schema_version: 1,
        paywall_enabled: false,
        revenuecat_enabled: false,
        remote_campaigns_enabled: true,
        feedback_popup_enabled: true,
        global_message_enabled: false,
        external_urls_enabled: false,
        cache_ttl_minutes: 30,
        session_timeout_minutes: 30,

        // Force update — English texts
        force_update_enabled: false,
        minimum_supported_version_code: 1,
        latest_version_code: 1,
        force_update_title: "A required update is available",
        force_update_message: "To continue using the app, please update it from Google Play.",
        force_update_button_text: "Update now",
        google_play_url: "",

        // Maintenance — English texts
        maintenance_enabled: false,
        maintenance_title: "Maintenance in progress",
        maintenance_message: "We are making improvements. Please try again shortly.",
        maintenance_action_text: "Try again",

        // Global message — disabled, English texts ready
        global_message_title: "",
        global_message_text: "",
        global_message_type: "info",
        global_message_action: "",
        global_message_action_text: "",
        global_message_dismissible: true,
      })
      .eq("app_key", "catering_manager_pro")
      .eq("app_language", "en");

    if (error) {
      console.error("❌ Failed to update:", error.message);
      process.exit(1);
    }
    console.log("✅ English config row updated with English texts.");
    return;
  }

  console.log("Creating new English config row...");

  const { error } = await admin.from("remote_config").insert({
    app_key: "catering_manager_pro",
    app_language: "en",

    // Technical settings (same as Hebrew)
    schema_version: 1,
    paywall_enabled: false,
    revenuecat_enabled: false,
    remote_campaigns_enabled: true,
    feedback_popup_enabled: true,
    global_message_enabled: false,
    external_urls_enabled: false,
    cache_ttl_minutes: 30,
    session_timeout_minutes: 30,

    // Force update — English texts
    force_update_enabled: false,
    minimum_supported_version_code: 1,
    latest_version_code: 1,
    force_update_title: "A required update is available",
    force_update_message: "To continue using the app, please update it from Google Play.",
    force_update_button_text: "Update now",
    google_play_url: "",

    // Maintenance — English texts
    maintenance_enabled: false,
    maintenance_title: "Maintenance in progress",
    maintenance_message: "We are making improvements. Please try again shortly.",
    maintenance_action_text: "Try again",

    // Global message — disabled, English texts ready
    global_message_title: "",
    global_message_text: "",
    global_message_type: "info",
    global_message_action: "",
    global_message_action_text: "",
    global_message_dismissible: true,
  });

  if (error) {
    console.error("❌ Failed to insert:", error.message);
    process.exit(1);
  }

  console.log("✅ English config row created successfully.");
}

seedEnglishConfig().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
