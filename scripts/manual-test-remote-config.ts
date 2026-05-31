/**
 * Manual Test Script — Remote Config via tRPC endpoint
 *
 * Tests:
 * a. maintenance_enabled=false → app opens normally (config returned, maintenance off)
 * b. maintenance_enabled=true → MaintenanceScreen should show
 * c. force_update=true + maintenance=true → ForceUpdate shown first
 * d. global_message_enabled=true → banner shown
 * e. global_message_enabled=false → banner not shown
 * f. Reset all flags to false after testing
 *
 * This script calls the tRPC API endpoint directly (same as the app would).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Always use local server for manual testing (not production URL from env)
const API_BASE_URL = "http://127.0.0.1:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helper: Update remote_config row ──
async function updateRemoteConfig(fields: Record<string, any>) {
  const { error } = await admin
    .from("remote_config")
    .update(fields)
    .eq("app_key", "catering_manager_pro")
    .eq("app_language", "he");

  if (error) {
    console.error(`❌ Failed to update remote_config:`, error.message);
    return false;
  }
  return true;
}

// ── Helper: Call tRPC endpoint ──
async function callGetRemoteConfig(appKey: string, appLanguage: string) {
  // tRPC GET request format: /api/trpc/config.getRemoteConfig
  const url = `${API_BASE_URL}/api/trpc/config.getRemoteConfig`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-app-key": appKey,
        "x-app-language": appLanguage,
      },
    });

    if (!res.ok) {
      console.error(`  HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    // tRPC with superjson wraps result in { result: { data: { json: ... } } }
    return json?.result?.data?.json ?? null;
  } catch (err: any) {
    console.error(`  Fetch error: ${err.message}`);
    return null;
  }
}

// ── Test Runner ──
async function runTests() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Manual Test: Remote Config via tRPC Endpoint");
  console.log("═══════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  // ── Test a: maintenance_enabled=false → app opens normally ──
  console.log("Test a: maintenance_enabled=false → app opens normally");
  await updateRemoteConfig({
    maintenance_enabled: false,
    force_update_enabled: false,
    global_message_enabled: false,
  });

  let data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (data && data.maintenance_enabled === false) {
    console.log("  ✅ PASS — maintenance_enabled=false, app would open normally\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected maintenance_enabled=false, got:`, data?.maintenance_enabled, "\n");
    failed++;
  }

  // ── Test b: maintenance_enabled=true → MaintenanceScreen shown ──
  console.log("Test b: maintenance_enabled=true → MaintenanceScreen shown");
  await updateRemoteConfig({
    maintenance_enabled: true,
    maintenance_title: "תחזוקה מתוכננת",
    maintenance_message: "נחזור בקרוב",
    maintenance_action_text: "נסה שוב",
  });

  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (
    data &&
    data.maintenance_enabled === true &&
    data.maintenance_title === "תחזוקה מתוכננת" &&
    data.maintenance_message === "נחזור בקרוב" &&
    data.maintenance_action_text === "נסה שוב"
  ) {
    console.log("  ✅ PASS — maintenance_enabled=true with Hebrew texts\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — maintenance data:`, {
      enabled: data?.maintenance_enabled,
      title: data?.maintenance_title,
      message: data?.maintenance_message,
      action: data?.maintenance_action_text,
    }, "\n");
    failed++;
  }

  // ── Test c: force_update=true + maintenance=true → ForceUpdate shown first ──
  console.log("Test c: force_update=true + maintenance=true → ForceUpdate shown first");
  await updateRemoteConfig({
    force_update_enabled: true,
    maintenance_enabled: true,
  });

  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (data && data.force_update_enabled === true && data.maintenance_enabled === true) {
    console.log("  ✅ PASS — both force_update and maintenance are true");
    console.log("  ℹ️  AppGate checks ForceUpdate BEFORE Maintenance → ForceUpdate screen shown first\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected both true, got:`, {
      force_update: data?.force_update_enabled,
      maintenance: data?.maintenance_enabled,
    }, "\n");
    failed++;
  }

  // ── Test d: global_message_enabled=true → banner shown ──
  console.log("Test d: global_message_enabled=true → banner shown");
  await updateRemoteConfig({
    force_update_enabled: false,
    maintenance_enabled: false,
    global_message_enabled: true,
    global_message_title: "הודעה חשובה",
    global_message_text: "שימו לב: מחירי חומרי גלם עודכנו",
    global_message_type: "warning",
    global_message_dismissible: true,
  });

  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (
    data &&
    data.global_message_enabled === true &&
    data.global_message_title === "הודעה חשובה" &&
    data.global_message_text === "שימו לב: מחירי חומרי גלם עודכנו" &&
    data.global_message_type === "warning"
  ) {
    console.log("  ✅ PASS — global_message_enabled=true with Hebrew texts\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — global message data:`, {
      enabled: data?.global_message_enabled,
      title: data?.global_message_title,
      text: data?.global_message_text,
      type: data?.global_message_type,
    }, "\n");
    failed++;
  }

  // ── Test e: global_message_enabled=false → banner not shown ──
  console.log("Test e: global_message_enabled=false → banner not shown");
  await updateRemoteConfig({
    global_message_enabled: false,
  });

  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (data && data.global_message_enabled === false) {
    console.log("  ✅ PASS — global_message_enabled=false, banner hidden\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected global_message_enabled=false, got:`, data?.global_message_enabled, "\n");
    failed++;
  }

  // ── Test: session_timeout_minutes is returned ──
  console.log("Test f: session_timeout_minutes is returned from config");
  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (data && typeof data.session_timeout_minutes === "number" && data.session_timeout_minutes > 0) {
    console.log(`  ✅ PASS — session_timeout_minutes=${data.session_timeout_minutes}\n`);
    passed++;
  } else {
    console.log(`  ❌ FAIL — session_timeout_minutes:`, data?.session_timeout_minutes, "\n");
    failed++;
  }

  // ── Test: No internal fields leaked ──
  console.log("Test g: No internal fields leaked (id, created_at, updated_at, app_key, app_language)");
  data = await callGetRemoteConfig("catering_manager_pro", "he");
  const hasInternalFields =
    data && ("id" in data || "created_at" in data || "updated_at" in data || "app_key" in data || "app_language" in data);
  if (!hasInternalFields) {
    console.log("  ✅ PASS — no internal fields in response\n");
    passed++;
  } else {
    const leaked = ["id", "created_at", "updated_at", "app_key", "app_language"].filter(
      (k) => data && k in data
    );
    console.log(`  ❌ FAIL — leaked fields: ${leaked.join(", ")}\n`);
    failed++;
  }

  // ── Test: Missing headers → null (SAFE_DEFAULTS on client) ──
  console.log("Test h: Missing x-app-key header → null (client uses SAFE_DEFAULTS)");
  data = await callGetRemoteConfig("", "he");
  if (data === null) {
    console.log("  ✅ PASS — null returned for missing app_key\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected null, got data\n`);
    failed++;
  }

  console.log("Test i: Missing x-app-language header → null");
  data = await callGetRemoteConfig("catering_manager_pro", "");
  if (data === null) {
    console.log("  ✅ PASS — null returned for missing app_language\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected null, got data\n`);
    failed++;
  }

  // ── Test: Hebrew config returns Hebrew texts ──
  console.log("Test j: Hebrew config returns Hebrew texts (he/en isolation)");
  data = await callGetRemoteConfig("catering_manager_pro", "he");
  if (data && data.force_update_title === "יש גרסה חדשה חובה") {
    console.log(`  ✅ PASS — Hebrew force_update_title="${data.force_update_title}"\n`);
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected Hebrew title, got: "${data?.force_update_title}"\n`);
    failed++;
  }

  // ── Test: English config returns English texts ──
  console.log("Test k: English config returns English texts (he/en isolation)");
  const enData = await callGetRemoteConfig("catering_manager_pro", "en");
  if (enData && enData.force_update_title === "A required update is available") {
    console.log(`  ✅ PASS — English force_update_title="${enData.force_update_title}"\n`);
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected English title, got: "${enData?.force_update_title}"\n`);
    failed++;
  }

  // ── Test: English maintenance texts ──
  console.log("Test l: English maintenance texts are correct");
  if (enData && enData.maintenance_title === "Maintenance in progress" && enData.maintenance_message === "We are making improvements. Please try again shortly.") {
    console.log(`  ✅ PASS — English maintenance texts correct\n`);
    passed++;
  } else {
    console.log(`  ❌ FAIL — English maintenance: title="${enData?.maintenance_title}", message="${enData?.maintenance_message}"\n`);
    failed++;
  }

  // ── Test: Unknown language returns null ──
  console.log("Test m: Unknown language (fr) returns null → SAFE_DEFAULTS");
  const frData = await callGetRemoteConfig("catering_manager_pro", "fr");
  if (frData === null) {
    console.log("  ✅ PASS — null returned for unsupported language\n");
    passed++;
  } else {
    console.log(`  ❌ FAIL — expected null, got data\n`);
    failed++;
  }

  // ── Reset: Set all flags to false ──
  console.log("Cleanup: Resetting all flags to false...");
  const resetOk = await updateRemoteConfig({
    maintenance_enabled: false,
    force_update_enabled: false,
    global_message_enabled: false,
    maintenance_title: "",
    maintenance_message: "",
    maintenance_action_text: "",
    global_message_title: "",
    global_message_text: "",
    global_message_type: "info",
    global_message_action: "",
    global_message_action_text: "",
    global_message_dismissible: true,
  });
  if (resetOk) {
    console.log("  ✅ All flags reset to false\n");
  } else {
    console.log("  ❌ Failed to reset flags\n");
  }

  // ── Summary ──
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("═══════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
