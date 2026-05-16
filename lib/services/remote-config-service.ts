/**
 * RemoteConfigService — fetches and caches the single-row `remote_config`
 * table from Supabase. Acts as the **master switch** layer.
 *
 * Safe defaults: every feature is OFF if Supabase is unreachable,
 * config is corrupt, or schema_version is unsupported.
 */
import { supabase } from "../supabase";
import { CacheManager } from "./cache-manager";
import { SUPPORTED_SCHEMA_VERSION, CACHE_TTL, devLog, warnLog } from "./environment";

// ── Types ──

export interface RemoteConfig {
  schema_version: number;
  paywall_enabled: boolean;
  revenuecat_enabled: boolean;
  remote_campaigns_enabled: boolean;
  feedback_popup_enabled: boolean;
  global_message_enabled: boolean;
  external_urls_enabled: boolean;
  // Force Update fields
  force_update_enabled: boolean;
  minimum_supported_version_code: number;
  latest_version_code: number;
  force_update_title: string;
  force_update_message: string;
  force_update_button_text: string;
  google_play_url: string;
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
  // Force Update safe defaults — never block users if config unavailable
  force_update_enabled: false,
  minimum_supported_version_code: 0,
  latest_version_code: 0,
  force_update_title: "",
  force_update_message: "",
  force_update_button_text: "",
  google_play_url: "" });

const CACHE_KEY = "remote_config";

export const RemoteConfigService = {
  /**
   * Fetch remote config with cache-first strategy.
   * 1. Try cache → return if valid
   * 2. Try Supabase → cache + return if valid
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

    // 2. Try Supabase
    try {
      const { data, error } = await supabase
        .from("remote_config")
        .select("*")
        .eq("id", 1)
        .single();

      if (error || !data) {
        warnLog("RemoteConfig", "Supabase fetch failed:", error?.message ?? "no data");
        return { ...SAFE_DEFAULTS };
      }

      const config: RemoteConfig = {
        schema_version: data.schema_version ?? SUPPORTED_SCHEMA_VERSION,
        paywall_enabled: data.paywall_enabled ?? false,
        revenuecat_enabled: data.revenuecat_enabled ?? false,
        remote_campaigns_enabled: data.remote_campaigns_enabled ?? false,
        feedback_popup_enabled: data.feedback_popup_enabled ?? false,
        global_message_enabled: data.global_message_enabled ?? false,
        external_urls_enabled: data.external_urls_enabled ?? false,
        // Force Update fields
        force_update_enabled: data.force_update_enabled ?? false,
        minimum_supported_version_code: data.minimum_supported_version_code ?? 0,
        latest_version_code: data.latest_version_code ?? 0,
        force_update_title: data.force_update_title ?? "",
        force_update_message: data.force_update_message ?? "",
        force_update_button_text: data.force_update_button_text ?? "",
        google_play_url: data.google_play_url ?? "" };

      if (config.schema_version > SUPPORTED_SCHEMA_VERSION) {
        devLog("RemoteConfig", `Unsupported schema_version ${config.schema_version}, using safe defaults`);
        return { ...SAFE_DEFAULTS };
      }

      await CacheManager.set(CACHE_KEY, config, CACHE_TTL.remoteConfig);
      devLog("RemoteConfig", "Fetched and cached fresh config");
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
      | "minimum_supported_version_code"
      | "latest_version_code"
      | "force_update_title"
      | "force_update_message"
      | "force_update_button_text"
      | "google_play_url"
    >,
  ): Promise<boolean> {
    const config = await RemoteConfigService.getConfig();
    return config[key] === true;
  } };
