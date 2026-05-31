/**
 * RemoteConfigService — fetches and caches the `remote_config` row
 * matching APP_KEY + APP_LANGUAGE via the server tRPC endpoint.
 * Acts as the **master switch** layer.
 *
 * Data flow: Client → tRPC (config.getRemoteConfig) → Server (service_role) → Supabase
 *
 * Why tRPC instead of direct Supabase?
 * The remote_config table has RLS enabled with no anon SELECT policy.
 * The server reads via service_role (bypasses RLS) and returns the data.
 *
 * Safe defaults: every feature is OFF if the server is unreachable,
 * no matching row exists, config is corrupt, or schema_version is unsupported.
 */
import { CacheManager } from "./cache-manager";
import { SUPPORTED_SCHEMA_VERSION, devLog, warnLog } from "./environment";
import { APP_KEY, APP_LANGUAGE } from "@/constants/app-identity";
import { getVanillaTrpc } from "@/lib/trpc";

// ── Types ──

export interface RemoteConfig {
  schema_version: number;
  paywall_enabled: boolean;
  revenuecat_enabled: boolean;
  remote_campaigns_enabled: boolean;
  feedback_popup_enabled: boolean;
  global_message_enabled: boolean;
  external_urls_enabled: boolean;
  // Cache TTL — server-controlled (minutes)
  cache_ttl_minutes: number;
  // Force Update fields
  force_update_enabled: boolean;
  minimum_supported_version_code: number;
  latest_version_code: number;
  force_update_title: string;
  force_update_message: string;
  force_update_button_text: string;
  google_play_url: string;
  // Maintenance Mode fields
  maintenance_enabled: boolean;
  maintenance_title: string;
  maintenance_message: string;
  maintenance_action_text: string;
  // Global Message fields (migrated from legacy app_config)
  global_message_title: string;
  global_message_text: string;
  global_message_type: string;
  global_message_action: string;
  global_message_action_text: string;
  global_message_dismissible: boolean;
  // Session timeout (minutes)
  session_timeout_minutes: number;
  // Dynamic Onboarding
  dynamic_onboarding_enabled: boolean;
  // Paywall / Adapty
  default_entitlement_id: string;
  default_offering_id: string;
  paywall_provider: string;
}

// ── Safe defaults (everything OFF) ──

export const SAFE_DEFAULTS: Readonly<RemoteConfig> = Object.freeze({
  schema_version: SUPPORTED_SCHEMA_VERSION,
  paywall_enabled: false,
  revenuecat_enabled: false,
  remote_campaigns_enabled: false,
  feedback_popup_enabled: false,
  global_message_enabled: false,
  external_urls_enabled: false,
  // Cache TTL default: 30 minutes (used when server value unavailable)
  cache_ttl_minutes: 30,
  // Force Update safe defaults — never block users if config unavailable
  force_update_enabled: false,
  minimum_supported_version_code: 0,
  latest_version_code: 0,
  force_update_title: "",
  force_update_message: "",
  force_update_button_text: "",
  google_play_url: "",
  // Maintenance Mode safe defaults — never block users if config unavailable
  maintenance_enabled: false,
  maintenance_title: "",
  maintenance_message: "",
  maintenance_action_text: "",
  // Global Message safe defaults — no banner shown
  global_message_title: "",
  global_message_text: "",
  global_message_type: "info",
  global_message_action: "",
  global_message_action_text: "",
  global_message_dismissible: true,
  // Session timeout default: 30 minutes
  session_timeout_minutes: 30,
  // Dynamic Onboarding default: disabled
  dynamic_onboarding_enabled: false,
  // Paywall / Adapty defaults: disabled, no IDs
  default_entitlement_id: "premium_access",
  default_offering_id: "",
  paywall_provider: "adapty",
});

const CACHE_KEY = "remote_config";

/**
 * Map raw data (from tRPC/Supabase) to a typed RemoteConfig object.
 * Uses nullish coalescing to ensure every field has a safe value.
 */
