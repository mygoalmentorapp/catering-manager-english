-- ═══════════════════════════════════════════════════════════════════
-- Phase 3 — Fix Paywall Column Name Mismatch
-- ═══════════════════════════════════════════════════════════════════
--
-- Purpose:  Rename DB columns to match the code contract in
--           paywall-router.ts, monetization-service.ts, and tests.
--
-- Safety:
--   • Does NOT drop any tables
--   • Does NOT touch user_entitlements_cache (already correct)
--   • Does NOT modify any non-paywall tables (remote_config, campaigns, etc.)
--   • All tables are empty — no data migration needed
--   • Designed for one-time execution; safe to re-run (IF NOT EXISTS guards)
--
-- Affected tables:
--   1. paywall_placements   (3 changes)
--   2. paywall_rules         (6 changes)
--   3. premium_feature_gates (4 changes)
--
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1. paywall_placements
-- ─────────────────────────────────────────────────────────────────

-- 1a. Rename "name" → "display_name"
--     Code: .select("... display_name ...")
--     DB:   column is called "name"
ALTER TABLE paywall_placements RENAME COLUMN name TO display_name;

-- 1b. Rename "is_active" → "is_enabled"
--     Code: .eq("is_enabled", true)
--     DB:   column is called "is_active"
ALTER TABLE paywall_placements RENAME COLUMN is_active TO is_enabled;

-- 1c. Add "default_offering_id" (missing entirely)
--     Code: .select("... default_offering_id ...")
--     DB:   column does not exist
ALTER TABLE paywall_placements
  ADD COLUMN IF NOT EXISTS default_offering_id TEXT DEFAULT '';


-- ─────────────────────────────────────────────────────────────────
-- 2. paywall_rules
-- ─────────────────────────────────────────────────────────────────

-- 2a. Rename "enabled" → "is_enabled"
--     Code: .eq("is_enabled", true)
--     DB:   column is called "enabled"
ALTER TABLE paywall_rules RENAME COLUMN enabled TO is_enabled;

-- 2b. Rename "required_entitlement_id" → "required_entitlement"
--     Code: .select("... required_entitlement ...")
--     DB:   column is called "required_entitlement_id"
ALTER TABLE paywall_rules RENAME COLUMN required_entitlement_id TO required_entitlement;

-- 2c. Rename "audience" → "target_audience"
--     Code: .select("... target_audience ...")
--     DB:   column is called "audience"
ALTER TABLE paywall_rules RENAME COLUMN audience TO target_audience;

-- 2d. Rename "max_impressions_per_user" → "max_impressions"
--     Code: .select("... max_impressions ...")
--     DB:   column is called "max_impressions_per_user"
ALTER TABLE paywall_rules RENAME COLUMN max_impressions_per_user TO max_impressions;

-- 2e. Drop old "placement_key" (TEXT) column
--     Code uses placement_id (BIGINT FK) instead of placement_key (TEXT)
--     The old column stored a text key; the new model uses a foreign key to paywall_placements.id
ALTER TABLE paywall_rules DROP COLUMN IF EXISTS placement_key;

-- 2f. Add "placement_id" as BIGINT foreign key to paywall_placements
--     Code: .eq("placement_id", placement.id)
ALTER TABLE paywall_rules
  ADD COLUMN IF NOT EXISTS placement_id BIGINT
    REFERENCES paywall_placements(id) ON DELETE CASCADE;

-- 2g. Create index on placement_id for efficient rule lookups by placement
CREATE INDEX IF NOT EXISTS idx_paywall_rules_placement_id
  ON paywall_rules(placement_id);


-- ─────────────────────────────────────────────────────────────────
-- 3. premium_feature_gates
-- ─────────────────────────────────────────────────────────────────

-- 3a. Rename "required_entitlement_id" → "required_entitlement"
--     Code: .select("... required_entitlement ...")
--     DB:   column is called "required_entitlement_id"
ALTER TABLE premium_feature_gates RENAME COLUMN required_entitlement_id TO required_entitlement;

-- 3b. Rename "paywall_placement_key" → "placement_key"
--     Code: .select("... placement_key ...")
--     DB:   column is called "paywall_placement_key"
ALTER TABLE premium_feature_gates RENAME COLUMN paywall_placement_key TO placement_key;

-- 3c. Rename "is_active" → "is_enabled"
--     Code: .eq("is_enabled", true)
--     DB:   column is called "is_active"
ALTER TABLE premium_feature_gates RENAME COLUMN is_active TO is_enabled;

