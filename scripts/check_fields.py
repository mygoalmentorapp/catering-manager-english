import json, re, sys

# Read the saved MCP result from the earlier schema query
with open("/home/ubuntu/.mcp/tool-results/2026-05-17_20-03-05_supabase_execute_sql.json") as f:
    data = json.load(f)

raw = data.get("result", "")
m = re.search(r'\[.*\]', raw, re.DOTALL)
if not m:
    print("Could not find JSON array in result")
    sys.exit(1)

cols = json.loads(m.group())
actual = [c['column_name'] for c in cols]
print(f"Actual columns in remote_campaigns: {len(actual)}")

required = [
    "campaign_key", "name", "type", "app_key", "app_language",
    "is_enabled", "is_archived", "priority",
    "title", "subtitle", "message", "icon", "image_url",
    "primary_button_text", "primary_button_action", "primary_button_payload",
    "secondary_button_text", "secondary_button_action", "secondary_button_payload",
    "dismissible",
    "trigger_event", "target_audience", "platform",
    "start_at", "end_at", "rollout_percentage",
    "cooldown_days_after_view", "cooldown_days_after_dismiss",
    "max_impressions_per_user", "max_impressions_per_session",
    "max_impressions_per_day", "max_clicks_per_user",
    "min_days_since_signup", "min_days_since_first_open",
    "min_sessions", "min_products_created", "min_orders_created",
    "min_shopping_lists_created", "min_completed_orders",
    "days_since_last_active",
    "show_only_if_not_premium", "show_only_if_premium",
    "show_only_if_feedback_not_submitted", "show_only_if_onboarding_not_completed",
    "requires_internet", "do_not_show_during_critical_flow",
    "min_app_version", "max_app_version",
]

missing = [f for f in required if f not in actual]
found = [f for f in required if f in actual]

print(f"Required: {len(required)}, Found: {len(found)}, Missing: {len(missing)}")

if missing:
    print(f"\n❌ MISSING FIELDS: {missing}")
else:
    print(f"\n✅ ALL {len(required)} FIELDS VERIFIED IN remote_campaigns!")