function mapToRemoteConfig(data: Record<string, any>): RemoteConfig {
  return {
    schema_version: data.schema_version ?? SUPPORTED_SCHEMA_VERSION,
    paywall_enabled: data.paywall_enabled ?? false,
    revenuecat_enabled: data.revenuecat_enabled ?? false,
    remote_campaigns_enabled: data.remote_campaigns_enabled ?? false,
    feedback_popup_enabled: data.feedback_popup_enabled ?? false,
    global_message_enabled: data.global_message_enabled ?? false,
    external_urls_enabled: data.external_urls_enabled ?? false,
    cache_ttl_minutes: data.cache_ttl_minutes ?? 30,
    force_update_enabled: data.force_update_enabled ?? false,
    minimum_supported_version_code: data.minimum_supported_version_code ?? 0,
    latest_version_code: data.latest_version_code ?? 0,
    force_update_title: data.force_update_title ?? "",
    force_update_message: data.force_update_message ?? "",
    force_update_button_text: data.force_update_button_text ?? "",
    google_play_url: data.google_play_url ?? "",
    maintenance_enabled: data.maintenance_enabled ?? false,
    maintenance_title: data.maintenance_title ?? "",
    maintenance_message: data.maintenance_message ?? "",
    maintenance_action_text: data.maintenance_action_text ?? "",
    global_message_title: data.global_message_title ?? "",
    global_message_text: data.global_message_text ?? "",
    global_message_type: data.global_message_type ?? "info",
    global_message_action: data.global_message_action ?? "",
    global_message_action_text: data.global_message_action_text ?? "",
    global_message_dismissible: data.global_message_dismissible ?? true,
    session_timeout_minutes: data.session_timeout_minutes ?? 30,
    dynamic_onboarding_enabled: data.dynamic_onboarding_enabled ?? false,
    default_entitlement_id: data.default_entitlement_id ?? "premium_access",
    default_offering_id: data.default_offering_id ?? "",
    paywall_provider: data.paywall_provider ?? "adapty",
  };
}

export const RemoteConfigService = {
  /**
   * Fetch remote config with cache-first strategy.
   * 1. Try cache → return if valid
   * 2. Try server (tRPC) → cache + return if valid
   * 3. Fallback to safe defaults
   */
  async getConfig(): Promise<RemoteConfig> {
    // 1. Try cache
    const cached = await CacheManager.get<RemoteConfig>(CACHE_KEY);
    if (cached) {
      if (cached.schema_version > SUPPORTED_SCHEMA_VERSION) {
        devLog("RemoteConfig", "Cached config has unsupported schema_version, using safe defaults");
        return { ...SAFE_DEFAULTS };
      }
      devLog("RemoteConfig", "Using cached config");
      return cached;
    }

    // 2. Try server via tRPC
    try {
      const trpc = getVanillaTrpc();
      // No input params needed — server reads app_key + app_language from request headers
      // (x-app-key, x-app-language are set by the tRPC client automatically)
      const data = await trpc.config.getRemoteConfig.query();

      if (!data) {
        warnLog("RemoteConfig", "Server returned null (no matching row)");
        return { ...SAFE_DEFAULTS };
      }

      const config = mapToRemoteConfig(data);

      if (config.schema_version > SUPPORTED_SCHEMA_VERSION) {
        devLog("RemoteConfig", `Unsupported schema_version ${config.schema_version}, using safe defaults`);
        return { ...SAFE_DEFAULTS };
      }

      // Use server-controlled TTL (convert minutes to ms), fallback to env default
      const ttlMs = (config.cache_ttl_minutes ?? 30) * 60 * 1000;
      await CacheManager.set(CACHE_KEY, config, ttlMs);
      devLog("RemoteConfig", `Fetched and cached fresh config (TTL: ${config.cache_ttl_minutes}min)`);
      return config;
    } catch (err) {
      warnLog("RemoteConfig", "Unexpected error:", err);
      return { ...SAFE_DEFAULTS };
    }
  },

  async refresh(): Promise<RemoteConfig> {
    await CacheManager.remove(CACHE_KEY);
    return RemoteConfigService.getConfig();
  },

  async isMasterEnabled(
    key: keyof Omit<
      RemoteConfig,
      | "schema_version"
      | "cache_ttl_minutes"
      | "minimum_supported_version_code"
      | "latest_version_code"
      | "force_update_title"
      | "force_update_message"
      | "force_update_button_text"
      | "google_play_url"
      | "maintenance_title"
      | "maintenance_message"
      | "maintenance_action_text"
      | "global_message_title"
      | "global_message_text"
      | "global_message_type"
      | "global_message_action"
      | "global_message_action_text"
      | "session_timeout_minutes"
    >,
  ): Promise<boolean> {
    const config = await RemoteConfigService.getConfig();
    return config[key] === true;
  },
};
