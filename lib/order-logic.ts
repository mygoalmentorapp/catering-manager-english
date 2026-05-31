/**
 * Order Logic — SPEC v2
 * Snapshot creation, change detection, false positive check,
 * Priority Matrix, Delta algorithm for shopping lists.
 */

import type {
  Product,
  Order,
  OrderProductRow,
  IngredientSnapshot,
  SavedShoppingList,
  ShoppingListIngredientRow,
  OrderStatus,
  MarkupType,
} from "./types";

// ============ Snapshot Helpers ============

/** Build a flat list of IngredientSnapshot from a Product */
export function buildIngredientsSnapshot(product: Product): IngredientSnapshot[] {
  const snaps: IngredientSnapshot[] = [];

  for (const ing of product.baseIngredients) {
    snaps.push({
      ingredientId: ing.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      price: ing.price,
      category: "base",
    });
  }

  for (const spice of product.spices) {
    snaps.push({
      ingredientId: spice.id,
      name: spice.name,
      quantity: spice.quantity,
      unit: spice.unit,
      price: spice.price,
      category: "spice",
    });
  }

  for (const cat of product.categories ?? []) {
    for (const item of cat.items) {
      snaps.push({
        ingredientId: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        category: cat.categoryName,
      });
    }
  }

  return snaps;
}

/** Compute cost from a product's ingredients (sum of all prices) */
export function computeProductCost(product: Product): number {
  let cost = 0;
  for (const ing of product.baseIngredients) cost += ing.price;
  for (const spice of product.spices) cost += spice.price;
  for (const cat of product.categories ?? []) {
    for (const item of cat.items) cost += item.price;
  }
  return Math.round(cost * 100) / 100;
}

/** Compute cost from a snapshot */
export function computeSnapshotCost(snapshot: IngredientSnapshot[]): number {
  let cost = 0;
  for (const s of snapshot) cost += s.price;
  return Math.round(cost * 100) / 100;
}

/** Create an OrderProductRow from a Product (when adding to order) */
export function createOrderProductRow(
  product: Product,
  quantity: number
): OrderProductRow {
  const now = product.updatedAt;
  return {
    productId: product.id,
    productNameAtAdd: product.name,
    customerPriceAtAdd: product.customerPrice,
    costAtAdd: computeProductCost(product),
    markupTypeAtAdd: product.markupType,
    markupValueAtAdd: product.markupValue,
    ingredientsSnapshotAtAdd: buildIngredientsSnapshot(product),
    productUpdatedAtAtAdd: now,
    lastHandledProductChangeAt: now,
    quantity,
  };
}

// ============ Change Detection ============

export interface ProductChanges {
  productId: string;
  productName: string; // current name
  hasIngredientChanges: boolean;
  /** Split ingredient changes: qty/unit (critical — causes locking) */
  hasIngredientQtyUnitChanges: boolean;
  /** Split ingredient changes: price only (non-critical — no locking) */
  hasIngredientPriceChanges: boolean;
  hasCostChange: boolean;
  hasCustomerPriceChange: boolean;
  hasMarkupChange: boolean;
  hasNameChange: boolean;
  /** Detailed ingredient diffs for display */
  ingredientDiffs: IngredientDiff[];
  /** Diffs that involve qty or unit changes (critical) */
  ingredientQtyUnitDiffs: IngredientDiff[];
  /** Diffs that involve only price changes (non-critical) */
  ingredientPriceDiffs: IngredientDiff[];
  /** Old vs new values */
  oldCost: number;
  newCost: number;
  oldCustomerPrice: number;
  newCustomerPrice: number;
  oldMarkupType: MarkupType;
  newMarkupType: MarkupType;
  oldMarkupValue: number;
  newMarkupValue: number;
  oldName: string;
  newName: string;
}

export interface IngredientDiff {
  name: string;
  type: "added" | "removed" | "changed";
  oldQty?: number;
  newQty?: number;
  oldPrice?: number;
  newPrice?: number;
  oldUnit?: string;
  newUnit?: string;
  oldName?: string;
  newName?: string;
  unit?: string;
}

/**
 * Detect changes between an order product row's snapshot and the current product.
 * Returns null if no real changes (false positive).
 */
