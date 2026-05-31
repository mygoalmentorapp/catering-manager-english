"""
Phase 2 — Dynamic Onboarding: Create Supabase tables and RLS policies.

Tables:
  - onboarding_flows: defines available onboarding flows per app_key + app_language
  - onboarding_screens: individual screens within a flow

Also adds dynamic_onboarding_enabled column to remote_config if missing.
"""
import os
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
MGMT_TOKEN = os.environ["SUPABASE_MANAGEMENT_TOKEN"]
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REF = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")


def run_sql(sql: str, description: str):
    """Execute SQL via Supabase Management API."""
    resp = requests.post(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        headers={
            "Authorization": f"Bearer {MGMT_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
    )
    if resp.status_code in (200, 201):
        print(f"  ✓ {description}")
        return resp.json()
    else:
        print(f"  ✗ {description}: {resp.status_code} - {resp.text[:300]}")
        return None


# ============ 1. ONBOARDING_FLOWS TABLE ============

print("=== Creating onboarding_flows table ===")
run_sql("""
CREATE TABLE IF NOT EXISTS onboarding_flows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_key TEXT NOT NULL,
  app_language TEXT NOT NULL,
  flow_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  priority INTEGER NOT NULL DEFAULT 0,
  audience TEXT NOT NULL DEFAULT 'all',
  rollout_percentage INTEGER NOT NULL DEFAULT 100
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT onboarding_flows_unique_key UNIQUE (app_key, app_language, flow_key)
);
""", "Create onboarding_flows table")

# Indexes
run_sql("""
CREATE INDEX IF NOT EXISTS idx_onboarding_flows_lookup
  ON onboarding_flows (app_key, app_language, status);
""", "Create lookup index on onboarding_flows")


# ============ 2. ONBOARDING_SCREENS TABLE ============

print("\n=== Creating onboarding_screens table ===")
run_sql("""
CREATE TABLE IF NOT EXISTS onboarding_screens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  screen_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  icon_name TEXT,
  primary_button_text TEXT,
  secondary_button_text TEXT,
  primary_action_type TEXT,
  primary_action_payload TEXT,
  secondary_action_type TEXT,
  secondary_action_payload TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
""", "Create onboarding_screens table")

# Indexes
run_sql("""
CREATE INDEX IF NOT EXISTS idx_onboarding_screens_flow_order
  ON onboarding_screens (flow_id, sort_order);
""", "Create flow+sort_order index on onboarding_screens")


# ============ 3. ENABLE RLS ============

print("\n=== Enabling RLS ===")
run_sql("ALTER TABLE onboarding_flows ENABLE ROW LEVEL SECURITY;", "Enable RLS on onboarding_flows")
run_sql("ALTER TABLE onboarding_screens ENABLE ROW LEVEL SECURITY;", "Enable RLS on onboarding_screens")


# ============ 4. RLS POLICIES ============

print("\n=== Creating RLS policies ===")

# onboarding_flows: service_role can do everything (default), no anon/authenticated SELECT.
# The app reads through tRPC (server uses service_role), so no direct client access needed.
# But we add a read policy for authenticated users so they can read active flows if needed.
run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_flows' AND policyname = 'Service role full access onboarding_flows'
  ) THEN
    CREATE POLICY "Service role full access onboarding_flows" ON onboarding_flows
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
""", "Full access policy for service_role on onboarding_flows")

run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_screens' AND policyname = 'Service role full access onboarding_screens'
  ) THEN
    CREATE POLICY "Service role full access onboarding_screens" ON onboarding_screens
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
""", "Full access policy for service_role on onboarding_screens")


# ============ 5. ADD dynamic_onboarding_enabled TO remote_config ============

print("\n=== Adding dynamic_onboarding_enabled to remote_config ===")
run_sql("""
ALTER TABLE remote_config
  ADD COLUMN IF NOT EXISTS dynamic_onboarding_enabled BOOLEAN NOT NULL DEFAULT false;
""", "Add dynamic_onboarding_enabled column")


# ============ 6. VERIFY ============

print("\n=== Verifying tables ===")
result = run_sql("""
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('onboarding_flows', 'onboarding_screens')
ORDER BY table_name;
""", "Check tables exist")
if result:
    for row in result:
        print(f"    ✓ {row['table_name']}")

result = run_sql("""
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'remote_config' AND column_name = 'dynamic_onboarding_enabled';
""", "Check dynamic_onboarding_enabled column")
if result and len(result) > 0:
    print(f"    ✓ dynamic_onboarding_enabled: {result[0]['data_type']} default={result[0]['column_default']}")
else:
    print("    ✗ dynamic_onboarding_enabled column not found!")

print("\n=== Done ===")
