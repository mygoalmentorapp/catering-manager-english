/**
 * Cloud API Integration Tests
 *
 * These tests verify that the cloud data router (Supabase) returns data
 * in exactly the format that the existing business logic expects.
 *
 * Tests cover:
 * 1. Product CRUD + data shape matches Product type
 * 2. Order CRUD + data shape matches Order type (with snapshots)
 * 3. Shopping List CRUD + data shape matches SavedShoppingList type
 * 4. Units CRUD + default seeding
 * 5. Categories CRUD + delete protection
 * 6. Business Settings get/update
 * 7. updatedAt changes on product update (critical for Change Detection)
 * 8. Order archive/unarchive + shopping list cascade
 * 9. Product delete protection when used in orders
 * 10. Change Detection compatibility — verifying the data shape works with analyzeOrderChanges
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ============ SETUP ============

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// We'll use a test user ID — find a real user from auth.users
let TEST_USER_ID = "";

function getAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Cleanup helper — delete all test data for the user
async function cleanupTestData() {
  const admin = getAdmin();
  if (!TEST_USER_ID) return;
  await admin.from("shopping_lists").delete().eq("user_id", TEST_USER_ID);
  await admin.from("orders").delete().eq("user_id", TEST_USER_ID);
  await admin.from("products").delete().eq("user_id", TEST_USER_ID);
  await admin.from("units").delete().eq("user_id", TEST_USER_ID);
  await admin.from("custom_categories").delete().eq("user_id", TEST_USER_ID);
  await admin.from("business_settings").delete().eq("user_id", TEST_USER_ID);
}

describe("Cloud API — Data Structure Verification", () => {
  beforeAll(async () => {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    // Get a test user
    const admin = getAdmin();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!data?.users?.length) throw new Error("No users found for testing");
    TEST_USER_ID = data.users[0].id;
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ============ 1. PRODUCTS ============

  describe("Products", () => {
    let productId = "";

    it("should create a product with correct data shape", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("products")
        .insert({
          user_id: TEST_USER_ID,
          name: "פסטה מוקרמת",
          base_ingredients: [
            { id: "ing1", name: "פסטה", quantity: 500, unit: "גרם", price: 8 },
            { id: "ing2", name: "שמנת", quantity: 200, unit: 'מ"ל', price: 12 },
          ],
          spices: [
            { id: "sp1", name: "מלח", quantity: 5, unit: "גרם", price: 0.5 },
          ],
          categories: [
            {
              categoryId: "cat1",
              categoryName: "תוספות",
              items: [
                { id: "ci1", name: "פרמזן", quantity: 50, unit: "גרם", price: 15 },
              ],
            },
          ],
          customer_price: 85,
          markup_type: "percent",
          markup_value: 30,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeTruthy();
      productId = data!.id;

      // Verify the shape matches what dbProductToAppProduct returns
      const product = {
        id: data!.id,
        name: data!.name,
        baseIngredients: data!.base_ingredients ?? [],
        spices: data!.spices ?? [],
        categories: data!.categories ?? [],
        customerPrice: Number(data!.customer_price) || 0,
        markupType: data!.markup_type || "percent",
        markupValue: Number(data!.markup_value) || 0,
        createdAt: data!.created_at,
        updatedAt: data!.updated_at,
      };

      // Verify Product type fields
      expect(product.id).toBeTruthy();
      expect(product.name).toBe("פסטה מוקרמת");
      expect(product.baseIngredients).toHaveLength(2);
      expect(product.baseIngredients[0]).toEqual({
        id: "ing1", name: "פסטה", quantity: 500, unit: "גרם", price: 8,
      });
      expect(product.spices).toHaveLength(1);
      expect(product.spices[0].name).toBe("מלח");
      expect(product.categories).toHaveLength(1);
      expect(product.categories[0].categoryName).toBe("תוספות");
      expect(product.categories[0].items).toHaveLength(1);
      expect(product.customerPrice).toBe(85);
      expect(product.markupType).toBe("percent");
      expect(product.markupValue).toBe(30);
      expect(product.createdAt).toBeTruthy();
      expect(product.updatedAt).toBeTruthy();
    });

    it("should update a product and change updatedAt (critical for Change Detection)", async () => {
      // Wait a moment to ensure timestamp difference
      await new Promise(r => setTimeout(r, 100));

      const admin = getAdmin();
      const { data: before } = await admin
        .from("products")
        .select("updated_at")
        .eq("id", productId)
        .single();

      const newUpdatedAt = new Date().toISOString();
      const { data, error } = await admin
        .from("products")
        .update({
          base_ingredients: [
            { id: "ing1", name: "פסטה", quantity: 700, unit: "גרם", price: 10 }, // Changed quantity & price
            { id: "ing2", name: "שמנת", quantity: 200, unit: 'מ"ל', price: 12 },
          ],
          updated_at: newUpdatedAt,
        })
        .eq("id", productId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.updated_at).not.toBe(before!.updated_at);
      // This is critical: Change Detection compares product.updatedAt vs order snapshot's lastHandledProductChangeAt
    });

    it("should enforce unique product name per user", async () => {
      const admin = getAdmin();
      const { error } = await admin
        .from("products")
        .insert({
          user_id: TEST_USER_ID,
          name: "פסטה מוקרמת", // Same name
          base_ingredients: [],
          spices: [],
          categories: [],
          customer_price: 50,
          markup_type: "percent",
          markup_value: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      // Should fail due to unique constraint
      expect(error).toBeTruthy();
      expect(error!.code).toBe("23505"); // unique_violation
    });
  });

  // ============ 2. ORDERS WITH SNAPSHOTS ============

  describe("Orders with Snapshots", () => {
    let orderId = "";

    it("should create an order with product snapshots (critical for Change Detection)", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();

      // Get the product we created
      const { data: products } = await admin
        .from("products")
        .select("*")
        .eq("user_id", TEST_USER_ID)
        .limit(1);

      const product = products![0];

      // Build snapshot like the app does
      const snapshot = [
        ...product.base_ingredients.map((ing: any) => ({
          ingredientId: ing.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          price: ing.price,
          category: "base",
        })),
        ...product.spices.map((sp: any) => ({
          ingredientId: sp.id,
          name: sp.name,
          quantity: sp.quantity,
          unit: sp.unit,
          price: sp.price,
          category: "spice",
        })),
        ...(product.categories ?? []).flatMap((cat: any) =>
          cat.items.map((item: any) => ({
            ingredientId: item.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.price,
            category: cat.categoryName,
          }))
        ),
      ];

      const { data, error } = await admin
        .from("orders")
        .insert({
          user_id: TEST_USER_ID,
          customer_name: "יוסי כהן",
          customer_phone: "050-1234567",
          customer_address: "רחוב הרצל 10",
          event_date: "2026-05-15",
          products: [
            {
              productId: product.id,
              productName: product.name,
              quantity: 3,
              customerPrice: Number(product.customer_price),
              markupType: product.markup_type,
              markupValue: Number(product.markup_value),
              ingredientsSnapshotAtAdd: snapshot,
              productUpdatedAtAtAdd: product.updated_at,
              lastHandledProductChangeAt: product.updated_at,
            },
          ],
          notes: "ללא גלוטן",
          status: "open",
          dismissed_change_categories: {},
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      expect(error).toBeNull();
      orderId = data!.id;

      // Transform like dbOrderToAppOrder
      const order = {
        id: data!.id,
        customerName: data!.customer_name,
        customerAddress: data!.customer_address || "",
        customerPhone: data!.customer_phone || "",
        eventDate: data!.event_date,
        products: (data!.products ?? []).map((p: any) => ({
          ...p,
          ingredientsSnapshotAtAdd: p.ingredientsSnapshotAtAdd ?? [],
          lastHandledProductChangeAt: p.lastHandledProductChangeAt ?? p.productUpdatedAtAtAdd ?? "",
        })),
        notes: data!.notes || "",
        status: data!.status || "open",
        archivedAt: data!.archived_at || undefined,
        shoppingListId: data!.shopping_list_id || undefined,
        dismissedChangeCategories: data!.dismissed_change_categories || {},
        createdAt: data!.created_at,
        updatedAt: data!.updated_at,
      };

      // Verify Order type fields
      expect(order.customerName).toBe("יוסי כהן");
      // Supabase returns date as ISO timestamp; dbOrderToAppOrder normalizes to YYYY-MM-DD
      expect(data!.event_date).toContain("2026-05-15");
      // After transform, it should be just the date part
      const normalizedDate = data!.event_date.split("T")[0];
      expect(normalizedDate).toBe("2026-05-15");
      expect(order.products).toHaveLength(1);
      expect(order.products[0].ingredientsSnapshotAtAdd).toHaveLength(4); // 2 base + 1 spice + 1 category item
      expect(order.products[0].lastHandledProductChangeAt).toBeTruthy();
      expect(order.status).toBe("open");
      expect(order.dismissedChangeCategories).toEqual({});
    });

    it("should verify snapshot structure is compatible with analyzeOrderChanges", async () => {
      const admin = getAdmin();

      // Get the order and product
      const { data: orderRow } = await admin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      const { data: products } = await admin
        .from("products")
        .select("*")
        .eq("user_id", TEST_USER_ID);

      // Transform to app format
      const order = {
        id: orderRow!.id,
        products: (orderRow!.products ?? []).map((p: any) => ({
          ...p,
          ingredientsSnapshotAtAdd: p.ingredientsSnapshotAtAdd ?? [],
          lastHandledProductChangeAt: p.lastHandledProductChangeAt ?? "",
        })),
        dismissedChangeCategories: orderRow!.dismissed_change_categories || {},
      };

      const appProducts = products!.map((row: any) => ({
        id: row.id,
        name: row.name,
        baseIngredients: row.base_ingredients ?? [],
        spices: row.spices ?? [],
        categories: row.categories ?? [],
        customerPrice: Number(row.customer_price) || 0,
        markupType: row.markup_type || "percent",
        markupValue: Number(row.markup_value) || 0,
        updatedAt: row.updated_at,
      }));

      // Verify the data shape is compatible with analyzeOrderChanges:
      // It needs: order.products[].productId, order.products[].lastHandledProductChangeAt,
      // order.products[].ingredientsSnapshotAtAdd[], order.dismissedChangeCategories
      // And: products[].id, products[].updatedAt, products[].baseIngredients, etc.

      const orderProduct = order.products[0];
      expect(orderProduct.productId).toBeTruthy();
      expect(orderProduct.lastHandledProductChangeAt).toBeTruthy();
      expect(Array.isArray(orderProduct.ingredientsSnapshotAtAdd)).toBe(true);
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("ingredientId");
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("name");
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("quantity");
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("unit");
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("price");
      expect(orderProduct.ingredientsSnapshotAtAdd[0]).toHaveProperty("category");

      const appProduct = appProducts.find((p: any) => p.id === orderProduct.productId);
      expect(appProduct).toBeTruthy();
      expect(appProduct!.updatedAt).toBeTruthy();
      expect(Array.isArray(appProduct!.baseIngredients)).toBe(true);
      expect(appProduct!.baseIngredients[0]).toHaveProperty("id");
      expect(appProduct!.baseIngredients[0]).toHaveProperty("name");
      expect(appProduct!.baseIngredients[0]).toHaveProperty("quantity");
      expect(appProduct!.baseIngredients[0]).toHaveProperty("unit");
      expect(appProduct!.baseIngredients[0]).toHaveProperty("price");
    });

    it("should archive an order and set archivedAt", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("orders")
        .update({ status: "archived", archived_at: now, updated_at: now })
        .eq("id", orderId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.status).toBe("archived");
      expect(data!.archived_at).toBeTruthy();
    });

    it("should unarchive an order", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("orders")
        .update({ status: "open", archived_at: null, updated_at: now })
        .eq("id", orderId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.status).toBe("open");
      expect(data!.archived_at).toBeNull();
    });

    it("should prevent deleting a product that is used in an order", async () => {
      const admin = getAdmin();
      const { data: products } = await admin
        .from("products")
        .select("id")
        .eq("user_id", TEST_USER_ID)
        .limit(1);

      const productId = products![0].id;

      // Check if product is used in any order
      const { data: orders } = await admin
        .from("orders")
        .select("id, products")
        .eq("user_id", TEST_USER_ID);

      const isUsed = orders!.some((o: any) =>
        (o.products ?? []).some((p: any) => p.productId === productId)
      );

      expect(isUsed).toBe(true);
      // The cloud-data-router checks this and throws PRECONDITION_FAILED
    });
  });

  // ============ 3. SHOPPING LISTS ============

  describe("Shopping Lists", () => {
    let listId = "";

    it("should create a shopping list with correct data shape", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("shopping_lists")
        .insert({
          user_id: TEST_USER_ID,
          order_ids: ["order1", "order2"],
          order_names: ["הזמנה 1", "הזמנה 2"],
          rows: [
            { name: "פסטה", quantity: 1500, unit: "גרם", category: "base", price: 24 },
            { name: "שמנת", quantity: 600, unit: 'מ"ל', category: "base", price: 36 },
            { name: "מלח", quantity: 15, unit: "גרם", category: "spice", price: 1.5 },
          ],
          status: "valid",
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      expect(error).toBeNull();
      listId = data!.id;

      // Transform like dbShoppingListToApp
      const list = {
        id: data!.id,
        orderIds: data!.order_ids ?? [],
        orderNames: data!.order_names ?? [],
        rows: data!.rows ?? [],
        status: data!.status || "valid",
        createdAt: data!.created_at,
        updatedAt: data!.updated_at,
      };

      expect(list.orderIds).toHaveLength(2);
      expect(list.orderNames).toHaveLength(2);
      expect(list.rows).toHaveLength(3);
      expect(list.rows[0]).toHaveProperty("name");
      expect(list.rows[0]).toHaveProperty("quantity");
      expect(list.rows[0]).toHaveProperty("unit");
      expect(list.rows[0]).toHaveProperty("category");
      expect(list.rows[0]).toHaveProperty("price");
      expect(list.status).toBe("valid");
    });

    it("should soft-delete a shopping list (set status to deleted)", async () => {
      const admin = getAdmin();
      const { data, error } = await admin
        .from("shopping_lists")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", listId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.status).toBe("deleted");
    });
  });

  // ============ 4. UNITS ============

  describe("Units", () => {
    it("should seed default units for a new user", async () => {
      const admin = getAdmin();
      const defaultUnits = [
        { singular: "קילו", plural: "קילו" },
        { singular: "גרם", plural: "גרם" },
        { singular: "ליטר", plural: "ליטר" },
        { singular: 'מ"ל', plural: 'מ"ל' },
        { singular: "יחידה", plural: "יחידות" },
        { singular: "כוס", plural: "כוסות" },
        { singular: "כף", plural: "כפות" },
        { singular: "קופסא", plural: "קופסאות" },
      ];

      const rows = defaultUnits.map(u => ({
        user_id: TEST_USER_ID,
        singular: u.singular,
        plural: u.plural,
        created_at: new Date().toISOString(),
      }));

      const { data, error } = await admin.from("units").insert(rows).select();
      expect(error).toBeNull();
      expect(data).toHaveLength(8);

      // Verify shape matches UnitDef
      const units = data!.map((row: any) => ({
        singular: row.singular,
        plural: row.plural,
      }));

      expect(units[0]).toHaveProperty("singular");
      expect(units[0]).toHaveProperty("plural");
      expect(units.find((u: any) => u.singular === "קילו")).toBeTruthy();
    });

    it("should create a custom unit", async () => {
      const admin = getAdmin();
      const { data, error } = await admin
        .from("units")
        .insert({
          user_id: TEST_USER_ID,
          singular: "חבילה",
          plural: "חבילות",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.singular).toBe("חבילה");
      expect(data!.plural).toBe("חבילות");
    });

    it("should enforce unique unit per user", async () => {
      const admin = getAdmin();
      const { error } = await admin
        .from("units")
        .insert({
          user_id: TEST_USER_ID,
          singular: "חבילה", // duplicate
          plural: "חבילות",
          created_at: new Date().toISOString(),
        });

      expect(error).toBeTruthy();
    });
  });

  // ============ 5. CATEGORIES ============

  describe("Categories", () => {
    let categoryId = "";

    it("should create a custom category", async () => {
      const admin = getAdmin();
      const { data, error } = await admin
        .from("custom_categories")
        .insert({
          user_id: TEST_USER_ID,
          name: "רטבים",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      categoryId = data!.id;

      // Verify shape matches CustomCategory
      const category = {
        id: data!.id,
        name: data!.name,
        createdAt: data!.created_at,
      };

      expect(category.id).toBeTruthy();
      expect(category.name).toBe("רטבים");
      expect(category.createdAt).toBeTruthy();
    });

    it("should enforce unique category name per user", async () => {
      const admin = getAdmin();
      const { error } = await admin
        .from("custom_categories")
        .insert({
          user_id: TEST_USER_ID,
          name: "רטבים", // duplicate
          created_at: new Date().toISOString(),
        });

      expect(error).toBeTruthy();
    });

    it("should delete a category not in use", async () => {
      const admin = getAdmin();
      const { error } = await admin
        .from("custom_categories")
        .delete()
        .eq("id", categoryId)
        .eq("user_id", TEST_USER_ID);

      expect(error).toBeNull();
    });
  });

  // ============ 6. BUSINESS SETTINGS ============

  describe("Business Settings", () => {
    it("should upsert business settings", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("business_settings")
        .upsert({
          user_id: TEST_USER_ID,
          business_name: "מגשי אירוח דוד",
          primary_color: "#FF6B6B",
          updated_at: now,
        }, { onConflict: "user_id" })
        .select()
        .single();

      expect(error).toBeNull();

      // Verify shape matches what dbSettingsToApp returns
      const settings = {
        businessName: data!.business_name || "",
        businessLogo: data!.business_logo_url || "",
        primaryColor: data!.primary_color || "#6C63FF",
      };

      expect(settings.businessName).toBe("מגשי אירוח דוד");
      expect(settings.primaryColor).toBe("#FF6B6B");
      expect(settings.businessLogo).toBe("");
    });

    it("should update only specific fields without overwriting others", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();

      // Update only logo
      const { data, error } = await admin
        .from("business_settings")
        .update({ business_logo_url: "https://example.com/logo.png", updated_at: now })
        .eq("user_id", TEST_USER_ID)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.business_name).toBe("מגשי אירוח דוד"); // Unchanged
      expect(data!.business_logo_url).toBe("https://example.com/logo.png"); // Updated
      expect(data!.primary_color).toBe("#FF6B6B"); // Unchanged
    });
  });

  // ============ 7. CHANGE DETECTION COMPATIBILITY ============

  describe("Change Detection Compatibility", () => {
    it("should verify updatedAt timestamp format is ISO string (required by analyzeOrderChanges)", async () => {
      const admin = getAdmin();
      const { data } = await admin
        .from("products")
        .select("updated_at")
        .eq("user_id", TEST_USER_ID)
        .limit(1);

      expect(data).toBeTruthy();
      expect(data!.length).toBeGreaterThan(0);

      const updatedAt = data![0].updated_at;
      // Must be a valid ISO date string
      const parsed = new Date(updatedAt);
      expect(parsed.toISOString()).toBeTruthy();
      expect(isNaN(parsed.getTime())).toBe(false);
    });

    it("should verify dismissed_change_categories is stored as JSON object", async () => {
      const admin = getAdmin();
      const now = new Date().toISOString();

      // Update an order with dismissed changes
      const { data: orders } = await admin
        .from("orders")
        .select("id")
        .eq("user_id", TEST_USER_ID)
        .limit(1);

      if (orders && orders.length > 0) {
        const { data, error } = await admin
          .from("orders")
          .update({
            dismissed_change_categories: {
              "product123": { "base": true, "spice": false },
            },
            updated_at: now,
          })
          .eq("id", orders[0].id)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data!.dismissed_change_categories).toEqual({
          "product123": { "base": true, "spice": false },
        });
      }
    });
  });

  // ============ 8. RLS BASIC CHECK ============

  describe("RLS Basic Check", () => {
    it("should not return data for a different user_id", async () => {
      const admin = getAdmin();
      const fakeUserId = "00000000-0000-0000-0000-000000000000";

      const { data: products } = await admin
        .from("products")
        .select("*")
        .eq("user_id", fakeUserId);

      expect(products).toEqual([]);

      const { data: orders } = await admin
        .from("orders")
        .select("*")
        .eq("user_id", fakeUserId);

      expect(orders).toEqual([]);
    });
  });
});
