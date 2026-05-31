import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const REQUIRED_FIELDS = [
  "campaign_key", "name", "type", "app_key", "app_language",
  "is_enabled", "is_archived", "priority",
  "title", "subtitle", "message", "icon", "image_url",
  "primary_button_text", "primary_button_action", "primary_button_payload",
  "secondary_button_text", "secondary_button_action", "secondary_button_payload",
  "dismissible",
  "trigger_event", "target_audience", "platform",
  "start_at", "end_at", "rollout_percentage",
  "cooldown_days_after_view", "cooldown_days_after_dismiss",
  "max_impressions_per_user", "max_impressions_per_session",
  "max_impressions_per_day", "max_clicks_per_user",
  "min_days_since_signup", "min_days_since_first_open",
  "min_sessions", "min_products_created", "min_orders_created",
  "min_shopping_lists_created", "min_completed_orders",
  "days_since_last_active",
  "show_only_if_not_premium", "show_only_if_premium",
  "show_only_if_feedback_not_submitted", "show_only_if_onboarding_not_completed",
  "requires_internet", "do_not_show_during_critical_flow",
  "min_app_version", "max_app_version",
];

async function main() {
  // Get a row to check columns
  const { data: row, error: err } = await supabase
    .from("remote_campaigns")
    .select("*")
    .limit(1);
  
  if (err) {
    console.error("Error querying remote_campaigns:", err.message);
    process.exit(1);
  }
  
  if (row && row.length > 0) {
    const actualColumns = Object.keys(row[0]);
    console.log(`Actual columns in remote_campaigns: ${actualColumns.length}`);
    
    const missing = REQUIRED_FIELDS.filter(f => !actualColumns.includes(f));
    const found = REQUIRED_FIELDS.filter(f => actualColumns.includes(f));
    
    console.log(`Required fields found: ${found.length}/${REQUIRED_FIELDS.length}`);
    
    if (missing.length > 0) {
      console.log(`\n❌ MISSING FIELDS: ${missing.join(", ")}`);
      process.exit(1);
    } else {
      console.log("\n✅ All 47 required fields exist in remote_campaigns!");
    }
  } else {
    // Table has data (we know from earlier query), try select with specific columns
    console.log("Checking fields individually...");
    const missing = [];
    for (const field of REQUIRED_FIELDS) {
      const { error: fieldErr } = await supabase
        .from("remote_campaigns")
        .select(field)
        .limit(0);
      if (fieldErr) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      console.log(`\n❌ MISSING FIELDS: ${missing.join(", ")}`);
      process.exit(1);
    } else {
      console.log(`\n✅ All ${REQUIRED_FIELDS.length} required fields verified!`);
    }
  }
}

main().catch(console.error);
