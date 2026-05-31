/**
 * Pre-4B Seed Data Script
 * 
 * Inserts minimal seed data for admin dashboard visual verification.
 * IDEMPOTENT: Uses ON CONFLICT DO NOTHING on unique constraints.
 * Does NOT delete existing data.
 * 
 * Tables seeded:
 * - remote_campaigns: +1 (en campaign)
 * - onboarding_flows: +2 (he + en)
 * - onboarding_screens: +4 (2 per flow)
 * - paywall_placements: +3 (he active, en active, he disabled)
 * - paywall_rules: +1 (linked to he placement via FK)
 * - premium_feature_gates: +3 (he active, en active, he disabled)
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const APP_KEY = "catering_manager_pro";

async function seed() {
  console.log("=== Pre-4B Seed Data ===\n");

  // 1. remote_campaigns: +1 English campaign
  console.log("1. remote_campaigns (en campaign)...");
  const { data: campData, error: campErr } = await supabase
    .from("remote_campaigns")
    .upsert(
      {
        campaign_key: "rate_app_en",
        name: "Rate App Request",
        description: "Ask English users to rate the app after 5 sessions",
        type: "circle_popup",
        title: "Enjoying the app?",
        subtitle: "We'd love your feedback",
        message: "If you're enjoying Catering Manager, please take a moment to rate us on the App Store.",
        icon: "⭐",
        primary_button_text: "Rate Now",
        primary_button_action: "open_store_review",
        primary_button_payload: {},
        secondary_button_text: "Later",
        secondary_button_action: "dismiss_for_later",
        secondary_button_payload: {},
        is_enabled: true,
        is_archived: false,
        priority: 40,
        rollout_percentage: 100,
        target_audience: "all",
        trigger_event: "session_start",
        allowed_screens: [],
        blocked_screens: [],
        min_sessions: 5,
        cooldown_days_after_dismiss: 7,
        max_impressions_per_user: 2,
        dismissible: true,
        do_not_show_during_critical_flow: true,
        schema_version: 1,
        app_key: APP_KEY,
        app_language: "en",
      },
      { onConflict: "campaign_key" }
    )
    .select();
  console.log(campErr ? `  ERROR: ${campErr.message}` : `  OK (${campData?.length || 0} rows)`);

  // 2. onboarding_flows: +2 (he + en)
  console.log("\n2. onboarding_flows (he + en)...");
  const { data: flowData, error: flowErr } = await supabase
    .from("onboarding_flows")
    .upsert(
      [
        {
          app_key: APP_KEY,
          app_language: "he",
          flow_key: "welcome_he",
          name: "ברוכים הבאים",
          description: "מסך הכרות ראשוני למשתמשים חדשים",
          status: "active",
          priority: 10,
          audience: "all",
          rollout_percentage: 100,
        },
        {
          app_key: APP_KEY,
          app_language: "en",
          flow_key: "welcome_en",
          name: "Welcome Flow",
          description: "Initial onboarding for new English users",
          status: "active",
          priority: 10,
          audience: "all",
          rollout_percentage: 100,
        },
      ],
      { onConflict: "app_key,app_language,flow_key" }
    )
    .select();
  console.log(flowErr ? `  ERROR: ${flowErr.message}` : `  OK (${flowData?.length || 0} rows)`);

  // 3. onboarding_screens: +4 (2 per flow)
  console.log("\n3. onboarding_screens (4 screens)...");
  
  // Get flow IDs
  const { data: flows } = await supabase
    .from("onboarding_flows")
    .select("id, flow_key")
    .eq("app_key", APP_KEY)
    .in("flow_key", ["welcome_he", "welcome_en"]);

  const heFlowId = flows?.find((f) => f.flow_key === "welcome_he")?.id;
  const enFlowId = flows?.find((f) => f.flow_key === "welcome_en")?.id;

  if (!heFlowId || !enFlowId) {
    console.log("  ERROR: Could not find flow IDs. Skipping screens.");
  } else {
    // onboarding_screens has no unique constraint beyond PK, so we check existence first
    const { data: existingScreens } = await supabase
      .from("onboarding_screens")
      .select("screen_key, flow_id")
      .in("flow_id", [heFlowId, enFlowId]);

    const existingKeys = new Set(
      (existingScreens || []).map((s) => `${s.flow_id}_${s.screen_key}`)
    );

    const screens = [
      {
        flow_id: heFlowId,
        screen_key: "welcome",
        sort_order: 1,
        title: "ברוכים הבאים",
        body: "נהל את עסק הקייטרינג שלך בקלות ויעילות. הזמנות, מוצרים, לקוחות — הכל במקום אחד.",
        icon_name: "restaurant",
        primary_button_text: "הבא",
        primary_action_type: "next_screen",
      },
      {
        flow_id: heFlowId,
        screen_key: "products",
        sort_order: 2,
        title: "ניהול מוצרים",
        body: "הוסף מוצרים, קבע מחירים, ונהל את התפריט שלך בצורה פשוטה ומהירה.",
        icon_name: "inventory",
        primary_button_text: "בואו נתחיל",
        primary_action_type: "complete_onboarding",
      },
      {
        flow_id: enFlowId,
        screen_key: "welcome",
        sort_order: 1,
        title: "Welcome",
        body: "Manage your catering business with ease. Orders, products, clients — all in one place.",
        icon_name: "restaurant",
        primary_button_text: "Next",
        primary_action_type: "next_screen",
      },
      {
        flow_id: enFlowId,
        screen_key: "products",
        sort_order: 2,
        title: "Manage Products",
        body: "Add products, set prices, and manage your menu quickly and easily.",
        icon_name: "inventory",
        primary_button_text: "Let's Start",
        primary_action_type: "complete_onboarding",
      },
    ];

    const toInsert = screens.filter(
      (s) => !existingKeys.has(`${s.flow_id}_${s.screen_key}`)
    );

    if (toInsert.length === 0) {
      console.log("  OK (0 new — already exist)");
    } else {
      const { data: scrData, error: scrErr } = await supabase
        .from("onboarding_screens")
        .insert(toInsert)
        .select();
      console.log(scrErr ? `  ERROR: ${scrErr.message}` : `  OK (${scrData?.length || 0} rows)`);
    }
  }

  // 4. paywall_placements: +3
  console.log("\n4. paywall_placements (3 placements)...");
  const { data: plData, error: plErr } = await supabase
    .from("paywall_placements")
    .upsert(
      [
        {
          app_key: APP_KEY,
          app_language: "he",
          placement_key: "export_feature",
          display_name: "ייצוא מתקדם",
          description: "גישה לייצוא PDF ו-Excel של הזמנות ודוחות",
          is_enabled: true,
          default_offering_id: "premium_monthly",
        },
        {
          app_key: APP_KEY,
          app_language: "en",
          placement_key: "export_feature",
          display_name: "Advanced Export",
          description: "Access PDF and Excel export for orders and reports",
          is_enabled: true,
          default_offering_id: "premium_monthly",
        },
        {
          app_key: APP_KEY,
          app_language: "he",
          placement_key: "premium_analytics",
          display_name: "אנליטיקה מתקדמת",
          description: "גישה לדוחות מתקדמים וניתוח נתונים",
          is_enabled: false,
          default_offering_id: "premium_yearly",
        },
      ],
      { onConflict: "app_key,app_language,placement_key" }
    )
    .select();
  console.log(plErr ? `  ERROR: ${plErr.message}` : `  OK (${plData?.length || 0} rows)`);

  // 5. paywall_rules: +1 (linked to he export placement)
  console.log("\n5. paywall_rules (1 rule linked to placement)...");
  
  // Get the he export placement ID
  const { data: placements } = await supabase
    .from("paywall_placements")
    .select("id")
    .eq("app_key", APP_KEY)
    .eq("app_language", "he")
    .eq("placement_key", "export_feature")
    .limit(1);

  const hePlacementId = placements?.[0]?.id;
  
  if (!hePlacementId) {
    console.log("  ERROR: Could not find he export placement ID");
  } else {
    const { data: ruleData, error: ruleErr } = await supabase
      .from("paywall_rules")
      .upsert(
        {
          app_key: APP_KEY,
          app_language: "he",
          rule_key: "export_after_3_orders",
          is_enabled: true,
          required_entitlement: "premium_access",
          offering_id: "premium_monthly",
          target_audience: "all",
          rollout_percentage: 100,
          priority: 10,
          placement_id: hePlacementId,
        },
        { onConflict: "app_key,app_language,rule_key" }
      )
      .select();
    console.log(ruleErr ? `  ERROR: ${ruleErr.message}` : `  OK (${ruleData?.length || 0} rows)`);
  }

  // 6. premium_feature_gates: +3
  console.log("\n6. premium_feature_gates (3 gates)...");
  const { data: gateData, error: gateErr } = await supabase
    .from("premium_feature_gates")
    .upsert(
      [
        {
          app_key: APP_KEY,
          app_language: "he",
          feature_key: "pdf_export",
          display_name: "ייצוא PDF",
          requires_premium: true,
          required_entitlement: "premium_access",
          placement_key: "export_feature",
          is_enabled: true,
        },
        {
          app_key: APP_KEY,
          app_language: "en",
          feature_key: "pdf_export",
          display_name: "PDF Export",
          requires_premium: true,
          required_entitlement: "premium_access",
          placement_key: "export_feature",
          is_enabled: true,
        },
        {
          app_key: APP_KEY,
          app_language: "he",
          feature_key: "advanced_analytics",
          display_name: "אנליטיקה מתקדמת",
          requires_premium: true,
          required_entitlement: "premium_access",
          placement_key: "premium_analytics",
          is_enabled: false,
        },
      ],
      { onConflict: "app_key,app_language,feature_key" }
    )
    .select();
  console.log(gateErr ? `  ERROR: ${gateErr.message}` : `  OK (${gateData?.length || 0} rows)`);

  // 7. Verification
  console.log("\n=== Verification ===");
  const counts = {};
  for (const table of [
    "remote_config",
    "remote_campaigns",
    "feature_flags",
    "onboarding_flows",
    "onboarding_screens",
    "paywall_placements",
    "paywall_rules",
    "premium_feature_gates",
  ]) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    counts[table] = error ? `ERROR: ${error.message}` : count;
  }
  console.log("\nRow counts:");
  for (const [t, c] of Object.entries(counts)) {
    console.log(`  ${t}: ${c}`);
  }

  // Verify FK
  console.log("\nFK verification (paywall_rules.placement_id):");
  const { data: rules } = await supabase
    .from("paywall_rules")
    .select("rule_key, placement_id")
    .eq("app_key", APP_KEY);
  for (const r of rules || []) {
    const { data: pl } = await supabase
      .from("paywall_placements")
      .select("placement_key, display_name")
      .eq("id", r.placement_id)
      .single();
    console.log(`  rule "${r.rule_key}" → placement_id=${r.placement_id} → ${pl ? pl.placement_key + ' (' + pl.display_name + ')' : 'NOT FOUND'}`);
  }

  console.log("\n=== Seed Complete ===");
}

seed().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
