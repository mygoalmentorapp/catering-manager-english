-- ============================================================
-- Paywall Seed Data for Pre-Phase 4 Validation
-- Purpose: Insert minimal test data to verify endpoints, 
--          language isolation, FK, RLS, and is_enabled filtering
-- Safe: No DROP TABLE, no schema changes, only INSERTs
-- Cleanup: DELETE statements at the bottom (commented out)
-- ============================================================

-- ============================================================
-- 1. paywall_placements — 3 rows
-- ============================================================

-- 1a. Active placement (Hebrew)
INSERT INTO paywall_placements (app_key, app_language, placement_key, display_name, description, is_enabled, default_offering_id)
VALUES ('catering_manager_pro', 'he', 'export_feature', 'ייצוא מתקדם', 'Paywall לפני ייצוא PDF', true, 'default_offering');

-- 1b. Active placement (English)
INSERT INTO paywall_placements (app_key, app_language, placement_key, display_name, description, is_enabled, default_offering_id)
VALUES ('catering_manager_pro', 'en', 'export_feature', 'Advanced Export', 'Paywall before PDF export', true, 'default_offering');

-- 1c. DISABLED placement (Hebrew) — should NOT appear in endpoint results
INSERT INTO paywall_placements (app_key, app_language, placement_key, display_name, description, is_enabled, default_offering_id)
VALUES ('catering_manager_pro', 'he', 'premium_analytics', 'ניתוח מתקדם', 'Paywall לפני ניתוח נתונים', false, 'default_offering');

-- ============================================================
-- 2. paywall_rules — 1 row linked to he placement via FK
-- ============================================================

-- Rule linked to the Hebrew export_feature placement
INSERT INTO paywall_rules (placement_id, rule_key, priority, is_enabled, required_entitlement, offering_id, target_audience, rollout_percentage, cooldown_hours, max_impressions, start_at, end_at)
VALUES (
  (SELECT id FROM paywall_placements WHERE placement_key = 'export_feature' AND app_language = 'he' AND app_key = 'catering_manager_pro'),
  'export_rule_1',
  1,
  true,
  'premium_access',
  'default_offering',
  'all',
  100,
  0,
  10,
  NOW(),
  NOW() + INTERVAL '1 year'
);

-- ============================================================
-- 3. premium_feature_gates — 3 rows
-- ============================================================

-- 3a. Active gate (Hebrew)
INSERT INTO premium_feature_gates (app_key, app_language, feature_key, display_name, requires_premium, required_entitlement, placement_key, is_enabled)
VALUES ('catering_manager_pro', 'he', 'pdf_export', 'ייצוא PDF', true, 'premium_access', 'export_feature', true);

-- 3b. Active gate (English)
INSERT INTO premium_feature_gates (app_key, app_language, feature_key, display_name, requires_premium, required_entitlement, placement_key, is_enabled)
VALUES ('catering_manager_pro', 'en', 'pdf_export', 'PDF Export', true, 'premium_access', 'export_feature', true);

-- 3c. DISABLED gate (Hebrew) — should NOT appear in endpoint results
INSERT INTO premium_feature_gates (app_key, app_language, feature_key, display_name, requires_premium, required_entitlement, placement_key, is_enabled)
VALUES ('catering_manager_pro', 'he', 'advanced_analytics', 'ניתוח מתקדם', true, 'premium_access', 'premium_analytics', false);

-- ============================================================
-- CLEANUP (run after validation — currently commented out)
-- ============================================================
-- DELETE FROM paywall_rules WHERE rule_key = 'export_rule_1';
-- DELETE FROM premium_feature_gates WHERE feature_key IN ('pdf_export', 'advanced_analytics') AND app_key = 'catering_manager_pro';
-- DELETE FROM paywall_placements WHERE placement_key IN ('export_feature', 'premium_analytics') AND app_key = 'catering_manager_pro';
