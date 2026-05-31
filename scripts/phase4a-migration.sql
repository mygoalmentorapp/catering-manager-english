-- ============================================================
-- Phase 4A Migration — Admin Dashboard Foundation
-- Date: 2026-05-17
-- Purpose: Create apps + admin_audit_logs tables, harden RLS
-- ============================================================

-- ============================================================
-- PART 1: Create apps table
-- ============================================================

CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  supported_languages TEXT[] NOT NULL DEFAULT '{he}',
  platforms TEXT[] NOT NULL DEFAULT '{ios,android}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  enabled_modules TEXT[] NOT NULL DEFAULT '{}',
  supported_events JSONB NOT NULL DEFAULT '[]',
  supported_actions JSONB NOT NULL DEFAULT '[]',
  supported_placements JSONB NOT NULL DEFAULT '[]',
  supported_entitlements JSONB NOT NULL DEFAULT '[]',
  premium_features JSONB NOT NULL DEFAULT '[]',
  condition_fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: No anon/authenticated access at all (admin-only table)
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
-- No policies = default deny for anon/authenticated
-- service_role bypasses RLS automatically

-- GRANT: only SELECT for service_role (already has it), nothing for anon/authenticated
GRANT SELECT ON apps TO service_role;
-- Explicitly revoke any default grants
REVOKE ALL ON apps FROM anon;
REVOKE ALL ON apps FROM authenticated;

-- ============================================================
-- PART 2: Create admin_audit_logs table
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  app_key TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_value JSONB,
  after_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: completely locked down (admin-only, accessed via service_role)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- No policies = default deny for anon/authenticated
-- service_role bypasses RLS automatically

-- GRANT: nothing for anon/authenticated
REVOKE ALL ON admin_audit_logs FROM anon;
REVOKE ALL ON admin_audit_logs FROM authenticated;
GRANT ALL ON admin_audit_logs TO service_role;

-- Index for common queries
CREATE INDEX idx_audit_logs_app_key ON admin_audit_logs (app_key);
CREATE INDEX idx_audit_logs_created_at ON admin_audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_module ON admin_audit_logs (module);

-- ============================================================
-- PART 3: RLS Hardening — Fix overly permissive policies
-- ============================================================

-- 3a. onboarding_flows: Replace "public ALL" with SELECT-only
DROP POLICY IF EXISTS "Service role full access onboarding_flows" ON onboarding_flows;
CREATE POLICY "read_active_onboarding_flows"
  ON onboarding_flows FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

-- 3b. onboarding_screens: Replace "public ALL" with SELECT-only
DROP POLICY IF EXISTS "Service role full access onboarding_screens" ON onboarding_screens;
CREATE POLICY "read_onboarding_screens"
  ON onboarding_screens FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: remote_config and remote_campaigns already have SELECT-only policies.
-- Their existing policies are:
--   remote_config: "Authenticated read remote_config" (authenticated, SELECT, true)
--   remote_config: "anon_read_remote_config" (anon, SELECT, true)
--   remote_campaigns: "authenticated_read_campaigns" (authenticated, SELECT, true)
-- These are already correct — no changes needed.

-- Note: feature_flags and allowed_external_domains already have SELECT-only policies.
--   feature_flags: "Authenticated read feature_flags" (authenticated, SELECT, true)
--   allowed_external_domains: "Authenticated read allowed_external_domains" (authenticated, SELECT, true)
-- These are already correct — no changes needed.

-- Note: paywall tables already have correct SELECT-only policies with is_enabled filter.
--   paywall_placements: "authenticated_read_placements" (authenticated, SELECT, is_enabled=true)
--   paywall_rules: "authenticated_read_rules" (authenticated, SELECT, is_enabled=true)
--   premium_feature_gates: "authenticated_read_gates" (authenticated, SELECT, is_enabled=true)
-- These are already correct — no changes needed.

-- ============================================================
-- PART 4: Seed data — catering_manager_pro
-- ============================================================

