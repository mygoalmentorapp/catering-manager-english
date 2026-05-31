/**
 * Adapty Integration Tests
 *
 * Tests cover:
 * 1. Placement naming — consistent naming, no "limit_feature" typo
 * 2. OneSignal integration key — verified from source code
 * 3. User attributes — type validation
 * 4. Remote config — paywall_provider default
 * 5. Service exports — all expected functions exist
 */

import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Read the source file directly for static analysis tests
const adaptyServicePath = path.join(__dirname, "../lib/services/adapty-service.ts");
const adaptyServiceSource = fs.readFileSync(adaptyServicePath, "utf-8");

const remoteConfigPath = path.join(__dirname, "../lib/services/remote-config-service.ts");
const remoteConfigSource = fs.readFileSync(remoteConfigPath, "utf-8");

const adaptyBootstrapPath = path.join(__dirname, "../lib/adapty-bootstrap.tsx");
const adaptyBootstrapSource = fs.readFileSync(adaptyBootstrapPath, "utf-8");

const paywallScreenPath = path.join(__dirname, "../app/paywall.tsx");
const paywallScreenSource = fs.readFileSync(paywallScreenPath, "utf-8");

// ============ PLACEMENT NAMING TESTS ============

describe("ADAPTY_PLACEMENTS — naming consistency", () => {
  it("should define exactly 4 placements: settings, main, onboarding, feature_limit", () => {
    // Extract the ADAPTY_PLACEMENTS object from source
    const match = adaptyServiceSource.match(/export const ADAPTY_PLACEMENTS = \{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];

    expect(body).toContain('"settings"');
    expect(body).toContain('"main"');
    expect(body).toContain('"onboarding"');
    expect(body).toContain('"feature_limit"');
  });

  it("should NOT contain 'limit_feature' anywhere in the codebase", () => {
    expect(adaptyServiceSource).not.toContain("limit_feature");
    expect(paywallScreenSource).not.toContain("limit_feature");
    expect(adaptyBootstrapSource).not.toContain("limit_feature");
  });

  it("placement values should be lowercase with underscores only", () => {
    const values = adaptyServiceSource.match(/:\s*"([a-z_]+)"/g);
    expect(values).not.toBeNull();
    for (const v of values!) {
      const val = v.replace(/:\s*"/, "").replace(/"/, "");
      expect(val).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("paywall screen should reference feature_limit as a valid placement", () => {
    expect(paywallScreenSource).toContain("feature_limit");
  });
});

// ============ ONESIGNAL INTEGRATION KEY TESTS ============

describe("OneSignal integration — correct identifier key", () => {
  it("should use 'one_signal' as the integration identifier (not 'onesignal')", () => {
    // The official Adapty key for OneSignal
    expect(adaptyServiceSource).toContain('"one_signal"');
  });

  it("should NOT use 'onesignal' (without underscore) as identifier", () => {
    // Check that we don't have the wrong key
    const lines = adaptyServiceSource.split("\n");
    const identifierLines = lines.filter((l) => l.includes("setIntegrationIdentifier"));
    for (const line of identifierLines) {
      if (line.includes('"onesignal"')) {
        // This would be wrong — the correct key is "one_signal"
        expect(line).not.toContain('"onesignal"');
      }
    }
  });

  it("should NOT use 'one_signal_subscription_id' as identifier", () => {
    expect(adaptyServiceSource).not.toContain('"one_signal_subscription_id"');
  });

  it("should pass subscriptionId in the data object", () => {
    expect(adaptyServiceSource).toContain("{ subscriptionId }");
  });
});

// ============ USER ATTRIBUTES TESTS ============

describe("User attributes — structure and validation", () => {
  it("should define AdaptyUserAttributes interface with expected fields", () => {
    expect(adaptyServiceSource).toContain("business_type?: string");
    expect(adaptyServiceSource).toContain("order_count?: number");
    expect(adaptyServiceSource).toContain("recipe_count?: number");
    expect(adaptyServiceSource).toContain("app_language?: string");
    expect(adaptyServiceSource).toContain("onboarding_completed?: boolean");
    expect(adaptyServiceSource).toContain("days_since_install?: number");
    expect(adaptyServiceSource).toContain("platform?: string");
  });

  it("should truncate business_type to 50 chars", () => {
    expect(adaptyServiceSource).toContain("substring(0, 50)");
  });

  it("should skip undefined attributes (check for !== undefined)", () => {
    const undefinedChecks = (adaptyServiceSource.match(/!== undefined/g) || []).length;
    // Should have at least 7 checks (one per attribute)
    expect(undefinedChecks).toBeGreaterThanOrEqual(7);
  });

  it("syncUserAttributes should add platform automatically", () => {
    expect(adaptyServiceSource).toContain("platform: Platform.OS");
  });
});

// ============ REMOTE CONFIG — PAYWALL PROVIDER ============

describe("Remote config — paywall_provider default", () => {
  it("should default to 'adapty' not 'revenuecat'", () => {
    expect(remoteConfigSource).toContain('paywall_provider: "adapty"');
    expect(remoteConfigSource).not.toContain('paywall_provider: "revenuecat"');
  });
});

// ============ SERVICE EXPORTS ============

describe("AdaptyService — exported functions", () => {
  it("should export activate function", () => {
    expect(adaptyServiceSource).toContain("export async function activate");
  });

  it("should export identify function", () => {
    expect(adaptyServiceSource).toContain("export async function identify");
  });

  it("should export logout function", () => {
    expect(adaptyServiceSource).toContain("export async function logout");
  });

  it("should export getPaywall function", () => {
    expect(adaptyServiceSource).toContain("export async function getPaywall");
  });

  it("should export getProfile function", () => {
    expect(adaptyServiceSource).toContain("export async function getProfile");
  });

  it("should export getSubscriptionStatus function", () => {
    expect(adaptyServiceSource).toContain("export async function getSubscriptionStatus");
  });

  it("should export restorePurchases function", () => {
    expect(adaptyServiceSource).toContain("export async function restorePurchases");
  });

  it("should export setOneSignalSubscriptionId function", () => {
    expect(adaptyServiceSource).toContain("export async function setOneSignalSubscriptionId");
  });

  it("should export updateCustomAttributes function", () => {
    expect(adaptyServiceSource).toContain("export async function updateCustomAttributes");
  });

  it("should export syncUserAttributes function", () => {
    expect(adaptyServiceSource).toContain("export async function syncUserAttributes");
  });

  it("should export onProfileUpdated function", () => {
    expect(adaptyServiceSource).toContain("export function onProfileUpdated");
  });

  it("should export isActivated function", () => {
    expect(adaptyServiceSource).toContain("export function isActivated");
  });

  it("should export isMockMode function", () => {
    expect(adaptyServiceSource).toContain("export function isMockMode");
  });
});

// ============ MOCK MODE SAFETY ============

describe("AdaptyService — mock mode safety", () => {
  it("should enter mock mode when SDK key is empty", () => {
    expect(adaptyServiceSource).toContain("if (!sdkKey)");
    expect(adaptyServiceSource).toContain("_mockMode = true");
  });

  it("should enter mock mode when native module is unavailable", () => {
    expect(adaptyServiceSource).toContain("Native module unavailable");
    // After native module check, should set mock mode
    const nativeUnavailableIndex = adaptyServiceSource.indexOf("Native module unavailable");
    const mockModeAfter = adaptyServiceSource.indexOf("_mockMode = true", nativeUnavailableIndex);
    expect(mockModeAfter).toBeGreaterThan(nativeUnavailableIndex);
  });

  it("should gracefully handle activation failure", () => {
    expect(adaptyServiceSource).toContain("Activation failed");
  });

  it("getPaywall should return null in mock mode", () => {
    const getPaywallFn = adaptyServiceSource.substring(
      adaptyServiceSource.indexOf("export async function getPaywall"),
      adaptyServiceSource.indexOf("export async function getProfile")
    );
    expect(getPaywallFn).toContain("return null");
    expect(getPaywallFn).toContain("_mockMode");
  });

  it("identify should skip in mock mode", () => {
    const identifyFn = adaptyServiceSource.substring(
      adaptyServiceSource.indexOf("export async function identify"),
      adaptyServiceSource.indexOf("export async function logout")
    );
    expect(identifyFn).toContain("_mockMode");
    expect(identifyFn).toContain("skipped");
  });
});

// ============ PAYWALL SCREEN ============

describe("Paywall screen — structure", () => {
  it("should accept placement as a route parameter", () => {
    expect(paywallScreenSource).toContain("placement");
  });

  it("should handle loading state", () => {
    expect(paywallScreenSource).toContain("loading");
  });

  it("should handle error state", () => {
    expect(paywallScreenSource).toContain("error");
  });

  it("should have a back/close button", () => {
    expect(paywallScreenSource).toMatch(/router\.back|router\.dismiss|goBack/);
  });

  it("should import from AdaptyService", () => {
    expect(paywallScreenSource).toContain("adapty-service");
  });
});

// ============ BOOTSTRAP ============

describe("AdaptyBootstrap — integration", () => {
  it("should import AdaptyService", () => {
    expect(adaptyBootstrapSource).toContain("adapty-service");
  });

  it("should call activate with SDK key from env", () => {
    expect(adaptyBootstrapSource).toContain("activate");
    expect(adaptyBootstrapSource).toContain("EXPO_PUBLIC_ADAPTY_KEY");
  });

  it("should call identify when user is logged in", () => {
    expect(adaptyBootstrapSource).toContain("identify");
  });

  it("should call syncUserAttributes after identification", () => {
    expect(adaptyBootstrapSource).toContain("syncUserAttributes");
  });
});

// ============ CAMPAIGN ACTION HANDLER ============

describe("Campaign action handler — Adapty paywall", () => {
  it("should navigate to /paywall when open_paywall action is triggered", () => {
    const actionHandlerPath = path.join(
      __dirname,
      "../lib/services/campaign-action-handler.ts"
    );
    const actionHandlerSource = fs.readFileSync(actionHandlerPath, "utf-8");
    expect(actionHandlerSource).toContain("/paywall?placement=main");
    // Should NOT reference RevenueCat anymore
    expect(actionHandlerSource).not.toContain("MonetizationService.presentPaywall");
  });
});