export function detectProductChanges(
  row: OrderProductRow,
  currentProduct: Product
): ProductChanges | null {
  // False positive check: if updatedAt hasn't changed, skip
  if (currentProduct.updatedAt <= row.lastHandledProductChangeAt) {
    return null;
  }

  const currentSnapshot = buildIngredientsSnapshot(currentProduct);
  const currentCost = computeProductCost(currentProduct);
  const oldCost = row.costAtAdd;

  // Check ingredient changes
  const ingredientDiffs = compareIngredients(
    row.ingredientsSnapshotAtAdd,
    currentSnapshot
  );
  const hasIngredientChanges = ingredientDiffs.length > 0;

  // Check customer price change
  const hasCustomerPriceChange =
    Math.abs(currentProduct.customerPrice - row.customerPriceAtAdd) > 0.001;

  // Check markup change
  const hasMarkupChange =
    currentProduct.markupType !== row.markupTypeAtAdd ||
    Math.abs(currentProduct.markupValue - row.markupValueAtAdd) > 0.001;

  // Check name change
  const hasNameChange =
    currentProduct.name.trim() !== row.productNameAtAdd.trim();

  // If nothing actually changed, it's a false positive
  if (
    !hasIngredientChanges &&
    !hasCustomerPriceChange &&
    !hasMarkupChange &&
    !hasNameChange
  ) {
    return null;
  }

  // Split ingredient diffs into qty/unit (critical) vs price-only (non-critical)
  const ingredientQtyUnitDiffs = ingredientDiffs.filter((d) => {
    if (d.type === "added" || d.type === "removed") return true; // added/removed are always critical
    // "changed" — critical if qty or unit changed
    return (d.oldQty != null && d.newQty != null && d.oldQty !== d.newQty) ||
           (d.oldUnit != null && d.newUnit != null && d.oldUnit !== d.newUnit) ||
           (d.oldName != null && d.newName != null && d.oldName !== d.newName);
  });
  const ingredientPriceDiffs = ingredientDiffs.filter((d) => {
    if (d.type !== "changed") return false;
    // Any ingredient with a price change — even if it also has qty/unit changes
    const hasPrice = d.oldPrice != null && d.newPrice != null && Math.abs(d.oldPrice - d.newPrice) > 0.001;
    return hasPrice;
  });

  return {
    productId: row.productId,
    productName: currentProduct.name,
    hasIngredientChanges,
    hasIngredientQtyUnitChanges: ingredientQtyUnitDiffs.length > 0,
    hasIngredientPriceChanges: ingredientPriceDiffs.length > 0,
    hasCostChange: false, // cost is auto-calculated, not shown in changes screen
    hasCustomerPriceChange,
    hasMarkupChange,
    hasNameChange,
    ingredientDiffs,
    ingredientQtyUnitDiffs,
    ingredientPriceDiffs,
    oldCost,
    newCost: currentCost,
    oldCustomerPrice: row.customerPriceAtAdd,
    newCustomerPrice: currentProduct.customerPrice,
    oldMarkupType: row.markupTypeAtAdd,
    newMarkupType: currentProduct.markupType,
    oldMarkupValue: row.markupValueAtAdd,
    newMarkupValue: currentProduct.markupValue,
    oldName: row.productNameAtAdd,
    newName: currentProduct.name,
  };
}

/** Compare two ingredient snapshots — match by ingredientId, detect unit changes */
function compareIngredients(
  oldSnap: IngredientSnapshot[],
  newSnap: IngredientSnapshot[]
): IngredientDiff[] {
  const diffs: IngredientDiff[] = [];

  // Primary key: ingredientId (stable ID).
  // If the same ingredientId appears with a different unit, that's a unit change, not remove+add.
  const oldById = new Map<string, IngredientSnapshot>();
  for (const s of oldSnap) {
    oldById.set(s.ingredientId, s);
  }

  const newById = new Map<string, IngredientSnapshot>();
  for (const s of newSnap) {
    newById.set(s.ingredientId, s);
  }

  // Check removed and changed
  for (const [id, oldIng] of oldById) {
    const newIng = newById.get(id);
    if (!newIng) {
      diffs.push({ name: oldIng.name, type: "removed" });
    } else {
      const unitChanged = oldIng.unit !== newIng.unit;
      const qtyChanged = Math.abs(newIng.quantity - oldIng.quantity) > 0.001;
      const priceChanged = Math.abs(newIng.price - oldIng.price) > 0.001;
      const nameChanged = oldIng.name !== newIng.name;
      if (unitChanged || qtyChanged || priceChanged || nameChanged) {
        diffs.push({
          name: newIng.name,
          type: "changed",
          ...(qtyChanged ? { oldQty: oldIng.quantity, newQty: newIng.quantity } : {}),
          ...(priceChanged ? { oldPrice: oldIng.price, newPrice: newIng.price } : {}),
          ...(unitChanged ? { oldUnit: oldIng.unit, newUnit: newIng.unit } : {}),
          ...(nameChanged ? { oldName: oldIng.name, newName: newIng.name } : {}),
          unit: newIng.unit,
        });
      }
    }
  }

  // Check added
  for (const [id, newIng] of newById) {
    if (!oldById.has(id)) {
      diffs.push({ name: newIng.name, type: "added" });
    }
  }

  return diffs;
}

