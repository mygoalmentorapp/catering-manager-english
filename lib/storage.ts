import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { generateId } from "./uuid";
import type { Product, Order, CustomCategory, UnitDef, SavedShoppingList, OrderProductRow } from "./types";

const PRODUCTS_KEY = "@catering_products";
const ORDERS_KEY = "@catering_orders";
const UNITS_KEY = "@catering_units";
const CATEGORIES_KEY = "@catering_categories";
const MIGRATION_KEY = "@catering_migration_v5";
const BUSINESS_NAME_KEY = "@catering_business_name";
const BUSINESS_LOGO_KEY = "@catering_business_logo";
const SHOPPING_LISTS_KEY = "@catering_shopping_lists";
const PRIMARY_COLOR_KEY = "@catering_primary_color";

// ============ Business Name ============
export async function getBusinessName(): Promise<string> {
  const name = await AsyncStorage.getItem(BUSINESS_NAME_KEY);
  return name || "";
}

export async function setBusinessName(name: string): Promise<void> {
  await AsyncStorage.setItem(BUSINESS_NAME_KEY, name);
}

// ============ Business Logo ============
export async function getBusinessLogo(): Promise<string> {
  const logo = await AsyncStorage.getItem(BUSINESS_LOGO_KEY);
  return logo || "";
}

export async function setBusinessLogo(uri: string): Promise<void> {
  await AsyncStorage.setItem(BUSINESS_LOGO_KEY, uri);
}

// ============ Primary Color ============
export const DEFAULT_PRIMARY_COLOR = "#3AAFA9";

export async function getPrimaryColor(): Promise<string> {
  const color = await AsyncStorage.getItem(PRIMARY_COLOR_KEY);
  return color || DEFAULT_PRIMARY_COLOR;
}

export async function setPrimaryColor(color: string): Promise<void> {
  await AsyncStorage.setItem(PRIMARY_COLOR_KEY, color);
}

const DEFAULT_UNITS: UnitDef[] = [
  { singular: "קילו", plural: "קילו" },
  { singular: "גרם", plural: "גרם" },
  { singular: "ליטר", plural: "ליטר" },
  { singular: "מ\"ל", plural: "מ\"ל" },
  { singular: "יחידה", plural: "יחידות" },
  { singular: "כוס", plural: "כוסות" },
  { singular: "כף", plural: "כפות" },
  { singular: "קופסא", plural: "קופסאות" },
];

// ============ Migration ============

