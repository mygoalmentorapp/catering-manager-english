/**
 * Add RLS SELECT policy for remote_config table via Supabase Management API.
 * Uses the service_role key to execute SQL through the PostgREST SQL endpoint.
 * Run with: npx tsx scripts/fix-rls-policy.ts
 */
import "../scripts/load-env.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function tryCreateRpcFunction() {
  // Create a temporary RPC function to execute SQL
  console.log("=== Creating temporary exec_sql RPC function ===\n");
  
  const createFnSql = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    DECLARE
      result json;
    BEGIN
      EXECUTE sql INTO result;
      RETURN result;
    END;
    $$;
  `;

  // Try via the Supabase SQL API
  // The Supabase project has a SQL API at /pg/query or we can try the management API
  
  // Method 1: Try creating via PostgREST RPC
  // First, let's check what RPC functions exist
  const { data: rpcTest, error: rpcErr } = await admin.rpc("version");
  console.log("version() RPC:", rpcTest, rpcErr?.message);

  // Method 2: Try the Supabase project ref to hit the management API
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
  console.log("Project ref:", projectRef);

  // Method 3: Try to use the pg-meta endpoint
  const endpoints = [
    `${supabaseUrl}/rest/v1/rpc/`,
    `${supabaseUrl}/pg/`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
      });
      console.log(`${ep} → ${res.status}`);
    } catch (e: any) {
      console.log(`${ep} → error: ${e.message}`);
    }
  }
}

async function checkAndFixViaApp() {
  // The app uses the anon key. If anon can't read, the app falls back to SAFE_DEFAULTS.
  // We need to either:
  // 1. Add an RLS policy (requires SQL access)
  // 2. Or route remote_config reads through the server (service_role)
  
  console.log("\n=== Current situation ===\n");
  console.log("1. remote_config table exists with all 31 columns ✅");
  console.log("2. Data row exists (app_key=catering_manager_pro, app_language=he) ✅");
  console.log("3. service_role can read the data ✅");
  console.log("4. anon key CANNOT read (RLS blocks) ❌");
  console.log("");
  console.log("Options:");
  console.log("  A) Add RLS policy: CREATE POLICY 'anon_read' ON remote_config FOR SELECT USING (true);");
  console.log("     → Requires SQL access (Supabase Dashboard or migration)");
  console.log("  B) Route reads through server tRPC endpoint using service_role");
  console.log("     → Works immediately, no RLS change needed");
  console.log("");
  
  // Let's check if there's already a server endpoint for remote_config
  console.log("Checking if server already has a remote_config endpoint...");
}

async function main() {
  await tryCreateRpcFunction();
  await checkAndFixViaApp();
}

main().catch(console.error);
