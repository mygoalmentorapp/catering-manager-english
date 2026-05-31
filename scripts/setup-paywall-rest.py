"""
Phase 3 — Setup Paywall Tables using Supabase REST API.
Uses the Supabase postgrest endpoint with service_role key.
Since we can't run DDL via PostgREST, we'll use the Supabase Management API.
"""

import os
import json
import requests
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://szcukdxkbrezhgotwsqd.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set")
    exit(1)

# Extract project ref from URL
match = re.search(r"https://([^.]+)\.supabase\.co", SUPABASE_URL)
PROJECT_REF = match.group(1) if match else "szcukdxkbrezhgotwsqd"

# Use the Supabase Management API SQL endpoint
# This requires the service_role key as Bearer token
SQL_ENDPOINT = f"https://{PROJECT_REF}.supabase.co/rest/v1/rpc/"

# Alternative: use the pg_net extension or direct SQL via the dashboard API
# Let's try using the supabase-py client which can call rpc functions

# First, let's check if we can create a helper function for DDL
# Actually, the simplest approach is to use the Supabase HTTP API for SQL
# The correct endpoint is: POST /pg/query (requires service_role)

def run_sql(sql: str, label: str) -> bool:
    """Execute SQL via Supabase's internal pg endpoint."""
    # Try the /rest/v1/rpc/exec_sql endpoint (custom function)
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            headers={
                "apikey": SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            },
            json={"sql_text": sql.strip()},
            timeout=15,
        )
        if resp.status_code in (200, 204):
            print(f"  ✓ {label}")
            return True
        elif "does not exist" in resp.text:
            # exec_sql function doesn't exist, need to create it first
            return None  # Signal to try alternative
        elif "already exists" in resp.text or "duplicate" in resp.text.lower():
            print(f"  ✓ {label} (already exists)")
            return True
        else:
            print(f"  ✗ {label}: {resp.status_code} - {resp.text[:150]}")
            return False
    except Exception as e:
        print(f"  ✗ {label}: {e}")
        return False


# First try to create the exec_sql helper function
CREATE_EXEC_SQL = """
CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;
"""

# Try via the Supabase SQL API (used by the dashboard)
# This is available at: POST https://<ref>.supabase.co/pg/query
def run_sql_via_pg(sql: str, label: str) -> bool:
    """Execute SQL via Supabase's pg/query endpoint (same as SQL Editor)."""
    try:
        resp = requests.post(
            f"https://{PROJECT_REF}.supabase.co/pg/query",
            headers={
                "apikey": SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "x-connection-encrypted": "false",
            },
            json={"query": sql.strip()},
            timeout=15,
        )
        if resp.status_code in (200, 204):
            data = resp.json() if resp.text else None
            if data and isinstance(data, list) and len(data) > 0:
                first = data[0]
                if isinstance(first, dict) and first.get("error"):
                    err = first["error"]
                    if "already exists" in str(err) or "duplicate" in str(err).lower():
                        print(f"  ✓ {label} (already exists)")
                        return True
                    print(f"  ✗ {label}: {err}")
                    return False
            print(f"  ✓ {label}")
            return True
        else:
            text = resp.text[:200]
            if "already exists" in text or "duplicate" in text.lower():
                print(f"  ✓ {label} (already exists)")
                return True
            print(f"  ✗ {label}: HTTP {resp.status_code} - {text}")
            return False
    except Exception as e:
        print(f"  ✗ {label}: {e}")
        return False


# ============ SQL Statements ============

