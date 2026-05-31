import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock AsyncStorage
const store: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete store[key];
    }),
  },
}));

// Mock expo-file-system
vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: vi.fn(async () => "base64data"),
  writeAsStringAsync: vi.fn(async () => {}),
  documentDirectory: "file:///mock/",
  EncodingType: { Base64: "base64" },
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Mock uuid utility
vi.mock("../uuid", () => ({
  generateId: vi.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
}));

import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  addOrder,
  deleteOrder,
} from "../storage";
import type { OrderProductRow } from "../types";

/** Helper to create a minimal OrderProductRow for tests */
function makeOrderProductRow(overrides: Partial<OrderProductRow> & { productId: string }): OrderProductRow {
  const now = new Date().toISOString();
  return {
    productNameAtAdd: "מוצר",
    customerPriceAtAdd: 0,
    costAtAdd: 0,
    markupTypeAtAdd: "percent",
    markupValueAtAdd: 0,
    ingredientsSnapshotAtAdd: [],
    productUpdatedAtAtAdd: now,
    lastHandledProductChangeAt: now,
    quantity: 1,
    ...overrides,
  };
}

beforeEach(() => {
  Object.keys(store).forEach((key) => delete store[key]);
});

describe("Products Storage", () => {
  it("should return empty array when no products exist", async () => {
    const products = await getProducts();
    expect(products).toEqual([]);
  });

  it("should add a product with prices", async () => {
    const product = await addProduct({
      name: "פסטה",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 1, unit: "קילו", price: 12 }],
      spices: [{ id: "1", name: "מלח", quantity: 0.5, unit: "כף", price: 2 }],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    expect(product.name).toBe("פסטה");
    expect(product.id).toBeTruthy();
    expect(product.baseIngredients[0].price).toBe(12);
    expect(product.spices[0].price).toBe(2);

    const products = await getProducts();
    expect(products).toHaveLength(1);
  });

  it("should reject duplicate product names", async () => {
    await addProduct({
      name: "פסטה",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 1, unit: "קילו", price: 10 }],
      spices: [],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    await expect(
      addProduct({
        name: "פסטה",
        baseIngredients: [{ id: "2", name: "פסטה", quantity: 1, unit: "קילו", price: 10 }],
        spices: [],
        categories: [],
        customerPrice: 0,
        markupType: "percent",
        markupValue: 0,
      })
    ).rejects.toThrow("כבר קיים מוצר בשם זה");
  });

  it("should update a product", async () => {
    const product = await addProduct({
      name: "פסטה",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 1, unit: "קילו", price: 10 }],
      spices: [],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    const updated = await updateProduct(product.id, {
      name: "פסטה מיוחדת",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 2, unit: "קילו", price: 20 }],
      spices: [{ id: "1", name: "בזיליקום", quantity: 1, unit: "כף", price: 5 }],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    expect(updated.name).toBe("פסטה מיוחדת");
    expect(updated.baseIngredients[0].quantity).toBe(2);
    expect(updated.baseIngredients[0].price).toBe(20);
  });

  it("should delete a product not in use", async () => {
    const product = await addProduct({
      name: "פסטה",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 1, unit: "קילו", price: 10 }],
      spices: [],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    await deleteProduct(product.id);
    const products = await getProducts();
    expect(products).toHaveLength(0);
  });

  it("should not delete a product in use by an order", async () => {
    const product = await addProduct({
      name: "פסטה",
      baseIngredients: [{ id: "1", name: "פסטה", quantity: 1, unit: "קילו", price: 10 }],
      spices: [],
      categories: [],
      customerPrice: 0,
      markupType: "percent",
      markupValue: 0,
    });

    await addOrder({
      customerName: "לקוח",
      customerAddress: "",
      customerPhone: "",
      eventDate: new Date().toISOString(),
      products: [makeOrderProductRow({ productId: product.id, productNameAtAdd: "פסטה", quantity: 1 })],
      notes: "",
      status: "open",
    });

    await expect(deleteProduct(product.id)).rejects.toThrow(
      "לא ניתן למחוק מוצר זה מכיוון שהוא משויך להזמנות קיימות"
    );
  });
});

describe("Orders Storage", () => {
  it("should return empty array when no orders exist", async () => {
    const orders = await getOrders();
    expect(orders).toEqual([]);
  });

  it("should add an order", async () => {
    const order = await addOrder({
      customerName: "לקוח",
      customerAddress: "",
      customerPhone: "",
      eventDate: new Date().toISOString(),
      products: [makeOrderProductRow({ productId: "p1", productNameAtAdd: "פסטה", quantity: 2 })],
      notes: "",
      status: "open",
    });

    expect(order.customerName).toBe("לקוח");
    expect(order.id).toBeTruthy();

    const orders = await getOrders();
    expect(orders).toHaveLength(1);
  });

  it("should delete an order", async () => {
    const order = await addOrder({
      customerName: "לקוח",
      customerAddress: "",
      customerPhone: "",
      eventDate: new Date().toISOString(),
      products: [makeOrderProductRow({ productId: "p1", productNameAtAdd: "פסטה", quantity: 2 })],
      notes: "",
      status: "open",
    });

    await deleteOrder(order.id);
    const orders = await getOrders();
    expect(orders).toHaveLength(0);
  });
});
