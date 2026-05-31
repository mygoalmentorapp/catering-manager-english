/**
 * Environment Detection — determines if the app is running in
 * development or production mode.
 */

/** True when running in Expo development mode (__DEV__ is set by Metro). */
export const isDev: boolean = typeof __DEV__ !== "undefined" ? __DEV__ : false;

/** True when running in a production build. */
export const isProd: boolean = !isDev;

/** Current schema version supported by this app build. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Cache TTLs per environment.
 * Dev uses shorter TTLs for faster iteration.
 */
export const CACHE_TTL = {
  remoteConfig: isDev ? 2 * 60 * 1000 : 30 * 60 * 1000,
  featureFlags: isDev ? 2 * 60 * 1000 : 30 * 60 * 1000,
  allowedDomains: isDev ? 2 * 60 * 1000 : 60 * 60 * 1000,
  onboarding: isDev ? 2 * 60 * 1000 : 60 * 60 * 1000, // 1 hour in prod, 2 min in dev
} as const;

export function devLog(tag: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(`[${tag}]`, ...args);
  }
}

export function warnLog(tag: string, ...args: unknown[]): void {
  console.warn(`[${tag}]`, ...args);
}
