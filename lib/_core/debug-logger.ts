/**
 * Debug Logger — captures auth-related logs in memory AND persists to AsyncStorage.
 * Logs survive app restarts so they can be viewed after the bug occurs.
 *
 * Usage:
 *   import { debugLog } from "@/lib/_core/debug-logger";
 *   debugLog("initAuth", "Session found:", !!session);
 *
 * All logs are stored in memory (max 300 entries) with timestamps,
 * and automatically persisted to AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LogEntry {
  timestamp: string;
  tag: string;
  message: string;
}

const MAX_ENTRIES = 300;
const STORAGE_KEY = "debug_auth_logs";
let logs: LogEntry[] = [];
let initialized = false;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Load persisted logs from AsyncStorage on first use.
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LogEntry[];
      if (Array.isArray(parsed)) {
        logs = parsed.slice(-MAX_ENTRIES);
      }
    }
  } catch {
    // Ignore parse errors
  }
}

// Initialize immediately
ensureInitialized();

/**
 * Persist logs to AsyncStorage (debounced to avoid excessive writes).
 */
function schedulePersist(): void {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs)).catch(() => {});
  }, 500);
}

/**
 * Add a debug log entry. Also calls console.log for dev convenience.
 * Persists to AsyncStorage automatically.
 */
export function debugLog(tag: string, ...args: any[]): void {
  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");

  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now
    .getMilliseconds()
    .toString()
    .padStart(3, "0")}`;

  const entry: LogEntry = { timestamp, tag, message };
  logs.push(entry);

  // Trim old entries
  if (logs.length > MAX_ENTRIES) {
    logs.splice(0, logs.length - MAX_ENTRIES);
  }

  // Persist to AsyncStorage
  schedulePersist();

  // Also output to console
  console.log(`[${tag}] ${message}`);
}

/**
 * Get all captured log entries (newest last).
 * Includes logs from previous app sessions.
 */
export function getDebugLogs(): LogEntry[] {
  return [...logs];
}

/**
 * Clear all captured logs (memory + AsyncStorage).
 */
export function clearDebugLogs(): void {
  logs.length = 0;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/**
 * Get logs as a single string for sharing/copying.
 */
export function getDebugLogsAsText(): string {
  return logs
    .map((e) => `[${e.timestamp}] [${e.tag}] ${e.message}`)
    .join("\n");
}
