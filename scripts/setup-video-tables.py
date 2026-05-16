"""
Create video_topics and video_tutorials tables in Supabase Postgres,
enable RLS with public read policies, and seed sample topics.
Uses the Supabase Management API with SUPABASE_MANAGEMENT_TOKEN.
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
        print(f"  ✗ {description}: {resp.status_code} - {resp.text[:200]}")
        return None

print("=== Creating video_topics table ===")
run_sql("""
CREATE TABLE IF NOT EXISTS video_topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
""", "Create video_topics table")

print("\n=== Creating video_tutorials table ===")
run_sql("""
CREATE TABLE IF NOT EXISTS video_tutorials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES video_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
""", "Create video_tutorials table")

print("\n=== Enabling RLS ===")
run_sql("ALTER TABLE video_topics ENABLE ROW LEVEL SECURITY;", "Enable RLS on video_topics")
run_sql("ALTER TABLE video_tutorials ENABLE ROW LEVEL SECURITY;", "Enable RLS on video_tutorials")

print("\n=== Creating RLS policies ===")
run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'video_topics' AND policyname = 'Allow public read of active topics'
  ) THEN
    CREATE POLICY "Allow public read of active topics" ON video_topics
      FOR SELECT USING (is_active = true);
  END IF;
END $$;
""", "RLS policy for video_topics")

run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'video_tutorials' AND policyname = 'Allow public read of active tutorials'
  ) THEN
    CREATE POLICY "Allow public read of active tutorials" ON video_tutorials
      FOR SELECT USING (is_active = true);
  END IF;
END $$;
""", "RLS policy for video_tutorials")

print("\n=== Seeding sample topics ===")
# Check if topics already exist
result = run_sql("SELECT COUNT(*) as cnt FROM video_topics;", "Check existing topics")
if result and len(result) > 0 and result[0].get("cnt", 0) > 0:
    print(f"  Already has {result[0]['cnt']} topics, skipping seed")
else:
    run_sql("""
INSERT INTO video_topics (title, sort_order, is_active) VALUES
  ('התחלה מהירה', 1, true),
  ('יצירת מוצרים', 2, true),
  ('מרכיבים ועלויות', 3, true),
  ('יצירת הזמנות', 4, true),
  ('רשימות קניות', 5, true),
  ('הגדרות', 6, true);
""", "Seed 6 sample topics")

print("\n=== Verifying ===")
result = run_sql("SELECT id, title, sort_order FROM video_topics ORDER BY sort_order;", "List topics")
if result:
    for row in result:
        print(f"    {row['sort_order']}. {row['title']} (id: {row['id'][:8]}...)")

print("\n=== Done ===")
