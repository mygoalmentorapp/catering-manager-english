import { describe, it, expect } from "vitest";
import { generatePriceQuoteHtml, generateExecutionListHtml } from "../print-documents";
import type { Order, Product, OrderProductRow } from "../types";

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "פסטה מוקרמת",
  baseIngredients: [
    { id: "i1", name: "פסטה", quantity: 1, unit: "ק\"ג", price: 15 },
    { id: "i2", name: "שמנת", quantity: 0.5, unit: "ליטר", price: 12 },
  ],
  spices: [],
  categories: [],
  customerPrice: 85,
  markupType: "fixed",
  markupValue: 5,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  ...overrides,
});

function makeOrderProductRow(overrides: Partial<OrderProductRow> = {}): OrderProductRow {
  const now = "2024-01-01";
  return {
    productId: "p1",
    productNameAtAdd: "פסטה מוקרמת",
    customerPriceAtAdd: 85,
    costAtAdd: 27,
    markupTypeAtAdd: "fixed",
    markupValueAtAdd: 5,
    ingredientsSnapshotAtAdd: [
      { ingredientId: "i1", name: "פסטה", quantity: 1, unit: "ק\"ג", price: 15, category: "base" },
      { ingredientId: "i2", name: "שמנת", quantity: 0.5, unit: "ליטר", price: 12, category: "base" },
    ],
    productUpdatedAtAtAdd: now,
    lastHandledProductChangeAt: now,
    quantity: 3,
    ...overrides,
  };
}

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: "o1",
  customerName: "ישראל ישראלי",
  customerAddress: "רחוב הרצל 10, תל אביב",
  customerPhone: "050-1234567",
  eventDate: "2024-06-15T12:00:00",
  products: [makeOrderProductRow()],
  notes: "ללא גלוטן",
  status: "open",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  ...overrides,
});

describe("generatePriceQuoteHtml", () => {
  it("generates valid HTML with prices and total", () => {
    const products = [makeProduct()];
    const order = makeOrder();
    const html = generatePriceQuoteHtml({
      order,
      products,
      businessName: "מגשי אירוח Tasty",
    });

    // Contains doc title
    expect(html).toContain("הזמנה עם מחירים");
    // Contains business name
    expect(html).toContain("מגשי אירוח Tasty");
    // Contains customer name
    expect(html).toContain("ישראל ישראלי");
    // Date format is DD/MM/YYYY from formatDate
    expect(html).toMatch(/15\/06\/2024/);
    // Contains product name
    expect(html).toContain("פסטה מוקרמת");
    // Contains unit price (₪85)
    expect(html).toContain("₪85");
    // Contains line total (3 × 85 = 255)
    expect(html).toContain("₪255");
    // Contains total row
    expect(html).toContain("סה\"כ לתשלום");
    // Contains notes
    expect(html).toContain("ללא גלוטן");
    // Contains customer phone
    expect(html).toContain("050-1234567");
    // Contains customer address
    expect(html).toContain("רחוב הרצל 10, תל אביב");
    // Is valid HTML
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("dir=\"rtl\"");
  });

  it("includes logo when provided", () => {
    const html = generatePriceQuoteHtml({
      order: makeOrder(),
      products: [makeProduct()],
      businessName: "Test",
      logoBase64: "data:image/png;base64,ABC123",
    });
    expect(html).toContain("data:image/png;base64,ABC123");
    expect(html).toContain("<img");
  });

  it("omits logo img when no logo", () => {
    const html = generatePriceQuoteHtml({
      order: makeOrder(),
      products: [makeProduct()],
      businessName: "Test",
    });
    expect(html).not.toContain("<img");
  });

  it("omits optional customer fields when empty", () => {
    const order = makeOrder({ customerPhone: "", customerAddress: "" });
    const html = generatePriceQuoteHtml({
      order,
      products: [makeProduct()],
      businessName: "Test",
    });
    expect(html).not.toContain("טלפון:");
    expect(html).not.toContain("כתובת:");
  });

  it("omits notes section when no notes", () => {
    const order = makeOrder({ notes: "" });
    const html = generatePriceQuoteHtml({
      order,
      products: [makeProduct()],
      businessName: "Test",
    });
    expect(html).not.toContain("הערות");
  });
});

describe("generateExecutionListHtml", () => {
  it("generates HTML without prices", () => {
    const products = [makeProduct()];
    const order = makeOrder();
    const html = generateExecutionListHtml({
      order,
      products,
      businessName: "מגשי אירוח Tasty",
    });

    // Contains doc title
    expect(html).toContain("הזמנה לביצוע");
    // Contains business name
    expect(html).toContain("מגשי אירוח Tasty");
    // Contains customer name
    expect(html).toContain("ישראל ישראלי");
    // Contains product name and quantity
    expect(html).toContain("פסטה מוקרמת");
    expect(html).toContain(">3<");
    // Does NOT contain price columns
    expect(html).not.toContain("מחיר ליחידה");
    expect(html).not.toContain("סה\"כ לתשלום");
    // Does NOT contain ₪ symbol in table
    expect(html).not.toContain("₪85");
    expect(html).not.toContain("₪255");
    // Contains notes
    expect(html).toContain("ללא גלוטן");
    // Is RTL
    expect(html).toContain("dir=\"rtl\"");
  });

  it("shows quantity column header", () => {
    const html = generateExecutionListHtml({
      order: makeOrder(),
      products: [makeProduct()],
      businessName: "Test",
    });
    expect(html).toContain("כמות");
    expect(html).toContain("מוצר");
  });
});