/**
 * Analyze all products in an order for changes.
 * Returns changes grouped by type per the Priority Matrix.
 */
export function analyzeOrderChanges(
  order: Order,
  products: Product[]
): {
  allChanges: ProductChanges[];
  hasAnyIngredientChanges: boolean;
  hasAnyIngredientQtyUnitChanges: boolean;
  hasAnyIngredientPriceChanges: boolean;
  customerPriceChanges: ProductChanges[];
  markupChanges: ProductChanges[];
  nameChanges: ProductChanges[];
} {
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);

  const allChanges: ProductChanges[] = [];

  for (const row of order.products) {
    const currentProduct = productMap.get(row.productId);
    if (!currentProduct) continue; // product deleted — snapshot still works

    const changes = detectProductChanges(row, currentProduct);
    if (changes) {
      allChanges.push(changes);
    }
  }

  return {
    allChanges,
    hasAnyIngredientChanges: allChanges.some((c) => c.hasIngredientChanges),
    /** Critical: qty/unit ingredient changes cause locking */
    hasAnyIngredientQtyUnitChanges: allChanges.some((c) => c.hasIngredientQtyUnitChanges),
    /** Non-critical: price-only ingredient changes do NOT cause locking */
    hasAnyIngredientPriceChanges: allChanges.some((c) => c.hasIngredientPriceChanges),
    customerPriceChanges: allChanges.filter((c) => c.hasCustomerPriceChange),
    markupChanges: allChanges.filter((c) => c.hasMarkupChange),
    nameChanges: allChanges.filter((c) => c.hasNameChange),
  };
}

// ============ Refresh Logic ============

export type RefreshType = "partial" | "full";

/**
 * Refresh an order's product rows from current product data.
 * - partial: updates ingredients + cost only
 * - full: updates ingredients + cost + customerPrice
 * Returns the updated products array.
 */
export function refreshOrderProducts(
  orderProducts: OrderProductRow[],
  products: Product[],
  refreshType: RefreshType
): OrderProductRow[] {
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);

  return orderProducts.map((row) => {
    const currentProduct = productMap.get(row.productId);
    if (!currentProduct) return row; // product deleted — keep snapshot

    const newSnapshot = buildIngredientsSnapshot(currentProduct);
    const newCost = computeProductCost(currentProduct);
    const now = currentProduct.updatedAt;

    const updated: OrderProductRow = {
      ...row,
      ingredientsSnapshotAtAdd: newSnapshot,
      costAtAdd: newCost,
      markupTypeAtAdd: currentProduct.markupType,
      markupValueAtAdd: currentProduct.markupValue,
      productUpdatedAtAtAdd: now,
      lastHandledProductChangeAt: now,
    };

    if (refreshType === "full") {
      updated.customerPriceAtAdd = currentProduct.customerPrice;
      updated.markupTypeAtAdd = currentProduct.markupType;
      updated.markupValueAtAdd = currentProduct.markupValue;
    }

    return updated;
  });
}

// ============ Selective Refresh Logic ============

/** Options for selective refresh — each flag controls what gets updated */
export interface SelectiveRefreshOptions {
  /** Update ingredient qty/unit/name (critical — affects shopping list) */
  updateIngredientQtyUnit: boolean;
  /** Update ingredient prices (non-critical) */
  updateIngredientPrice: boolean;
  updateCustomerPrice: boolean;
  updateMarkup: boolean;
  updateName: boolean;
}

/**
 * Selectively refresh an order's product rows based on user-chosen checkboxes.
 * Only updates the fields the user selected.
 * lastHandledProductChangeAt is NOT updated here — it stays unchanged so
 * detectProductChanges can still find unresolved changes on next open.
 * The caller (changes-review screen) manages dismissed categories separately.
 */
