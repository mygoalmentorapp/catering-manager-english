/**
 * Seed remote_config row for app_key=catering_manager_pro, app_language=he.
 * First checks all available columns, then inserts with proper defaults.
 * Run with: npx tsx scripts/seed-remote-config.ts
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
  // Step 1: Check all columns by selecting from the table definition
  console.log("=== Step 1: Discover all columns ===\n");
  
  // We'll try to select all columns and see what comes back
  // First let's check if there's already a row for our app
  const { data: existing, error: existErr } = await supabase
    .from("remote_config")
    .select("*")
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "he");

  if (existErr) {
    console.error("Error checking existing row:", existErr.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log("Row already exists! Columns and values:");
    const row = existing[0];
    for (const [k, v] of Object.entries(row)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
    process.exit(0);
  }

  console.log("No existing row found. Creating one...\n");

  // Step 2: Insert the row with all the fields we know about
  const rowData = {
    app_key: "catering_manager_pro",
    app_language: "he",
    schema_version: 1,
    // Feature flags
    paywall_enabled: false,
    revenuecat_enabled: false,
    remote_campaigns_enabled: true,
    feedback_popup_enabled: true,
    global_message_enabled: false,
    external_urls_enabled: true,
    // Cache TTL
    cache_ttl_minutes: 30,
    // Force Update
    force_update_enabled: false,
    minimum_supported_version_code: 0,
    latest_version_code: 0,
    force_update_title: "עדכון נדרש",
    force_update_message: "גרסה חדשה זמינה. יש לעדכן כדי להמשיך להשתמש באפליקציה.",
    force_update_button_text: "עדכן עכשיו",
    google_play_url: "",
    // Maintenance Mode
    maintenance_enabled: false,
    maintenance_title: "תחזוקה מתוכננת",
    maintenance_message: "האפליקציה בתחזוקה. נחזור בקרוב.",
    maintenance_action_text: "נסה שוב",
    // Global Message
    global_message_title: "",
    global_message_text: "",
    global_message_type: "info",
    global_message_action: "",
    global_message_action_text: "",
    global_message_dismissible: true,
    // Session timeout
    session_timeout_minutes: 30,
  };

  console.log("Inserting row with data:", JSON.stringify(rowData, null, 2));

  const { data: inserted, error: insertErr } = await supabase
    .from("remote_config")
    .insert(rowData)
    .select();

  if (insertErr) {
    console.error("\nInsert error:", insertErr.message, insertErr.code, insertErr.details);
    
    // If some columns don't exist, try with fewer columns
    if (insertErr.message.includes("column")) {
      console.log("\nSome columns may not exist. Trying minimal insert...");
      const minimalData: Record<string, any> = {
        app_key: "catering_manager_pro",
        app_language: "he",
        schema_version: 1,
      };
      
      // Try adding columns one by one
      const optionalCols = Object.entries(rowData).filter(([k]) => !["app_key", "app_language", "schema_version"].includes(k));
      
      for (const [key, value] of optionalCols) {
        const testData = { ...minimalData, [key]: value };
        const { error: testErr } = await supabase
          .from("remote_config")
          .insert(testData)
          .select();
        
        if (!testErr) {
          // Delete the test row
          await supabase.from("remote_config").delete().eq("app_key", "catering_manager_pro");
          minimalData[key] = value;
          console.log(`  ✅ ${key} — accepted`);
        } else if (testErr.message.includes("column") || testErr.message.includes("does not exist")) {
          console.log(`  ❌ ${key} — column does not exist`);
        } else {
          // Some other error, column probably exists
          minimalData[key] = value;
          console.log(`  ⚠️ ${key} — other error: ${testErr.message}`);
        }
      }
      
      // Final insert with all valid columns
      console.log("\nFinal insert with valid columns...");
      const { data: finalData, error: finalErr } = await supabase
        .from("remote_config")
        .insert(minimalData)
        .select();
      
      if (finalErr) {
        console.error("Final insert failed:", finalErr.message);
      } else {
        console.log("\n✅ Row created successfully!");
        console.log("Columns:", Object.keys(finalData![0]).join(", "));
      }
    }
    
    process.exit(1);
  }

  console.log("\n✅ Row created successfully!");
  console.log("Inserted row:", JSON.stringify(inserted![0], null, 2));
  
  // Step 3: Verify by reading it back
  console.log("\n=== Step 3: Verify read-back ===\n");
  const { data: verify, error: verifyErr } = await supabase
    .from("remote_config")
    .select("*")
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "he")
    .single();

  if (verifyErr) {
    console.error("Verify error:", verifyErr.message);
  } else {
    console.log("✅ Read-back successful. All columns:");
    for (const [k, v] of Object.entries(verify!)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }
}

main().catch(console.error);
