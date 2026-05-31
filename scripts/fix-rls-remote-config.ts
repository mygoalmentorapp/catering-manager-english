/**
 * Check and fix RLS policies on remote_config table.
 * The anon key should be able to READ remote_config (it's public config data).
 * Run with: npx tsx scripts/fix-rls-remote-config.ts
 */
import "../scripts/load-env.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Y3VrZHhrYnJlemhnb3R3c3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDE5MTAsImV4cCI6MjA5MjQ3NzkxMH0.lbqM61U0qUrHLzy4x5UerX31d17tHJLHK9BCtABa_M8";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Step 1: Check current RLS status
  console.log("=== Step 1: Check RLS status ===\n");
  
  const { data: rlsData, error: rlsErr } = await admin.rpc("exec_sql", {
    sql: `SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'remote_config';`
  });
  
  if (rlsErr) {
    console.log("RPC exec_sql not available:", rlsErr.message);
    console.log("Trying direct REST approach...");
  } else {
    console.log("RLS status:", JSON.stringify(rlsData));
  }

  // Step 2: Check with anon key
  console.log("\n=== Step 2: Test anon read ===\n");
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: anonData, error: anonErr } = await anonClient
    .from("remote_config")
    .select("app_key, maintenance_enabled, session_timeout_minutes")
    .eq("app_key", "catering_manager_pro");

  if (anonErr) {
    console.log("Anon read error:", anonErr.message, anonErr.code);
  } else {
    console.log(`Anon read: ${anonData?.length ?? 0} rows`);
    if (anonData && anonData.length > 0) {
      console.log("✅ Anon CAN read remote_config!");
      console.log("Data:", JSON.stringify(anonData[0]));
    } else {
      console.log("❌ Anon returns 0 rows — RLS is blocking reads.");
    }
  }

  // Step 3: Try to add RLS policy via Supabase Management API
  console.log("\n=== Step 3: Fix RLS via SQL ===\n");
  
  // Use the Supabase REST API to run SQL
  const sqlStatements = [
    // First check if RLS is enabled
    `SELECT relrowsecurity FROM pg_class WHERE relname = 'remote_config'`,
  ];

  for (const sql of sqlStatements) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql }),
    });
    
    if (res.ok) {
      const result = await res.json();
      console.log(`SQL result:`, JSON.stringify(result));
    } else {
      const errText = await res.text();
      console.log(`SQL error (${res.status}):`, errText);
    }
  }

  // Step 4: Try using the Supabase SQL endpoint directly
  console.log("\n=== Step 4: Try pg_meta SQL endpoint ===\n");
  
  const pgMetaRes = await fetch(`${supabaseUrl}/pg/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      query: "SELECT schemaname, tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE tablename = 'remote_config'",
    }),
  });

  if (pgMetaRes.ok) {
    const result = await pgMetaRes.json();
    console.log("Policies:", JSON.stringify(result, null, 2));
  } else {
    console.log(`pg_meta error (${pgMetaRes.status}):`, await pgMetaRes.text());
  }

  // Step 5: Check the full row with service_role to confirm data is there
  console.log("\n=== Step 5: Full row via service_role ===\n");
  const { data: fullRow, error: fullErr } = await admin
    .from("remote_config")
    .select("*")
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "he")
    .single();

  if (fullErr) {
    console.error("Full row error:", fullErr.message);
  } else {
    console.log("Full row keys:", Object.keys(fullRow!).join(", "));
    console.log("maintenance_enabled:", fullRow!.maintenance_enabled);
    console.log("maintenance_title:", fullRow!.maintenance_title);
    console.log("maintenance_message:", fullRow!.maintenance_message);
    console.log("maintenance_action_text:", fullRow!.maintenance_action_text);
    console.log("global_message_enabled:", fullRow!.global_message_enabled);
    console.log("global_message_title:", fullRow!.global_message_title);
    console.log("global_message_text:", fullRow!.global_message_text);
    console.log("global_message_type:", fullRow!.global_message_type);
    console.log("global_message_dismissible:", fullRow!.global_message_dismissible);
    console.log("session_timeout_minutes:", fullRow!.session_timeout_minutes);
  }
}

main().catch(console.error);
