/**
 * Debug Logger — captures auth-related logs in memory for on-device viewing.
 * Accessible via long-press on the logo in DataLoadingSplash.
 *
 * Usage:
 *   import { debugLog } from "@/lib/_core/debug-logger";
 *   debugLog("initAuth", "Session found:", !!session);
 *
 * All logs are stored in memory (max 200 entries) with timestamps.
 * The log viewer can be triggered from the splash screen.
 */

export interface LogEntry {
  timestamp: string;
  tag: string;
  message: string;
}

const MAX_ENTRIES = 200;
const logs: LogEntry[] = [];

/**
 * Add a debug log entry. Also calls console.log for dev convenience.
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

  // Also output to console
  console.log(`[${tag}] ${message}`);
}

/**
 * Get all captured log entries (newest last).
 */
export function getDebugLogs(): LogEntry[] {
  return [...logs];
}

/**
 * Clear all captured logs.
 */
export function clearDebugLogs(): void {
  logs.length = 0;
}

/**
 * Get logs as a single string for sharing/copying.
 */
export function getDebugLogsAsText(): string {
  return logs
    .map((e) => `[${e.timestamp}] [${e.tag}] ${e.message}`)
    .join("\n");
}
