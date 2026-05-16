/**
 * Test script: Verify ExperienceRuleEngine selects the feedback_test_after_order campaign
 * when conditions are met (order_created event, 1+ orders, 1+ sessions, feedback not submitted).
 */
import { ExperienceRuleEngine, type RemoteCampaign, type RuleContext } from "../lib/services/experience-rule-engine";

const testCampaign: RemoteCampaign = {
  id: "test-uuid-001",
  campaign_key: "feedback_test_after_order",
  name: "Feedback Test After Order",
  description: "Test campaign for feedback after order",
  type: "circle_popup",
  title: "מה דעתך?",
  subtitle: null,
  message: "נשמח לשמוע את דעתך על האפליקציה",
  icon: null,
  image_url: null,
  animation_url: null,
  animation_type: null,
  primary_button_text: "שלח פידבק",
  primary_button_action: "navigate",
  primary_button_payload: { screen: "feedback" },
  secondary_button_text: "לא עכשיו",
  secondary_button_action: "dismiss",
  secondary_button_payload: null,
  is_enabled: true,
  is_archived: false,
  priority: 50,
  rollout_percentage: 100,
  environment: null,
  platform: null,
  language: null,
  country: null,
  region: null,
  target_audience: null,
  trigger_event: "order_created",
  allowed_screens: [],
  blocked_screens: [],
  start_at: null,
  end_at: null,
  min_app_version: null,
  max_app_version: null,
  min_days_since_signup: null,
  min_days_since_first_open: null,
  min_sessions: 1,
  min_session_duration_seconds: null,
  min_products_created: null,
  min_orders_created: 1,
  min_shopping_lists_created: null,
  min_completed_orders: null,
  days_since_last_active: null,
  cooldown_days_after_view: null,
  cooldown_days_after_dismiss: 7,
  max_impressions_per_user: 3,
  max_impressions_per_session: null,
  max_impressions_per_day: null,
  max_clicks_per_user: null,
  depends_on_campaign_id: null,
  depends_on_campaign_status: null,
  show_only_if_feedback_not_submitted: true,
  show_only_if_onboarding_not_completed: false,
  show_only_if_not_premium: false,
  show_only_if_premium: false,
  requires_internet: false,
  dismissible: true,
  do_not_show_during_critical_flow: false,
  schema_version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// Context: user just created an order, has 1 session, feedback not submitted
const eligibleCtx: RuleContext = {
  userId: "user-123",
  currentScreen: "orders",
  currentEvent: "order_created",
  isInCriticalFlow: false,
  isOnline: true,
  appVersion: "1.0.0",
  platform: "android",
  language: "he",
  country: "IL",
  region: "",
  environment: "prod",
  firstOpenAt: "2026-01-01T00:00:00Z",
  signupAt: "2026-01-01T00:00:00Z",
  lastActiveAt: new Date().toISOString(),
  sessionsCount: 3,
  productsCreatedCount: 5,
  ordersCreatedCount: 2,
  completedOrdersCount: 0,
  shoppingListsCreatedCount: 1,
  onboardingCompleted: true,
  feedbackSubmitted: false,
  isPremium: false,
  subscriptionStatus: "free",
  campaignStates: {},
  sessionImpressions: {},
};

// Test 1: Should be eligible
const result1 = ExperienceRuleEngine.evaluate(testCampaign, eligibleCtx);
console.log("Test 1 - Eligible (order_created, 1+ orders, feedback not submitted):", JSON.stringify(result1));

// Test 2: Wrong event
const result2 = ExperienceRuleEngine.evaluate(testCampaign, { ...eligibleCtx, currentEvent: "app_open" });
console.log("Test 2 - Wrong event (app_open):", JSON.stringify(result2));

// Test 3: Feedback already submitted
const result3 = ExperienceRuleEngine.evaluate(testCampaign, { ...eligibleCtx, feedbackSubmitted: true });
console.log("Test 3 - Feedback already submitted:", JSON.stringify(result3));

// Test 4: Not enough orders
const result4 = ExperienceRuleEngine.evaluate(testCampaign, { ...eligibleCtx, ordersCreatedCount: 0 });
console.log("Test 4 - Not enough orders:", JSON.stringify(result4));

// Test 5: Not enough sessions
const result5 = ExperienceRuleEngine.evaluate(testCampaign, { ...eligibleCtx, sessionsCount: 0 });
console.log("Test 5 - Not enough sessions:", JSON.stringify(result5));

// Test 6: Max impressions reached
const result6 = ExperienceRuleEngine.evaluate(testCampaign, {
  ...eligibleCtx,
  campaignStates: {
    feedback_test_after_order: {
      impressions_total: 3,
      impressions_today: 0,
      impressions_today_date: null,
      impressions_this_session: 0,
      clicks_total: 0,
      last_viewed_at: null,
      last_clicked_at: null,
      last_dismissed_at: null,
      dismissed_count: 0,
      completed: false,
    },
  },
});
console.log("Test 6 - Max impressions reached (3/3):", JSON.stringify(result6));

// Test 7: Cooldown after dismiss (dismissed 2 days ago, cooldown is 7)
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const result7 = ExperienceRuleEngine.evaluate(testCampaign, {
  ...eligibleCtx,
  campaignStates: {
    feedback_test_after_order: {
      impressions_total: 1,
      impressions_today: 0,
      impressions_today_date: null,
      impressions_this_session: 0,
      clicks_total: 0,
      last_viewed_at: null,
      last_clicked_at: null,
      last_dismissed_at: twoDaysAgo,
      dismissed_count: 1,
      completed: false,
    },
  },
});
console.log("Test 7 - Cooldown after dismiss (2 days ago, need 7):", JSON.stringify(result7));

console.log("\n=== All 7 tests completed ===");
