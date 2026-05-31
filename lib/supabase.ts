import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Supabase configuration.
 * 
 * The Supabase URL and anon key are public values (anon key is designed to be
 * exposed in client-side code — it only allows operations permitted by RLS).
 * We hardcode them here because Metro web bundler does not reliably inject
 * process.env.EXPO_PUBLIC_* at bundle time in all configurations.
 */
const SUPABASE_URL = "https://szcukdxkbrezhgotwsqd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Y3VrZHhrYnJlemhnb3R3c3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDE5MTAsImV4cCI6MjA5MjQ3NzkxMH0.lbqM61U0qUrHLzy4x5UerX31d17tHJLHK9BCtABa_M8";

/**
 * Check if we're running in a browser environment (not SSR/Node).
 */
const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/**
 * Cross-platform storage adapter for Supabase auth session persistence.
 * 
 * Uses AsyncStorage on native (iOS/Android) — more reliable than SecureStore
 * for session tokens on cold start / process death scenarios in Expo Go.
 * Uses localStorage in browser, and a no-op fallback for SSR/Node contexts.
 * 
 * Note: Session tokens are JWTs that are already signed and validated server-side.
 * Storing them in AsyncStorage is acceptable for most apps. If you need extra
 * security for production, switch back to SecureStore after thorough testing.
 */
const StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        if (isBrowser) {
          return window.localStorage.getItem(key);
        }
        return null; // SSR context - no storage available
      }
      return await AsyncStorage.getItem(key);
    } catch (err) {
      console.warn("[Supabase Storage] getItem error:", err);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (isBrowser) {
          window.localStorage.setItem(key, value);
        }
        return; // SSR context - no-op
      }
      await AsyncStorage.setItem(key, value);
    } catch (err) {
      console.warn("[Supabase Storage] setItem error:", err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        if (isBrowser) {
          window.localStorage.removeItem(key);
        }
        return; // SSR context - no-op
      }
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn("[Supabase Storage] removeItem error:", err);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
