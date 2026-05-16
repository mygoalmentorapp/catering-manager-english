/**
 * CacheManager — TTL-based AsyncStorage cache for remote config data.
 *
 * Provides get/set/clear with automatic expiry. All operations are
 * wrapped in try-catch so a storage failure never crashes the app.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──

interface CacheEntry<T> {
  data: T;
  timestamp: number; // ms since epoch
  ttl: number; // ms
}

// ── Constants ──

const CACHE_PREFIX = "rc_cache_";

/** Default TTL: 30 minutes */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

// ── Public API ──

export const CacheManager = {
  /**
   * Retrieve a cached value. Returns null if missing, expired, or corrupt.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = Date.now() - entry.timestamp;

      if (age > entry.ttl) {
        // Expired — remove silently
        await AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Store a value with an optional TTL (defaults to 30 min).
   */
  async set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlMs };
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Storage write failure — non-fatal
    }
  },

  /**
   * Remove a single cached key.
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch {
      // Non-fatal
    }
  },

  /**
   * Clear all cache entries managed by CacheManager.
   */
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch {
      // Non-fatal
    }
  },

  /**
   * Check if a cached value exists and is still valid (not expired).
   */
  async has(key: string): Promise<boolean> {
    const value = await CacheManager.get(key);
    return value !== null;
  } };
