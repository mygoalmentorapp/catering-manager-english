// Data models for the catering order management app
// SPEC v2 — Snapshot-based orders & Delta shopping lists

// ============ Ingredients & Products ============

export interface BaseIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number; // price for the given quantity
}

// Spices have quantity, unit, and price — same structure as BaseIngredient
export interface Spice {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

// A single item inside a dynamic category
export interface CategoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

// A dynamic category with its items inside a product
export interface ProductCategory {
  categoryId: string;
  categoryName: string;
  items: CategoryItem[];
}

export type MarkupType = "percent" | "fixed";

export interface Product {
  id: string;
  name: string;
  baseIngredients: BaseIngredient[];
  spices: Spice[];
  categories: ProductCategory[]; // dynamic custom categories
  customerPrice: number; // price charged to customer for this product
  markupType: MarkupType;
  markupValue: number;
  baseLabel?: string; // custom label for base ingredients section (default: "מרכיבי בסיס")
  spiceLabel?: string; // custom label for spices section (default: "תבלינים")
  createdAt: string;
  updatedAt: string;
}

// ============ Ingredient Snapshot (stored in order row) ============

/** A single ingredient snapshot stored inside an order product row */
export interface IngredientSnapshot {
  ingredientId: string;  // stable ID from BaseIngredient/Spice/CategoryItem
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category: string; // "base" | "spice" | custom category name
}

// ============ Order ============

export type OrderStatus = "open" | "needs_refresh_locked" | "archived";

/** A single product row inside an order — with full snapshot */
export interface OrderProductRow {
  productId: string;
  productNameAtAdd: string;
  customerPriceAtAdd: number;
  costAtAdd: number;
  markupTypeAtAdd: MarkupType;
  markupValueAtAdd: number;
  ingredientsSnapshotAtAdd: IngredientSnapshot[];
  productUpdatedAtAtAdd: string; // product.updatedAt at time of adding
  lastHandledProductChangeAt: string; // updated after handling change dialogs
  quantity: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  eventDate: string; // ISO date string
  products: OrderProductRow[];
  notes: string;
  status: OrderStatus;
  archivedAt?: string; // ISO date when archived
  shoppingListId?: string; // ID of the active shopping list for this order (max 1)
  /**
   * Per-product map of change categories that the user has already handled or dismissed.
   * Key: productId, Value: set of categories ("cost", "customerPrice", "markup", "name").
   * "ingredients" is NEVER dismissed — it stays until explicitly updated.
   * Cleared when all changes are resolved or when product is re-detected with new changes.
   */
  dismissedChangeCategories?: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
}

// ============ Shopping List ============

export type ShoppingListStatus = "valid" | "needs_refresh_locked" | "deleted";

/** A single ingredient row in a shopping list */
export interface ShoppingListIngredientRow {
  ingredientId: string;
  name: string;
  unit: string;
  category: string; // "base" | "spice" | custom category name
  totalQty: number; // sum from all orders
  sourceBreakdown: Record<string, number>; // orderId -> qty contribution
  manualDelta: number; // user manual adjustment (never overwritten)
  finalQty: number; // totalQty + manualDelta (min 0)
}

export interface SavedShoppingList {
  id: string;
  orderIds: string[];      // IDs of orders linked to this list
  orderNames: string[];    // Customer names for display
  rows: ShoppingListIngredientRow[];
  status: ShoppingListStatus;
  createdAt: string;
  updatedAt: string;
}

// ============ Units & Categories ============

export interface UnitDef {
  singular: string;
  plural: string;
}

export interface CustomCategory {
  id: string;
  name: string;
  createdAt: string;
}

// ============ Legacy types (kept for backward compat during migration) ============

/** @deprecated — use OrderProductRow */
export interface OrderProduct {
  productId: string;
  productName: string;
  quantity: number;
}

export interface ShoppingListItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface ShoppingListCategory {
  categoryName: string;
  items: ShoppingListItem[];
}

export interface ShoppingList {
  baseIngredients: ShoppingListItem[];
  spices: ShoppingListItem[];
  categories: ShoppingListCategory[];
  orderCount: number;
}

/** @deprecated — use ShoppingListIngredientRow */
export interface ShoppingListRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
}
