/**
 * Check remote_config table columns via RPC and data in Supabase.
 * Run with: npx tsx scripts/check-remote-config-columns.ts
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

const REQUIRED_NEW_COLUMNS = [
  "maintenance_enabled",
  "maintenance_title",
  "maintenance_message",
  "maintenance_action_text",
  "global_message_title",
  "global_message_text",
  "global_message_type",
  "global_message_action",
  "global_message_action_text",
  "global_message_dismissible",
  "session_timeout_minutes",
];

async function main() {
  console.log("=== Step 1: Check remote_config rows (no filter) ===\n");

  // Try fetching without any filter to see what's there
  const { data: allRows, error: allError } = await supabase
    .from("remote_config")
    .select("*");

  if (allError) {
    console.error("Error fetching remote_config:", allError.message, allError.code, allError.details);
  } else {
    console.log(`Found ${allRows?.length ?? 0} row(s) total.`);
    if (allRows && allRows.length > 0) {
      for (const row of allRows) {
        console.log(`\nRow: app_key=${row.app_key}, app_language=${row.app_language}`);
        const cols = Object.keys(row);
        console.log(`Columns (${cols.length}): ${cols.join(", ")}`);
        
        // Check required new columns
        console.log("\nNew columns check:");
        for (const col of REQUIRED_NEW_COLUMNS) {
          if (col in row) {
            console.log(`  ✅ ${col} = ${JSON.stringify(row[col])}`);
          } else {
            console.log(`  ❌ ${col} — MISSING`);
          }
        }
      }
    }
  }

  console.log("\n=== Step 2: Check app_config table ===\n");
  const { data: appConfigData, error: appConfigError } = await supabase
    .from("app_config")
    .select("*");

  if (appConfigError) {
    console.log("app_config error:", appConfigError.message, appConfigError.code);
  } else {
    console.log(`Found ${appConfigData?.length ?? 0} row(s) in app_config.`);
    if (appConfigData && appConfigData.length > 0) {
      for (const row of appConfigData) {
        console.log("Columns:", Object.keys(row).join(", "));
        console.log("Data:", JSON.stringify(row, null, 2));
      }
    }
  }

  console.log("\n=== Step 3: Try inserting test row to check columns exist ===\n");
  
  // Try to select specific columns to see which ones exist
  const testCols = [
    "id", "app_key", "app_language", "schema_version",
    ...REQUIRED_NEW_COLUMNS,
  ];
  
  for (const col of REQUIRED_NEW_COLUMNS) {
    const { error: colError } = await supabase
      .from("remote_config")
      .select(col)
      .limit(0);
    
    if (colError) {
      console.log(`  ❌ Column "${col}" — does NOT exist (${colError.message})`);
    } else {
      console.log(`  ✅ Column "${col}" — exists`);
    }
  }
}

main().catch(console.error);
