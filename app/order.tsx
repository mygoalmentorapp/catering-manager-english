import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  BackHandler } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import type { OrderProductRow, Product } from "@/lib/types";
import { createOrderProductRow, applyDelta } from "@/lib/order-logic";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
// useEditGuard removed — offline editing is seamless now
// OfflineInfoBanner removed — smooth UX, toast on save only
import { useThemeContext } from "@/lib/theme-provider";

/** Allow only numbers with max 1 decimal place */
function sanitizeQuantity(text: string): string {
  let cleaned = text.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    cleaned = parts[0] + "." + parts[1];
  }
  if (parts.length === 2 && parts[1].length > 1) {
    cleaned = parts[0] + "." + parts[1].substring(0, 1);
  }
  return cleaned;
}

export default function OrderScreen() {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { products, orders } = useData();

  const existingOrder = useMemo(
    () => (params.id ? orders.find((o) => o.id === params.id) : null),
    [params.id, orders]
  );
  const isEditing = !!existingOrder;

  // Block editing for locked or archived orders
  if (existingOrder && (existingOrder.status === "needs_refresh_locked" || existingOrder.status === "archived")) {
    return (
      <ScreenContainer
        edges={["top", "left", "right", "bottom"]}
        containerClassName="bg-background"
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: existingOrder.status === "archived" ? "#F3F4F6" : "#FEF3C7", borderRadius: 12, padding: 24, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <MaterialIcons
              name={existingOrder.status === "archived" ? "archive" : "lock"}
              size={48}
              color={existingOrder.status === "archived" ? "#9CA3AF" : "#F59E0B"}
            />
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1F2937", marginTop: 16, textAlign: "left" }}>
              {existingOrder.status === "archived" ? "Archived order" : "Locked order"}
            </Text>
            <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "left", lineHeight: 20 }}>
              {existingOrder.status === "archived"
                ? "This order is archived. Please unarchive before editing."
                : "This order is locked due to product changes. Please refresh the order from the orders list screen."}
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ backgroundColor: DS_COLORS.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 32, marginTop: 20 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (products.length === 0 && !isEditing) {
    return (
      <ScreenContainer
        edges={["top", "left", "right", "bottom"]}
        containerClassName="bg-background"
      >
        <View style={s.container}>
          <View style={s.header}>
            <View style={{ width: 40 }} />
            <Text style={s.headerTitle}>New order</Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={s.headerBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <MaterialIcons name="inventory-2" size={40} color={DS_COLORS.accent} />
            </View>
            <Text style={s.emptyTitle}>No products in the system</Text>
            <Text style={s.emptySubtitle}>Please add products first</Text>
            <TouchableOpacity
              onPress={() => {
                router.back();
                setTimeout(() => router.push("/products" as any), 100);
              }}
              style={s.emptyBtn}
              activeOpacity={0.8}
            >
              <Text style={s.emptyBtnText}>Go to data entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return <OrderForm existingOrder={existingOrder} isEditing={isEditing} />;
}

function OrderForm({
  existingOrder,
  isEditing }: {
  existingOrder: any;
  isEditing: boolean;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { products, orders, addOrder, updateOrder, deleteOrder, savedShoppingLists, updateSavedShoppingList, refreshShoppingLists, refreshOrders } = useData();
  const { guardMutation } = useMutationGuard();


  const [customerName, setCustomerName] = useState(existingOrder?.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(existingOrder?.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(existingOrder?.customerPhone ?? "");
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    existingOrder?.eventDate ? new Date(existingOrder.eventDate) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [orderProducts, setOrderProducts] = useState<OrderProductRow[]>(
    existingOrder?.products ?? []
  );
  const [notes, setNotes] = useState(existingOrder?.notes ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(
    !!(existingOrder?.customerAddress || existingOrder?.customerPhone)
  );

  const handleClose = () => {
    if (isDirty) {
      Alert.alert(
        "Unsaved changes",
        "You have unsaved changes. Exit without saving?",
        [
          { text: "Continue Edit", style: "cancel" },
          { text: "Exit without saving", style: "destructive", onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  // Intercept Android hardware back button when there are unsaved changes
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isDirty) {
        handleClose();
        return true; // Prevent default back
      }
      return false; // Allow default back
    });
    return () => sub.remove();
  }, [isDirty]);

  // Calculate live customer total from snapshot prices
  const customerTotal = useMemo(() => {
    let total = 0;
    for (const op of orderProducts) {
      total += (op.customerPriceAtAdd ?? 0) * (op.quantity || 0);
    }
    return Math.round(total * 10) / 10;
  }, [orderProducts]);

  const formatPrice = (value: number): string => {
    if (Number.isInteger(value)) return String(value);
    const fixed = value.toFixed(2);
    if (fixed.endsWith(".00")) return String(Math.round(value));
    return fixed;
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const availableProducts = useMemo(() => {
    const usedIds = new Set(orderProducts.map((op) => op.productId));
    return filteredProducts.filter((p) => !usedIds.has(p.id));
  }, [filteredProducts, orderProducts]);

  const addProductToOrder = useCallback(
    (product: Product) => {
      if (orderProducts.some((op) => op.productId === product.id)) {
        Alert.alert("Error", "This product is already in the order");
        return;
      }
      // Create a full snapshot row
      const row = createOrderProductRow(product, 1);
      setOrderProducts([...orderProducts, row]);
      setIsDirty(true);
      setShowSearch(false);
      setSearchQuery("");
    },
    [orderProducts]
  );

  const [qtyTexts, setQtyTexts] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    (existingOrder?.products ?? []).forEach((op: OrderProductRow, i: number) => {
      initial[i] = op.quantity ? String(op.quantity) : "";
    });
    return initial;
  });

  const updateProductQuantity = useCallback(
    (index: number, rawText: string) => {
      const sanitized = sanitizeQuantity(rawText);
      setQtyTexts((prev) => ({ ...prev, [index]: sanitized }));
      const updated = [...orderProducts];
      const num = parseFloat(sanitized);
      updated[index] = { ...updated[index], quantity: isNaN(num) ? 0 : num };
      setOrderProducts(updated);
    },
    [orderProducts]
  );

  const removeProductFromOrder = useCallback(
    (index: number) => {
      const productName = orderProducts[index]?.productNameAtAdd ?? "Product";
      Alert.alert("Remove product", `Remove "${productName}" from the order?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setOrderProducts(orderProducts.filter((_, i) => i !== index));
            setIsDirty(true);
          } },
      ]);
    },
    [orderProducts]
  );

  const handleSave = async () => {
    const allowed = await guardMutation();
    if (!allowed) return;

    setErrorFields(new Set());
    const newErrors = new Set<string>();

    if (!customerName.trim()) {
      newErrors.add("customerName");
      setErrorFields(new Set([...newErrors]));
      Alert.alert("Error", "Please enter a customer name");
      return;
    }

    // Duplicate name check with whitespace normalization
    const normalizeName = (n: string) => n.trim().replace(/\s+/g, " ");
    const normalizedInput = normalizeName(customerName);
    const duplicate = orders.find(
      (o) =>
        normalizeName(o.customerName) === normalizedInput &&
        (!isEditing || o.id !== existingOrder?.id)
    );
    if (duplicate) {
      newErrors.add("customerName");
      setErrorFields(new Set([...newErrors]));
      Alert.alert(
        "Duplicate name",
        "An order with this exact name already exists.\nTo avoid confusion, please add an identifier such as a number, event type, or short description.\nChanging only spaces does not count as a different name."
      );
      return;
    }
    if (!selectedDate) {
      Alert.alert("Error", "Please select an event date");
      return;
    }
    const dateObj = selectedDate;
    if (orderProducts.length === 0) {
      Alert.alert("Error", "Please add at least one product");
      return;
    }
    let hasQtyErrors = false;
    for (let i = 0; i < orderProducts.length; i++) {
      const op = orderProducts[i];
      if (!op.quantity || op.quantity <= 0) {
        newErrors.add(`qty-${i}`);
        hasQtyErrors = true;
      }
    }
    if (hasQtyErrors) {
      setErrorFields(new Set([...newErrors]));
      Alert.alert("Error", "Please enter a quantity greater than 0 for all products marked in red");
      return;
    }

    setSaving(true);
    try {
      const orderData = {
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerPhone: customerPhone.trim(),
        eventDate: dateObj.toISOString(),
        products: orderProducts,
        notes: notes.trim(),
        status: existingOrder?.status ?? ("open" as const) };

      let shoppingListUpdated = false;
      if (isEditing && existingOrder) {
        // Apply Delta to linked valid shopping list
        const linkedList = savedShoppingLists.find(
          (sl) => sl.status === "valid" && sl.orderIds.includes(existingOrder.id)
        );
        if (linkedList) {
          try {
            const updatedRows = applyDelta(
              linkedList.rows,
              existingOrder.id,
              existingOrder.products,
              orderProducts
            );
            await updateSavedShoppingList(linkedList.id, {
              rows: updatedRows,
              updatedAt: new Date().toISOString() });
            shoppingListUpdated = true;
          } catch {
            // Delta failure should not block order save
          }
        }
        await updateOrder(existingOrder.id, orderData);
      } else {
        await addOrder(orderData);
      }
      Alert.alert(
        "Success",
        shoppingListUpdated
          ? "Order updated successfully.\nThe shopping list has been updated according to your changes."
          : "Order saved successfully"
      );
      router.back();
    } catch (e: any) {
      // Network errors: server may have saved the order even though response didn't arrive.
      const isNetworkError =
        !e.message?.includes("Already exists") &&
        (e.message?.toLowerCase()?.includes("network") ||
         e.message?.toLowerCase()?.includes("fetch") ||
         e.message?.toLowerCase()?.includes("timeout") ||
         e.message?.toLowerCase()?.includes("failed") ||
         e.cause?.code === "ECONNABORTED");

      if (isNetworkError && !isEditing) {
        try {
          await refreshOrders();
          const savedName = customerName.trim().toLowerCase();
          const found = orders.find(
            (o) => o.customerName.trim().toLowerCase() === savedName
          );
          if (found) {
            Alert.alert("Success", "Order saved successfully");
            router.back();
            return;
          }
        } catch {
          // Refresh also failed
        }
      }
      Alert.alert("Error", e.message || "Error saving the order");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingOrder) return;
    Alert.alert("Delete order", "Are you sure you want to delete?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const allowed = await guardMutation();
          if (!allowed) return;
          try {
            await deleteOrder(existingOrder.id);
            router.back();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        } },
    ]);
  };

  const inputStyle = (fieldKey: string) => [
    s.input,
    focusedField === fieldKey && s.inputFocused,
    errorFields.has(fieldKey) && s.inputError,
  ];

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        <View style={s.header}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>
            {isEditing ? "Edit order" : "New order"}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Sticky Customer Price Header */}
        <View style={s.stickyPriceHeader}>
          <Text style={s.stickyPriceLabel}>Customer price</Text>
          <Text style={s.stickyPriceValue}>${formatPrice(customerTotal)}</Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 40}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >

            {/* Customer Name */}
            <View style={s.formCard}>
              <Text style={s.formLabel}>Name Customer</Text>
              <TextInput
                style={inputStyle("customerName")}
                value={customerName}
                onChangeText={(v) => {
                  setCustomerName(v);
                  setIsDirty(true);
                  if (errorFields.has("customerName")) {
                    setErrorFields((prev) => { const next = new Set(prev); next.delete("customerName"); return next; });
                  }
                }}
                placeholder="Enter customer name..."
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="left"
                returnKeyType="done"
                onFocus={() => setFocusedField("customer")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Customer Details Accordion */}
            <TouchableOpacity
              onPress={() => { setShowCustomerDetails(!showCustomerDetails); setIsDirty(true); }}
              style={s.accordionHeader}
              activeOpacity={0.7}
            >
              <View style={s.accordionHeaderLeft}>
                <MaterialIcons name="person-outline" size={20} color={DS_COLORS.accent} />
                <Text style={s.accordionHeaderText}>Customer details</Text>
                {!showCustomerDetails && (customerAddress || customerPhone) ? (
                  <Text style={s.accordionPreview} numberOfLines={1}>
                    {[customerPhone, customerAddress].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <MaterialIcons
                name={showCustomerDetails ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                size={22}
                color={DS_COLORS.textSecondary}
              />
            </TouchableOpacity>
            {showCustomerDetails && (
              <View style={s.accordionBody}>
                <View style={s.accordionField}>
                  <Text style={s.accordionFieldLabel}>Phone</Text>
                  <TextInput
                    style={[s.input, focusedField === "phone" && s.inputFocused]}
                    value={customerPhone}
                    onChangeText={(v) => { setCustomerPhone(v); setIsDirty(true); }}
                    placeholder="Enter phone number..."
                    placeholderTextColor={DS_COLORS.textSecondary}
                    textAlign="left"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={s.accordionField}>
                  <Text style={s.accordionFieldLabel}>Address</Text>
                  <TextInput
                    style={[s.input, focusedField === "address" && s.inputFocused]}
                    value={customerAddress}
                    onChangeText={(v) => { setCustomerAddress(v); setIsDirty(true); }}
                    placeholder="Enter address..."
                    placeholderTextColor={DS_COLORS.textSecondary}
                    textAlign="left"
                    returnKeyType="done"
                    selectTextOnFocus
                    onFocus={() => setFocusedField("address")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            )}

            {/* Event Date */}
            <View style={s.formCard}>
              <Text style={s.formLabel}>Event date</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={s.datePickerBtn}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    s.datePickerText,
                    !selectedDate && { color: DS_COLORS.textSecondary },
                  ]}
                >
                  {selectedDate ? formatDateForDisplay(selectedDate.toISOString()) : "Select date..."}
                </Text>
                <MaterialIcons name="event" size={20} color={DS_COLORS.accent} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event: any, date?: Date) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (date) { setSelectedDate(date); setIsDirty(true); }
                  }}
                  minimumDate={new Date()}
                />
              )}
            </View>

            {/* Products */}
            <View style={s.formCard}>
              <View style={s.formCardHeader}>
                <Text style={s.formLabel}>Products</Text>
                <TouchableOpacity
                  onPress={() => setShowSearch(true)}
                  style={s.addSmallBtn}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="add" size={16} color={DS_COLORS.accent} />
                  <Text style={s.addSmallBtnText}>Add product</Text>
                </TouchableOpacity>
              </View>

              {orderProducts.length === 0 && (
                <Text style={s.hint}>Please add at least one product</Text>
              )}

              {orderProducts.map((op, index) => {
                const unitPrice = op.customerPriceAtAdd ?? 0;
                const qty = op.quantity || 0;
                const lineTotal = Math.round(unitPrice * qty * 10) / 10;
                return (
                  <View key={op.productId} style={s.orderProductRow}>
                    <Text style={s.orderProductName} numberOfLines={1}>
                      {op.productNameAtAdd}
                    </Text>
                    <View style={s.orderProductCalcRow}>
                      <Text style={s.orderProductPrice}>${formatPrice(unitPrice)}</Text>
                      <Text style={s.orderProductMultiply}>×</Text>
                      <TextInput
                        style={[inputStyle(`qty-${index}`), s.qtyInput]}
                        value={qtyTexts[index] ?? (op.quantity ? String(op.quantity) : "")}
                        onChangeText={(v) => {
                          updateProductQuantity(index, v);
                          setIsDirty(true);
                          if (errorFields.has(`qty-${index}`)) {
                            setErrorFields((prev) => { const next = new Set(prev); next.delete(`qty-${index}`); return next; });
                          }
                        }}
                        keyboardType="decimal-pad"
                        textAlign="center"
                        placeholder="Quantity"
                        placeholderTextColor={DS_COLORS.textSecondary}
                        returnKeyType="done"
                        selectTextOnFocus
                        onFocus={() => setFocusedField(`qty-${index}`)}
                        onBlur={() => setFocusedField(null)}
                      />
                      <Text style={s.orderProductEquals}>=</Text>
                      <Text style={s.orderProductTotal}>${formatPrice(lineTotal)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeProductFromOrder(index)}
                      style={s.removeBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={18}
                        color={DS_COLORS.error}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Notes */}
            <View style={s.formCard}>
              <Text style={s.formLabel}>Notes</Text>
              <TextInput
                style={[s.input, s.notesInput, focusedField === "notes" && s.inputFocused]}
                value={notes}
                onChangeText={(v) => { setNotes(v); setIsDirty(true); }}
                placeholder="Notes for order..."
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="left"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                onFocus={() => setFocusedField("notes")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky Bottom Buttons */}
        <View style={[s.stickyBottomBar, { paddingBottom: Math.max(DS_SPACING.lg, insets.bottom + DS_SPACING.md) }]}>
          <TouchableOpacity
            onPress={handleSave}
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>

        </View>

        {/* Product Search Modal */}
        <Modal visible={showSearch} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <View style={{ width: 40 }} />
                <Text style={s.modalTitle}>Select product</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                  }}
                  style={s.headerBtn}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: DS_SPACING.xl }}>
                <TextInput
                  style={s.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search Product..."
                  placeholderTextColor={DS_COLORS.textSecondary}
                  textAlign="left"
                  autoFocus
                  returnKeyType="search"
                />
              </View>

              <FlatList
                data={availableProducts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: DS_SPACING.xl, gap: DS_SPACING.sm, paddingBottom: Math.max(DS_SPACING.xl, insets.bottom + DS_SPACING.xl) }}
                ListEmptyComponent={
                  <Text style={s.emptySearchText}>
                    {searchQuery ? "No products found" : "All products are already in the order"}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => addProductToOrder(item)}
                    style={s.searchResultItem}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="add-circle-outline" size={22} color={DS_COLORS.accent} />
                    <View style={s.searchResultInfo}>
                      <Text style={s.searchResultText}>{item.name}</Text>
                      <Text style={s.searchResultPrice}>
                        {(item.customerPrice ?? 0) > 0 ? `$${formatPrice(item.customerPrice ?? 0)}` : "Not set"}
                      </Text>
                    </View>
                    <View style={s.searchResultIcon}>
                      <MaterialIcons name="inventory-2" size={18} color={DS_COLORS.accent} />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
      </View>

    </ScreenContainer>
  );
}

function formatDateForDisplay(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

function _make_s() { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.background,
    writingDirection: "rtl" as const,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.accentLight,
  },
  stickyPriceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    writingDirection: "rtl" as const,
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.accent,
    marginHorizontal: DS_SPACING.lg,
    marginTop: DS_SPACING.xs,
    borderRadius: DS_RADIUS.lg,
  },
  stickyPriceLabel: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.white,
  },
  stickyPriceValue: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.white,
  },
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.lg,
    padding: DS_SPACING.xxxl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.sm,
  },
  emptyTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  emptyBtn: {
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.xxl,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    marginTop: DS_SPACING.sm,
    ...DS_SHADOW.button,
  },
  emptyBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  formContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  formCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.md,
    ...DS_SHADOW.card,
    writingDirection: "rtl" as const,
  },
  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    writingDirection: "rtl" as const,
  },
  formLabel: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    writingDirection: "rtl",
    alignSelf: "flex-start",
  },
  hint: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    writingDirection: "rtl",
    alignSelf: "flex-start",
  },
  input: {
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md + 2,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  inputFocused: {
    borderColor: DS_COLORS.accent,
    backgroundColor: DS_COLORS.inputFocusBg,
  },
  inputError: {
    borderColor: DS_COLORS.error,
    borderWidth: 2,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    gap: DS_SPACING.md,
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md + 2,
  },
  datePickerText: {
    flex: 1,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    writingDirection: "rtl",
  },
  addSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  addSmallBtnText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
  },
  orderProductRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    writingDirection: "rtl" as const,
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.sm,
    flexWrap: "wrap" as const,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  orderProductName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
    flex: 1,
  },
  orderProductCalcRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
    writingDirection: "ltr" as const,
  },
  orderProductPrice: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold as any,
  },
  orderProductMultiply: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  orderProductEquals: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  orderProductTotal: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
  },
  qtyInput: {
    width: 60,
    textAlign: "center",
    paddingVertical: DS_SPACING.xs,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  stickyBottomBar: {
    paddingHorizontal: DS_SPACING.lg,
    paddingTop: DS_SPACING.sm,
    paddingBottom: DS_SPACING.lg,
    backgroundColor: DS_COLORS.background,
    borderTopWidth: 0.5,
    borderTopColor: DS_COLORS.border,
    gap: DS_SPACING.sm,
  },
  saveBtn: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    ...DS_SHADOW.button,
  },
  saveBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
  },
  deleteOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    justifyContent: "center",
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.error,
    gap: DS_SPACING.sm,
  },
  deleteOrderBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(30,30,46,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: DS_COLORS.card,
    borderTopLeftRadius: DS_RADIUS.xl,
    borderTopRightRadius: DS_RADIUS.xl,
    maxHeight: "70%",
    minHeight: "50%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    justifyContent: "space-between",
    padding: DS_SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  modalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  searchInput: {
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    marginTop: DS_SPACING.md,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    gap: DS_SPACING.md,
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  searchResultIcon: {
    width: 36,
    height: 36,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultInfo: {
    flex: 1,
    gap: 2,
  },
  searchResultText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
  },
  searchResultPrice: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold as any,
  },
  emptySearchText: {
    textAlign: "right",
    padding: DS_SPACING.xxxl,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
  },
  markupRow: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    gap: DS_SPACING.md,
  },
  markupToggle: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    overflow: "hidden" as const,
  },
  markupToggleBtn: {
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm + 2,
    backgroundColor: DS_COLORS.background,
  },
  markupToggleBtnActive: {
    backgroundColor: DS_COLORS.accent,
  },
  markupToggleBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  markupToggleBtnTextActive: {
    color: DS_COLORS.white,
  },
  markupInput: {
    flex: 1,
    textAlign: "center",
  },
  markupHint: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    marginTop: DS_SPACING.xs,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    justifyContent: "space-between",
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.lg,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
  },
  accordionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    writingDirection: "rtl" as const,
    gap: DS_SPACING.sm,
    flex: 1,
  },
  accordionHeaderText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textPrimary,
  },
  accordionPreview: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    flex: 1,
    marginRight: DS_SPACING.sm,
  },
  accordionBody: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: -DS_SPACING.xs,
    gap: DS_SPACING.md,
  },
  accordionField: {
    gap: DS_SPACING.xs,
  },
  accordionFieldLabel: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium as any,
    color: DS_COLORS.textSecondary,
    writingDirection: "rtl",
    alignSelf: "flex-start",
  },
  notesInput: {
    minHeight: 80,
    paddingTop: DS_SPACING.md,
  },
}); }
