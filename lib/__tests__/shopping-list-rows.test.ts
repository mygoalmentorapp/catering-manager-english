import { describe, it, expect } from "vitest";
import { shoppingListToRows, calcShoppingListDiff } from "../shopping-list";
import type { ShoppingList, ShoppingListRow } from "../types";

describe("shoppingListToRows", () => {
  it("converts a ShoppingList into flat ShoppingListRow[]", () => {
    const list: ShoppingList = {
      baseIngredients: [
        { name: "קמח", quantity: 5, unit: "ק\"ג" },
        { name: "סוכר", quantity: 2, unit: "ק\"ג" },
      ],
      spices: [
        { name: "מלח", quantity: 0.5, unit: "ק\"ג" },
        { name: "כורכום", quantity: 0, unit: "" },
      ],
      categories: [
        {
          categoryName: "ירקות",
          items: [
            { name: "עגבניה", quantity: 3, unit: "ק\"ג" },
          ],
        },
      ],
      orderCount: 2,
    };

    const rows = shoppingListToRows(list);
    expect(rows).toHaveLength(5);

    // Check categories
    expect(rows[0].category).toBe("base");
    expect(rows[0].name).toBe("קמח");
    expect(rows[1].category).toBe("base");
    expect(rows[2].category).toBe("spice");
    expect(rows[3].category).toBe("spice");
    expect(rows[4].category).toBe("ירקות");
    expect(rows[4].name).toBe("עגבניה");

    // Each row has a unique ID
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("returns empty array for empty shopping list", () => {
    const list: ShoppingList = {
      baseIngredients: [],
      spices: [],
      categories: [],
      orderCount: 0,
    };
    const rows = shoppingListToRows(list);
    expect(rows).toHaveLength(0);
  });
});

describe("calcShoppingListDiff", () => {
  it("detects quantity increases", () => {
    const original: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const edited: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 7, unit: "ק\"ג", category: "base" },
    ];
    const diffs = calcShoppingListDiff(original, edited);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].diff).toBe(2);
    expect(diffs[0].name).toBe("קמח");
  });

  it("detects quantity decreases", () => {
    const original: ShoppingListRow[] = [
      { id: "1", name: "סוכר", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const edited: ShoppingListRow[] = [
      { id: "1", name: "סוכר", quantity: 3, unit: "ק\"ג", category: "base" },
    ];
    const diffs = calcShoppingListDiff(original, edited);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].diff).toBe(-2);
  });

  it("detects removed items", () => {
    const original: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
      { id: "2", name: "סוכר", quantity: 2, unit: "ק\"ג", category: "base" },
    ];
    const edited: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const diffs = calcShoppingListDiff(original, edited);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].name).toBe("סוכר");
    expect(diffs[0].diff).toBe(-2);
  });

  it("detects new items", () => {
    const original: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const edited: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
      { id: "2", name: "שמן", quantity: 3, unit: "ליטר", category: "manual" },
    ];
    const diffs = calcShoppingListDiff(original, edited);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].name).toBe("שמן");
    expect(diffs[0].diff).toBe(3);
  });

  it("returns empty array when no changes", () => {
    const original: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const edited: ShoppingListRow[] = [
      { id: "1", name: "קמח", quantity: 5, unit: "ק\"ג", category: "base" },
    ];
    const diffs = calcShoppingListDiff(original, edited);
    expect(diffs).toHaveLength(0);
  });
});

import { generateShoppingListRows } from "../order-logic";
import type { Order, IngredientSnapshot } from "../types";

describe("generateShoppingListRows — merge by name", () => {
  const makeSnapshot = (
    ingredientId: string,
    name: string,
    quantity: number,
    unit: string,
    category: string = "base"
  ): IngredientSnapshot => ({
    ingredientId,
    name,
    quantity,
    unit,
    price: 0,
    category,
  });

  const makeOrder = (
    id: string,
    products: {
      productId: string;
      quantity: number;
      snapshots: IngredientSnapshot[];
    }[]
  ): Order => ({
    id,
    customerName: "test",
    customerAddress: "",
    customerPhone: "",
    eventDate: new Date().toISOString(),
    products: products.map((p) => ({
      productId: p.productId,
      productNameAtAdd: "product",
      customerPriceAtAdd: 0,
      costAtAdd: 0,
      markupTypeAtAdd: "percent" as const,
      markupValueAtAdd: 0,
      ingredientsSnapshotAtAdd: p.snapshots,
      productUpdatedAtAtAdd: new Date().toISOString(),
      lastHandledProductChangeAt: new Date().toISOString(),
      quantity: p.quantity,
    })),
    notes: "",
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it("merges same-name ingredients from different products into one row", () => {
    const order = makeOrder("o1", [
      {
        productId: "p1",
        quantity: 1,
        snapshots: [makeSnapshot("id-a", "חסה", 2, "ק\"ג")],
      },
      {
        productId: "p2",
        quantity: 1,
        snapshots: [makeSnapshot("id-b", "חסה", 1.5, "ק\"ג")],
      },
    ]);

    const rows = generateShoppingListRows([order]);
    const lettuceRows = rows.filter((r) => r.name === "חסה");
    expect(lettuceRows).toHaveLength(1);
    expect(lettuceRows[0].totalQty).toBe(3.5); // 2 + 1.5
  });

  it("keeps ingredients with same name but different units separate", () => {
    const order = makeOrder("o1", [
      {
        productId: "p1",
        quantity: 1,
        snapshots: [makeSnapshot("id-a", "חלב", 1, "ליטר")],
      },
      {
        productId: "p2",
        quantity: 1,
        snapshots: [makeSnapshot("id-b", "חלב", 200, "מ\"ל")],
      },
    ]);

    const rows = generateShoppingListRows([order]);
    expect(rows).toHaveLength(2);
  });

  it("merges ingredients with whitespace differences in name", () => {
    const order = makeOrder("o1", [
      {
        productId: "p1",
        quantity: 1,
        snapshots: [makeSnapshot("id-a", "חסה  ירוקה", 2, "ק\"ג")],
      },
      {
        productId: "p2",
        quantity: 1,
        snapshots: [makeSnapshot("id-b", "חסה ירוקה", 1, "ק\"ג")],
      },
    ]);

    const rows = generateShoppingListRows([order]);
    const lettuceRows = rows.filter((r) => r.name.includes("חסה"));
    expect(lettuceRows).toHaveLength(1);
    expect(lettuceRows[0].totalQty).toBe(3); // 2 + 1
  });

  it("merges same ingredient across multiple orders", () => {
    const order1 = makeOrder("o1", [
      {
        productId: "p1",
        quantity: 2,
        snapshots: [makeSnapshot("id-a", "בצל", 1, "ק\"ג")],
      },
    ]);
    const order2 = makeOrder("o2", [
      {
        productId: "p2",
        quantity: 3,
        snapshots: [makeSnapshot("id-b", "בצל", 1, "ק\"ג")],
      },
    ]);

    const rows = generateShoppingListRows([order1, order2]);
    const onionRows = rows.filter((r) => r.name === "בצל");
    expect(onionRows).toHaveLength(1);
    expect(onionRows[0].totalQty).toBe(5); // 1*2 + 1*3
  });
});