export function selectiveRefreshOrderProducts(
  orderProducts: OrderProductRow[],
  products: Product[],
  options: SelectiveRefreshOptions
): OrderProductRow[] {
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);

  return orderProducts.map((row) => {
    const currentProduct = productMap.get(row.productId);
    if (!currentProduct) return row;

    const updated: OrderProductRow = { ...row };

    // If both qty/unit and price are updated, replace entire snapshot
    if (options.updateIngredientQtyUnit && options.updateIngredientPrice) {
      updated.ingredientsSnapshotAtAdd = buildIngredientsSnapshot(currentProduct);
      updated.costAtAdd = computeProductCost(currentProduct);
    } else if (options.updateIngredientQtyUnit) {
      // Update qty/unit/name in snapshot but keep old prices
      const newSnap = buildIngredientsSnapshot(currentProduct);
      const oldPriceMap = new Map<string, number>();
      for (const s of row.ingredientsSnapshotAtAdd) oldPriceMap.set(s.ingredientId, s.price);
      updated.ingredientsSnapshotAtAdd = newSnap.map((s) => ({
        ...s,
        price: oldPriceMap.has(s.ingredientId) ? oldPriceMap.get(s.ingredientId)! : s.price,
      }));
      // Recalculate cost from updated snapshot
      updated.costAtAdd = computeSnapshotCost(updated.ingredientsSnapshotAtAdd);
    } else if (options.updateIngredientPrice) {
      // Update only prices in snapshot, keep qty/unit/name
      const newSnap = buildIngredientsSnapshot(currentProduct);
      const newPriceMap = new Map<string, number>();
      for (const s of newSnap) newPriceMap.set(s.ingredientId, s.price);
      updated.ingredientsSnapshotAtAdd = row.ingredientsSnapshotAtAdd.map((s) => ({
        ...s,
        price: newPriceMap.has(s.ingredientId) ? newPriceMap.get(s.ingredientId)! : s.price,
      }));
      updated.costAtAdd = computeSnapshotCost(updated.ingredientsSnapshotAtAdd);
    }

    if (options.updateCustomerPrice) {
      updated.customerPriceAtAdd = currentProduct.customerPrice;
    }

    if (options.updateMarkup) {
      updated.markupTypeAtAdd = currentProduct.markupType;
      updated.markupValueAtAdd = currentProduct.markupValue;
    }

    if (options.updateName) {
      updated.productNameAtAdd = currentProduct.name;
    }

    return updated;
  });
}

/**
 * Mark all product rows as fully handled — updates lastHandledProductChangeAt.
 * Called only when ALL changes (including ingredients) have been resolved.
 */
export function markAllChangesHandled(
  orderProducts: OrderProductRow[],
  products: Product[]
): OrderProductRow[] {
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);

  return orderProducts.map((row) => {
    const currentProduct = productMap.get(row.productId);
    if (!currentProduct) return row;
    return {
      ...row,
      productUpdatedAtAtAdd: currentProduct.updatedAt,
      lastHandledProductChangeAt: currentProduct.updatedAt,
    };
  });
}

// ============ Delta Algorithm ============

/**
 * Apply Delta to a shopping list when an order changes.
 * Compares old snapshot vs new snapshot for a specific order,
 * and updates the shopping list rows accordingly.
 *
 * @param list - current shopping list
 * @param orderId - the order that changed
 * @param oldProducts - old OrderProductRow[] (before change)
 * @param newProducts - new OrderProductRow[] (after change)
 * @returns updated rows
 */