-- 3d. Add "app_language" column (missing entirely)
--     Code: .eq("app_language", appLanguage)
--     DB:   column does not exist
ALTER TABLE premium_feature_gates
  ADD COLUMN IF NOT EXISTS app_language TEXT NOT NULL DEFAULT 'he';

-- 3e. Update unique constraint to include app_language
--     Old: UNIQUE(app_key, feature_key)
--     New: UNIQUE(app_key, app_language, feature_key)
--     This allows the same feature_key to exist for different languages.
ALTER TABLE premium_feature_gates
  DROP CONSTRAINT IF EXISTS premium_feature_gates_app_key_feature_key_key;

ALTER TABLE premium_feature_gates
  ADD CONSTRAINT premium_feature_gates_app_key_language_feature_key_key
    UNIQUE (app_key, app_language, feature_key);


-- ─────────────────────────────────────────────────────────────────
-- 4. RLS Policies — Drop old, create new with correct column names
-- ─────────────────────────────────────────────────────────────────

-- 4a. paywall_placements: old policy uses "is_active", new uses "is_enabled"
DROP POLICY IF EXISTS authenticated_read_placements ON paywall_placements;
CREATE POLICY authenticated_read_placements
  ON paywall_placements
  FOR SELECT TO authenticated
  USING (is_enabled = true);

-- 4b. paywall_rules: old policy uses "enabled", new uses "is_enabled"
DROP POLICY IF EXISTS authenticated_read_rules ON paywall_rules;
CREATE POLICY authenticated_read_rules
  ON paywall_rules
  FOR SELECT TO authenticated
  USING (is_enabled = true);

-- 4c. premium_feature_gates: old policy uses "is_active", new uses "is_enabled"
DROP POLICY IF EXISTS authenticated_read_gates ON premium_feature_gates;
CREATE POLICY authenticated_read_gates
  ON premium_feature_gates
  FOR SELECT TO authenticated
  USING (is_enabled = true);

-- Note: user_entitlements_cache policies are NOT touched (already correct).


-- ─────────────────────────────────────────────────────────────────
-- 5. Verification — confirm all expected columns exist
-- ─────────────────────────────────────────────────────────────────

-- 5a. paywall_placements: expect display_name, is_enabled, default_offering_id
SELECT
  'paywall_placements' AS table_name,
  column_name,
  data_type,
  CASE
    WHEN column_name IN ('id','app_key','app_language','placement_key','display_name','description','is_enabled','default_offering_id','created_at','updated_at')
    THEN '✓ expected'
    ELSE '⚠ unexpected'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'paywall_placements'
ORDER BY ordinal_position;

-- 5b. paywall_rules: expect placement_id, is_enabled, required_entitlement, target_audience, max_impressions
SELECT
  'paywall_rules' AS table_name,
  column_name,
  data_type,
  CASE
    WHEN column_name IN ('id','app_key','app_language','rule_key','placement_id','is_enabled','required_entitlement','offering_id','target_audience','rollout_percentage','max_impressions','cooldown_hours','start_at','end_at','priority','created_at','updated_at')
    THEN '✓ expected'
    ELSE '⚠ unexpected'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'paywall_rules'
ORDER BY ordinal_position;

-- 5c. premium_feature_gates: expect app_language, required_entitlement, placement_key, is_enabled
SELECT
  'premium_feature_gates' AS table_name,
  column_name,
  data_type,
  CASE
    WHEN column_name IN ('id','app_key','app_language','feature_key','display_name','requires_premium','required_entitlement','placement_key','is_enabled','created_at','updated_at')
    THEN '✓ expected'
    ELSE '⚠ unexpected'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'premium_feature_gates'
ORDER BY ordinal_position;

-- 5d. user_entitlements_cache: confirm NOT touched (should have original columns)
SELECT
  'user_entitlements_cache' AS table_name,
  column_name,
  data_type,
  '✓ not modified' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_entitlements_cache'
ORDER BY ordinal_position;

-- 5e. Verify RLS policies exist with correct names
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('paywall_placements', 'paywall_rules', 'premium_feature_gates', 'user_entitlements_cache')
ORDER BY tablename, policyname;

-- 5f. Verify foreign key from paywall_rules.placement_id → paywall_placements.id
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'paywall_rules'
  AND kcu.column_name = 'placement_id';

-- 5g. Verify unique constraint on premium_feature_gates includes app_language
SELECT
  tc.constraint_name,
  tc.table_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_name = 'premium_feature_gates'
GROUP BY tc.constraint_name, tc.table_name;

-- 5h. Verify index on paywall_rules.placement_id
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename = 'paywall_rules'
  AND indexname = 'idx_paywall_rules_placement_id';
