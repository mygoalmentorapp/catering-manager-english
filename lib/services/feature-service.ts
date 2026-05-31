/**
 * FeatureService — the unified entry point for checking whether a feature
 * is active. Combines **remote_config** (master switch) with **feature_flags**
 * (granular control). A feature is active ONLY when both layers allow it.
 */
import { RemoteConfigService, type RemoteConfig } from "./remote-config-service";
import { FeatureFlagService, type FeatureFlags } from "./feature-flag-service";
import { AllowedDomainsService } from "./allowed-domains-service";

// ── Feature → config key mapping ──

type MasterKey = keyof Omit<RemoteConfig, "schema_version">;

interface FeatureMapping {
  masterKey: MasterKey;
  flagName: string;
}

const FEATURE_MAP: Record<string, FeatureMapping> = {
  paywall: { masterKey: "paywall_enabled", flagName: "paywall" },
  revenuecat: { masterKey: "revenuecat_enabled", flagName: "revenuecat" },
  remote_campaigns: { masterKey: "remote_campaigns_enabled", flagName: "remote_campaigns" },
  feedback_popup: { masterKey: "feedback_popup_enabled", flagName: "feedback_popup" },
  global_message: { masterKey: "global_message_enabled", flagName: "global_message" },
  external_urls: { masterKey: "external_urls_enabled", flagName: "external_urls" },
  dynamic_onboarding: { masterKey: "dynamic_onboarding_enabled", flagName: "dynamic_onboarding" },
};

export type FeatureName = keyof typeof FEATURE_MAP;

export const FeatureService = {
  /**
   * Check if a feature is active.
   * Returns true ONLY when:
   *   1. remote_config master switch is ON for this feature
   *   2. feature_flags granular flag is ON for this feature
   */
  async isFeatureActive(feature: FeatureName): Promise<boolean> {
    const mapping = FEATURE_MAP[feature];
    if (!mapping) return false;

    const [config, flags] = await Promise.all([
      RemoteConfigService.getConfig(),
      FeatureFlagService.getFlags(),
    ]);

    const masterOn = config[mapping.masterKey] === true;
    const flagOn = flags[mapping.flagName] === true;

    return masterOn && flagOn;
  },

  /**
   * Get the active/inactive state of all known features.
   */
  async getAllFeatureStates(): Promise<Record<FeatureName, boolean>> {
    const [config, flags] = await Promise.all([
      RemoteConfigService.getConfig(),
      FeatureFlagService.getFlags(),
    ]);

    const result: Record<string, boolean> = {};
    for (const [feature, mapping] of Object.entries(FEATURE_MAP)) {
      result[feature] = config[mapping.masterKey] === true && flags[mapping.flagName] === true;
    }
    return result as Record<FeatureName, boolean>;
  },

  /**
   * Check if an external URL is allowed to be opened.
   * Requires:
   *   1. external_urls feature is active (both master + flag)
   *   2. The URL's domain is in the allowed_external_domains list
   */
  async isExternalUrlAllowed(url: string): Promise<boolean> {
    const isActive = await FeatureService.isFeatureActive("external_urls");
    if (!isActive) return false;

    const domains = await AllowedDomainsService.getDomains();
    return AllowedDomainsService.isDomainAllowed(url, domains);
  },

  /**
   * Refresh all caches (remote_config + feature_flags + domains).
   */
  async refreshAll(): Promise<void> {
    await Promise.all([
      RemoteConfigService.refresh(),
      FeatureFlagService.refresh(),
      AllowedDomainsService.refresh(),
    ]);
  },
};
