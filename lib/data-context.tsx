import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product, Order, CustomCategory, UnitDef, SavedShoppingList } from "./types";
import { updateAccentColor } from "./design-system";
import { trpc } from "./trpc";
import { useAuth } from "./auth-context";
import { useNetwork } from "./network-context";
import { ExperienceEventService } from "./services/experience-event-service";
import { UserExperienceStateService } from "./services/user-experience-state-service";
import { generateId } from "./uuid";
import {
  STORAGE_KEYS,
  cacheData,
  loadCachedData,
  loadPendingOps,
  savePendingOps,
  createPendingOp,
  resolveId,
  saveIdMapping,
  loadIdMap,
  loadLastSync,
  saveLastSync,
  shouldRetry,
  type PendingOp,
  type OpType,
} from "./sync-engine";
import { isDeviceBlockedError, emitDeviceBlocked } from "./device-events";
import { emitOfflineSave } from "./offline-toast-events";

/**
 * Cloud-based DataProvider with offline-first support.
 *
 * IMPORTANT: The interface exposed by useData() is IDENTICAL to the previous
 * version. All screens, hooks, and pure logic modules continue to work unchanged.
 *
 * Offline-first behavior:
 * 1. On init: load cached data from AsyncStorage immediately, then fetch from server
 * 2. On mutation: apply optimistically to local state, then try server
 * 3. If server fails (offline): queue the operation for later sync
 * 4. When connectivity returns: flush the queue in order
 * 5. All data is cached after every successful server fetch
 */

export const DEFAULT_PRIMARY_COLOR = "#3AAFA9";

// AsyncStorage cache keys for instant restore on app launch
const CACHE_PRIMARY_COLOR = "cache_primary_color";
const CACHE_BUSINESS_LOGO = "cache_business_logo";

// ============ SYNC STATE (exposed via context) ============

export interface SyncStatus {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

interface DataContextType {
  products: Product[];
  orders: Order[];
  units: UnitDef[];
  customCategories: CustomCategory[];
  loading: boolean;
  refreshProducts: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshUnits: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addProduct: (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (id: string, product: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;
  addOrder: (order: Omit<Order, "id" | "createdAt" | "updatedAt">) => Promise<Order>;
  updateOrder: (id: string, order: Partial<Omit<Order, "id" | "createdAt">>) => Promise<Order>;
  deleteOrder: (id: string) => Promise<void>;
  archiveOrder: (id: string) => Promise<void>;
  unarchiveOrder: (id: string) => Promise<Order>;
  addUnit: (unit: UnitDef) => Promise<void>;
  deleteUnit: (singular: string) => Promise<void>;
  addCustomCategory: (name: string) => Promise<CustomCategory>;
  renameCustomCategory: (id: string, name: string) => Promise<void>;
  deleteCustomCategory: (id: string) => Promise<void>;
  businessName: string;
  setBusinessNameValue: (name: string) => Promise<void>;
  businessLogo: string;
  setBusinessLogoValue: (uri: string) => Promise<void>;
  primaryColor: string;
  setPrimaryColorValue: (color: string) => Promise<void>;
  colorKey: number;
  savedShoppingLists: SavedShoppingList[];
  refreshShoppingLists: () => Promise<void>;
  addSavedShoppingList: (list: Omit<SavedShoppingList, "id" | "createdAt" | "updatedAt">) => Promise<SavedShoppingList>;
  updateSavedShoppingList: (id: string, updates: Partial<Omit<SavedShoppingList, "id" | "createdAt">>) => Promise<SavedShoppingList>;
  deleteSavedShoppingList: (id: string) => Promise<void>;
  /** Sync status for UI display */
  syncStatus: SyncStatus;
  /** Whether data was loaded from cache (no server fetch yet) */
  isOfflineCached: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [businessName, setBusinessNameState] = useState("");
  const [businessLogo, setBusinessLogoState] = useState("");
  const [primaryColor, setPrimaryColorState] = useState(DEFAULT_PRIMARY_COLOR);
  const [savedShoppingLists, setSavedShoppingLists] = useState<SavedShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [colorKey, setColorKey] = useState(0);
  const mountedRef = useRef(true);
  const isConnectedRef = useRef(isConnected);

  // ============ SYNC STATE ============
  const [pendingOps, setPendingOps] = useState<PendingOp[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const flushingRef = useRef(false);

  // Keep isConnectedRef in sync
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // ============ tRPC utils ============
  const utils = trpc.useUtils();

  // ============ CACHE HELPERS ============

  const cacheAllData = useCallback((data: {
    products?: Product[];
    orders?: Order[];
    units?: UnitDef[];
    categories?: CustomCategory[];
    shoppingLists?: SavedShoppingList[];
    settings?: { businessName?: string; businessLogo?: string; primaryColor?: string };
  }) => {
    if (data.products) cacheData(STORAGE_KEYS.CACHE_PRODUCTS, data.products);
    if (data.orders) cacheData(STORAGE_KEYS.CACHE_ORDERS, data.orders);
    if (data.units) cacheData(STORAGE_KEYS.CACHE_UNITS, data.units);
    if (data.categories) cacheData(STORAGE_KEYS.CACHE_CATEGORIES, data.categories);
    if (data.shoppingLists) cacheData(STORAGE_KEYS.CACHE_SHOPPING_LISTS, data.shoppingLists);
    if (data.settings) cacheData(STORAGE_KEYS.CACHE_SETTINGS, data.settings);
  }, []);

  // ============ REFRESH FUNCTIONS (with cache) ============

  const refreshProducts = useCallback(async () => {
    try {
      const data = await utils.cloudData.products.list.fetch();
      if (mountedRef.current) {
        setProducts(data as Product[]);
        cacheData(STORAGE_KEYS.CACHE_PRODUCTS, data);
      }
    } catch (err) {
      console.error("[DataProvider] refreshProducts error:", err);
    }
  }, [utils]);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await utils.cloudData.orders.list.fetch();
      if (mountedRef.current) {
        setOrders(data as Order[]);
        cacheData(STORAGE_KEYS.CACHE_ORDERS, data);
      }
    } catch (err) {
      console.error("[DataProvider] refreshOrders error:", err);
    }
  }, [utils]);

