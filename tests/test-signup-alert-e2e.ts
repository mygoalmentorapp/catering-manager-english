/**
 * E2E test: manually test the signup alert flow.
 * Run with: npx tsx tests/test-signup-alert-e2e.ts <email>
 */
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx tests/test-signup-alert-e2e.ts <email>");
    process.exit(1);
  }

  console.log(`\n=== Testing signup alert for: ${email} ===\n`);

  // Step 1: Check env vars
  console.log("1. Checking env vars...");
  console.log(`   SUPABASE_URL: ${SUPABASE_URL ? "✓ set" : "✗ MISSING"}`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? "✓ set (" + SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) + "...)" : "✗ MISSING"}`);
  console.log(`   RESEND_API_KEY: ${RESEND_API_KEY ? "✓ set (" + RESEND_API_KEY.substring(0, 10) + "...)" : "✗ MISSING"}`);

  // Step 2: Query Supabase for the user
  console.log("\n2. Querying Supabase admin API for users...");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  console.log(`   Response status: ${res.status}`);
  
  if (!res.ok) {
    const text = await res.text();
    console.error(`   ERROR: ${text}`);
    return;
  }

  const data = await res.json();
  const users = data.users || [];
  console.log(`   Total users found: ${users.length}`);

  // Step 3: Find the specific user
  const user = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    console.log(`\n3. User found:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   email_confirmed_at: ${user.email_confirmed_at || "NULL (not verified)"}`);
    console.log(`   created_at: ${user.created_at}`);
    console.log(`   Verified: ${!!user.email_confirmed_at}`);
  } else {
    console.log(`\n3. User NOT found with email: ${email}`);
    console.log(`   Available emails: ${users.map((u: any) => u.email).join(", ")}`);
    return;
  }

  if (!user.email_confirmed_at) {
    console.log("\n   ⚠️  User is NOT verified — alert email would NOT be sent.");
    return;
  }

  // Step 4: Try sending email via Resend
  console.log("\n4. Sending test alert email via Resend...");
  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);

  const result = await resend.emails.send({
    from: `ניהול קייטרינג פרו <support@cateringmanager.app>`,
    to: email,
    subject: "ניסיון הרשמה לחשבון הקיים שלך (בדיקה)",
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>בדיקת שליחת מייל התראה</h2>
      <p>אם אתה רואה את ההודעה הזו, המייל נשלח בהצלחה!</p>
    </div>`,
  });

  if (result.error) {
    console.error(`   ✗ Resend error:`, result.error);
  } else {
    console.log(`   ✓ Email sent successfully! ID: ${result.data?.id}`);
  }

  console.log("\n=== Done ===\n");
}

main().catch(console.error);
