/**
 * sync-engine.ts — Offline-first sync engine for catering-manager.
 *
 * Architecture:
 * 1. All mutations go through this engine
 * 2. If online → execute immediately via tRPC, then update local cache
 * 3. If offline → apply optimistically to local state, queue the operation
 * 4. When connectivity returns → flush the queue in order
 * 5. All data is cached in AsyncStorage for offline reads
 *
 * The engine exposes:
 * - pendingOps: readonly array of queued operations
 * - pendingCount: number of pending operations
 * - isSyncing: whether the engine is currently flushing
 * - lastSyncAt: timestamp of last successful full sync
 * - flush(): manually trigger a flush
 * - addPendingOp(): queue an operation
 * - clearPending(): clear all pending ops (after full sync)
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateId } from "./uuid";

// ============ TYPES ============

export type OpType =
  | "products.create"
  | "products.update"
  | "products.delete"
  | "orders.create"
  | "orders.update"
  | "orders.delete"
  | "orders.archive"
  | "orders.unarchive"
  | "units.create"
  | "units.delete"
  | "categories.create"
  | "categories.rename"
  | "categories.delete"
  | "settings.update"
  | "shoppingLists.create"
  | "shoppingLists.update"
  | "shoppingLists.delete";

export interface PendingOp {
  id: string;
  type: OpType;
  payload: any;
  /** Temporary local ID for create operations (maps to server ID after sync) */
  tempId?: string;
  createdAt: number;
  retryCount: number;
  /** Last error message if retry failed */
  lastError?: string;
}

export interface SyncState {
  pendingOps: PendingOp[];
  isSyncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

// ============ STORAGE KEYS ============

const STORAGE_KEYS = {
  PENDING_OPS: "@sync_pending_ops",
  LAST_SYNC: "@sync_last_sync_at",
  CACHE_PRODUCTS: "@cache_products",
  CACHE_ORDERS: "@cache_orders",
  CACHE_UNITS: "@cache_units",
  CACHE_CATEGORIES: "@cache_categories",
  CACHE_SHOPPING_LISTS: "@cache_shopping_lists",
  CACHE_SETTINGS: "@cache_settings",
  /** Maps temp local IDs to server IDs after sync */
  ID_MAP: "@sync_id_map" } as const;

export { STORAGE_KEYS };

// ============ CACHE HELPERS ============

/** Save data to AsyncStorage cache */
export async function cacheData(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn("[sync-engine] cacheData error:", key, err);
  }
}

/** Load data from AsyncStorage cache */
export async function loadCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn("[sync-engine] loadCachedData error:", key, err);
    return null;
  }
}

// ============ PENDING OPS PERSISTENCE ============

/** Load pending operations from AsyncStorage */
export async function loadPendingOps(): Promise<PendingOp[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_OPS);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOp[];
  } catch (err) {
    console.warn("[sync-engine] loadPendingOps error:", err);
    return [];
  }
}

/** Save pending operations to AsyncStorage */
export async function savePendingOps(ops: PendingOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_OPS, JSON.stringify(ops));
  } catch (err) {
    console.warn("[sync-engine] savePendingOps error:", err);
  }
}

/** Create a new pending operation */
export function createPendingOp(
  type: OpType,
  payload: any,
  tempId?: string
): PendingOp {
  return {
    id: generateId(),
    type,
    payload,
    tempId,
    createdAt: Date.now(),
    retryCount: 0 };
}

// ============ ID MAPPING ============

/** Maps temp local IDs → server IDs after create operations sync */
let idMap: Record<string, string> = {};

export async function loadIdMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ID_MAP);
    if (raw) idMap = JSON.parse(raw);
  } catch {
    idMap = {};
  }
  return idMap;
}

export async function saveIdMapping(tempId: string, serverId: string): Promise<void> {
  idMap[tempId] = serverId;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ID_MAP, JSON.stringify(idMap));
  } catch (err) {
    console.warn("[sync-engine] saveIdMapping error:", err);
  }
}

export function resolveId(id: string): string {
  return idMap[id] || id;
}

export async function clearIdMap(): Promise<void> {
  idMap = {};
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.ID_MAP);
  } catch {}
}

// ============ LAST SYNC ============

export async function loadLastSync(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function saveLastSync(ts: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(ts));
  } catch {}
}

// ============ MAX RETRIES ============

export const MAX_RETRIES = 5;

/** Check if an operation should be retried or dropped */
export function shouldRetry(op: PendingOp): boolean {
  return op.retryCount < MAX_RETRIES;
}
