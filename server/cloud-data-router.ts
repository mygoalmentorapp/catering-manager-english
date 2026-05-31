/**
 * Cloud Data Router — Server-side CRUD endpoints for all business data.
 *
 * Replaces AsyncStorage with Supabase PostgreSQL.
 * All endpoints require authentication via the custom app JWT (Bearer token).
 * Uses protectedProcedure → ctx.user.openId for user identification.
 * Uses service_role client for DB operations.
 *
 * Tables: products, orders, shopping_lists, units, custom_categories, business_settings
 *
 * IMPORTANT: The data shapes returned by these endpoints MUST match the
 * TypeScript interfaces in lib/types.ts exactly, so that order-logic.ts,
 * shopping-list.ts, and print-documents.ts continue to work unchanged.
 */

import { z } from "zod";
import { protectedProcedure, deviceProtectedProcedure, router } from "./_core/trpc";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

// ============ HELPERS ============

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Supabase credentials not configured",
    });
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get the authenticated user's Supabase user ID from the custom JWT.
 * The bridge endpoint stores the Supabase user.id as openId in the app DB.
 * protectedProcedure guarantees ctx.user is non-null.
 */
function getUserId(ctx: { user: { openId: string } }): string {
  return ctx.user.openId;
}

// ============ DEFAULT UNITS ============

const DEFAULT_UNITS = [
  { singular: "קילו", plural: "קילו" },
  { singular: "גרם", plural: "גרם" },
  { singular: "ליטר", plural: "ליטר" },
  { singular: 'מ"ל', plural: 'מ"ל' },
  { singular: "יחידה", plural: "יחידות" },
  { singular: "כוס", plural: "כוסות" },
  { singular: "כף", plural: "כפות" },
  { singular: "קופסא", plural: "קופסאות" },
];

// ============ ZOD SCHEMAS ============

const ingredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price: z.number(),
});

const categoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price: z.number(),
});

const productCategorySchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  items: z.array(categoryItemSchema),
});

const productInputSchema = z.object({
  name: z.string().min(1, "יש להזין שם מוצר"),
  baseIngredients: z.array(ingredientSchema),
  spices: z.array(ingredientSchema),
  categories: z.array(productCategorySchema),
  customerPrice: z.number(),
  markupType: z.enum(["percent", "fixed"]),
  markupValue: z.number(),
  baseLabel: z.string().optional(),
  spiceLabel: z.string().optional(),
});

const ingredientSnapshotSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price: z.number(),
  category: z.string(),
});

const orderProductRowSchema = z.object({
  productId: z.string(),
  productNameAtAdd: z.string(),
  customerPriceAtAdd: z.number(),
  costAtAdd: z.number(),
  markupTypeAtAdd: z.enum(["percent", "fixed"]),
  markupValueAtAdd: z.number(),
  ingredientsSnapshotAtAdd: z.array(ingredientSnapshotSchema),
  productUpdatedAtAtAdd: z.string(),
  lastHandledProductChangeAt: z.string(),
  quantity: z.number(),
});

const orderInputSchema = z.object({
  customerName: z.string().min(1),
  customerAddress: z.string().default(""),
  customerPhone: z.string().default(""),
  eventDate: z.string(),
  products: z.array(orderProductRowSchema),
  notes: z.string().default(""),
  status: z.enum(["open", "needs_refresh_locked", "archived"]).default("open"),
  shoppingListId: z.string().optional(),
  dismissedChangeCategories: z.record(z.string(), z.array(z.string())).optional(),
});

const shoppingListRowSchema = z.object({
  ingredientId: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string(),
  totalQty: z.number(),
  sourceBreakdown: z.record(z.string(), z.number()),
  manualDelta: z.number(),
  finalQty: z.number(),
});

const shoppingListInputSchema = z.object({
  orderIds: z.array(z.string()),
  orderNames: z.array(z.string()),
  rows: z.array(shoppingListRowSchema),
  status: z.enum(["valid", "needs_refresh_locked", "deleted"]).default("valid"),
});

// ============ TRANSFORM HELPERS ============

/**
 * Transform a Supabase products row into the Product interface expected by the app.
 * DB uses snake_case JSONB columns; app uses camelCase with typed arrays.
 */
