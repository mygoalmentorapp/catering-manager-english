-- Adapty Webhook Idempotency Table
-- This table stores processed webhook events to prevent duplicate processing.
-- Run this in your Supabase SQL Editor.

-- 1. Create the idempotency table
CREATE TABLE IF NOT EXISTS adapty_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  user_id UUID DEFAULT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_adapty_webhook_events_event_id ON adapty_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_adapty_webhook_events_user_id ON adapty_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_adapty_webhook_events_event_type ON adapty_webhook_events(event_type);

-- 3. Enable RLS
ALTER TABLE adapty_webhook_events ENABLE ROW LEVEL SECURITY;

-- 4. Only service_role can read/write (webhook uses service_role key)
-- No user-facing policies needed since this is server-only
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'adapty_webhook_events' AND policyname = 'service_role_all_adapty_webhook') THEN
    CREATE POLICY service_role_all_adapty_webhook ON adapty_webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Auto-cleanup: delete events older than 90 days (optional, run as cron)
-- SELECT cron.schedule('cleanup-adapty-webhook-events', '0 3 * * 0', $$
--   DELETE FROM adapty_webhook_events WHERE processed_at < now() - interval '90 days';
-- $$);

-- 6. Ensure profiles table has subscription_status column (should already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_status') THEN
    ALTER TABLE profiles ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'trial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;
