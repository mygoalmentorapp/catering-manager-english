import { describe, it, expect } from "vitest";
import { generateShoppingList, formatShoppingListText } from "../shopping-list";
import type { Order, Product, OrderProductRow } from "../types";

const makeProduct = (
  id: string,
  name: string,
  baseIngredients: { name: string; quantity: number; unit: string }[],
  spices: { name: string; quantity: number; unit: string }[],
  categories?: Product["categories"]
): Product => ({
  id,
  name,
  baseIngredients: baseIngredients.map((bi, i) => ({
    id: `bi-${id}-${i}`,
    ...bi,
    price: 0,
  })),
  spices: spices.map((s, i) => ({ id: `sp-${id}-${i}`, ...s, price: 0 })),
  categories: categories ?? [],
  customerPrice: 0,
  markupType: "percent",
  markupValue: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Helper to create an OrderProductRow (snapshot-based) */
const makeOrderProductRow = (
  productId: string,
  productName: string,
  quantity: number
): OrderProductRow => ({
  productId,
  productNameAtAdd: productName,
  customerPriceAtAdd: 0,
  costAtAdd: 0,
  markupTypeAtAdd: "percent",
  markupValueAtAdd: 0,
  ingredientsSnapshotAtAdd: [],
  productUpdatedAtAtAdd: new Date().toISOString(),
  lastHandledProductChangeAt: new Date().toISOString(),
  quantity,
});

const makeOrder = (
  id: string,
  customerName: string,
  products: OrderProductRow[]
): Order => ({
  id,
  customerName,
  customerAddress: "",
  customerPhone: "",
  eventDate: new Date().toISOString(),
  products,
  notes: "",
  status: "open",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("generateShoppingList", () => {
  it("should aggregate ingredients from multiple orders", () => {
    const products = [
      makeProduct(
        "p1",
        "פסטה",
        [{ name: "פסטה", quantity: 1, unit: "קילו" }],
        [{ name: "מלח", quantity: 1, unit: "כף" }]
      ),
    ];
    const orders = [
      makeOrder("o1", "לקוח1", [makeOrderProductRow("p1", "פסטה", 2)]),
      makeOrder("o2", "לקוח2", [makeOrderProductRow("p1", "פסטה", 3)]),
    ];

    const result = generateShoppingList(orders, products);

    expect(result.baseIngredients).toHaveLength(1);
    expect(result.baseIngredients[0].name).toBe("פסטה");
    expect(result.baseIngredients[0].quantity).toBe(5); // 1*2 + 1*3
    expect(result.baseIngredients[0].unit).toBe("קילו");
    expect(result.spices).toHaveLength(1);
    expect(result.spices[0].name).toBe("מלח");
    expect(result.spices[0].quantity).toBe(5); // 1*2 + 1*3
    expect(result.orderCount).toBe(2);
  });

  it("should keep ingredients with different units separate", () => {
    const products = [
      makeProduct(
        "p1",
        "מוצר1",
        [
          { name: "חלב", quantity: 1, unit: "ליטר" },
          { name: "חלב", quantity: 200, unit: 'מ"ל' },
        ],
        []
      ),
    ];
    const orders = [
      makeOrder("o1", "לקוח1", [makeOrderProductRow("p1", "מוצר1", 1)]),
    ];

    const result = generateShoppingList(orders, products);

    expect(result.baseIngredients).toHaveLength(2);
  });

  it("should aggregate spices with quantities", () => {
    const products = [
      makeProduct(
        "p1",
        "מוצר1",
        [{ name: "בצל", quantity: 1, unit: "יחידה" }],
        [
          { name: "מלח", quantity: 1, unit: "כף" },
          { name: "פלפל", quantity: 0.5, unit: "כף" },
        ]
      ),
      makeProduct(
        "p2",
        "מוצר2",
        [{ name: "שום", quantity: 1, unit: "יחידה" }],
        [
          { name: "מלח", quantity: 2, unit: "כף" },
          { name: "פפריקה", quantity: 1, unit: "כף" },
        ]
      ),
    ];
    const orders = [
      makeOrder("o1", "לקוח1", [
        makeOrderProductRow("p1", "מוצר1", 1),
        makeOrderProductRow("p2", "מוצר2", 1),
      ]),
    ];

    const result = generateShoppingList(orders, products);

    expect(result.spices).toHaveLength(3);
    const salt = result.spices.find((s) => s.name === "מלח");
    expect(salt?.quantity).toBe(3); // 1+2
    const pepper = result.spices.find((s) => s.name === "פלפל");
    expect(pepper?.quantity).toBe(0.5);
    const paprika = result.spices.find((s) => s.name === "פפריקה");
    expect(paprika?.quantity).toBe(1);
  });

  it("should multiply ingredient quantities by order product quantity", () => {
    const products = [
      makeProduct(
        "p1",
        "עוגה",
        [
          { name: "קמח", quantity: 2, unit: "כוסות" },
          { name: "סוכר", quantity: 1, unit: "כוס" },
        ],
        []
      ),
    ];
    const orders = [
      makeOrder("o1", "לקוח1", [makeOrderProductRow("p1", "עוגה", 3)]),
    ];

    const result = generateShoppingList(orders, products);

    const flour = result.baseIngredients.find((i) => i.name === "קמח");
    const sugar = result.baseIngredients.find((i) => i.name === "סוכר");
    expect(flour?.quantity).toBe(6); // 2 * 3
    expect(sugar?.quantity).toBe(3); // 1 * 3
  });

  it("should handle dynamic categories", () => {
    const products = [
      makeProduct("p1", "מוצר", [], [], [
        {
          categoryId: "cat1",
          categoryName: "חד פעמי",
          items: [{ id: "1", name: "צלחות", quantity: 10, unit: "יחידה", price: 0 }],
        },
      ]),
    ];
    const orders = [
      makeOrder("o1", "לקוח", [makeOrderProductRow("p1", "מוצר", 2)]),
    ];

    const result = generateShoppingList(orders, products);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].categoryName).toBe("חד פעמי");
    expect(result.categories[0].items[0].quantity).toBe(20); // 10*2
  });

  it("should handle empty orders", () => {
    const result = generateShoppingList([], []);
    expect(result.baseIngredients).toHaveLength(0);
    expect(result.spices).toHaveLength(0);
    expect(result.categories).toHaveLength(0);
    expect(result.orderCount).toBe(0);
  });
});

describe("formatShoppingListText", () => {
  it("should format shopping list as readable text", () => {
    const text = formatShoppingListText({
      baseIngredients: [
        { name: "פסטה", quantity: 4, unit: "קילו" },
        { name: "חלב", quantity: 6, unit: "ליטר" },
      ],
      spices: [
        { name: "מלח", quantity: 3, unit: "כף" },
        { name: "פלפל", quantity: 1.5, unit: "כף" },
      ],
      categories: [
        {
          categoryName: "חד פעמי",
          items: [{ name: "צלחות", quantity: 20, unit: "יחידה" }],
        },
      ],
      orderCount: 3,
    });

    expect(text).toContain("רשימת קניות — 3 הזמנות");
    expect(text).toContain("🛒 מרכיבי בסיס:");
    expect(text).toContain("פסטה — 4 קילו");
    expect(text).toContain("חלב — 6 ליטר");
    expect(text).toContain("🧂 תבלינים:");
    expect(text).toContain("מלח — 3 כף");
    expect(text).toContain("📦 חד פעמי:");
    expect(text).toContain("צלחות — 20 יחידה");
  });
});