  const refreshUnits = useCallback(async () => {
    try {
      const data = await utils.cloudData.units.list.fetch();
      if (mountedRef.current) {
        setUnits(data as UnitDef[]);
        cacheData(STORAGE_KEYS.CACHE_UNITS, data);
      }
    } catch (err) {
      console.error("[DataProvider] refreshUnits error:", err);
    }
  }, [utils]);

  const refreshCategories = useCallback(async () => {
    try {
      const data = await utils.cloudData.categories.list.fetch();
      if (mountedRef.current) {
        setCustomCategories(data as CustomCategory[]);
        cacheData(STORAGE_KEYS.CACHE_CATEGORIES, data);
      }
    } catch (err) {
      console.error("[DataProvider] refreshCategories error:", err);
    }
  }, [utils]);

  const refreshShoppingLists = useCallback(async () => {
    try {
      const data = await utils.cloudData.shoppingLists.list.fetch();
      if (mountedRef.current) {
        setSavedShoppingLists(data as SavedShoppingList[]);
        cacheData(STORAGE_KEYS.CACHE_SHOPPING_LISTS, data);
      }
    } catch (err) {
      console.error("[DataProvider] refreshShoppingLists error:", err);
    }
  }, [utils]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshProducts(),
      refreshOrders(),
      refreshUnits(),
      refreshCategories(),
      refreshShoppingLists(),
    ]);
  }, [refreshProducts, refreshOrders, refreshUnits, refreshCategories, refreshShoppingLists]);

  // ============ REFRESH SETTINGS ============

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await utils.cloudData.settings.get.fetch();
      if (mountedRef.current) {
        setBusinessNameState(settings.businessName);
        setBusinessLogoState(settings.businessLogo);
        const color = settings.primaryColor || DEFAULT_PRIMARY_COLOR;
        setPrimaryColorState((prev) => {
          if (prev !== color) {
            updateAccentColor(color);
            setColorKey(k => k + 1);
          }
          return color;
        });
        // Cache settings
        cacheData(STORAGE_KEYS.CACHE_SETTINGS, {
          businessName: settings.businessName,
          businessLogo: settings.businessLogo,
          primaryColor: color,
        });
        AsyncStorage.setItem(CACHE_PRIMARY_COLOR, color).catch(() => {});
        if (settings.businessLogo) {
          AsyncStorage.setItem(CACHE_BUSINESS_LOGO, settings.businessLogo).catch(() => {});
        } else {
          AsyncStorage.removeItem(CACHE_BUSINESS_LOGO).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[DataProvider] refreshSettings error:", err);
    }
  }, [utils]);

  // ============ PENDING OPS MANAGEMENT ============

  const addPendingOp = useCallback(async (type: OpType, payload: any, tempId?: string) => {
    const op = createPendingOp(type, payload, tempId);
    setPendingOps(prev => {
      const next = [...prev, op];
      savePendingOps(next).catch(() => {});
      return next;
    });
    return op;
  }, []);

  const removePendingOp = useCallback(async (opId: string) => {
    setPendingOps(prev => {
      const next = prev.filter(o => o.id !== opId);
      savePendingOps(next).catch(() => {});
      return next;
    });
  }, []);

  // ============ FLUSH PENDING OPS ============

  const flushPendingOps = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const ops = await loadPendingOps();
      if (ops.length === 0) {
        flushingRef.current = false;
        setIsSyncing(false);
        return;
      }

      console.log(`[sync] Flushing ${ops.length} pending operations...`);
      const remaining: PendingOp[] = [];

      for (const op of ops) {
        if (!isConnectedRef.current) {
          // Lost connection mid-flush — keep remaining ops
          remaining.push(op);
          continue;
        }

        try {
          // Resolve any temp IDs in the payload
          const resolvedPayload = resolvePayloadIds(op);
          await executeMutation(utils, op.type, resolvedPayload);

          // If this was a create op, save the ID mapping
          if (op.tempId && resolvedPayload._serverResult?.id) {
            await saveIdMapping(op.tempId, resolvedPayload._serverResult.id);
          }

          console.log(`[sync] ✓ Flushed: ${op.type} (${op.id})`);
        } catch (err: any) {
          // DEVICE_NOT_ACTIVE: stop flushing, block device, drop all remaining ops
          if (isDeviceBlockedError(err)) {
            console.warn(`[sync] Device blocked during flush — stopping queue`);
            emitDeviceBlocked();
            // Don't keep any remaining ops — device is no longer authorized
            await savePendingOps([]);
            if (mountedRef.current) setPendingOps([]);
            return;
          }

          console.error(`[sync] ✗ Failed: ${op.type} (${op.id}):`, err?.message);
          op.retryCount++;
          op.lastError = err?.message || "Unknown error";

          if (shouldRetry(op)) {
            remaining.push(op);
          } else {
            console.warn(`[sync] Dropping op after max retries: ${op.type} (${op.id})`);
          }
        }
      }

      await savePendingOps(remaining);
      if (mountedRef.current) {
        setPendingOps(remaining);
        if (remaining.length === 0) {
          const now = Date.now();
          setLastSyncAt(now);
          saveLastSync(now).catch(() => {});
        }
      }

      // After flushing, refresh all data from server to get authoritative state
      if (isConnectedRef.current && remaining.length < ops.length) {
        try {
          await Promise.all([refreshAll(), refreshSettings()]);
          if (mountedRef.current) setIsOfflineCached(false);
        } catch {
          // Non-critical — local state is still valid
        }
      }
    } catch (err: any) {
      console.error("[sync] flush error:", err);
      if (mountedRef.current) setLastSyncError(err?.message || "Sync failed");
    } finally {
      flushingRef.current = false;
      if (mountedRef.current) setIsSyncing(false);
    }
  }, [utils, refreshAll, refreshSettings]);

  // ============ AUTO-FLUSH ON RECONNECT ============

  useEffect(() => {
    if (isConnected && pendingOps.length > 0 && !flushingRef.current) {
      console.log("[sync] Connection restored — flushing pending ops...");
      flushPendingOps();
    }
  }, [isConnected, pendingOps.length, flushPendingOps]);

  // ============ INIT ============

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setProducts([]);
      setOrders([]);
      setUnits([]);
      setCustomCategories([]);
      setSavedShoppingLists([]);
      setBusinessNameState("");
      setBusinessLogoState("");
      setPrimaryColorState(DEFAULT_PRIMARY_COLOR);
      updateAccentColor(DEFAULT_PRIMARY_COLOR);
      setLoading(false);
      setPendingOps([]);
      setIsOfflineCached(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        // 1. Load cached data FIRST for instant display
        const [
          cachedProducts,
          cachedOrders,
          cachedUnits,
          cachedCategories,
          cachedShoppingLists,
          cachedSettings,
          cachedColor,
          cachedLogo,
          savedOps,
          savedLastSync,
        ] = await Promise.all([
          loadCachedData<Product[]>(STORAGE_KEYS.CACHE_PRODUCTS),
          loadCachedData<Order[]>(STORAGE_KEYS.CACHE_ORDERS),
          loadCachedData<UnitDef[]>(STORAGE_KEYS.CACHE_UNITS),
          loadCachedData<CustomCategory[]>(STORAGE_KEYS.CACHE_CATEGORIES),
          loadCachedData<SavedShoppingList[]>(STORAGE_KEYS.CACHE_SHOPPING_LISTS),
          loadCachedData<{ businessName: string; businessLogo: string; primaryColor: string }>(STORAGE_KEYS.CACHE_SETTINGS),
          AsyncStorage.getItem(CACHE_PRIMARY_COLOR),
          AsyncStorage.getItem(CACHE_BUSINESS_LOGO),
          loadPendingOps(),
          loadLastSync(),
        ]);

        // Load ID map for resolving temp IDs
        await loadIdMap();

        const hasCachedData = !!(cachedProducts || cachedOrders);

        if (mountedRef.current) {
          // Apply cached data
          if (cachedProducts) setProducts(cachedProducts);
          if (cachedOrders) setOrders(cachedOrders);
          if (cachedUnits) setUnits(cachedUnits);
          if (cachedCategories) setCustomCategories(cachedCategories);
          if (cachedShoppingLists) setSavedShoppingLists(cachedShoppingLists);
          if (cachedSettings) {
            setBusinessNameState(cachedSettings.businessName || "");
            setBusinessLogoState(cachedSettings.businessLogo || "");
            const color = cachedSettings.primaryColor || DEFAULT_PRIMARY_COLOR;
            setPrimaryColorState(color);
            updateAccentColor(color);
            if (color !== DEFAULT_PRIMARY_COLOR) setColorKey(k => k + 1);
          } else {
            // Fallback to individual cached values
            if (cachedColor) {
              setPrimaryColorState(cachedColor);
              updateAccentColor(cachedColor);
              if (cachedColor !== DEFAULT_PRIMARY_COLOR) setColorKey(k => k + 1);
            }
            if (cachedLogo) setBusinessLogoState(cachedLogo);
          }

          // Restore pending ops
          if (savedOps.length > 0) {
            setPendingOps(savedOps);
            console.log(`[sync] Restored ${savedOps.length} pending operations`);
          }
          if (savedLastSync) setLastSyncAt(savedLastSync);

          // If we have cached data, mark loading as done immediately
          if (hasCachedData) {
            setIsOfflineCached(true);
            setLoading(false);
          }
        }

        // 2. Try to fetch fresh data from server
        try {
          await Promise.all([refreshAll(), refreshSettings()]);
          if (mountedRef.current) {
            setIsOfflineCached(false);
            const now = Date.now();
            setLastSyncAt(now);
            saveLastSync(now).catch(() => {});
          }
        } catch (err) {
          console.warn("[DataProvider] Server fetch failed, using cached data:", err);
          // If we had no cached data and server failed, we're stuck
          if (!hasCachedData && mountedRef.current) {
            console.error("[DataProvider] No cached data and server unreachable");
          }
        }

        // 3. Flush any pending ops if connected
        if (isConnectedRef.current && savedOps.length > 0) {
          // Small delay to let the server data settle
          setTimeout(() => {
            if (mountedRef.current) flushPendingOps();
          }, 2000);
        }
      } catch (err) {
        console.error("[DataProvider] init error:", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    init();
  }, [isAuthenticated, refreshAll, refreshSettings, flushPendingOps]);

  // ============ APP STATE: RELOAD DATA ON FOREGROUND ============

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && isAuthenticated && mountedRef.current) {
        console.log("[DataProvider] App foregrounded — refreshing all data");
        setTimeout(() => {
          if (mountedRef.current && isAuthenticated) {
            if (isConnectedRef.current) {
              refreshAll().catch((err) =>
                console.error("[DataProvider] Foreground refresh error:", err)
              );
              refreshSettings().catch((err) =>
                console.error("[DataProvider] Foreground settings refresh error:", err)
              );
              // Also try to flush pending ops
              if (pendingOps.length > 0) {
                flushPendingOps();
              }
            }
          }
        }, 1000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, refreshAll, refreshSettings, pendingOps.length, flushPendingOps]);

  // ============ OFFLINE-AWARE MUTATION HELPER ============

  /**
   * Execute a mutation with offline-first support.
   * 1. Apply optimistic update to local state
   * 2. Try server mutation
   * 3. If server fails → queue for later sync
   * 4. Cache updated state
   */
  interface OfflineMutationOpts<T> {
    type: OpType;
    payload: any;
    tempId?: string;
    optimisticUpdate: () => T;
    refreshFn?: () => Promise<void>;
    extraRefreshFns?: (() => Promise<void>)[];
    cacheKey?: string;
    getCacheState?: () => any;
    onSuccess?: () => void;
  }

  const offlineMutationRef = useRef(async function offlineMutationFn<T>(opts: OfflineMutationOpts<T>): Promise<T> {
    // 1. Apply optimistic update immediately
    const optimisticResult = opts.optimisticUpdate();

    // 2. Cache the updated state
    if (opts.cacheKey && opts.getCacheState) {
      // Small delay to let setState settle
      setTimeout(() => {
        cacheData(opts.cacheKey!, opts.getCacheState!());
      }, 50);
    }

    // 3. Try server mutation
    if (isConnectedRef.current) {
      try {
        const serverResult = await executeMutation(utils, opts.type, opts.payload);

        // If create operation, save ID mapping
        if (opts.tempId && serverResult?.id) {
          await saveIdMapping(opts.tempId, serverResult.id);
        }

        // Refresh from server for authoritative state
        if (opts.refreshFn) {
          try { await opts.refreshFn(); } catch {}
        }
        if (opts.extraRefreshFns) {
          for (const fn of opts.extraRefreshFns) {
            try { await fn(); } catch {}
          }
        }

        // Fire success events
        if (opts.onSuccess) opts.onSuccess();

        return serverResult || optimisticResult;
      } catch (err: any) {
        // DEVICE_NOT_ACTIVE: block immediately, do NOT queue
        if (isDeviceBlockedError(err)) {
          console.warn(`[sync] Device blocked — mutation ${opts.type} rejected`);
          emitDeviceBlocked();
          throw err; // Re-throw so the UI can show an error
        }
        console.warn(`[sync] Server mutation failed for ${opts.type}, queuing:`, err);
        // Queue for later
        await addPendingOp(opts.type, opts.payload, opts.tempId);
        return optimisticResult;
      }
    } else {
      // Offline — queue immediately
      console.log(`[sync] Offline — queuing: ${opts.type}`);
      await addPendingOp(opts.type, opts.payload, opts.tempId);
      emitOfflineSave();
      return optimisticResult;
    }
  });

  // Keep ref up to date
  useEffect(() => {
    offlineMutationRef.current = async function offlineMutationFn<T>(opts: OfflineMutationOpts<T>): Promise<T> {
      const optimisticResult = opts.optimisticUpdate();
      if (opts.cacheKey && opts.getCacheState) {
        setTimeout(() => { cacheData(opts.cacheKey!, opts.getCacheState!()); }, 50);
      }
      if (isConnectedRef.current) {
        try {
          const serverResult = await executeMutation(utils, opts.type, opts.payload);
          if (opts.tempId && serverResult?.id) {
            await saveIdMapping(opts.tempId, serverResult.id);
          }
          if (opts.refreshFn) { try { await opts.refreshFn(); } catch {} }
          if (opts.extraRefreshFns) { for (const fn of opts.extraRefreshFns) { try { await fn(); } catch {} } }
          if (opts.onSuccess) opts.onSuccess();
          return serverResult || optimisticResult;
        } catch (err: any) {
          // DEVICE_NOT_ACTIVE: block immediately, do NOT queue
          if (isDeviceBlockedError(err)) {
            console.warn(`[sync] Device blocked — mutation ${opts.type} rejected`);
            emitDeviceBlocked();
            throw err;
          }
          console.warn(`[sync] Server mutation failed for ${opts.type}, queuing:`, err);
          await addPendingOp(opts.type, opts.payload, opts.tempId);
          return optimisticResult;
        }
      } else {
        console.log(`[sync] Offline — queuing: ${opts.type}`);
        await addPendingOp(opts.type, opts.payload, opts.tempId);
        emitOfflineSave();
        return optimisticResult;
      }
    };
  }, [utils, addPendingOp]);

  // Stable reference for mutations
  const offlineMutation = useCallback(<T,>(opts: OfflineMutationOpts<T>): Promise<T> => {
    return offlineMutationRef.current(opts);
  }, []);

  // ============ PRODUCT MUTATIONS ============

  const addProduct = useCallback(
    async (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
      const tempId = generateId();
      const now = new Date().toISOString();
      const optimistic: Product = { ...product, id: tempId, createdAt: now, updatedAt: now } as Product;

      return offlineMutation<Product>({
        type: "products.create",
        payload: product,
        tempId,
        optimisticUpdate: () => {
          setProducts(prev => [...prev, optimistic]);
          return optimistic;
        },
        refreshFn: refreshProducts,
        cacheKey: STORAGE_KEYS.CACHE_PRODUCTS,
        getCacheState: () => [...products, optimistic],
        onSuccess: () => {
          ExperienceEventService.logProductCreated().catch(() => {});
          UserExperienceStateService.onProductCreated().catch(() => {});
        },
      });
    },
    [offlineMutation, refreshProducts, products]
  );

  const updateProduct = useCallback(
    async (id: string, product: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
      const resolvedId = resolveId(id);
      const now = new Date().toISOString();

      return offlineMutation<Product>({
        type: "products.update",
        payload: { id: resolvedId, ...product },
        optimisticUpdate: () => {
          const updated = { ...product, id, updatedAt: now } as Product;
          setProducts(prev => prev.map(p => p.id === id ? { ...p, ...product, updatedAt: now } : p));
          return updated;
        },
        refreshFn: refreshProducts,
        cacheKey: STORAGE_KEYS.CACHE_PRODUCTS,
        getCacheState: () => products.map(p => p.id === id ? { ...p, ...product, updatedAt: now } : p),
        onSuccess: () => {
          ExperienceEventService.logProductUpdated().catch(() => {});
        },
      });
    },
    [offlineMutation, refreshProducts, products]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "products.delete",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          setProducts(prev => prev.filter(p => p.id !== id));
        },
        refreshFn: refreshProducts,
        cacheKey: STORAGE_KEYS.CACHE_PRODUCTS,
        getCacheState: () => products.filter(p => p.id !== id),
      });
    },
    [offlineMutation, refreshProducts, products]
  );

  // ============ ORDER MUTATIONS ============

  const addOrder = useCallback(
    async (order: Omit<Order, "id" | "createdAt" | "updatedAt">) => {
      const tempId = generateId();
      const now = new Date().toISOString();
      const optimistic: Order = { ...order, id: tempId, createdAt: now, updatedAt: now } as Order;

      return offlineMutation<Order>({
        type: "orders.create",
        payload: order,
        tempId,
        optimisticUpdate: () => {
          setOrders(prev => [...prev, optimistic]);
          return optimistic;
        },
        refreshFn: refreshOrders,
        cacheKey: STORAGE_KEYS.CACHE_ORDERS,
        getCacheState: () => [...orders, optimistic],
        onSuccess: () => {
          const counterPromise = UserExperienceStateService.onOrderCreated().catch(() => {});
          counterPromise.then(() => {
            ExperienceEventService.logOrderCreated().catch(() => {});
          });
        },
      });
    },
    [offlineMutation, refreshOrders, orders]
  );

  const updateOrder = useCallback(
    async (id: string, order: Partial<Omit<Order, "id" | "createdAt">>) => {
      const resolvedId = resolveId(id);
      const now = new Date().toISOString();

      return offlineMutation<Order>({
        type: "orders.update",
        payload: { id: resolvedId, ...order },
        optimisticUpdate: () => {
          const updated = { id, ...order, updatedAt: now } as Order;
          setOrders(prev => prev.map(o => o.id === id ? { ...o, ...order, updatedAt: now } : o));
          return updated;
        },
        refreshFn: refreshOrders,
        cacheKey: STORAGE_KEYS.CACHE_ORDERS,
        getCacheState: () => orders.map(o => o.id === id ? { ...o, ...order, updatedAt: now } : o),
        onSuccess: () => {
          ExperienceEventService.logOrderUpdated().catch(() => {});
        },
      });
    },
    [offlineMutation, refreshOrders, orders]
  );

  const deleteOrder = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "orders.delete",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          setOrders(prev => prev.filter(o => o.id !== id));
          // Also remove from shopping lists that reference this order
          setSavedShoppingLists(prev => prev.map(sl => ({
            ...sl,
            orderIds: sl.orderIds.filter(oid => oid !== id),
            orderNames: sl.orderNames.filter((_, idx) => sl.orderIds[idx] !== id),
          })));
        },
        refreshFn: refreshOrders,
        extraRefreshFns: [refreshShoppingLists],
      });
    },
    [offlineMutation, refreshOrders, refreshShoppingLists]
  );

  const archiveOrderCb = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "orders.archive",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          const now = new Date().toISOString();
          setOrders(prev => prev.map(o =>
            o.id === id ? { ...o, status: "archived" as const, archivedAt: now, updatedAt: now } : o
          ));
        },
        refreshFn: refreshOrders,
        extraRefreshFns: [refreshShoppingLists],
        onSuccess: () => {
          ExperienceEventService.logOrderCompleted().catch(() => {});
          UserExperienceStateService.onOrderCompleted().catch(() => {});
        },
      });
    },
    [offlineMutation, refreshOrders, refreshShoppingLists]
  );

  const unarchiveOrderCb = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);
      const now = new Date().toISOString();

      return offlineMutation<Order>({
        type: "orders.unarchive",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          const updated = orders.find(o => o.id === id);
          if (updated) {
            const restored = { ...updated, status: "open" as const, archivedAt: undefined, updatedAt: now };
            setOrders(prev => prev.map(o => o.id === id ? restored : o));
            return restored;
          }
          return { id, status: "open" as const, updatedAt: now } as Order;
        },
        refreshFn: refreshOrders,
      });
    },
    [offlineMutation, refreshOrders, orders]
  );

  // ============ UNIT MUTATIONS ============

  const addUnit = useCallback(
    async (unit: UnitDef) => {
      await offlineMutation<void>({
        type: "units.create",
        payload: unit,
        optimisticUpdate: () => {
          setUnits(prev => [...prev, unit]);
        },
        refreshFn: refreshUnits,
        cacheKey: STORAGE_KEYS.CACHE_UNITS,
        getCacheState: () => [...units, unit],
      });
    },
    [offlineMutation, refreshUnits, units]
  );

  const deleteUnit = useCallback(
    async (singular: string) => {
      await offlineMutation<void>({
        type: "units.delete",
        payload: { singular },
        optimisticUpdate: () => {
          setUnits(prev => prev.filter(u => u.singular !== singular));
        },
        refreshFn: refreshUnits,
        cacheKey: STORAGE_KEYS.CACHE_UNITS,
        getCacheState: () => units.filter(u => u.singular !== singular),
      });
    },
    [offlineMutation, refreshUnits, units]
  );

  // ============ CATEGORY MUTATIONS ============

  const addCustomCategory = useCallback(
    async (name: string): Promise<CustomCategory> => {
      const tempId = generateId();
      const now = new Date().toISOString();
      const optimistic: CustomCategory = { id: tempId, name, createdAt: now };

      return offlineMutation<CustomCategory>({
        type: "categories.create",
        payload: { name },
        tempId,
        optimisticUpdate: () => {
          setCustomCategories(prev => [...prev, optimistic]);
          return optimistic;
        },
        refreshFn: refreshCategories,
        cacheKey: STORAGE_KEYS.CACHE_CATEGORIES,
        getCacheState: () => [...customCategories, optimistic],
      });
    },
    [offlineMutation, refreshCategories, customCategories]
  );

  const renameCustomCategory = useCallback(
    async (id: string, name: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "categories.rename",
        payload: { id: resolvedId, name },
        optimisticUpdate: () => {
          setCustomCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
        },
        refreshFn: refreshCategories,
        cacheKey: STORAGE_KEYS.CACHE_CATEGORIES,
        getCacheState: () => customCategories.map(c => c.id === id ? { ...c, name } : c),
      });
    },
    [offlineMutation, refreshCategories, customCategories]
  );

  const deleteCustomCategory = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "categories.delete",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          setCustomCategories(prev => prev.filter(c => c.id !== id));
        },
        refreshFn: refreshCategories,
        cacheKey: STORAGE_KEYS.CACHE_CATEGORIES,
        getCacheState: () => customCategories.filter(c => c.id !== id),
      });
    },
    [offlineMutation, refreshCategories, customCategories]
  );

  // ============ BUSINESS SETTINGS MUTATIONS ============

  const setBusinessNameValue = useCallback(async (name: string) => {
    await offlineMutation<void>({
      type: "settings.update",
      payload: { businessName: name },
      optimisticUpdate: () => {
        setBusinessNameState(name);
      },
      cacheKey: STORAGE_KEYS.CACHE_SETTINGS,
      getCacheState: () => ({ businessName: name, businessLogo, primaryColor }),
    });
  }, [offlineMutation, businessLogo, primaryColor]);

  const setBusinessLogoValue = useCallback(async (uri: string) => {
    await offlineMutation<void>({
      type: "settings.update",
      payload: { businessLogo: uri },
      optimisticUpdate: () => {
        setBusinessLogoState(uri);
        if (uri) {
          AsyncStorage.setItem(CACHE_BUSINESS_LOGO, uri).catch(() => {});
        } else {
          AsyncStorage.removeItem(CACHE_BUSINESS_LOGO).catch(() => {});
        }
      },
      cacheKey: STORAGE_KEYS.CACHE_SETTINGS,
      getCacheState: () => ({ businessName, businessLogo: uri, primaryColor }),
    });
  }, [offlineMutation, businessName, primaryColor]);

  const setPrimaryColorValue = useCallback(async (color: string) => {
    await offlineMutation<void>({
      type: "settings.update",
      payload: { primaryColor: color },
      optimisticUpdate: () => {
        updateAccentColor(color);
        setPrimaryColorState(color);
        setColorKey(k => k + 1);
        AsyncStorage.setItem(CACHE_PRIMARY_COLOR, color).catch(() => {});
      },
      cacheKey: STORAGE_KEYS.CACHE_SETTINGS,
      getCacheState: () => ({ businessName, businessLogo, primaryColor: color }),
    });
  }, [offlineMutation, businessName, businessLogo]);

  // ============ SHOPPING LIST MUTATIONS ============

  const addSavedShoppingListCb = useCallback(
    async (list: Omit<SavedShoppingList, "id" | "createdAt" | "updatedAt">) => {
      const tempId = generateId();
      const now = new Date().toISOString();
      const optimistic: SavedShoppingList = { ...list, id: tempId, createdAt: now, updatedAt: now } as SavedShoppingList;

      return offlineMutation<SavedShoppingList>({
        type: "shoppingLists.create",
        payload: list,
        tempId,
        optimisticUpdate: () => {
          setSavedShoppingLists(prev => [...prev, optimistic]);
          return optimistic;
        },
        refreshFn: refreshShoppingLists,
        cacheKey: STORAGE_KEYS.CACHE_SHOPPING_LISTS,
        getCacheState: () => [...savedShoppingLists, optimistic],
        onSuccess: () => {
          ExperienceEventService.logShoppingListCreated().catch(() => {});
          UserExperienceStateService.onShoppingListCreated().catch(() => {});
        },
      });
    },
    [offlineMutation, refreshShoppingLists, savedShoppingLists]
  );

  const updateSavedShoppingListCb = useCallback(
    async (id: string, updates: Partial<Omit<SavedShoppingList, "id" | "createdAt">>) => {
      const resolvedId = resolveId(id);
      const now = new Date().toISOString();

      return offlineMutation<SavedShoppingList>({
        type: "shoppingLists.update",
        payload: { id: resolvedId, ...updates },
        optimisticUpdate: () => {
          const updated = { id, ...updates, updatedAt: now } as SavedShoppingList;
          setSavedShoppingLists(prev => prev.map(sl => sl.id === id ? { ...sl, ...updates, updatedAt: now } : sl));
          return updated;
        },
        refreshFn: refreshShoppingLists,
        cacheKey: STORAGE_KEYS.CACHE_SHOPPING_LISTS,
        getCacheState: () => savedShoppingLists.map(sl => sl.id === id ? { ...sl, ...updates, updatedAt: now } : sl),
      });
    },
    [offlineMutation, refreshShoppingLists, savedShoppingLists]
  );

  const deleteSavedShoppingListCb = useCallback(
    async (id: string) => {
      const resolvedId = resolveId(id);

      await offlineMutation<void>({
        type: "shoppingLists.delete",
        payload: { id: resolvedId },
        optimisticUpdate: () => {
          setSavedShoppingLists(prev => prev.filter(sl => sl.id !== id));
        },
        refreshFn: refreshShoppingLists,
        cacheKey: STORAGE_KEYS.CACHE_SHOPPING_LISTS,
        getCacheState: () => savedShoppingLists.filter(sl => sl.id !== id),
      });
    },
    [offlineMutation, refreshShoppingLists, savedShoppingLists]
  );

  // ============ SYNC STATUS ============

  const syncStatus: SyncStatus = {
    pendingCount: pendingOps.length,
    isSyncing,
    lastSyncAt,
    lastError: lastSyncError,
  };

  return (
    <DataContext.Provider
      value={{
        products,
        orders,
        units,
        customCategories,
        loading,
        refreshProducts,
        refreshOrders,
        refreshUnits,
        refreshCategories,
        refreshAll,
        addProduct,
        updateProduct,
        deleteProduct,
        addOrder,
        updateOrder,
        deleteOrder,
        archiveOrder: archiveOrderCb,
        unarchiveOrder: unarchiveOrderCb,
        addUnit,
        deleteUnit,
        addCustomCategory,
        renameCustomCategory,
        deleteCustomCategory,
        businessName,
        setBusinessNameValue,
        businessLogo,
        setBusinessLogoValue,
        primaryColor,
        setPrimaryColorValue,
        colorKey,
        savedShoppingLists,
        refreshShoppingLists,
        addSavedShoppingList: addSavedShoppingListCb,
        updateSavedShoppingList: updateSavedShoppingListCb,
        deleteSavedShoppingList: deleteSavedShoppingListCb,
        syncStatus,
        isOfflineCached,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}

// ============ MUTATION EXECUTOR ============

/**
 * Execute a single mutation against the server via tRPC.
 * Used both for live mutations and queue flush.
 */
async function executeMutation(
  utils: ReturnType<typeof trpc.useUtils>,
  type: OpType,
  payload: any
): Promise<any> {
  switch (type) {
    case "products.create":
      return utils.client.cloudData.products.create.mutate(payload);
    case "products.update":
      return utils.client.cloudData.products.update.mutate(payload);
    case "products.delete":
      return utils.client.cloudData.products.delete.mutate(payload);
    case "orders.create":
      return utils.client.cloudData.orders.create.mutate(payload);
    case "orders.update":
      return utils.client.cloudData.orders.update.mutate(payload);
    case "orders.delete":
      return utils.client.cloudData.orders.delete.mutate(payload);
    case "orders.archive":
      return utils.client.cloudData.orders.archive.mutate(payload);
    case "orders.unarchive":
      return utils.client.cloudData.orders.unarchive.mutate(payload);
    case "units.create":
      return utils.client.cloudData.units.create.mutate(payload);
    case "units.delete":
      return utils.client.cloudData.units.delete.mutate(payload);
    case "categories.create":
      return utils.client.cloudData.categories.create.mutate(payload);
    case "categories.rename":
      return utils.client.cloudData.categories.rename.mutate(payload);
    case "categories.delete":
      return utils.client.cloudData.categories.delete.mutate(payload);
    case "settings.update":
      return utils.client.cloudData.settings.update.mutate(payload);
    case "shoppingLists.create":
      return utils.client.cloudData.shoppingLists.create.mutate(payload);
    case "shoppingLists.update":
      return utils.client.cloudData.shoppingLists.update.mutate(payload);
    case "shoppingLists.delete":
      return utils.client.cloudData.shoppingLists.delete.mutate(payload);
    default:
      throw new Error(`Unknown mutation type: ${type}`);
  }
}

/**
 * Resolve temp IDs in a pending operation's payload before replaying.
 * For update/delete operations, the `id` field might be a temp ID that
 * needs to be mapped to the real server ID.
 */
function resolvePayloadIds(op: PendingOp): any {
  const payload = { ...op.payload };

  // For operations that reference an entity by ID
  if (payload.id) {
    payload.id = resolveId(payload.id);
  }

  // For shopping lists that reference order IDs
  if (payload.orderIds && Array.isArray(payload.orderIds)) {
    payload.orderIds = payload.orderIds.map((id: string) => resolveId(id));
  }

  // For orders that reference shopping list IDs
  if (payload.shoppingListId) {
    payload.shoppingListId = resolveId(payload.shoppingListId);
  }

  return payload;
}
