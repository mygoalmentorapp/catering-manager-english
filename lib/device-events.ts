/**
 * Simple event bus for device-related events.
 * Used to communicate between DataProvider (which catches DEVICE_NOT_ACTIVE errors)
 * and DeviceProvider (which manages the gate status).
 *
 * This is needed because DataProvider is OUTSIDE DeviceProvider in the component tree,
 * so useDevice() cannot be called from DataProvider.
 */

type Listener = () => void;

const listeners: Set<Listener> = new Set();

/**
 * Emit a device-blocked event.
 * Called by DataProvider when a mutation returns DEVICE_NOT_ACTIVE.
 */
export function emitDeviceBlocked(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error("[device-events] Listener error:", e);
    }
  }
}

/**
 * Subscribe to device-blocked events.
 * Called by DeviceProvider to listen for blocks triggered by mutations.
 * Returns an unsubscribe function.
 */
export function onDeviceBlocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Check if a tRPC error is a DEVICE_NOT_ACTIVE error.
 * The server returns FORBIDDEN with message "DEVICE_NOT_ACTIVE".
 */
export function isDeviceBlockedError(err: any): boolean {
  if (!err) return false;
  // TRPCClientError shape
  if (err.data?.code === "FORBIDDEN" && err.message === "DEVICE_NOT_ACTIVE") return true;
  // Alternative shape
  if (err.shape?.data?.code === "FORBIDDEN" && err.shape?.message === "DEVICE_NOT_ACTIVE") return true;
  // Simple message check
  if (err.message === "DEVICE_NOT_ACTIVE") return true;
  return false;
}
