/**
 * useEditGuard — Hook for edit screens.
 *
 * With offline-first support, editing is ALWAYS allowed.
 * The hook still reports the network state so screens can show
 * an informational banner (not a blocking overlay).
 *
 * Usage:
 *   const { canEdit, blockReason, isChecking, isOffline } = useEditGuard();
 *
 *   // canEdit is always true (offline-first)
 *   // isOffline can be used to show an informational banner
 */

import { useNetwork } from "@/lib/network-context";

export type EditBlockReason = "offline" | "server-unreachable" | null;

export interface EditGuardResult {
  /** Whether editing is currently allowed — always true with offline-first */
  canEdit: boolean;
  /** The reason editing would have been blocked (null if connected) */
  blockReason: EditBlockReason;
  /** Whether the initial verification is still in progress */
  isChecking: boolean;
  /** Whether the device is currently offline */
  isOffline: boolean;
}

export function useEditGuard(): EditGuardResult {
  const { isOnline, isServerReachable } = useNetwork();

  // Derive the network state for informational purposes
  const blockReason: EditBlockReason = (() => {
    if (!isOnline) return "offline";
    if (!isServerReachable) return "server-unreachable";
    return null;
  })();

  const isOffline = !isOnline || !isServerReachable;

  // canEdit is ALWAYS true — offline-first means edits are always allowed
  // They get queued and synced when connectivity returns
  return { canEdit: true, blockReason, isChecking: false, isOffline };
}
