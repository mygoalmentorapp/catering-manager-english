/**
 * AllowedDomainsService — fetches and caches the `allowed_external_domains`
 * table from Supabase. Used to validate external URLs before opening them.
 */
import { supabase } from "../supabase";
import { CacheManager } from "./cache-manager";
import { CACHE_TTL, devLog, warnLog } from "./environment";

const CACHE_KEY = "allowed_domains";

export const AllowedDomainsService = {
  async getDomains(): Promise<string[]> {
    // 1. Try cache
    const cached = await CacheManager.get<string[]>(CACHE_KEY);
    if (cached) {
      devLog("AllowedDomains", "Using cached domains");
      return cached;
    }

    // 2. Try Supabase
    try {
      const { data, error } = await supabase
        .from("allowed_external_domains")
        .select("domain")
        .eq("is_active", true);

      if (error || !data) {
        warnLog("AllowedDomains", "Supabase fetch failed:", error?.message ?? "no data");
        return [];
      }

      const domains = data
        .map((row) => row.domain)
        .filter((d): d is string => typeof d === "string" && d.length > 0);

      await CacheManager.set(CACHE_KEY, domains, CACHE_TTL.allowedDomains);
      devLog("AllowedDomains", "Fetched and cached", domains.length, "domains");
      return domains;
    } catch (err) {
      warnLog("AllowedDomains", "Unexpected error:", err);
      return [];
    }
  },

  async refresh(): Promise<string[]> {
    await CacheManager.remove(CACHE_KEY);
    return AllowedDomainsService.getDomains();
  },

  isDomainAllowed(url: string, allowedDomains: string[]): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return allowedDomains.some((domain) => {
        const d = domain.toLowerCase();
        return hostname === d || hostname.endsWith("." + d);
      });
    } catch {
      return false;
    }
  },
};
