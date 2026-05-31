-- =============================================================
-- Seed English remote_config row
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================

-- 1. First, grant INSERT/UPDATE/DELETE to service_role so the
--    admin dashboard can manage remote_config rows in the future.
GRANT INSERT, UPDATE, DELETE ON TABLE public.remote_config TO service_role;

-- 2. Insert the English config row
INSERT INTO public.remote_config (
  app_key,
  app_language,
  schema_version,
  paywall_enabled,
  revenuecat_enabled,
  remote_campaigns_enabled,
  feedback_popup_enabled,
  global_message_enabled,
  external_urls_enabled,
  cache_ttl_minutes,
  session_timeout_minutes,
  force_update_enabled,
  minimum_supported_version_code,
  latest_version_code,
  force_update_title,
  force_update_message,
  force_update_button_text,
  google_play_url,
  maintenance_enabled,
  maintenance_title,
  maintenance_message,
  maintenance_action_text,
  global_message_title,
  global_message_text,
  global_message_type,
  global_message_action,
  global_message_action_text,
  global_message_dismissible
) VALUES (
  'catering_manager_pro',
  'en',
  1,                          -- schema_version
  false,                      -- paywall_enabled
  false,                      -- revenuecat_enabled
  true,                       -- remote_campaigns_enabled
  true,                       -- feedback_popup_enabled
  false,                      -- global_message_enabled
  false,                      -- external_urls_enabled
  30,                         -- cache_ttl_minutes
  30,                         -- session_timeout_minutes
  false,                      -- force_update_enabled
  1,                          -- minimum_supported_version_code
  1,                          -- latest_version_code
  'A required update is available',
  'To continue using the app, please update it from Google Play.',
  'Update now',
  '',                         -- google_play_url
  false,                      -- maintenance_enabled
  'Maintenance in progress',
  'We are making improvements. Please try again shortly.',
  'Try again',
  '',                         -- global_message_title
  '',                         -- global_message_text
  'info',                     -- global_message_type
  '',                         -- global_message_action
  '',                         -- global_message_action_text
  true                        -- global_message_dismissible
);

-- 3. Verify both rows exist
SELECT id, app_key, app_language, maintenance_title, force_update_title
FROM public.remote_config
ORDER BY app_language;
