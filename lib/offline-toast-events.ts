/**
 * Offline Toast Events — Simple event emitter for offline save notifications.
 *
 * DataProvider emits "offline_save" when a mutation is queued offline.
 * ToastProvider listens and shows a brief toast.
 *
 * This decouples the two providers so they don't need to be nested in a specific order.
 */

type Listener = () => void;

const listeners: Set<Listener> = new Set();

/** Emit an offline save event (called from DataProvider) */
export function emitOfflineSave() {
  listeners.forEach((fn) => fn());
}

/** Subscribe to offline save events (called from ToastProvider or a component) */
export function onOfflineSave(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
