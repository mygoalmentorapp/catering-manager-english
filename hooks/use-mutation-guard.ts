/**
 * useMutationGuard — Guard hook for mutations.
 *
 * With offline-first support, mutations are ALWAYS allowed.
 * They are applied optimistically and queued for sync when offline.
 *
 * The guardMutation() function always returns true now.
 * The hook still reports connectivity state for informational UI.
 *
 * Usage:
 *   const { guardMutation, canMutate, isOffline } = useMutationGuard();
 *
 *   const handleSave = async () => {
 *     const allowed = await guardMutation();
 *     if (!allowed) return; // Always true now
 *     // ... perform mutation (will be queued if offline)
 *   };
 */

import { useCallback } from "react";
import { useNetwork } from "@/lib/network-context";

export type MutationBlockReason = "offline" | "server-unreachable" | null;

export interface MutationGuardResult {
  /** Check if mutation is allowed. Always returns true (offline-first). */
  guardMutation: () => Promise<boolean>;
  /** Synchronous check — always true with offline-first */
  canMutate: boolean;
  /** The reason mutations would have been blocked (null if connected) */
  blockReason: MutationBlockReason;
  /** Whether the device is currently offline */
  isOffline: boolean;
}

export function useMutationGuard(): MutationGuardResult {
  const { isOnline, isServerReachable } = useNetwork();

  const blockReason: MutationBlockReason = (() => {
    if (!isOnline) return "offline";
    if (!isServerReachable) return "server-unreachable";
    return null;
  })();

  const isOffline = !isOnline || !isServerReachable;

  // Always allow mutations — they'll be queued if offline
  const guardMutation = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  return { guardMutation, canMutate: true, blockReason, isOffline };
}
