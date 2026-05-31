/**
 * Phase 4B — Update capabilities labels to Hebrew in the apps table.
 * This script updates the JSONB capability fields for catering_manager_pro
 * to use Hebrew labels and descriptions.
 *
 * Run: node scripts/update-capabilities-hebrew.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APP_KEY = "catering_manager_pro";

const hebrewCapabilities = {
  supported_events: [
    { key: "order_created", label: "הזמנה נוצרה", description: "מופעל לאחר שהמשתמש יוצר הזמנה חדשה" },
    { key: "product_created", label: "מוצר נוצר", description: "מופעל לאחר שהמשתמש יוצר מוצר חדש" },
    { key: "shopping_list_created", label: "רשימת קניות נוצרה", description: "מופעל לאחר יצירת רשימת קניות" },
    { key: "order_completed", label: "הזמנה הושלמה", description: "מופעל כאשר סטטוס ההזמנה משתנה להושלם" },
    { key: "onboarding_completed", label: "הדרכה הושלמה", description: "מופעל כאשר המשתמש מסיים את ההדרכה" },
    { key: "paywall_opened", label: "מסך תשלום נפתח", description: "מופעל כאשר מסך התשלום מוצג" },
    { key: "app_opened", label: "האפליקציה נפתחה", description: "מופעל בכל הפעלה של האפליקציה" },
    { key: "session_started", label: "סשן התחיל", description: "מופעל כאשר סשן חדש מתחיל" },
  ],
  supported_actions: [
    { key: "open_home", label: "פתח מסך ראשי", description: "ניווט למסך הבית" },
    { key: "open_products", label: "פתח מוצרים", description: "ניווט למסך המוצרים" },
    { key: "open_orders", label: "פתח הזמנות", description: "ניווט למסך ההזמנות" },
    { key: "open_shopping_lists", label: "פתח רשימות קניות", description: "ניווט למסך רשימות הקניות" },
    { key: "open_settings", label: "פתח הגדרות", description: "ניווט למסך ההגדרות" },
    { key: "open_paywall", label: "פתח מסך תשלום", description: "הצגת מסך הרכישה" },
    { key: "open_url", label: "פתח קישור", description: "פתיחת קישור חיצוני בדפדפן" },
    { key: "open_onboarding", label: "פתח הדרכה", description: "הצגה מחדש של תהליך ההדרכה" },
  ],
  supported_placements: [
    { key: "home_banner", label: "באנר מסך ראשי", description: "אזור עליון במסך הבית" },
    { key: "after_order", label: "אחרי הזמנה", description: "מוצג מיד לאחר שמירת הזמנה" },
    { key: "after_product", label: "אחרי מוצר", description: "מוצג לאחר שמירת מוצר" },
    { key: "settings_premium", label: "פרימיום בהגדרות", description: "אזור פרימיום במסך ההגדרות" },
    { key: "export_feature", label: "תכונת ייצוא", description: "מוצג כאשר המשתמש מנסה לייצא" },
  ],
  supported_entitlements: [
    { key: "premium", label: "פרימיום", description: "גישה מלאה לכל התכונות" },
    { key: "pro_annual", label: "פרו שנתי", description: "מנוי שנתי עם כל היכולות" },
  ],
  premium_features: [
    { key: "pdf_export", label: "ייצוא PDF", description: "ייצוא הזמנות ורשימות קניות ל-PDF" },
    { key: "advanced_analytics", label: "אנליטיקס מתקדם", description: "גרפים ודוחות רווחיות" },
    { key: "bulk_operations", label: "פעולות מרובות", description: "עריכה ומחיקה של פריטים מרובים בבת אחת" },
    { key: "custom_branding", label: "מיתוג מותאם", description: "לוגו ועיצוב מותאמים אישית" },
  ],
  condition_fields: [
    { key: "min_orders_created", label: "מינימום הזמנות", description: "מספר ההזמנות שהמשתמש יצר", type: "number" },
    { key: "min_products_created", label: "מינימום מוצרים", description: "מספר המוצרים שהמשתמש יצר", type: "number" },
    { key: "min_shopping_lists_created", label: "מינימום רשימות קניות", description: "מספר רשימות הקניות שנוצרו", type: "number" },
    { key: "min_completed_orders", label: "מינימום הזמנות שהושלמו", description: "מספר ההזמנות עם סטטוס הושלם", type: "number" },
    { key: "min_sessions", label: "מינימום סשנים", description: "מספר הסשנים שהיו למשתמש", type: "number" },
    { key: "min_days_since_signup", label: "מינימום ימים מהרשמה", description: "ימים שעברו מאז ההרשמה", type: "number" },
    { key: "days_since_last_active", label: "ימים מפעילות אחרונה", description: "ימים שעברו מאז הפעילות האחרונה", type: "number" },
    { key: "min_days_since_first_open", label: "מינימום ימים מפתיחה ראשונה", description: "ימים שעברו מאז הפעלה ראשונה", type: "number" },
  ],
};

async function main() {
  console.log("Updating capabilities labels to Hebrew for", APP_KEY, "...");

  const { data, error } = await supabase
    .from("apps")
    .update(hebrewCapabilities)
    .eq("app_key", APP_KEY)
    .select("app_key, display_name")
    .single();

  if (error) {
    console.error("Error updating capabilities:", error.message);
    process.exit(1);
  }

  console.log("✅ Updated:", data.app_key, "-", data.display_name);

  // Verify
  const { data: verify, error: verifyError } = await supabase
    .from("apps")
    .select("supported_events, supported_actions, supported_placements, supported_entitlements, premium_features, condition_fields")
    .eq("app_key", APP_KEY)
    .single();

  if (verifyError) {
    console.error("Verify error:", verifyError.message);
    process.exit(1);
  }

  console.log("\nVerification:");
  console.log("  supported_events[0].label:", verify.supported_events[0].label);
  console.log("  supported_actions[0].label:", verify.supported_actions[0].label);
  console.log("  supported_placements[0].label:", verify.supported_placements[0].label);
  console.log("  supported_entitlements[0].label:", verify.supported_entitlements[0].label);
  console.log("  premium_features[0].label:", verify.premium_features[0].label);
  console.log("  condition_fields[0].label:", verify.condition_fields[0].label);
  console.log("\n✅ All capabilities labels updated to Hebrew!");
}

main().catch(console.error);
