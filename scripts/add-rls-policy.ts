/**
 * Add RLS SELECT policy for remote_config via Supabase Management API.
 * Run with: npx tsx scripts/add-rls-policy.ts
 */
import "../scripts/load-env.js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Extract project ref from URL
const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

async function main() {
  console.log("Project ref:", projectRef);
  console.log("Supabase URL:", supabaseUrl);
  
  // Try the Supabase Management API SQL endpoint
  // https://supabase.com/docs/reference/management-api/execute-sql
  const managementApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  // The Management API requires a personal access token, not the service_role key
  // Let's try with the service_role key anyway
  
  const sqlQueries = [
    // Check current policies
    "SELECT policyname, cmd, permissive, roles, qual FROM pg_policies WHERE tablename = 'remote_config'",
    // Check if RLS is enabled
    "SELECT relrowsecurity FROM pg_class WHERE relname = 'remote_config'",
  ];

  // Method: Use PostgREST's built-in SQL execution via the /rest/v1/ endpoint
  // Actually, PostgREST doesn't support raw SQL. We need another approach.
  
  // Method: Create a temporary function via PostgREST
  // PostgREST can call functions. Let's create one that adds the policy.
  
  // Actually, the simplest approach: use the Supabase CLI or Dashboard.
  // But we can try the pg-graphql or pg-meta endpoints.
  
  // Try the internal pg-meta endpoint
  const pgMetaEndpoints = [
    `${supabaseUrl}/pg/query`,
    `${supabaseUrl}/pg-meta/default/query`,
  ];
  
  for (const endpoint of pgMetaEndpoints) {
    console.log(`\nTrying ${endpoint}...`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          query: "SELECT 1 as test",
        }),
      });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Result:", JSON.stringify(data));
      } else {
        console.log("Error:", await res.text());
      }
    } catch (e: any) {
      console.log("Fetch error:", e.message);
    }
  }

  // Try creating a function via the PostgREST schema cache reload
  // This won't work either. Let's try a different approach.
  
  // The real solution: use the Supabase client to call a pre-existing function
  // or create one. Let's check if there's a way to execute SQL.
  
  console.log("\n=== Trying to create helper function via fetch to PostgREST ===\n");
  
  // PostgREST doesn't support DDL. We need the pg-meta service.
  // The pg-meta service runs on port 8080 internally in Supabase.
  // It's accessible via the Supabase Management API.
  
  // Let's try the Supabase Management API with the service_role key as auth
  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  console.log(`Trying Management API: ${mgmtUrl}`);
  
  try {
    const res = await fetch(mgmtUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        query: "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'remote_config'",
      }),
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log("Response:", text.substring(0, 500));
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}

main().catch(console.error);