INSERT INTO apps (
  app_key,
  display_name,
  description,
  supported_languages,
  platforms,
  status,
  enabled_modules,
  supported_events,
  supported_actions,
  supported_placements,
  supported_entitlements,
  premium_features,
  condition_fields
) VALUES (
  'catering_manager_pro',
  'Catering Manager Pro',
  'Professional catering order management, products, shopping lists, and profitability tracking',
  '{he,en}',
  '{ios,android}',
  'active',
  '{remote_config,feature_flags,campaigns,onboarding,paywall,global_messages}',
  '[
    {"key": "order_created", "label": "Order Created", "description": "Triggered after user creates a new order"},
    {"key": "product_created", "label": "Product Created", "description": "Triggered after user creates a new product"},
    {"key": "shopping_list_created", "label": "Shopping List Created", "description": "Triggered after creating a shopping list"},
    {"key": "order_completed", "label": "Order Completed", "description": "Triggered when order status changes to completed"},
    {"key": "onboarding_completed", "label": "Onboarding Completed", "description": "Triggered when user finishes onboarding"},
    {"key": "paywall_opened", "label": "Paywall Opened", "description": "Triggered when paywall screen is displayed"},
    {"key": "app_opened", "label": "App Opened", "description": "Triggered on every app launch"},
    {"key": "session_started", "label": "Session Started", "description": "Triggered when a new session begins"}
  ]'::jsonb,
  '[
    {"key": "open_home", "label": "Open Home", "description": "Navigate to home screen"},
    {"key": "open_products", "label": "Open Products", "description": "Navigate to products screen"},
    {"key": "open_orders", "label": "Open Orders", "description": "Navigate to orders screen"},
    {"key": "open_shopping_lists", "label": "Open Shopping Lists", "description": "Navigate to shopping lists screen"},
    {"key": "open_settings", "label": "Open Settings", "description": "Navigate to settings screen"},
    {"key": "open_paywall", "label": "Open Paywall", "description": "Show the purchase screen"},
    {"key": "open_url", "label": "Open URL", "description": "Open external URL in browser"},
    {"key": "open_onboarding", "label": "Open Onboarding", "description": "Re-show the onboarding flow"}
  ]'::jsonb,
  '[
    {"key": "home_banner", "label": "Home Banner", "description": "Top area of the home screen"},
    {"key": "after_order", "label": "After Order", "description": "Shown immediately after saving an order"},
    {"key": "after_product", "label": "After Product", "description": "Shown after saving a product"},
    {"key": "settings_premium", "label": "Settings Premium", "description": "Premium area in settings screen"},
    {"key": "export_feature", "label": "Export Feature", "description": "Shown when user attempts to export"}
  ]'::jsonb,
  '[
    {"key": "premium", "label": "Premium", "description": "Full access to all features"},
    {"key": "pro_annual", "label": "Pro Annual", "description": "Annual subscription with all capabilities"}
  ]'::jsonb,
  '[
    {"key": "pdf_export", "label": "PDF Export", "description": "Export orders and shopping lists to PDF"},
    {"key": "advanced_analytics", "label": "Advanced Analytics", "description": "Charts and profitability reports"},
    {"key": "bulk_operations", "label": "Bulk Operations", "description": "Edit and delete multiple items at once"},
    {"key": "custom_branding", "label": "Custom Branding", "description": "Custom logo and design"}
  ]'::jsonb,
  '[
    {"key": "min_orders_created", "label": "Min Orders Created", "description": "Number of orders the user has created", "type": "number"},
    {"key": "min_products_created", "label": "Min Products Created", "description": "Number of products the user has created", "type": "number"},
    {"key": "min_shopping_lists_created", "label": "Min Shopping Lists", "description": "Number of shopping lists created", "type": "number"},
    {"key": "min_completed_orders", "label": "Min Completed Orders", "description": "Number of orders with completed status", "type": "number"},
    {"key": "min_sessions", "label": "Min Sessions", "description": "Number of sessions the user has had", "type": "number"},
    {"key": "min_days_since_signup", "label": "Min Days Since Signup", "description": "Days elapsed since user registration", "type": "number"},
    {"key": "days_since_last_active", "label": "Days Since Last Active", "description": "Days elapsed since last activity", "type": "number"},
    {"key": "min_days_since_first_open", "label": "Min Days Since First Open", "description": "Days elapsed since first app launch", "type": "number"}
  ]'::jsonb
) ON CONFLICT (app_key) DO NOTHING;

-- ============================================================
-- PART 5: Verification queries
-- ============================================================

-- Verify apps table created and seeded
SELECT app_key, display_name, status, array_length(enabled_modules, 1) as module_count
FROM apps;

-- Verify admin_audit_logs table created
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_audit_logs'
ORDER BY ordinal_position;

-- Verify RLS policies after changes
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('onboarding_flows', 'onboarding_screens', 'apps', 'admin_audit_logs')
ORDER BY tablename, policyname;

-- Verify no write GRANTs for anon/authenticated on new tables
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name IN ('apps', 'admin_audit_logs')
AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee;