export function applyDelta(
  currentRows: ShoppingListIngredientRow[],
  orderId: string,
  oldProducts: OrderProductRow[],
  newProducts: OrderProductRow[]
): ShoppingListIngredientRow[] {
  // Build old ingredient totals for this order
  const oldIngredients = flattenOrderIngredients(oldProducts);
  // Build new ingredient totals for this order
  const newIngredients = flattenOrderIngredients(newProducts);

  // Clone rows
  const rows = currentRows.map((r) => ({ ...r, sourceBreakdown: { ...r.sourceBreakdown } }));

  // Collect all ingredient keys
  const allKeys = new Set([...oldIngredients.keys(), ...newIngredients.keys()]);

  for (const key of allKeys) {
    const oldQty = oldIngredients.get(key)?.qty ?? 0;
    const newQty = newIngredients.get(key)?.qty ?? 0;
    const delta = newQty - oldQty;

    if (Math.abs(delta) < 0.001) continue;

    // Find or create the row
    let row = rows.find((r) => `${r.ingredientId}|${r.unit}` === key);
    if (!row) {
      const info = newIngredients.get(key) ?? oldIngredients.get(key)!;
      row = {
        ingredientId: info.ingredientId,
        name: info.name,
        unit: info.unit,
        category: info.category,
        totalQty: 0,
        sourceBreakdown: {},
        manualDelta: 0,
        finalQty: 0,
      };
      rows.push(row);
    }

    // Update sourceBreakdown
    row.sourceBreakdown[orderId] = (row.sourceBreakdown[orderId] ?? 0) + delta;

    // Recalculate totalQty from all sources
    row.totalQty = Object.values(row.sourceBreakdown).reduce((sum, v) => sum + v, 0);
    row.totalQty = Math.round(row.totalQty * 10) / 10;

    // Recalculate finalQty with minimum correction
    row.finalQty = row.totalQty + row.manualDelta;
    if (row.finalQty < 0) {
      row.finalQty = 0;
      row.manualDelta = -row.totalQty;
    }
  }

  // Remove rows where the ingredient is no longer needed (totalQty <= 0 and finalQty <= 0)
  // This handles unit changes: old unit row drops to 0, new unit row is added
  return rows.filter((r) => r.totalQty > 0.001 || r.finalQty > 0.001 || r.manualDelta > 0.001);
}

interface FlatIngredient {
  ingredientId: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
}

/** Flatten all ingredients from order product rows, multiplied by quantity */
function flattenOrderIngredients(
  products: OrderProductRow[]
): Map<string, FlatIngredient> {
  const map = new Map<string, FlatIngredient>();

  for (const row of products) {
    for (const ing of row.ingredientsSnapshotAtAdd) {
      const key = `${ing.ingredientId}|${ing.unit}`;
      const existing = map.get(key);
      const qty = ing.quantity * row.quantity;
      if (existing) {
        existing.qty += qty;
      } else {
        map.set(key, {
          ingredientId: ing.ingredientId,
          name: ing.name,
          qty,
          unit: ing.unit,
          category: ing.category,
        });
      }
    }
  }

  // Round
  for (const v of map.values()) {
    v.qty = Math.round(v.qty * 10) / 10;
  }

  return map;
}

/**
 * Generate initial shopping list rows from orders (using snapshots).
 */
export function generateShoppingListRows(
  orders: Order[]
): ShoppingListIngredientRow[] {
  const rowMap = new Map<string, ShoppingListIngredientRow>();

  for (const order of orders) {
    for (const product of order.products) {
      for (const ing of product.ingredientsSnapshotAtAdd) {
        // Merge by normalized name + unit (not ingredientId) so identical ingredients
        // from different products are combined into a single row
        const normalizedName = ing.name.trim().replace(/\s+/g, " ");
        const normalizedUnit = ing.unit.trim();
        const key = `${normalizedName}|${normalizedUnit}`;
        const qty = Math.round(ing.quantity * product.quantity * 10) / 10;

        let row = rowMap.get(key);
        if (!row) {
          row = {
            ingredientId: ing.ingredientId,
            name: ing.name,
            unit: ing.unit,
            category: ing.category,
            totalQty: 0,
            sourceBreakdown: {},
            manualDelta: 0,
            finalQty: 0,
          };
          rowMap.set(key, row);
        }

        row.sourceBreakdown[order.id] = (row.sourceBreakdown[order.id] ?? 0) + qty;
        row.totalQty += qty;
      }
    }
  }

  // Finalize
  for (const row of rowMap.values()) {
    row.totalQty = Math.round(row.totalQty * 10) / 10;
    row.finalQty = row.totalQty; // manualDelta is 0 initially
  }

  return Array.from(rowMap.values());
}

// ============ Status Helpers ============

/** Check if any linked order is in needs_refresh_locked status */
export function shouldLockShoppingList(
  list: SavedShoppingList,
  orders: Order[]
): boolean {
  const orderMap = new Map<string, Order>();
  for (const o of orders) orderMap.set(o.id, o);

  return list.orderIds.some((id) => {
    const order = orderMap.get(id);
    return order && order.status === "needs_refresh_locked";
  });
}

/** Get locked orders for a shopping list */
export function getLockedOrdersForList(
  list: SavedShoppingList,
  orders: Order[]
): Order[] {
  const orderMap = new Map<string, Order>();
  for (const o of orders) orderMap.set(o.id, o);

  return list.orderIds
    .map((id) => orderMap.get(id))
    .filter((o): o is Order => !!o && o.status === "needs_refresh_locked")
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
}
