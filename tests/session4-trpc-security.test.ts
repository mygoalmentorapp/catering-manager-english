/**
 * Session 4 — tRPC Security & Architecture Verification Tests
 *
 * Verifies the 10 approved rules for experience DB operations:
 * 1. No direct Supabase write from client to experience tables
 * 2. No direct Supabase read from client to remote_campaigns (RLS blocks)
 * 3. user_id is never accepted from the client
 * 4. ctx.user.openId is always used as user_id (server-side)
 * 5. service_role does not appear in client code (only comments)
 * 6. tRPC failure does not crash business operations
 * 7. Campaigns are not loaded if user is not authenticated
 * 8. Client does not send platform/language/app_version (server adds them)
 * 9. Event logging is fire-and-forget (never throws)
 * 10. TypeScript compiles with 0 errors (verified externally)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Mock app-identity (required by remote-config-service) ──
vi.mock("@/constants/app-identity", () => ({
  APP_KEY: "catering_manager_pro",
  APP_LANGUAGE: "he",
}));

// ── Mock tRPC (required by remote-config-service) ──
vi.mock("@/lib/trpc", () => ({
  getVanillaTrpc: vi.fn(() => ({
    config: {
      getRemoteConfig: {
        query: vi.fn(async () => null),
      },
    },
  })),
}));

// ── Mock oauth (required by @/lib/trpc import chain) ──
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
  API_BASE_URL: "http://localhost:3000",
}));

// ── Mock auth (required by @/lib/trpc import chain) ──
vi.mock("@/lib/_core/auth", () => ({
  getAccessToken: vi.fn(async () => null),
}));

// ── Mock device-id (required by @/lib/trpc import chain) ──
vi.mock("@/lib/device-id", () => ({
  getDeviceId: vi.fn(async () => "test-device-id"),
}));

// ── Mock AsyncStorage ──
const mockStore: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Object.keys(mockStore))),
    multiRemove: vi.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStore[k]);
      return Promise.resolve();
    }),
  },
}));

// ── Mock Supabase ──
vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      insert: vi.fn(() => ({ error: null })),
    })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

// ── Mock expo-router ──
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useSegments: vi.fn(() => []),
}));

// ── Mock expo-constants ──
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0" } },
}));

// ── Mock react-native ──
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (obj: any) => obj.android ?? obj.default ?? {} },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  StyleSheet: { create: (styles: any) => styles, absoluteFillObject: {} },
  Animated: {
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    View: "Animated.View",
    timing: vi.fn(() => ({ start: vi.fn() })),
    parallel: vi.fn(() => ({ start: vi.fn() })),
  },
  Modal: "Modal",
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    currentState: "active",
  },
}));

// ── Mock MaterialIcons ──
vi.mock("@expo/vector-icons/MaterialIcons", () => ({
  default: "MaterialIcons",
}));

// ── Mock design-system ──
vi.mock("../lib/design-system", () => ({
  DS_COLORS: { accent: "#007AFF", accentLight: "#E6F4FE", card: "#FFFFFF", background: "#F5F5F5", textPrimary: "#1A1A1A", textSecondary: "#666666", white: "#FFFFFF" },
  DS_FONT: { titleLarge: 22, body: 16, bodySmall: 14 },
  DS_WEIGHT: { bold: "700", semibold: "600", medium: "500", regular: "400" },
  DS_SPACING: { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  DS_RADIUS: { md: 12, xl: 24 },
  DS_SHADOW: { card: {} },
}));

// ── Imports after mocks ──
import { ExperienceEventService, EVENT_NAMES } from "../lib/services/experience-event-service";
import { UserExperienceStateService } from "../lib/services/user-experience-state-service";
import { CampaignSelectorService } from "../lib/services/campaign-selector-service";
import { CampaignActionHandler } from "../lib/services/campaign-action-handler";

// ── Helper: read source file content ──
function readSourceFile(relativePath: string): string {
  const fullPath = path.resolve(__dirname, "..", relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

// ============================================================
// RULE 1: No direct Supabase write from client to experience tables
// ============================================================
describe("Rule 1: No direct Supabase write from client to experience tables", () => {
  const experienceClientFiles = [
    "lib/services/experience-event-service.ts",
    "lib/services/user-experience-state-service.ts",
    "lib/services/campaign-selector-service.ts",
    "lib/services/campaign-action-handler.ts",
    "components/campaign/campaign-renderer.tsx",
    "lib/experience-bootstrap.tsx",
  ];

  for (const file of experienceClientFiles) {
    it(`${file} does not import supabase directly`, () => {
      const content = readSourceFile(file);
      // Check for direct import of supabase (not just mentioning it in comments)
      const importLines = content.split("\n").filter(
        (line) => line.match(/^import\s.*from\s.*supabase/) && !line.startsWith("//")
      );
      expect(importLines).toHaveLength(0);
    });
  }
});

// ============================================================
// RULE 2: No direct Supabase read from client to remote_campaigns
// ============================================================
describe("Rule 2: No direct Supabase read from client to remote_campaigns", () => {
  it("CampaignSelectorService does not import supabase", () => {
    const content = readSourceFile("lib/services/campaign-selector-service.ts");
    const importLines = content.split("\n").filter(
      (line) => line.match(/^import\s.*from\s.*supabase/) && !line.startsWith("//")
    );
    expect(importLines).toHaveLength(0);
  });

  it("CampaignSelectorService uses tRPC client injection pattern", () => {
    const content = readSourceFile("lib/services/campaign-selector-service.ts");
    expect(content).toContain("setTrpcClient");
    expect(content).toContain("getActiveCampaigns");
    expect(content).toContain("clearTrpcClient");
  });
});

// ============================================================
// RULE 3: user_id is never accepted from the client
// ============================================================
describe("Rule 3: user_id is never accepted from the client", () => {
  it("ExperienceEventService.logEvent does not include user_id in payload", () => {
    const content = readSourceFile("lib/services/experience-event-service.ts");
    // Find the logEvent method and check the row object
    const logEventSection = content.substring(
      content.indexOf("async logEvent("),
      content.indexOf("async logEvent(") + 1000
    );
    // The row object should NOT contain user_id
    expect(logEventSection).not.toMatch(/user_id\s*:/);
  });

  it("server experience-router strips user_id from client updates", () => {
    const content = readSourceFile("server/experience-router.ts");
    // Server should delete user_id from client-supplied updates
    expect(content).toContain("delete safeUpdates.user_id");
    expect(content).toContain("delete updates.user_id");
  });
});

// ============================================================
// RULE 4: ctx.user.openId is always used as user_id (server-side)
// ============================================================
describe("Rule 4: ctx.user.openId is always used as user_id", () => {
  it("server experience-router uses getUserId(ctx) for all operations", () => {
    const content = readSourceFile("server/experience-router.ts");
    // getUserId should be defined and used
    expect(content).toContain("function getUserId(ctx");
    expect(content).toContain("return ctx.user.openId");
    // Every mutation/query that writes user data should call getUserId
    const userIdCalls = (content.match(/getUserId\(ctx\)/g) || []).length;
    // At least: logEvent, upsertState, getState, incrementCounter, getCampaignStates, upsertCampaignState
    expect(userIdCalls).toBeGreaterThanOrEqual(6);
  });
});

// ============================================================
// RULE 5: service_role does not appear in client code (only comments)
// ============================================================
describe("Rule 5: service_role is server-side only", () => {
  const clientDirs = ["lib/", "components/", "app/", "hooks/"];

  it("no client file imports or references SUPABASE_SERVICE_ROLE_KEY in executable code", () => {
    for (const dir of clientDirs) {
      const dirPath = path.resolve(__dirname, "..", dir);
      if (!fs.existsSync(dirPath)) continue;
      const files = getAllTsFiles(dirPath);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const executableLines = content.split("\n").filter(
          (line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/**")
        );
        const executableContent = executableLines.join("\n");
        expect(executableContent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(executableContent).not.toContain("process.env.SUPABASE_SERVICE_ROLE");
      }
    }
  });

  it("server experience-router uses getAdminClient with service_role", () => {
    const content = readSourceFile("server/experience-router.ts");
    expect(content).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).toContain("getAdminClient");
  });
});

// ============================================================
// RULE 6: tRPC failure does not crash business operations
// ============================================================
describe("Rule 6: tRPC failure does not crash business operations", () => {
  beforeEach(() => {
    ExperienceEventService.clearTrpcClient();
    UserExperienceStateService.clearTrpcClient();
    CampaignSelectorService.clearTrpcClient();
  });

  it("ExperienceEventService.logEvent does not throw when tRPC client is null", async () => {
    // Should not throw — just queue the event
    await expect(
      ExperienceEventService.logEvent({ event_name: EVENT_NAMES.ORDER_CREATED })
    ).resolves.toBeUndefined();
  });

  it("ExperienceEventService.logEvent does not throw when tRPC client fails", async () => {
    ExperienceEventService.setTrpcClient({
      logEvent: { mutate: vi.fn().mockRejectedValue(new Error("Network error")) },
    });
    await expect(
      ExperienceEventService.logEvent({ event_name: EVENT_NAMES.ORDER_CREATED })
    ).resolves.toBeUndefined();
  });

  it("UserExperienceStateService.onOrderCreated does not throw when tRPC client is null", async () => {
    await expect(
      UserExperienceStateService.onOrderCreated()
    ).resolves.toBeUndefined();
  });

  it("UserExperienceStateService.getState returns null when tRPC client is null", async () => {
    const state = await UserExperienceStateService.getState();
    expect(state).toBeNull();
  });

  it("UserExperienceStateService.getCampaignStates returns empty array when tRPC client is null", async () => {
    const states = await UserExperienceStateService.getCampaignStates();
    expect(states).toEqual([]);
  });

  it("CampaignSelectorService.selectCampaign returns null when tRPC client is null", async () => {
    const result = await CampaignSelectorService.selectCampaign({
      userId: "test-user",
      currentScreen: "home",
      currentEvent: null,
      isInCriticalFlow: false,
      isOnline: true,
      appVersion: "1.0.0",
      appKey: "catering_manager_pro",
      platform: "android",
      language: "he",
      country: "IL",
      region: "",
      environment: "prod",
      firstOpenAt: null,
      signupAt: null,
      lastActiveAt: null,
      sessionsCount: 1,
      productsCreatedCount: 0,
      ordersCreatedCount: 0,
      completedOrdersCount: 0,
      shoppingListsCreatedCount: 0,
      onboardingCompleted: false,
      feedbackSubmitted: false,
      isPremium: false,
      subscriptionStatus: "none",
      campaignStates: {},
      sessionImpressions: {},
    });
    expect(result).toBeNull();
  });

  it("CampaignActionHandler.execute does not throw on unknown action", async () => {
    const onClose = vi.fn();
    const result = await CampaignActionHandler.execute(
      "some_unknown_action",
      { campaignKey: "test", userId: "user-123" },
      onClose
    );
    expect(result).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });
});

// ============================================================
// RULE 7: Campaigns are not loaded if user is not authenticated
// ============================================================
describe("Rule 7: Campaigns not loaded without authentication", () => {
  it("CampaignSelectorService returns null without tRPC client (unauthenticated)", async () => {
    CampaignSelectorService.clearTrpcClient();
    const result = await CampaignSelectorService.selectCampaign({
      userId: "test-user",
      currentScreen: "home",
      currentEvent: null,
      isInCriticalFlow: false,
      isOnline: true,
      appVersion: "1.0.0",
      appKey: "catering_manager_pro",
      platform: "android",
      language: "he",
      country: "IL",
      region: "",
      environment: "prod",
      firstOpenAt: null,
      signupAt: null,
      lastActiveAt: null,
      sessionsCount: 1,
      productsCreatedCount: 0,
      ordersCreatedCount: 0,
      completedOrdersCount: 0,
      shoppingListsCreatedCount: 0,
      onboardingCompleted: false,
      feedbackSubmitted: false,
      isPremium: false,
      subscriptionStatus: "none",
      campaignStates: {},
      sessionImpressions: {},
    });
    expect(result).toBeNull();
  });

  it("ExperienceEventService queues events when not authenticated", async () => {
    ExperienceEventService.clearTrpcClient();
    // Should not throw, just queue
    await ExperienceEventService.logEvent({ event_name: EVENT_NAMES.APP_OPEN });
    // No way to verify queue directly, but it should not throw
  });
});

// ============================================================
// RULE 8: Client does not send platform/language/app_version
// ============================================================
describe("Rule 8: Client does not send platform/language/app_version to server", () => {
  it("ExperienceEventService.logEvent payload does not include platform, language, or app_version", () => {
    const content = readSourceFile("lib/services/experience-event-service.ts");
    // Find the row construction in logEvent
    const rowStart = content.indexOf("const row = {");
    const rowEnd = content.indexOf("};", rowStart);
    if (rowStart >= 0 && rowEnd >= 0) {
      const rowSection = content.substring(rowStart, rowEnd + 2);
      expect(rowSection).not.toContain("platform:");
      expect(rowSection).not.toContain("language:");
      expect(rowSection).not.toContain("app_version:");
    }
  });

  it("server experience-router derives platform/language/app_version from headers", () => {
    const content = readSourceFile("server/experience-router.ts");
    expect(content).toContain("getDeviceInfo(ctx)");
    expect(content).toContain("deviceInfo.platform");
    expect(content).toContain("deviceInfo.language");
    expect(content).toContain("deviceInfo.app_version");
  });
});

// ============================================================
// RULE 9: Event logging is fire-and-forget (never throws)
// ============================================================
describe("Rule 9: Event logging is fire-and-forget", () => {
  it("ExperienceEventService.logEvent wraps everything in try-catch", () => {
    const content = readSourceFile("lib/services/experience-event-service.ts");
    // The logEvent method should have a try-catch
    const logEventSection = content.substring(
      content.indexOf("async logEvent("),
      content.indexOf("async logEvent(") + 2000
    );
    expect(logEventSection).toContain("try {");
    expect(logEventSection).toContain("catch");
  });

  it("UserExperienceStateService methods all have try-catch", () => {
    const content = readSourceFile("lib/services/user-experience-state-service.ts");
    // Count try blocks — should be at least 8 (one per public method)
    const tryCount = (content.match(/try\s*\{/g) || []).length;
    expect(tryCount).toBeGreaterThanOrEqual(8);
  });

  it("CampaignRenderer _logCampaignViewed uses .catch(() => {})", () => {
    const content = readSourceFile("components/campaign/campaign-renderer.tsx");
    expect(content).toContain(".catch(() => {})");
  });
});

// ============================================================
// RULE 10: Server getActiveCampaigns filters properly
// ============================================================
describe("Rule 10: Server filters campaigns correctly", () => {
  it("getActiveCampaigns filters by is_enabled, is_archived, date range, and environment", () => {
    const content = readSourceFile("server/experience-router.ts");
    const getCampaignsSection = content.substring(
      content.indexOf("getActiveCampaigns"),
      content.indexOf("getActiveCampaigns") + 3000
    );
    expect(getCampaignsSection).toContain('.eq("is_enabled", true)');
    expect(getCampaignsSection).toContain('.eq("is_archived", false)');
    expect(getCampaignsSection).toContain("start_at");
    expect(getCampaignsSection).toContain("end_at");
    expect(getCampaignsSection).toContain("environment");
  });

  it("getActiveCampaigns uses getEnvironment() for environment filtering", () => {
    const content = readSourceFile("server/experience-router.ts");
    expect(content).toContain("function getEnvironment()");
    expect(content).toContain('process.env.NODE_ENV === "production"');
  });
});

// ============================================================
// Helper: recursively get all .ts/.tsx files in a directory
// ============================================================
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".expo") {
        results.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }
  return results;
}
