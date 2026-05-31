"""
Phase 3 — Setup Paywall Tables + remote_config fields in Supabase.

Uses Supabase Management API SQL endpoint (via service_role + PostgREST rpc).
Falls back to printing SQL for manual execution.
"""

import os
import json
import requests

# Load env
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

assert SUPABASE_URL, "SUPABASE_URL not set"
assert SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY not set"

headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ============ SQL Statements ============

STATEMENTS = [
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

# ============ Execute via Supabase MCP or direct ============

print("Phase 3 — Setting up Paywall tables...")
print()

# Use the Supabase MCP tool via manus-mcp-cli
import subprocess

success_count = 0
fail_count = 0

for label, sql in STATEMENTS:
    sql_clean = sql.strip()
    try:
        result = subprocess.run(
            ["manus-mcp-cli", "tool", "call", "execute_sql", "--server", "supabase", 
             "--input", json.dumps({"project_id": "szcukdxkbrezhgotwsqd", "query": sql_clean})],
            capture_output=True, text=True, timeout=30
        )
        output = result.stdout + result.stderr
        if result.returncode == 0 and ("error" not in output.lower() or "already exists" in output.lower()):
            print(f"  ✓ {label}")
            success_count += 1
        elif "already exists" in output.lower() or "duplicate" in output.lower():
            print(f"  ✓ {label} (already exists)")
            success_count += 1
        else:
            print(f"  ✗ {label}: {output[:200]}")
            fail_count += 1
    except subprocess.TimeoutExpired:
        print(f"  ✗ {label}: timeout")
        fail_count += 1
    except Exception as e:
        print(f"  ✗ {label}: {e}")
        fail_count += 1

print()
print(f"Results: {success_count} succeeded, {fail_count} failed")
if fail_count == 0:
    print("✅ Phase 3 Supabase setup complete!")
else:
    print("⚠ Some statements failed. Check errors above.")