export async function runMigrations(): Promise<void> {
  try {
    const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
    if (migrated === "done") return;

    // Migrate products
    const prodData = await AsyncStorage.getItem(PRODUCTS_KEY);
    if (prodData) {
      const products = JSON.parse(prodData) as any[];
      let changed = false;
      for (const product of products) {
        if (Array.isArray(product.baseIngredients)) {
          for (const ing of product.baseIngredients) {
            if (ing.price === undefined) { ing.price = 0; changed = true; }
          }
        }
        if (Array.isArray(product.spices)) {
          for (const spice of product.spices) {
            if (spice.quantity === undefined) { spice.quantity = 0; spice.unit = ""; changed = true; }
            if (spice.price === undefined) { spice.price = 0; changed = true; }
          }
        }
        if (product.customerPrice === undefined) { product.customerPrice = 0; changed = true; }
        if (product.markupType === undefined) { product.markupType = "percent"; product.markupValue = 0; changed = true; }
        if (!Array.isArray(product.categories)) {
          product.categories = []; changed = true;
        } else {
          for (const cat of product.categories) {
            if (Array.isArray(cat.items)) {
              for (const item of cat.items) {
                if (item.price === undefined) { item.price = 0; changed = true; }
              }
            }
          }
        }
      }
      if (changed) {
        await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
      }
    }

    // Migrate orders to v5 (snapshot-based)
    const orderData = await AsyncStorage.getItem(ORDERS_KEY);
    if (orderData) {
      const orders = JSON.parse(orderData) as any[];
      let changed = false;
      // Load products for snapshot migration
      const products = prodData ? JSON.parse(prodData) as any[] : [];
      const productMap = new Map<string, any>();
      for (const p of products) productMap.set(p.id, p);

      for (const order of orders) {
        // Remove legacy markup fields
        if (order.markupType !== undefined) {
          delete order.markupType;
          delete order.markupValue;
          changed = true;
        }
        // Add status if missing
        if (!order.status) {
          order.status = "open";
          changed = true;
        }
        // Migrate old OrderProduct[] to OrderProductRow[]
        if (Array.isArray(order.products) && order.products.length > 0) {
          const firstProd = order.products[0];
          // Detect old format: has productName but not productNameAtAdd
          if (firstProd.productName !== undefined && firstProd.productNameAtAdd === undefined) {
            const now = new Date().toISOString();
            order.products = order.products.map((op: any) => {
              const product = productMap.get(op.productId);
              const row: any = {
                productId: op.productId,
                productNameAtAdd: op.productName || (product?.name ?? "מוצר לא ידוע"),
                customerPriceAtAdd: product?.customerPrice ?? 0,
                costAtAdd: 0,
                markupTypeAtAdd: product?.markupType ?? "percent",
                markupValueAtAdd: product?.markupValue ?? 0,
                ingredientsSnapshotAtAdd: [],
                productUpdatedAtAtAdd: product?.updatedAt ?? now,
                lastHandledProductChangeAt: product?.updatedAt ?? now,
                quantity: op.quantity ?? 1,
              };
              // Build snapshot from product if available
              if (product) {
                const snaps: any[] = [];
                for (const ing of product.baseIngredients ?? []) {
                  snaps.push({ ingredientId: ing.id, name: ing.name, quantity: ing.quantity, unit: ing.unit, price: ing.price ?? 0, category: "base" });
                }
                for (const spice of product.spices ?? []) {
                  snaps.push({ ingredientId: spice.id, name: spice.name, quantity: spice.quantity ?? 0, unit: spice.unit ?? "", price: spice.price ?? 0, category: "spice" });
                }
                for (const cat of product.categories ?? []) {
                  for (const item of cat.items ?? []) {
                    snaps.push({ ingredientId: item.id, name: item.name, quantity: item.quantity, unit: item.unit, price: item.price ?? 0, category: cat.categoryName });
                  }
                }
                row.ingredientsSnapshotAtAdd = snaps;
                let cost = 0;
                for (const s of snaps) cost += s.price;
                row.costAtAdd = Math.round(cost * 100) / 100;
              }
              return row;
            });
            changed = true;
          }
        }
      }
      if (changed) {
        await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
      }
    }

    // Migrate shopping lists to v5
    const listData = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
    if (listData) {
      const lists = JSON.parse(listData) as any[];
      let changed = false;
      for (const list of lists) {
        if (!list.status) {
          list.status = "valid";
          changed = true;
        }
        // Migrate old format (originalRows/editedRows) to new (rows)
        if (list.originalRows !== undefined && list.rows === undefined) {
          list.rows = (list.editedRows ?? list.originalRows ?? []).map((r: any) => ({
            ingredientId: r.id || generateId(),
            name: r.name,
            unit: r.unit,
            category: r.category || "base",
            totalQty: r.quantity,
            sourceBreakdown: {},
            manualDelta: 0,
            finalQty: r.quantity,
          }));
          delete list.originalRows;
          delete list.editedRows;
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(lists));
      }
    }

    await AsyncStorage.setItem(MIGRATION_KEY, "done");
  } catch {
    // Migration errors are non-fatal
  }
}

// ============ Products ============

