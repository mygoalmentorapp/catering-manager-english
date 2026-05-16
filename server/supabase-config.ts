/**
 * Supabase server-side configuration.
 *
 * The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from environment
 * variables. As a fallback, the hardcoded values from the original project
 * are used so the server works even when env vars are not injected correctly.
 *
 * The anon key is public (safe to hardcode); the service role key is a secret
 * and should always be provided via SUPABASE_SERVICE_ROLE_KEY env var.
 */

const HARDCODED_URL = "https://szcukdxkbrezhgotwsqd.supabase.co";

function resolveSupabaseUrl(): string {
  const envUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  // Validate: must start with https://
  if (envUrl.startsWith("https://") || envUrl.startsWith("http://")) {
    return envUrl;
  }
  // Fallback to hardcoded value
  console.warn("[Supabase] SUPABASE_URL env var is invalid or missing, using hardcoded fallback.");
  return HARDCODED_URL;
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
