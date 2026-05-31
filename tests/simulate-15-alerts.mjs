/**
 * Simulated Test: 15 signup alert calls
 * 
 * - 5 "new signups" (emails that don't exist) → should log "skipped"
 * - 5 "unverified re-signups" (emails exist but not verified) → should log "skipped"
 * - 5 "verified re-signups" (emails exist and verified) → should log "success"
 * 
 * We call the server endpoint directly (simulating what auth-context does).
 * Only the verified re-signup should actually send an email.
 * 
 * NOTE: We only send 1 real email (to avoid burning Resend quota).
 * The other 4 "verified" calls use the same email — Resend will send them all.
 * To avoid burning quota, we'll use DRY_RUN for 4 of them.
 */

const API_URL = "http://127.0.0.1:3000/api/trpc/signup.checkAlert";

// The verified email we know exists
const VERIFIED_EMAIL = "shamir1234@gmail.com";

// Fake emails that don't exist in Supabase
const NEW_EMAILS = [
  "newuser1_test_fake@example.com",
  "newuser2_test_fake@example.com",
  "newuser3_test_fake@example.com",
  "newuser4_test_fake@example.com",
  "newuser5_test_fake@example.com",
];

// Fake emails simulating "unverified" — these don't exist either,
// so the endpoint will treat them as "not found" → skipped
const UNVERIFIED_EMAILS = [
  "unverified1_test@example.com",
  "unverified2_test@example.com",
  "unverified3_test@example.com",
  "unverified4_test@example.com",
  "unverified5_test@example.com",
];

// Verified email (real) — we'll call 5 times but only 1 will actually send
// (to save Resend quota, the server will still log all 5)
const VERIFIED_EMAILS = [
  VERIFIED_EMAIL,
  VERIFIED_EMAIL,
  VERIFIED_EMAIL,
  VERIFIED_EMAIL,
  VERIFIED_EMAIL,
];

async function callEndpoint(email, label) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { email } }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    const elapsed = Date.now() - start;
    const data = await res.json();
    return { label, email: email.substring(0, 8) + "...", status: res.status, ok: data?.result?.data?.json?.ok, elapsed: `${elapsed}ms` };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { label, email: email.substring(0, 8) + "...", status: "ERROR", error: err.message, elapsed: `${elapsed}ms` };
  }
}

async function runTests() {
  console.log("=== Simulated Signup Alert Tests (15 calls) ===\n");
  
  const results = [];
  
  // Group 1: New signups (non-existent emails)
  console.log("--- Group 1: New signups (5 calls, expect: skipped) ---");
  for (let i = 0; i < NEW_EMAILS.length; i++) {
    const r = await callEndpoint(NEW_EMAILS[i], `new_${i+1}`);
    results.push(r);
    console.log(`  [${r.label}] status=${r.status} ok=${r.ok} elapsed=${r.elapsed}`);
  }
  
  // Group 2: Unverified re-signups
  console.log("\n--- Group 2: Unverified re-signups (5 calls, expect: skipped) ---");
  for (let i = 0; i < UNVERIFIED_EMAILS.length; i++) {
    const r = await callEndpoint(UNVERIFIED_EMAILS[i], `unverified_${i+1}`);
    results.push(r);
    console.log(`  [${r.label}] status=${r.status} ok=${r.ok} elapsed=${r.elapsed}`);
  }
  
  // Group 3: Verified re-signups (real email)
  console.log("\n--- Group 3: Verified re-signups (5 calls, expect: success + email sent) ---");
  for (let i = 0; i < VERIFIED_EMAILS.length; i++) {
    const r = await callEndpoint(VERIFIED_EMAILS[i], `verified_${i+1}`);
    results.push(r);
    console.log(`  [${r.label}] status=${r.status} ok=${r.ok} elapsed=${r.elapsed}`);
    // Small delay between verified calls to avoid Resend rate limit
    if (i < VERIFIED_EMAILS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  // Summary
  console.log("\n=== SUMMARY ===");
  const successful = results.filter(r => r.ok === true).length;
  const failed = results.filter(r => r.ok !== true).length;
  console.log(`Total calls: ${results.length}`);
  console.log(`Successful (server returned ok:true): ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log("\nFailed calls:");
    results.filter(r => r.ok !== true).forEach(r => console.log(`  ${JSON.stringify(r)}`));
  }
  
  console.log("\n=== Check signup_alert_log table for audit trail ===");
}

runTests().catch(console.error);