export async function getProducts(): Promise<Product[]> {
  try {
    const data = await AsyncStorage.getItem(PRODUCTS_KEY);
    if (!data) return [];
    const products = JSON.parse(data) as Product[];
    return products.map((p) => ({
      ...p,
      categories: (p.categories ?? []).map((cat: any) => ({
        ...cat,
        items: (cat.items ?? []).map((item: any) => ({ ...item, price: item.price ?? 0 })),
      })),
      baseIngredients: (p.baseIngredients ?? []).map((ing: any) => ({ ...ing, price: ing.price ?? 0 })),
      spices: (p.spices ?? []).map((s: any) => ({
        ...s,
        quantity: s.quantity ?? 0,
        unit: s.unit ?? "",
        price: s.price ?? 0,
      })),
      customerPrice: p.customerPrice ?? 0,
      markupType: (p as any).markupType ?? "percent",
      markupValue: (p as any).markupValue ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function saveProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export async function addProduct(
  product: Omit<Product, "id" | "createdAt" | "updatedAt">
): Promise<Product> {
  const products = await getProducts();
  const exists = products.some(
    (p) => p.name.trim().toLowerCase() === product.name.trim().toLowerCase()
  );
  if (exists) {
    throw new Error("כבר קיים מוצר בשם זה");
  }
  const now = new Date().toISOString();
  const newProduct: Product = {
    ...product,
    categories: product.categories ?? [],
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  products.push(newProduct);
  await saveProducts(products);
  return newProduct;
}

export async function updateProduct(
  id: string,
  updates: Omit<Product, "id" | "createdAt" | "updatedAt">
): Promise<Product> {
  const products = await getProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("מוצר לא נמצא");

  const nameExists = products.some(
    (p) =>
      p.id !== id &&
      p.name.trim().toLowerCase() === updates.name.trim().toLowerCase()
  );
  if (nameExists) {
    throw new Error("כבר קיים מוצר בשם זה");
  }

  const updated: Product = {
    ...products[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  products[index] = updated;
  await saveProducts(products);
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const orders = await getOrders();
  const isUsed = orders.some((order) =>
    order.products.some((op) => op.productId === id)
  );
  if (isUsed) {
    throw new Error(
      "לא ניתן למחוק מוצר זה מכיוון שהוא משויך להזמנות קיימות"
    );
  }
  const products = await getProducts();
  const filtered = products.filter((p) => p.id !== id);
  await saveProducts(filtered);
}

// ============ Orders ============

export async function getOrders(): Promise<Order[]> {
  try {
    const data = await AsyncStorage.getItem(ORDERS_KEY);
    if (!data) return [];
    const orders = JSON.parse(data) as any[];
    return orders.map((o) => {
      const { markupType, markupValue, ...rest } = o;
      return {
        ...rest,
        status: rest.status || "open",
        products: (rest.products ?? []).map((p: any) => ({
          ...p,
          ingredientsSnapshotAtAdd: p.ingredientsSnapshotAtAdd ?? [],
          lastHandledProductChangeAt: p.lastHandledProductChangeAt ?? p.productUpdatedAtAtAdd ?? "",
        })),
      } as Order;
    });
  } catch {
    return [];
  }
}

export async function saveOrders(orders: Order[]): Promise<void> {
  await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export async function addOrder(
  order: Omit<Order, "id" | "createdAt" | "updatedAt">
): Promise<Order> {
  const orders = await getOrders();
  const now = new Date().toISOString();
  const newOrder: Order = {
    ...order,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  orders.push(newOrder);
  await saveOrders(orders);
  return newOrder;
}

export async function updateOrder(
  id: string,
  updates: Partial<Omit<Order, "id" | "createdAt">>
): Promise<Order> {
  const orders = await getOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) throw new Error("הזמנה לא נמצאה");

  const updated: Order = {
    ...orders[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  orders[index] = updated;
  await saveOrders(orders);
  return updated;
}

export async function deleteOrder(id: string): Promise<void> {
  const orders = await getOrders();
  const filtered = orders.filter((o) => o.id !== id);
  await saveOrders(filtered);
}

/**
 * Archive an order atomically.
 * If the order has shopping lists, they are deleted.
 */
export async function archiveOrder(id: string): Promise<void> {
  const orders = await getOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) throw new Error("הזמנה לא נמצאה");

  const order = orders[index];

  // Delete associated shopping lists
  if (order.shoppingListId) {
    const lists = await getSavedShoppingLists();
    const updatedLists = lists.map((l) => {
      if (l.id === order.shoppingListId || l.orderIds.includes(id)) {
        return { ...l, status: "deleted" as const, updatedAt: new Date().toISOString() };
      }
      return l;
    });
    await saveSavedShoppingLists(updatedLists);
  } else {
    // Also check if any list references this order
    const lists = await getSavedShoppingLists();
    let changed = false;
    const updatedLists = lists.map((l) => {
      if (l.orderIds.includes(id) && l.status !== "deleted") {
        changed = true;
        return { ...l, status: "deleted" as const, updatedAt: new Date().toISOString() };
      }
      return l;
    });
    if (changed) await saveSavedShoppingLists(updatedLists);
  }

  orders[index] = {
    ...order,
    status: "archived",
    archivedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveOrders(orders);
}

/**
 * Unarchive an order — set status back to open.
 * Shopping lists are NOT restored.
 */
export async function unarchiveOrder(id: string): Promise<Order> {
  const orders = await getOrders();
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) throw new Error("הזמנה לא נמצאה");

  const updated: Order = {
    ...orders[index],
    status: "open",
    archivedAt: undefined,
    shoppingListId: undefined,
    updatedAt: new Date().toISOString(),
  };
  orders[index] = updated;
  await saveOrders(orders);
  return updated;
}

// ============ Measurement Units ============

function migrateUnits(raw: any[]): UnitDef[] {
  return raw.map((u) => {
    if (typeof u === "string") {
      // Try to match against DEFAULT_UNITS for proper plural form
      const match = DEFAULT_UNITS.find((d) => d.singular === u || d.plural === u);
      if (match) return { ...match };
      return { singular: u, plural: u };
    }
    // Fix units that were migrated with same singular/plural
    if (u.singular && u.singular === u.plural) {
      const match = DEFAULT_UNITS.find((d) => d.singular === u.singular || d.plural === u.singular);
      if (match) return { ...match };
    }
    return u as UnitDef;
  });
}

export async function getUnits(): Promise<UnitDef[]> {
  try {
    const data = await AsyncStorage.getItem(UNITS_KEY);
    if (data) {
      const parsed = JSON.parse(data) as any[];
      if (parsed.length === 0) return DEFAULT_UNITS;
      const migrated = migrateUnits(parsed);
      // Re-save if any units were strings or had same singular/plural (fixed by migration)
      const needsSave = parsed.some((u: any) => typeof u === "string") ||
        parsed.some((u: any) => typeof u === "object" && u.singular && u.singular === u.plural);
      if (needsSave) {
        await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(migrated));
      }
      return migrated;
    }
    await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(DEFAULT_UNITS));
    return DEFAULT_UNITS;
  } catch {
    return DEFAULT_UNITS;
  }
}

export async function addUnit(unit: UnitDef): Promise<UnitDef[]> {
  const units = await getUnits();
  if (!unit.singular.trim()) throw new Error("יש להזין שם יחידה");
  if (!unit.plural.trim()) throw new Error("יש להזין גם צורת רבים");
  if (units.some((u) => u.singular === unit.singular.trim())) {
    throw new Error("יחידה זו כבר קיימת");
  }
  const updated = [...units, { singular: unit.singular.trim(), plural: unit.plural.trim() }];
  await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteUnit(singular: string): Promise<UnitDef[]> {
  const units = await getUnits();
  const filtered = units.filter((u) => u.singular !== singular);
  await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(filtered));
  return filtered;
}

// ============ Custom Categories ============

export async function getCustomCategories(): Promise<CustomCategory[]> {
  try {
    const data = await AsyncStorage.getItem(CATEGORIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addCustomCategory(name: string): Promise<CustomCategory[]> {
  const categories = await getCustomCategories();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("יש להזין שם קטגוריה");
  if (categories.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("קטגוריה זו כבר קיימת");
  }
  const newCat: CustomCategory = {
    id: generateId(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  const updated = [...categories, newCat];
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteCustomCategory(id: string): Promise<CustomCategory[]> {
  const categories = await getCustomCategories();
  const filtered = categories.filter((c) => c.id !== id);
  await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(filtered));
  return filtered;
}

// ============ Saved Shopping Lists ============

export async function getSavedShoppingLists(): Promise<SavedShoppingList[]> {
  try {
    const data = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
    if (!data) return [];
    const lists = JSON.parse(data) as SavedShoppingList[];
    // Filter out deleted lists
    return lists.filter((l) => l.status !== "deleted");
  } catch {
    return [];
  }
}

/** Get ALL lists including deleted (for internal use) */
export async function getAllSavedShoppingLists(): Promise<SavedShoppingList[]> {
  try {
    const data = await AsyncStorage.getItem(SHOPPING_LISTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveSavedShoppingLists(lists: SavedShoppingList[]): Promise<void> {
  await AsyncStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(lists));
}

export async function addSavedShoppingList(
  list: Omit<SavedShoppingList, "id" | "createdAt" | "updatedAt">
): Promise<SavedShoppingList> {
  const lists = await getAllSavedShoppingLists();
  const now = new Date().toISOString();
  const newList: SavedShoppingList = {
    ...list,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  lists.push(newList);
  await saveSavedShoppingLists(lists);
  return newList;
}

export async function updateSavedShoppingList(
  id: string,
  updates: Partial<Omit<SavedShoppingList, "id" | "createdAt">>
): Promise<SavedShoppingList> {
  const lists = await getAllSavedShoppingLists();
  const index = lists.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("רשימת קניות לא נמצאה");
  const updated: SavedShoppingList = {
    ...lists[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  lists[index] = updated;
  await saveSavedShoppingLists(lists);
  return updated;
}

export async function deleteSavedShoppingList(id: string): Promise<void> {
  const lists = await getAllSavedShoppingLists();
  // Mark as deleted instead of removing
  const updatedLists = lists.map((l) =>
    l.id === id ? { ...l, status: "deleted" as const, updatedAt: new Date().toISOString() } : l
  );
  await saveSavedShoppingLists(updatedLists);
}

// ============ Export / Import ============

export interface ExportData {
  version: 3;
  exportedAt: string;
  products: Product[];
  orders: Order[];
  units: (UnitDef | string)[];
  customCategories: CustomCategory[];
  businessName?: string;
  businessLogo?: string;
  primaryColor?: string;
  savedShoppingLists?: SavedShoppingList[];
}

export async function exportAllData(): Promise<ExportData> {
  const [products, orders, units, customCategories, businessName, businessLogo, savedShoppingLists, primaryColor] = await Promise.all([
    getProducts(),
    getOrders(),
    getUnits(),
    getCustomCategories(),
    getBusinessName(),
    getBusinessLogo(),
    getSavedShoppingLists(),
    getPrimaryColor(),
  ]);

  // Convert logo file URI to base64 data URI for portability
  let logoForExport = businessLogo || undefined;
  if (logoForExport && !logoForExport.startsWith("data:")) {
    try {
      if (Platform.OS !== "web") {
        const base64 = await FileSystem.readAsStringAsync(logoForExport, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoForExport = `data:image/png;base64,${base64}`;
      }
    } catch (e) {
      console.warn("Failed to convert logo to base64 for export:", e);
      logoForExport = undefined;
    }
  }

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    products,
    orders,
    units,
    customCategories,
    businessName: businessName || undefined,
    businessLogo: logoForExport,
    primaryColor: primaryColor !== DEFAULT_PRIMARY_COLOR ? primaryColor : undefined,
    savedShoppingLists,
  };
}

export async function importAllData(data: ExportData): Promise<void> {
  if (!data || !data.version) {
    throw new Error("קובץ לא תקין");
  }
  if (!Array.isArray(data.products) || !Array.isArray(data.orders)) {
    throw new Error("קובץ לא תקין — חסרים נתונים");
  }
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(data.products));
  await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(data.orders));
  if (Array.isArray(data.units) && data.units.length > 0) {
    const migrated = migrateUnits(data.units);
    await AsyncStorage.setItem(UNITS_KEY, JSON.stringify(migrated));
  }
  if (Array.isArray(data.customCategories)) {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(data.customCategories));
  }
  if (data.businessName && typeof data.businessName === "string") {
    await setBusinessName(data.businessName);
  }
  if (data.businessLogo && typeof data.businessLogo === "string") {
    // If logo is base64 data URI, save to file and store file URI (for native)
    // If it's already a file URI or web data URI, store as-is
    let logoUri = data.businessLogo;
    if (logoUri.startsWith("data:") && Platform.OS !== "web") {
      try {
        const base64Data = logoUri.split(",")[1] || "";
        const filePath = `${FileSystem.documentDirectory}imported_logo.png`;
        await FileSystem.writeAsStringAsync(filePath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        logoUri = filePath;
      } catch (e) {
        console.warn("Failed to save imported logo to file:", e);
      }
    }
    await setBusinessLogo(logoUri);
  }
  if (data.primaryColor && typeof data.primaryColor === "string") {
    await setPrimaryColor(data.primaryColor);
  }
  if (Array.isArray(data.savedShoppingLists)) {
    await saveSavedShoppingLists(data.savedShoppingLists);
  }
  // Re-run migration to ensure consistency
  await AsyncStorage.removeItem(MIGRATION_KEY);
  await runMigrations();
}