function dbProductToAppProduct(row: any) {
  return {
    id: row.id,
    name: row.name,
    baseIngredients: row.base_ingredients ?? [],
    spices: row.spices ?? [],
    categories: row.categories ?? [],
    customerPrice: Number(row.customer_price) || 0,
    markupType: row.markup_type || "percent",
    markupValue: Number(row.markup_value) || 0,
    baseLabel: row.base_label || undefined,
    spiceLabel: row.spice_label || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbOrderToAppOrder(row: any) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerAddress: row.customer_address || "",
    customerPhone: row.customer_phone || "",
    eventDate: row.event_date ? row.event_date.split("T")[0] : "",
    products: (row.products ?? []).map((p: any) => ({
      ...p,
      ingredientsSnapshotAtAdd: p.ingredientsSnapshotAtAdd ?? [],
      lastHandledProductChangeAt: p.lastHandledProductChangeAt ?? p.productUpdatedAtAtAdd ?? "",
    })),
    notes: row.notes || "",
    status: row.status || "open",
    archivedAt: row.archived_at || undefined,
    shoppingListId: row.shopping_list_id || undefined,
    dismissedChangeCategories: row.dismissed_change_categories || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbShoppingListToApp(row: any) {
  return {
    id: row.id,
    orderIds: row.order_ids ?? [],
    orderNames: row.order_names ?? [],
    rows: row.rows ?? [],
    status: row.status || "valid",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbUnitToApp(row: any) {
  return {
    singular: row.singular,
    plural: row.plural,
  };
}

function dbCategoryToApp(row: any) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function dbSettingsToApp(row: any) {
  return {
    businessName: row.business_name || "",
    businessLogo: row.business_logo_url || "",
    primaryColor: row.primary_color || "#3AAFA9",
  };
}

// ============ PRODUCTS ROUTER ============

const productsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cloud-data] products.list error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת מוצרים" });
    }
    return (data || []).map(dbProductToAppProduct);
  }),

  create: deviceProtectedProcedure.input(productInputSchema).mutation(async ({ ctx, input }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();

    // Check unique name
    const { data: existing } = await admin
      .from("products")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", input.name.trim())
      .limit(1);
    if (existing && existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "כבר קיים מוצר בשם זה" });
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("products")
      .insert({
        user_id: userId,
        name: input.name.trim(),
        base_ingredients: input.baseIngredients,
        spices: input.spices,
        categories: input.categories,
        customer_price: input.customerPrice,
        markup_type: input.markupType,
        markup_value: input.markupValue,
        base_label: input.baseLabel || null,
        spice_label: input.spiceLabel || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) {
      console.error("[cloud-data] products.create error:", error);
      if (error.code === "23505") {
        throw new TRPCError({ code: "CONFLICT", message: "כבר קיים מוצר בשם זה" });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה ביצירת מוצר" });
    }
    return dbProductToAppProduct(data);
  }),

  update: deviceProtectedProcedure
    .input(z.object({ id: z.string() }).merge(productInputSchema))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Check unique name (exclude self)
      const { data: existing } = await admin
        .from("products")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", input.name.trim())
        .neq("id", input.id)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "כבר קיים מוצר בשם זה" });
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("products")
        .update({
          name: input.name.trim(),
          base_ingredients: input.baseIngredients,
          spices: input.spices,
          categories: input.categories,
          customer_price: input.customerPrice,
          markup_type: input.markupType,
          markup_value: input.markupValue,
          base_label: input.baseLabel || null,
          spice_label: input.spiceLabel || null,
          updated_at: now,
        })
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] products.update error:", error);
        if (error.code === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "כבר קיים מוצר בשם זה" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בעדכון מוצר" });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "מוצר לא נמצא" });
      }
      return dbProductToAppProduct(data);
    }),

  delete: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Check if product is used in any order
      const { data: orders } = await admin
        .from("orders")
        .select("id, products")
        .eq("user_id", userId);
      if (orders) {
        const isUsed = orders.some((order: any) =>
          (order.products ?? []).some((p: any) => p.productId === input.id)
        );
        if (isUsed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "לא ניתן למחוק מוצר זה מכיוון שהוא משויך להזמנות קיימות",
          });
        }
      }

      const { error } = await admin
        .from("products")
        .delete()
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) {
        console.error("[cloud-data] products.delete error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה במחיקת מוצר" });
      }
      return { success: true };
    }),
});

// ============ ORDERS ROUTER ============

const ordersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cloud-data] orders.list error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת הזמנות" });
    }
    return (data || []).map(dbOrderToAppOrder);
  }),

  create: deviceProtectedProcedure.input(orderInputSchema).mutation(async ({ ctx, input }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        customer_name: input.customerName,
        customer_address: input.customerAddress,
        customer_phone: input.customerPhone,
        event_date: input.eventDate,
        products: input.products,
        notes: input.notes,
        status: input.status,
        shopping_list_id: input.shoppingListId || null,
        dismissed_change_categories: input.dismissedChangeCategories || {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) {
      console.error("[cloud-data] orders.create error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה ביצירת הזמנה" });
    }
    return dbOrderToAppOrder(data);
  }),

  update: deviceProtectedProcedure
    .input(
      z.object({
        id: z.string(),
        customerName: z.string().optional(),
        customerAddress: z.string().optional(),
        customerPhone: z.string().optional(),
        eventDate: z.string().optional(),
        products: z.array(orderProductRowSchema).optional(),
        notes: z.string().optional(),
        status: z.enum(["open", "needs_refresh_locked", "archived"]).optional(),
        archivedAt: z.string().optional().nullable(),
        shoppingListId: z.string().optional().nullable(),
        dismissedChangeCategories: z.record(z.string(), z.array(z.string())).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const { id, ...updates } = input;
      const now = new Date().toISOString();

      // Map camelCase to snake_case
      const dbUpdates: Record<string, any> = { updated_at: now };
      if (updates.customerName !== undefined) dbUpdates.customer_name = updates.customerName;
      if (updates.customerAddress !== undefined) dbUpdates.customer_address = updates.customerAddress;
      if (updates.customerPhone !== undefined) dbUpdates.customer_phone = updates.customerPhone;
      if (updates.eventDate !== undefined) dbUpdates.event_date = updates.eventDate;
      if (updates.products !== undefined) dbUpdates.products = updates.products;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.archivedAt !== undefined) dbUpdates.archived_at = updates.archivedAt;
      if (updates.shoppingListId !== undefined) dbUpdates.shopping_list_id = updates.shoppingListId;
      if (updates.dismissedChangeCategories !== undefined) dbUpdates.dismissed_change_categories = updates.dismissedChangeCategories;

      const { data, error } = await admin
        .from("orders")
        .update(dbUpdates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] orders.update error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בעדכון הזמנה" });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "הזמנה לא נמצאה" });
      }
      return dbOrderToAppOrder(data);
    }),

  delete: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const { error } = await admin
        .from("orders")
        .delete()
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) {
        console.error("[cloud-data] orders.delete error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה במחיקת הזמנה" });
      }
      return { success: true };
    }),

  archive: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const now = new Date().toISOString();

      // Get the order first to find shopping list references
      const { data: order, error: fetchErr } = await admin
        .from("orders")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", userId)
        .single();
      if (fetchErr || !order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "הזמנה לא נמצאה" });
      }

      // Soft-delete associated shopping lists
      if (order.shopping_list_id) {
        await admin
          .from("shopping_lists")
          .update({ status: "deleted", updated_at: now })
          .eq("id", order.shopping_list_id)
          .eq("user_id", userId);
      }
      // Also check for any list that references this order
      const { data: lists } = await admin
        .from("shopping_lists")
        .select("id, order_ids, status")
        .eq("user_id", userId)
        .neq("status", "deleted");
      if (lists) {
        for (const list of lists) {
          if ((list.order_ids ?? []).includes(input.id)) {
            await admin
              .from("shopping_lists")
              .update({ status: "deleted", updated_at: now })
              .eq("id", list.id)
              .eq("user_id", userId);
          }
        }
      }

      // Archive the order
      const { data, error } = await admin
        .from("orders")
        .update({
          status: "archived",
          archived_at: now,
          updated_at: now,
        })
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] orders.archive error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בארכוב הזמנה" });
      }
      return dbOrderToAppOrder(data);
    }),

  unarchive: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("orders")
        .update({
          status: "open",
          archived_at: null,
          shopping_list_id: null,
          updated_at: now,
        })
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] orders.unarchive error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בשחזור הזמנה" });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "הזמנה לא נמצאה" });
      }
      return dbOrderToAppOrder(data);
    }),
});

// ============ SHOPPING LISTS ROUTER ============

const shoppingListsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("shopping_lists")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "deleted")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cloud-data] shoppingLists.list error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת רשימות קניות" });
    }
    return (data || []).map(dbShoppingListToApp);
  }),

  create: deviceProtectedProcedure.input(shoppingListInputSchema).mutation(async ({ ctx, input }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("shopping_lists")
      .insert({
        user_id: userId,
        order_ids: input.orderIds,
        order_names: input.orderNames,
        rows: input.rows,
        status: input.status,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) {
      console.error("[cloud-data] shoppingLists.create error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה ביצירת רשימת קניות" });
    }
    return dbShoppingListToApp(data);
  }),

  update: deviceProtectedProcedure
    .input(
      z.object({
        id: z.string(),
        orderIds: z.array(z.string()).optional(),
        orderNames: z.array(z.string()).optional(),
        rows: z.array(shoppingListRowSchema).optional(),
        status: z.enum(["valid", "needs_refresh_locked", "deleted"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const { id, ...updates } = input;
      const now = new Date().toISOString();

      const dbUpdates: Record<string, any> = { updated_at: now };
      if (updates.orderIds !== undefined) dbUpdates.order_ids = updates.orderIds;
      if (updates.orderNames !== undefined) dbUpdates.order_names = updates.orderNames;
      if (updates.rows !== undefined) dbUpdates.rows = updates.rows;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { data, error } = await admin
        .from("shopping_lists")
        .update(dbUpdates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] shoppingLists.update error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בעדכון רשימת קניות" });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "רשימת קניות לא נמצאה" });
      }
      return dbShoppingListToApp(data);
    }),

  delete: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const now = new Date().toISOString();
      // Soft delete — mark as "deleted"
      const { error } = await admin
        .from("shopping_lists")
        .update({ status: "deleted", updated_at: now })
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) {
        console.error("[cloud-data] shoppingLists.delete error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה במחיקת רשימת קניות" });
      }
      return { success: true };
    }),
});

// ============ UNITS ROUTER ============

const unitsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("units")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cloud-data] units.list error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת יחידות מידה" });
    }
    // If no units exist, seed defaults
    if (!data || data.length === 0) {
      const now = new Date().toISOString();
      const rows = DEFAULT_UNITS.map((u) => ({
        user_id: userId,
        singular: u.singular,
        plural: u.plural,
        created_at: now,
      }));
      const { data: seeded, error: seedErr } = await admin
        .from("units")
        .insert(rows)
        .select();
      if (seedErr) {
        console.error("[cloud-data] units.seed error:", seedErr);
        // Return defaults even if seed fails
        return DEFAULT_UNITS;
      }
      return (seeded || []).map(dbUnitToApp);
    }
    return data.map(dbUnitToApp);
  }),

  create: deviceProtectedProcedure
    .input(z.object({ singular: z.string().min(1, "יש להזין שם יחידה"), plural: z.string().min(1, "יש להזין גם צורת רבים") }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Check duplicate
      const { data: existing } = await admin
        .from("units")
        .select("id")
        .eq("user_id", userId)
        .eq("singular", input.singular.trim())
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "יחידה זו כבר קיימת" });
      }

      const { data, error } = await admin
        .from("units")
        .insert({
          user_id: userId,
          singular: input.singular.trim(),
          plural: input.plural.trim(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] units.create error:", error);
        if (error.code === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "יחידה זו כבר קיימת" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה ביצירת יחידה" });
      }
      return dbUnitToApp(data);
    }),

  delete: deviceProtectedProcedure
    .input(z.object({ singular: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Check if unit is in use by any product
      const { data: products } = await admin
        .from("products")
        .select("id, name, base_ingredients, spices, categories")
        .eq("user_id", userId);
      if (products) {
        const productsUsingUnit: string[] = [];
        for (const p of products) {
          const allIngredients = [
            ...(p.base_ingredients ?? []),
            ...(p.spices ?? []),
            ...((p.categories ?? []).flatMap((c: any) => c.items ?? [])),
          ];
          if (allIngredients.some((ing: any) => ing.unit === input.singular)) {
            productsUsingUnit.push(p.name);
          }
        }
        if (productsUsingUnit.length > 0) {
          const names = productsUsingUnit.slice(0, 3).join(", ");
          const suffix = productsUsingUnit.length > 3 ? ` ועוד ${productsUsingUnit.length - 3}` : "";
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `לא ניתן למחוק יחידה זו — בשימוש במוצרים: ${names}${suffix}`,
          });
        }
      }

      const { error } = await admin
        .from("units")
        .delete()
        .eq("user_id", userId)
        .eq("singular", input.singular);
      if (error) {
        console.error("[cloud-data] units.delete error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה במחיקת יחידה" });
      }
      return { success: true };
    }),
});

// ============ CUSTOM CATEGORIES ROUTER ============

const categoriesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("custom_categories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cloud-data] categories.list error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת קטגוריות" });
    }
    return (data || []).map(dbCategoryToApp);
  }),

  create: deviceProtectedProcedure
    .input(z.object({ name: z.string().min(1, "יש להזין שם קטגוריה") }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const trimmed = input.name.trim();

      // Check duplicate
      const { data: existing } = await admin
        .from("custom_categories")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", trimmed)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "קטגוריה זו כבר קיימת" });
      }

      const { data, error } = await admin
        .from("custom_categories")
        .insert({
          user_id: userId,
          name: trimmed,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] categories.create error:", error);
        if (error.code === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "קטגוריה זו כבר קיימת" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה ביצירת קטגוריה" });
      }
      return dbCategoryToApp(data);
    }),

  rename: deviceProtectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1, "יש להזין שם קטגוריה") }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const trimmed = input.name.trim();

      // Check duplicate
      const { data: existing } = await admin
        .from("custom_categories")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", trimmed)
        .neq("id", input.id)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "קטגוריה בשם זה כבר קיימת" });
      }

      const { error } = await admin
        .from("custom_categories")
        .update({ name: trimmed })
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) {
        console.error("[cloud-data] categories.rename error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בשינוי שם קטגוריה" });
      }
      return { success: true };
    }),

  delete: deviceProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Get category name first
      const { data: cat } = await admin
        .from("custom_categories")
        .select("name")
        .eq("id", input.id)
        .eq("user_id", userId)
        .single();
      if (!cat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "קטגוריה לא נמצאה" });
      }

      const { error } = await admin
        .from("custom_categories")
        .delete()
        .eq("id", input.id)
        .eq("user_id", userId);
      if (error) {
        console.error("[cloud-data] categories.delete error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה במחיקת קטגוריה" });
      }
      return { success: true };
    }),
});

// ============ BUSINESS SETTINGS ROUTER ============

const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx as any);
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("business_settings")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine for new users
      console.error("[cloud-data] settings.get error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בטעינת הגדרות" });
    }
    if (!data) {
      // Return defaults for new user
      return { businessName: "", businessLogo: "", primaryColor: "#3AAFA9" };
    }
    return dbSettingsToApp(data);
  }),

  update: deviceProtectedProcedure
    .input(
      z.object({
        businessName: z.string().optional(),
        businessLogo: z.string().optional(),
        primaryColor: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();
      const now = new Date().toISOString();

      const dbUpdates: Record<string, any> = { updated_at: now };
      if (input.businessName !== undefined) dbUpdates.business_name = input.businessName;
      if (input.businessLogo !== undefined) dbUpdates.business_logo_url = input.businessLogo;
      if (input.primaryColor !== undefined) dbUpdates.primary_color = input.primaryColor;

      // Upsert — insert if not exists, update if exists
      const { data, error } = await admin
        .from("business_settings")
        .upsert({
          user_id: userId,
          ...dbUpdates,
        }, { onConflict: "user_id" })
        .select()
        .single();
      if (error) {
        console.error("[cloud-data] settings.update error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בעדכון הגדרות" });
      }
      return dbSettingsToApp(data);
    }),

  uploadLogo: deviceProtectedProcedure
    .input(z.object({ base64: z.string(), mimeType: z.string().default("image/png") }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx as any);
      const admin = getAdminClient();

      // Ensure logos bucket exists and is public
      const { data: buckets } = await admin.storage.listBuckets();
      const logosBucket = buckets?.find((b: any) => b.id === "logos");
      if (!logosBucket) {
        await admin.storage.createBucket("logos", {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        });
      } else if (!logosBucket.public) {
        await admin.storage.updateBucket("logos", { public: true });
      }

      // Upload to Supabase Storage
      const filePath = `${userId}/logo.png`;
      const buffer = Buffer.from(input.base64, "base64");

      const { error: uploadErr } = await admin.storage
        .from("logos")
        .upload(filePath, buffer, {
          contentType: input.mimeType,
          upsert: true,
        });
      if (uploadErr) {
        console.error("[cloud-data] settings.uploadLogo error:", uploadErr);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "שגיאה בהעלאת לוגו" });
      }

      // Get public URL with cache-busting timestamp
      const { data: urlData } = admin.storage.from("logos").getPublicUrl(filePath);
      const baseLogoUrl = urlData?.publicUrl || "";
      // Append timestamp to bust CDN/browser cache when logo is replaced
      const logoUrl = baseLogoUrl ? `${baseLogoUrl}?t=${Date.now()}` : "";

      // Update settings
      const now = new Date().toISOString();
      await admin
        .from("business_settings")
        .upsert({
          user_id: userId,
          business_logo_url: logoUrl,
          updated_at: now,
        }, { onConflict: "user_id" });

      return { logoUrl };
    }),
});

// ============ COMBINED ROUTER ============

export const cloudDataRouter = router({
  products: productsRouter,
  orders: ordersRouter,
  shoppingLists: shoppingListsRouter,
  units: unitsRouter,
  categories: categoriesRouter,
  settings: settingsRouter,
});
