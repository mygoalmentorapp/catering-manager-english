import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient as createVanillaClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { getDeviceId } from "@/lib/device-id";
import { Platform } from "react-native";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 *
 * Auth: Uses the custom OAuth Bearer token from SecureStore.
 * The app does NOT use Supabase Auth — all auth goes through the custom
 * JWT stored in SecureStore and sent as Authorization: Bearer header.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates a shared link configuration.
 * Called at usage time (not import time) to ensure getApiBaseUrl() returns correct value.
 */
function createSharedLink() {
  return httpBatchLink({
    url: `${getApiBaseUrl()}/api/trpc`,
    // tRPC v11: transformer MUST be inside httpBatchLink, not at root
    transformer: superjson,
    async headers() {
      const token = await Auth.getSessionToken();
      if (!token) return {};
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      // Send device UUID so server can validate device ownership on mutations
      if (Platform.OS !== "web") {
        try {
          const deviceUuid = await getDeviceId();
          if (deviceUuid) headers["x-device-uuid"] = deviceUuid;
        } catch {
          // Non-critical: device ID may not be available yet
        }
      }
      return headers;
    },
    // Custom fetch with credentials + timeout protection
    fetch(url, options) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      return fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: "include" }).finally(() => clearTimeout(timeoutId));
    } });
}

/**
 * Creates the tRPC React client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [createSharedLink()] });
}

/**
 * Vanilla (non-React) tRPC client — lazily initialized.
 * 
 * Use this for services that run OUTSIDE the React component tree
 * (e.g., ExperienceEventService, UserExperienceStateService, CampaignSelectorService).
 * 
 * This client does NOT depend on React context, hooks, or lifecycle.
 * It uses the same auth headers and configuration as the React client.
 * 
 * IMPORTANT: Lazily initialized to ensure getApiBaseUrl() returns the correct
 * URL (env vars may not be available at module import time on native).
 */
let _vanillaTrpc: ReturnType<typeof createVanillaClient<AppRouter>> | null = null;

export function getVanillaTrpc(): ReturnType<typeof createVanillaClient<AppRouter>> {
  if (!_vanillaTrpc) {
    _vanillaTrpc = createVanillaClient<AppRouter>({
      links: [createSharedLink()] });
  }
  return _vanillaTrpc;
}

/**
 * @deprecated Use getVanillaTrpc() instead for lazy initialization.
 * Kept for backward compatibility — evaluates getApiBaseUrl() at import time.
 */
export const vanillaTrpc = new Proxy({} as ReturnType<typeof createVanillaClient<AppRouter>>, {
  get(_target, prop) {
    return (getVanillaTrpc() as any)[prop];
  } });
