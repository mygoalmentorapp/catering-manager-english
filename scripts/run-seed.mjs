import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("=== Inserting Paywall Seed Data ===\n");

  // 1. Insert 3 paywall_placements
  console.log("1. Inserting paywall_placements...");
  const { data: placements, error: placementsErr } = await supabase
    .from("paywall_placements")
    .insert([
      {
        app_key: "catering_manager_pro",
        app_language: "he",
        placement_key: "export_feature",
        display_name: "ייצוא מתקדם",
        description: "Paywall לפני ייצוא PDF",
        is_enabled: true,
        default_offering_id: "default_offering",
      },
      {
        app_key: "catering_manager_pro",
        app_language: "en",
        placement_key: "export_feature",
        display_name: "Advanced Export",
        description: "Paywall before PDF export",
        is_enabled: true,
        default_offering_id: "default_offering",
      },
      {
        app_key: "catering_manager_pro",
        app_language: "he",
        placement_key: "premium_analytics",
        display_name: "ניתוח מתקדם",
        description: "Paywall לפני ניתוח נתונים",
        is_enabled: false,
        default_offering_id: "default_offering",
      },
    ])
    .select();

  if (placementsErr) {
    console.error("  ERROR:", placementsErr.message);
    process.exit(1);
  }
  console.log(`  ✓ Inserted ${placements.length} placements`);
  console.log("  IDs:", placements.map((p) => `${p.placement_key}(${p.app_language})=${p.id}`).join(", "));

  // Find the Hebrew export_feature placement ID for the rule FK
  const hePlacement = placements.find(
    (p) => p.placement_key === "export_feature" && p.app_language === "he"
  );
  if (!hePlacement) {
    console.error("  ERROR: Could not find Hebrew export_feature placement");
    process.exit(1);
  }

  // 2. Insert 1 paywall_rule linked to Hebrew placement
  console.log("\n2. Inserting paywall_rules...");
  const { data: rules, error: rulesErr } = await supabase
    .from("paywall_rules")
    .insert([
      {
        app_key: "catering_manager_pro",
        app_language: "he",
        placement_id: hePlacement.id,
        rule_key: "export_rule_1",
        priority: 1,
        is_enabled: true,
        required_entitlement: "premium_access",
        offering_id: "default_offering",
        target_audience: "all",
        rollout_percentage: 100,
        cooldown_hours: 0,
        max_impressions: 10,
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
    .select();

  if (rulesErr) {
    console.error("  ERROR:", rulesErr.message);
    process.exit(1);
  }
  console.log(`  ✓ Inserted ${rules.length} rule(s)`);
  console.log(`  Rule: ${rules[0].rule_key} → placement_id=${rules[0].placement_id}`);

  // 3. Insert 3 premium_feature_gates
  console.log("\n3. Inserting premium_feature_gates...");
  const { data: gates, error: gatesErr } = await supabase
    .from("premium_feature_gates")
    .insert([
      {
        app_key: "catering_manager_pro",
        app_language: "he",
        feature_key: "pdf_export",
        display_name: "ייצוא PDF",
        requires_premium: true,
        required_entitlement: "premium_access",
        placement_key: "export_feature",
        is_enabled: true,
      },
      {
        app_key: "catering_manager_pro",
        app_language: "en",
        feature_key: "pdf_export",
        display_name: "PDF Export",
        requires_premium: true,
        required_entitlement: "premium_access",
        placement_key: "export_feature",
        is_enabled: true,
      },
      {
        app_key: "catering_manager_pro",
        app_language: "he",
        feature_key: "advanced_analytics",
        display_name: "ניתוח מתקדם",
        requires_premium: true,
        required_entitlement: "premium_access",
        placement_key: "premium_analytics",
        is_enabled: false,
      },
    ])
    .select();

  if (gatesErr) {
    console.error("  ERROR:", gatesErr.message);
    process.exit(1);
  }
  console.log(`  ✓ Inserted ${gates.length} gate(s)`);
  console.log("  Gates:", gates.map((g) => `${g.feature_key}(${g.app_language})`).join(", "));

  console.log("\n=== Seed Complete! ===");
  console.log("Total: 3 placements + 1 rule + 3 gates = 7 rows");
}

seed().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
