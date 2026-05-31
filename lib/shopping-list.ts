import type { Order, Product, ShoppingList, ShoppingListItem, ShoppingListCategory, ShoppingListRow } from "./types";
import { generateId } from "./uuid";

/**
 * Generate a shopping list from selected orders.
 * - Collects all products from orders
 * - Multiplies base ingredient / spice / category-item quantities by order product quantities
 * - Merges items with same name AND same unit
 * - Rounds to 1 decimal place
 */
export function generateShoppingList(
  orders: Order[],
  products: Product[]
): ShoppingList {
  const productMap = new Map<string, Product>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  // Key: "name|unit" -> accumulated quantity
  const ingredientMap = new Map<string, ShoppingListItem>();
  const spiceMap = new Map<string, ShoppingListItem>();
  // categoryName -> Map<"name|unit", ShoppingListItem>
  const categoryMaps = new Map<string, Map<string, ShoppingListItem>>();

  for (const order of orders) {
    for (const orderProduct of order.products) {
      const product = productMap.get(orderProduct.productId);
      if (!product) continue;

      // Process base ingredients
      for (const ingredient of product.baseIngredients) {
        accumulateItem(ingredientMap, ingredient, orderProduct.quantity);
      }

      // Process spices (now with quantity and unit)
      for (const spice of product.spices) {
        // If spice has quantity > 0, accumulate; otherwise just add as name-only
        if (spice.quantity > 0 && spice.unit) {
          accumulateItem(spiceMap, spice, orderProduct.quantity);
        } else {
          // Legacy or name-only spice: add with quantity 0
          const key = `${spice.name.trim()}|`;
          if (!spiceMap.has(key)) {
            spiceMap.set(key, { name: spice.name.trim(), quantity: 0, unit: "" });
          }
        }
      }

      // Process dynamic categories
      for (const cat of product.categories ?? []) {
        if (!categoryMaps.has(cat.categoryName)) {
          categoryMaps.set(cat.categoryName, new Map());
        }
        const catMap = categoryMaps.get(cat.categoryName)!;
        for (const item of cat.items) {
          accumulateItem(catMap, item, orderProduct.quantity);
        }
      }
    }
  }

  // Round quantities to 1 decimal place
  const roundItems = (items: ShoppingListItem[]) =>
    items.map((item) => ({
      ...item,
      quantity: Math.round(item.quantity * 10) / 10,
    }));

  const categories: ShoppingListCategory[] = [];
  for (const [catName, catMap] of categoryMaps) {
    categories.push({
      categoryName: catName,
      items: roundItems(Array.from(catMap.values())),
    });
  }

  return {
    baseIngredients: roundItems(Array.from(ingredientMap.values())),
    spices: roundItems(Array.from(spiceMap.values())),
    categories,
    orderCount: orders.length,
  };
}

function accumulateItem(
  map: Map<string, ShoppingListItem>,
  item: { name: string; quantity: number; unit: string },
  multiplier: number
) {
  const key = `${item.name.trim().replace(/\s+/g, " ")}|${item.unit.trim()}`;
  const existing = map.get(key);
  const calculatedQty = item.quantity * multiplier;

  if (existing) {
    existing.quantity += calculatedQty;
  } else {
    map.set(key, {
      name: item.name.trim(),
      quantity: calculatedQty,
      unit: item.unit.trim(),
    });
  }
}

/**
 * Format shopping list as a readable text string for sharing
 */
export function formatShoppingListText(list: ShoppingList): string {
  let text = `רשימת קניות — ${list.orderCount} הזמנות\n\n`;

  if (list.baseIngredients.length > 0) {
    text += "🛒 מרכיבי בסיס:\n";
    for (const item of list.baseIngredients) {
      text += `${item.name} — ${item.quantity} ${item.unit}\n`;
    }
  }

  if (list.spices.length > 0) {
    text += "\n🧂 תבלינים:\n";
    for (const item of list.spices) {
      if (item.quantity > 0 && item.unit) {
        text += `${item.name} — ${item.quantity} ${item.unit}\n`;
      } else {
        text += `${item.name}\n`;
      }
    }
  }

  for (const cat of list.categories) {
    if (cat.items.length > 0) {
      text += `\n📦 ${cat.categoryName}:\n`;
      for (const item of cat.items) {
        text += `${item.name} — ${item.quantity} ${item.unit}\n`;
      }
    }
  }

  return text.trim();
}

/**
 * Convert a ShoppingList into flat ShoppingListRow[] for the editable shopping list.
 * Each row gets a unique ID and a category label.
 */
export function shoppingListToRows(list: ShoppingList): ShoppingListRow[] {
  const rows: ShoppingListRow[] = [];

  for (const item of list.baseIngredients) {
    rows.push({
      id: generateId(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: "base",
    });
  }

  for (const item of list.spices) {
    rows.push({
      id: generateId(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: "spice",
    });
  }

  for (const cat of list.categories) {
    for (const item of cat.items) {
      rows.push({
        id: generateId(),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: cat.categoryName,
      });
    }
  }

  return rows;
}

/**
 * Calculate the diff between original and edited rows.
 * Returns an array of { name, unit, diff } where diff is the quantity change.
 * Only includes items that actually changed.
 */
export function calcShoppingListDiff(
  originalRows: ShoppingListRow[],
  editedRows: ShoppingListRow[]
): { name: string; unit: string; diff: number }[] {
  // Build map from original: key -> total quantity
  const origMap = new Map<string, number>();
  for (const r of originalRows) {
    const key = `${r.name}|${r.unit}`;
    origMap.set(key, (origMap.get(key) || 0) + r.quantity);
  }

  // Build map from edited
  const editMap = new Map<string, number>();
  for (const r of editedRows) {
    const key = `${r.name}|${r.unit}`;
    editMap.set(key, (editMap.get(key) || 0) + r.quantity);
  }

  const diffs: { name: string; unit: string; diff: number }[] = [];

  // Check all original keys
  const allKeys = new Set([...origMap.keys(), ...editMap.keys()]);
  for (const key of allKeys) {
    const origQty = origMap.get(key) || 0;
    const editQty = editMap.get(key) || 0;
    const d = Math.round((editQty - origQty) * 10) / 10;
    if (d !== 0) {
      const [name, unit] = key.split("|");
      diffs.push({ name, unit, diff: d });
    }
  }

  // Check for completely new items in edited (not in original)
  // Already handled above since allKeys includes both

  return diffs;
}