STATEMENTS = [
    ("Create exec_sql helper function", CREATE_EXEC_SQL),
    ("Create paywall_placements table", """
CREATE TABLE IF NOT EXISTS paywall_placements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_language TEXT NOT NULL DEFAULT 'he',
  placement_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_key, app_language, placement_key)
);
"""),
    ("Create paywall_rules table", """
CREATE TABLE IF NOT EXISTS paywall_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_language TEXT NOT NULL DEFAULT 'he',
  rule_key TEXT NOT NULL,
  placement_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  required_entitlement_id TEXT NOT NULL DEFAULT 'premium_access',
  offering_id TEXT DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'all',
  rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  max_impressions_per_user INTEGER DEFAULT NULL,
  cooldown_hours INTEGER DEFAULT 24,
  start_at TIMESTAMPTZ DEFAULT NULL,
  end_at TIMESTAMPTZ DEFAULT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_key, app_language, rule_key)
);
"""),
    ("Create premium_feature_gates table", """
CREATE TABLE IF NOT EXISTS premium_feature_gates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_key TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  requires_premium BOOLEAN NOT NULL DEFAULT false,
  required_entitlement_id TEXT NOT NULL DEFAULT 'premium_access',
  paywall_placement_key TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_key, feature_key)
);
"""),
    ("Create user_entitlements_cache table", """
CREATE TABLE IF NOT EXISTS user_entitlements_cache (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revenuecat_customer_id TEXT DEFAULT NULL,
  active_entitlements JSONB NOT NULL DEFAULT '[]'::jsonb,
  subscription_status TEXT NOT NULL DEFAULT 'none',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""),
    ("Add paywall columns to remote_config", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'remote_config' AND column_name = 'default_entitlement_id') THEN
    ALTER TABLE remote_config ADD COLUMN default_entitlement_id TEXT NOT NULL DEFAULT 'premium_access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'remote_config' AND column_name = 'default_offering_id') THEN
    ALTER TABLE remote_config ADD COLUMN default_offering_id TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'remote_config' AND column_name = 'paywall_provider') THEN
    ALTER TABLE remote_config ADD COLUMN paywall_provider TEXT NOT NULL DEFAULT 'revenuecat';
  END IF;
END $$;
"""),
    ("Enable RLS on paywall_placements", "ALTER TABLE paywall_placements ENABLE ROW LEVEL SECURITY;"),
    ("Enable RLS on paywall_rules", "ALTER TABLE paywall_rules ENABLE ROW LEVEL SECURITY;"),
    ("Enable RLS on premium_feature_gates", "ALTER TABLE premium_feature_gates ENABLE ROW LEVEL SECURITY;"),
    ("Enable RLS on user_entitlements_cache", "ALTER TABLE user_entitlements_cache ENABLE ROW LEVEL SECURITY;"),
    ("RLS: authenticated read placements", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'paywall_placements' AND policyname = 'authenticated_read_placements') THEN
    CREATE POLICY authenticated_read_placements ON paywall_placements FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;
"""),
    ("RLS: authenticated read rules", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'paywall_rules' AND policyname = 'authenticated_read_rules') THEN
    CREATE POLICY authenticated_read_rules ON paywall_rules FOR SELECT TO authenticated USING (enabled = true);
  END IF;
END $$;
"""),
    ("RLS: authenticated read gates", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'premium_feature_gates' AND policyname = 'authenticated_read_gates') THEN
    CREATE POLICY authenticated_read_gates ON premium_feature_gates FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;
"""),
    ("RLS: user read own entitlements", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_entitlements_cache' AND policyname = 'user_read_own_entitlements') THEN
    CREATE POLICY user_read_own_entitlements ON user_entitlements_cache FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
"""),
    ("RLS: user update own entitlements", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_entitlements_cache' AND policyname = 'user_update_own_entitlements') THEN
    CREATE POLICY user_update_own_entitlements ON user_entitlements_cache FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
"""),
    ("RLS: user insert own entitlements", """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_entitlements_cache' AND policyname = 'user_insert_own_entitlements') THEN
    CREATE POLICY user_insert_own_entitlements ON user_entitlements_cache FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
"""),
]

# ============ Execute ============

print("Phase 3 — Setting up Paywall tables...")
print()

# Try pg/query endpoint first
print("Testing pg/query endpoint...")
test_result = run_sql_via_pg("SELECT 1 as test", "Connection test")

if test_result:
    print("Using pg/query endpoint...")
    print()
    success = 0
    fail = 0
    for label, sql in STATEMENTS:
        if run_sql_via_pg(sql, label):
            success += 1
        else:
            fail += 1
    print()
    print(f"Results: {success} succeeded, {fail} failed")
    if fail == 0:
        print("✅ Phase 3 Supabase setup complete!")
else:
    # Try exec_sql RPC approach
    print("pg/query not available, trying exec_sql RPC...")
    # First create the function
    result = run_sql(CREATE_EXEC_SQL, "Create exec_sql function")
    if result is None:
        print()
        print("⚠ Neither pg/query nor exec_sql available.")
        print("Please run the following SQL in the Supabase SQL Editor:")
        print("=" * 60)
        for label, sql in STATEMENTS:
            print(f"-- {label}")
            print(sql.strip())
            print()
        print("=" * 60)
    else:
        success = 0
        fail = 0
        for label, sql in STATEMENTS[1:]:  # Skip exec_sql creation
            if run_sql(sql, label):
                success += 1
            else:
                fail += 1
        print()
        print(f"Results: {success} succeeded, {fail} failed")
