import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  Animated,
  Modal,
  Pressable,
  BackHandler } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import type { BaseIngredient, Spice, Product, ProductCategory, CategoryItem, CustomCategory, MarkupType, UnitDef } from "@/lib/types";
import { generateId } from "@/lib/uuid";
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

// ============ Price formatting helper ============
function formatPrice(value: number): string {
  if (Number.isInteger(value)) return String(value);
  // Show up to 2 decimal places, remove trailing zeros only if all decimals are zero
  const fixed = value.toFixed(2);
  // If it ends with .00, return integer
  if (fixed.endsWith(".00")) return String(Math.round(value));
  return fixed;
}

// ============ Unit plural helper ============
function getUnitLabel(unit: string, quantity: number, units: UnitDef[]): string {
  const def = units.find((u) => u.singular === unit || u.plural === unit);
  if (!def) return unit;
  return quantity > 1 ? def.plural : def.singular;
}

// ============ Quantity helper ============
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

// ============ Animated Card Wrapper ============
function PressableCard({
  children,
  onPress,
  style }: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() =>
          Animated.timing(scaleAnim, {
            toValue: 0.97,
            duration: 80,
            useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true }).start()
        }
        activeOpacity={1}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============ Unit Picker Modal ============
function UnitPickerModal({
  visible,
  units,
  selectedUnit,
  onSelect,
  onClose,
  onAddUnit }: {
  visible: boolean;
  units: UnitDef[];
  selectedUnit: string;
  onSelect: (unit: string) => void;
  onClose: () => void;
  onAddUnit: (unit: UnitDef) => Promise<void>;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const [newSingular, setNewSingular] = useState("");
  const [newPlural, setNewPlural] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddUnit = async () => {
    if (!newSingular.trim()) return;
    if (!newPlural.trim()) {
      Alert.alert("Error", "Please also enter the plural form");
      return;
    }
    setAdding(true);
    try {
      await onAddUnit({ singular: newSingular.trim(), plural: newPlural.trim() });
      onSelect(newSingular.trim());
      setNewSingular("");
      setNewPlural("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.unitModalContent}>
          <View style={s.unitModalHeader}>
            <TouchableOpacity onPress={onClose} style={s.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={s.unitModalTitle}>Select measurement unit</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ padding: DS_SPACING.lg }}>
            {units.map((unitDef) => (
              <TouchableOpacity
                key={unitDef.singular}
                onPress={() => { onSelect(unitDef.singular); onClose(); }}
                style={[s.unitOption, selectedUnit === unitDef.singular && s.unitOptionSelected]}
                activeOpacity={0.7}
              >
                <Text style={[s.unitOptionText, selectedUnit === unitDef.singular && s.unitOptionTextSelected]}>
                  {unitDef.singular}/{unitDef.plural}
                </Text>
                {selectedUnit === unitDef.singular && (
                  <MaterialIcons name="check" size={20} color={DS_COLORS.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.addUnitSection}>
            <View style={s.addUnitRow}>
              <TextInput
                style={[s.addUnitInput, { flex: 1 }]}
                value={newSingular}
                onChangeText={setNewSingular}
                placeholder="Singular (e.g., kg)"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="left"
                returnKeyType="next"
              />
              <TextInput
                style={[s.addUnitInput, { flex: 1 }]}
                value={newPlural}
                onChangeText={setNewPlural}
                placeholder="Plural (e.g., kg)"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="left"
                returnKeyType="done"
                onSubmitEditing={handleAddUnit}
              />
            </View>
            <TouchableOpacity
              onPress={handleAddUnit}
              style={[s.addUnitBtn, (!newSingular.trim() || adding) && { opacity: 0.5 }]}
              activeOpacity={0.8}
              disabled={!newSingular.trim() || adding}
            >
              <MaterialIcons name="add" size={18} color={DS_COLORS.white} />
              <Text style={s.addUnitBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ============ Category Management Modal ============
interface AllCategory {
  id: string;
  name: string;
  isBuiltIn: boolean; // true for base ingredients / spices defaults
}

function CategoryManageModal({
  visible,
  allCategories,
  onAdd,
  onRename,
  onDelete,
  onClose }: {
  visible: boolean;
  allCategories: AllCategory[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const [newCatName, setNewCatName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = async () => {
    if (!newCatName.trim()) return;
    setAdding(true);
    try {
      await onAdd(newCatName.trim());
      setNewCatName("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (cat: AllCategory) => {
    if (allCategories.length <= 1) {
      Alert.alert("Error", "At least one category must remain");
      return;
    }
    Alert.alert("Delete category", `Delete "${cat.name}"?\nAll items inside will be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(cat.id) },
    ]);
  };

  const startEditing = (cat: AllCategory) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const finishEditing = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      // Revert to original name
      setEditingId(null);
      setEditingName("");
      return;
    }
    const original = allCategories.find((c) => c.id === editingId);
    if (original && trimmed !== original.name) {
      try {
        await onRename(editingId, trimmed);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    }
    setEditingId(null);
    setEditingName("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={s.unitModalContent}>
            <View style={s.unitModalHeader}>
              <TouchableOpacity onPress={onClose} style={s.headerBtn} activeOpacity={0.7}>
                <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={s.unitModalTitle}>Manage categories</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView style={{ maxHeight: 350 }} contentContainerStyle={{ padding: DS_SPACING.lg, gap: DS_SPACING.sm }}>
              {allCategories.map((cat) => (
                <View key={cat.id} style={s.catRow}>
                  {editingId === cat.id ? (
                    <TextInput
                      style={s.catRowInput}
                      value={editingName}
                      onChangeText={setEditingName}
                      autoFocus
                      textAlign="left"
                      returnKeyType="done"
                      onSubmitEditing={finishEditing}
                      onBlur={finishEditing}
                      selectTextOnFocus
                    />
                  ) : (
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => startEditing(cat)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.catRowText}>{cat.name}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(cat)}
                    style={s.removeBtn}
                    activeOpacity={0.7}
                    disabled={allCategories.length <= 1}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={18}
                      color={allCategories.length <= 1 ? DS_COLORS.border : DS_COLORS.error}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <View style={[s.addUnitSection, { paddingBottom: DS_SPACING.xxxl * 2 }]}>
              <View style={s.addUnitRow}>
                <TextInput
                  style={s.addUnitInput}
                  value={newCatName}
                  onChangeText={setNewCatName}
                  placeholder="Enter name for new category..."
                  placeholderTextColor={DS_COLORS.textSecondary}
                  textAlign="left"
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                />
                <TouchableOpacity
                  onPress={handleAdd}
                  style={[s.addUnitBtn, (!newCatName.trim() || adding) && { opacity: 0.5 }]}
                  activeOpacity={0.8}
                  disabled={!newCatName.trim() || adding}
                >
                  <MaterialIcons name="add" size={18} color={DS_COLORS.white} />
                  <Text style={s.addUnitBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============ Product Detail View ============
function ProductDetailView({
  product,
  onClose,
  onEdit }: {
  product: Product;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const { units } = useData();
  // Calculate total product cost and final cost (with markup)
  const productCost = (() => {
    let sum = 0;
    product.baseIngredients.forEach((i) => sum += (i.price || 0));
    product.spices.forEach((sp) => sum += (sp.price || 0));
    (product.categories ?? []).forEach((cat) => cat.items.forEach((item) => sum += (item.price || 0)));
    return Math.round(sum * 10) / 10;
  })();

  const markupAmount = product.markupType === "percent"
    ? Math.round(productCost * (product.markupValue || 0) / 100 * 10) / 10
    : (product.markupValue || 0);
  const finalCost = Math.round((productCost + markupAmount) * 10) / 10;
  const profit = Math.round(((product.customerPrice ?? 0) - finalCost) * 10) / 10;

  const renderDetailItem = (item: { id: string; name: string; quantity: number; unit: string; price?: number }) => (
    <View key={item.id} style={s.detailRow}>
      <Text style={s.detailItemQty}>{item.quantity} {item.unit ? getUnitLabel(item.unit, item.quantity, units) : item.unit}</Text>
      <Text style={s.detailItemName}>{item.name}</Text>
      {(item.price ?? 0) > 0 && (
        <Text style={s.detailItemPrice}>{item.price} $</Text>
      )}
    </View>
  );

  const [activeTab, setActiveTab] = useState<"customer" | "cost" | "profit">("customer");

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onEdit} style={s.editHeaderBtn} activeOpacity={0.8}>
            <MaterialIcons name="edit" size={18} color={DS_COLORS.accent} />
            <Text style={s.editHeaderBtnText}>Edit</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{product.name}</Text>
          <TouchableOpacity onPress={onClose} style={s.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Sticky: 3-Tab Price Display */}
        <View style={s.prodTabContainer}>
          <View style={s.prodTabRow}>
            <TouchableOpacity
              onPress={() => setActiveTab("customer")}
              style={[s.prodTabBtn, activeTab === "customer" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "customer" && s.prodTabBtnTextActive]}>Customer price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("cost")}
              style={[s.prodTabBtn, activeTab === "cost" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "cost" && s.prodTabBtnTextActive]}>Price Cost</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("profit")}
              style={[s.prodTabBtn, activeTab === "profit" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "profit" && s.prodTabBtnTextActive]}>Our profit</Text>
            </TouchableOpacity>
          </View>

          <View style={s.prodTabContentRow}>
            <View style={s.prodTabContentCell}>
              {activeTab === "customer" && (
                <Text style={s.prodTabValueAmount}>${formatPrice(product.customerPrice ?? 0)}</Text>
              )}
            </View>
            <View style={s.prodTabContentCell}>
              {activeTab === "cost" && (
                <Text style={s.prodTabValueAmount}>${formatPrice(finalCost)}</Text>
              )}
            </View>
            <View style={s.prodTabContentCell}>
              {activeTab === "profit" && (
                <Text style={[
                  s.prodTabValueAmount,
                  profit < 0 && { color: DS_COLORS.error },
                ]}>${formatPrice(profit)}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Scrollable: Ingredients */}
        <ScrollView contentContainerStyle={s.detailContent}>
          {/* Base Ingredients */}
          <View style={s.detailCard}>
            <View style={s.detailCardHeader}>
              <Text style={s.detailCardTitle}>{product.baseLabel || "Base ingredients"}</Text>
            </View>
            {product.baseIngredients.length === 0 ? (
              <Text style={s.detailEmpty}>No {product.baseLabel || "Base ingredients"}</Text>
            ) : (
              product.baseIngredients.map(renderDetailItem)
            )}
          </View>

          {/* Spices */}
          <View style={s.detailCard}>
            <View style={s.detailCardHeader}>
              <Text style={s.detailCardTitle}>{product.spiceLabel || "Spices"}</Text>
            </View>
            {product.spices.length === 0 ? (
              <Text style={s.detailEmpty}>No {product.spiceLabel || "Spices"}</Text>
            ) : (
              product.spices.map(renderDetailItem)
            )}
          </View>

          {/* Dynamic Categories */}
          {(product.categories ?? []).map((cat) => (
            <View key={cat.categoryId} style={s.detailCard}>
              <View style={s.detailCardHeader}>
                <Text style={s.detailCardTitle}>{cat.categoryName}</Text>
              </View>
              {cat.items.length === 0 ? (
                <Text style={s.detailEmpty}>No items</Text>
              ) : (
                cat.items.map(renderDetailItem)
              )}
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

// ============ Main Products Screen ============
export default function ProductsScreen() {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const { products, deleteProduct } = useData();
  const { guardMutation } = useMutationGuard();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const handleDelete = useCallback(
    (product: Product) => {
      Alert.alert("Delete product", "Are you sure you want to delete?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const allowed = await guardMutation();
            if (!allowed) return;
            try {
              await deleteProduct(product.id);
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          } },
      ]);
    },
    [deleteProduct, guardMutation]
  );

  const handleEdit = useCallback((product: Product) => {
    setViewingProduct(null);
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const handleAdd = useCallback(() => {
    setEditingProduct(null);
    setShowForm(true);
  }, []);

  const handleFormClose = useCallback((isNew?: boolean) => {
    setShowForm(false);
    setEditingProduct(null);
    if (isNew) router.back();
  }, [router]);

  const handleView = useCallback((product: Product) => {
    setViewingProduct(product);
  }, []);

  // Show product detail view
  if (viewingProduct) {
    // Get the latest version of the product from the list
    const latestProduct = products.find((p) => p.id === viewingProduct.id) ?? viewingProduct;
    return (
      <ProductDetailView
        product={latestProduct}
        onClose={() => setViewingProduct(null)}
        onEdit={() => handleEdit(latestProduct)}
      />
    );
  }

  // Show product form
  if (showForm) {
    return <ProductForm product={editingProduct} onClose={handleFormClose} />;
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleAdd} style={s.addBtn} activeOpacity={0.8}>
            <MaterialIcons name="add" size={22} color={DS_COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Products</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {products.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <MaterialIcons name="inventory-2" size={40} color={DS_COLORS.accent} />
            </View>
            <Text style={s.emptyTitle}>No products in the system</Text>
            <Text style={s.emptySubtitle}>Start by adding your first product</Text>
            <TouchableOpacity onPress={handleAdd} style={s.emptyBtn} activeOpacity={0.8}>
              <MaterialIcons name="add" size={20} color={DS_COLORS.white} />
              <Text style={s.emptyBtnText}>Add first product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => (
              <PressableCard onPress={() => handleView(item)} style={s.productCard}>
                <View style={s.productCardInner}>
                  <View style={s.productIconWrap}>
                    <MaterialIcons name="inventory-2" size={22} color={DS_COLORS.accent} />
                  </View>
                  <View style={s.productInfo}>
                    <Text style={s.productName}>{item.name}</Text>
                    <Text style={s.productMeta}>
                      {(item.customerPrice ?? 0) > 0
                        ? `Customer price: $${formatPrice(item.customerPrice ?? 0)}`
                        : "Customer price: Not set"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    style={s.deleteBtn}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="delete-outline" size={20} color={DS_COLORS.error} />
                  </TouchableOpacity>
                </View>
              </PressableCard>
            )}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

// ============ Product Form Component ============

function ProductForm({
  product,
  onClose }: {
  product: Product | null;
  onClose: (isNew?: boolean) => void;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const { addProduct, updateProduct, refreshProducts, units, addUnit, customCategories, addCustomCategory, renameCustomCategory, deleteCustomCategory, orders, products: allProducts } = useData();
  const { guardMutation } = useMutationGuard();

  const insets = useSafeAreaInsets();
  const isEditing = !!product;

  const [name, setName] = useState(product?.name ?? "");
  const [baseIngredients, setBaseIngredients] = useState<BaseIngredient[]>(
    product?.baseIngredients ?? []
  );
  const [spices, setSpices] = useState<Spice[]>(
    (product?.spices ?? []).map((sp) => ({
      id: sp.id,
      name: sp.name,
      quantity: sp.quantity ?? 0,
      unit: sp.unit ?? "",
      price: sp.price ?? 0 }))
  );
  const [categories, setCategories] = useState<ProductCategory[]>(
    product?.categories ?? []
  );
  const [customerPrice, setCustomerPrice] = useState(product?.customerPrice ?? 0);
  const [customerPriceText, setCustomerPriceText] = useState(
    product?.customerPrice != null ? String(product.customerPrice) : ""
  );
  const [markupType, setMarkupType] = useState<MarkupType>(product?.markupType ?? "percent");
  const [markupValue, setMarkupValue] = useState<string>(
    product?.markupValue ? String(product.markupValue) : "0"
  );
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const priceInputRefs = useRef<Record<string, TextInput>>({});
  const [unitPickerTarget, setUnitPickerTarget] = useState<{
    type: "ingredient" | "spice" | "category";
    index: number;
    catIndex?: number;
  } | null>(null);
  // Category label names (editable via category management modal)
  const [baseLabel, setBaseLabel] = useState(product?.baseLabel ?? "Base ingredients");
  const [spiceLabel, setSpiceLabel] = useState(product?.spiceLabel ?? "Spices");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  // Track fields with validation errors (visual red border)
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  // Active tab for price display (same as product detail view)
  const [activeTab, setActiveTab] = useState<"customer" | "cost" | "profit">("customer");
  // Track if user made any changes (dirty state)
  const [isDirty, setIsDirty] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      Alert.alert(
        "Unsaved changes",
        "You have unsaved changes. Exit without saving?",
        [
          { text: "Continue Edit", style: "cancel" },
          { text: "Exit without saving", style: "destructive", onPress: () => onClose() },
        ]
      );
    } else {
      onClose();
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

  // Track raw text for quantity fields
  const [qtyTexts, setQtyTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    (product?.baseIngredients ?? []).forEach((ing) => {
      initial[`ing-${ing.id}`] = ing.quantity != null ? String(ing.quantity) : "";
    });
    (product?.spices ?? []).forEach((sp) => {
      initial[`sp-${sp.id}`] = sp.quantity != null ? String(sp.quantity) : "";
    });
    (product?.categories ?? []).forEach((cat) => {
      cat.items.forEach((item) => {
        initial[`cat-${cat.categoryId}-${item.id}`] = item.quantity != null ? String(item.quantity) : "";
      });
    });
    return initial;
  });

  // Track raw text for price fields
  const [priceTexts, setPriceTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    (product?.baseIngredients ?? []).forEach((ing) => {
      initial[`ing-${ing.id}`] = ing.price != null ? String(ing.price) : "";
    });
    (product?.spices ?? []).forEach((sp) => {
      initial[`sp-${sp.id}`] = sp.price != null ? String(sp.price) : "";
    });
    (product?.categories ?? []).forEach((cat) => {
      cat.items.forEach((item) => {
        initial[`cat-${cat.categoryId}-${item.id}`] = item.price != null ? String(item.price) : "";
      });
    });
    return initial;
  });

  // Calculate total product cost
  const totalCost = useMemo(() => {
    let sum = 0;
    baseIngredients.forEach((i) => sum += (i.price || 0));
    spices.forEach((sp) => sum += (sp.price || 0));
    categories.forEach((cat) => cat.items.forEach((item) => sum += (item.price || 0)));
    return Math.round(sum * 10) / 10;
  }, [baseIngredients, spices, categories]);

  // Calculate final cost (with markup) and profit for tabs
  const { finalCost, profit: formProfit } = useMemo(() => {
    const numMarkup = parseFloat(markupValue) || 0;
    const markupAmount = markupType === "percent"
      ? Math.round(totalCost * numMarkup / 100 * 10) / 10
      : numMarkup;
    const fc = Math.round((totalCost + markupAmount) * 10) / 10;
    const p = Math.round((customerPrice - fc) * 10) / 10;
    return { finalCost: fc, profit: p };
  }, [totalCost, markupValue, markupType, customerPrice]);

  // Sync categories with global custom categories:
  // - Add new global categories that don't exist in the form yet
  // - Remove form categories whose global category was deleted
  // - Deduplicate by matching both categoryId and categoryName
  useEffect(() => {
    setCategories((prev) => {
      const globalIds = new Set(customCategories.map((cc) => cc.id));
      const globalNames = new Set(customCategories.map((cc) => cc.name));
      
      // Remove categories that no longer exist globally (deleted)
      let updated = prev.filter((c) => globalIds.has(c.categoryId) || globalNames.has(c.categoryName));
      
      // Fix any categories that have a local ID but match by name — update to server ID
      updated = updated.map((c) => {
        if (!globalIds.has(c.categoryId)) {
          const match = customCategories.find((cc) => cc.name === c.categoryName);
          if (match) {
            return { ...c, categoryId: match.id };
          }
        }
        return c;
      });
      
      // Deduplicate by categoryId (keep the one with more items)
      const byId = new Map<string, ProductCategory>();
      for (const c of updated) {
        const existing = byId.get(c.categoryId);
        if (!existing || c.items.length > existing.items.length) {
          byId.set(c.categoryId, c);
        }
      }
      updated = Array.from(byId.values());
      
      // Add new global categories that don't exist in the form
      const existingIds = new Set(updated.map((c) => c.categoryId));
      const newCats = customCategories.filter((cc) => !existingIds.has(cc.id));
      if (newCats.length > 0) {
        updated = [
          ...updated,
          ...newCats.map((cc) => ({
            categoryId: cc.id,
            categoryName: cc.name,
            items: [] as CategoryItem[] })),
        ];
      }
      
      // Only update if something actually changed
      if (updated.length !== prev.length || updated.some((c, i) => c !== prev[i])) {
        return updated;
      }
      return prev;
    });
  }, [customCategories]);

  // ── Base Ingredients ──
  const addIngredient = () => {
    const newId = generateId();
    setBaseIngredients([
      ...baseIngredients,
      { id: newId, name: "", quantity: 0, unit: "", price: 0 },
    ]);
    // Initialize text tracking so validation knows these are untouched (empty) fields
    const key = `ing-${newId}`;
    setQtyTexts((prev) => ({ ...prev, [key]: "" }));
    setPriceTexts((prev) => ({ ...prev, [key]: "" }));
    setIsDirty(true);
  };

  const updateIngredient = (index: number, field: keyof BaseIngredient, value: string | number) => {
    const updated = [...baseIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setBaseIngredients(updated);
  };

  // Count total ingredients across all sections (base + spices + all category items)
  const getTotalIngredientCount = () => {
    return baseIngredients.length + spices.length + categories.reduce((sum, c) => sum + c.items.length, 0);
  };

  // Check if product is linked to an active (non-archived) order
  const isLinkedToActiveOrder = isEditing && product
    ? orders.some((o) => !o.archivedAt && o.products.some((p) => p.productId === product.id))
    : false;

  const removeIngredient = (index: number) => {
    // Block if this is the last ingredient and product is linked to active order
    if (getTotalIngredientCount() <= 1 && isLinkedToActiveOrder) {
      Alert.alert(
        "Unable to remove",
        "A product with no items is considered deleted, and you cannot delete a product linked to an active order."
      );
      return;
    }
    const ingredientName = baseIngredients[index]?.name || "Ingredient";
    Alert.alert("Remove ingredient", `Remove "${ingredientName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => { setBaseIngredients(baseIngredients.filter((_, i) => i !== index)); setIsDirty(true); } },
    ]);
  };

  // ── Spices (now with quantity + unit) ──
  const addSpice = () => {
    const newId = generateId();
    setSpices([...spices, { id: newId, name: "", quantity: 0, unit: "", price: 0 }]);
    const key = `sp-${newId}`;
    setQtyTexts((prev) => ({ ...prev, [key]: "" }));
    setPriceTexts((prev) => ({ ...prev, [key]: "" }));
    setIsDirty(true);
  };

  const updateSpice = (index: number, field: keyof Spice, value: string | number) => {
    const updated = [...spices];
    updated[index] = { ...updated[index], [field]: value };
    setSpices(updated);
  };

  const removeSpice = (index: number) => {
    // Block if this is the last ingredient and product is linked to active order
    if (getTotalIngredientCount() <= 1 && isLinkedToActiveOrder) {
      Alert.alert(
        "Unable to remove",
        "A product with no items is considered deleted, and you cannot delete a product linked to an active order."
      );
      return;
    }
    const spiceName = spices[index]?.name || "Spice";
    Alert.alert("Remove spice", `Remove "${spiceName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => { setSpices(spices.filter((_, i) => i !== index)); setIsDirty(true); } },
    ]);
  };

  // ── Category Items ──
  const addCategoryItem = (catIndex: number) => {
    const newId = generateId();
    const updated = [...categories];
    updated[catIndex] = {
      ...updated[catIndex],
      items: [...updated[catIndex].items, { id: newId, name: "", quantity: 0, unit: "", price: 0 }] };
    const key = `cat-${updated[catIndex].categoryId}-${newId}`;
    setQtyTexts((prev) => ({ ...prev, [key]: "" }));
    setPriceTexts((prev) => ({ ...prev, [key]: "" }));
    setCategories(updated);
    setIsDirty(true);
  };

  const updateCategoryItem = (catIndex: number, itemIndex: number, field: keyof CategoryItem, value: string | number) => {
    const updated = [...categories];
    const items = [...updated[catIndex].items];
    items[itemIndex] = { ...items[itemIndex], [field]: value };
    updated[catIndex] = { ...updated[catIndex], items };
    setCategories(updated);
  };

  const removeCategoryItem = (catIndex: number, itemIndex: number) => {
    // Block if this is the last ingredient and product is linked to active order
    if (getTotalIngredientCount() <= 1 && isLinkedToActiveOrder) {
      Alert.alert(
        "Unable to remove",
        "A product with no items is considered deleted, and you cannot delete a product linked to an active order."
      );
      return;
    }
    const itemName = categories[catIndex].items[itemIndex]?.name || "Item";
    Alert.alert("Remove item", `Remove "${itemName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          const updated = [...categories];
          updated[catIndex] = {
            ...updated[catIndex],
            items: updated[catIndex].items.filter((_, i) => i !== itemIndex) };
          setCategories(updated);
          setIsDirty(true);
        } },
    ]);
  };

  // ── Helpers: row emptiness checks ──
  const isRowCompletelyEmpty = (item: { name: string; quantity: number; unit: string; price: number }) =>
    !item.name.trim() && item.quantity === 0 && !item.unit.trim() && (item.price === 0 || !item.price);

  const isRowFullyValid = (item: { name: string; quantity: number; unit: string; price: number }) =>
    !!item.name.trim() && item.quantity >= 0 && !!item.unit.trim() && item.price >= 0;

  // ── Save ──
  const handleSave = async () => {
    const allowed = await guardMutation();
    if (!allowed) return;

    // Clear previous errors
    setErrorFields(new Set());

    if (!name.trim()) {
      setErrorFields(new Set(["name"]));
      Alert.alert("Error", "Please enter a product name");
      return;
    }

    // ── Validate all rows: collect errors for partial rows, silently drop empty rows ──
    const newErrors = new Set<string>();

    // Build a lookup key for raw text values (same scheme as renderIngredientRow)
    const getTextKey = (item: { id: string }, prefix: string): string => {
      if (prefix === "ing") return `ing-${item.id}`;
      if (prefix === "sp") return `sp-${item.id}`;
      // For categories, prefix is "cat-{catIndex}", extract catIndex
      const catIdx = parseInt(prefix.replace("cat-", ""), 10);
      return `cat-${categories[catIdx]?.categoryId}-${item.id}`;
    };

    // Helper to check a row and collect error field keys
    const validateRow = (
      item: { id: string; name: string; quantity: number; unit: string; price: number },
      prefix: string,
      index: number,
    ): "valid" | "empty" | "partial" => {
      const textKey = getTextKey(item, prefix);
      const rawQty = qtyTexts[textKey] ?? "";
      const rawPrice = priceTexts[textKey] ?? "";

      // Completely empty: no name, no meaningful quantity, no unit, no typed price
      // Note: rawQty of "0" is treated as empty since quantity must be > 0
      const qtyEmpty = !rawQty.trim() || parseFloat(rawQty.trim()) === 0;
      const isEmpty = !item.name.trim() && qtyEmpty && !item.unit.trim() && !rawPrice.trim();
      if (isEmpty) return "empty";

      // Quantity 0 is treated as not filled (must be > 0)
      const qtyFilled = rawQty.trim() !== "" && parseFloat(rawQty.trim()) > 0;
      const priceFilled = rawPrice.trim() !== "";

      // Fully valid: name filled, quantity > 0, unit filled, price filled
      const isValid = !!item.name.trim() && qtyFilled && !!item.unit.trim() && priceFilled;
      if (isValid) return "valid";

      // Partial: mark specific empty fields
      if (!item.name.trim()) newErrors.add(`${prefix}-name-${index}`);
      if (!qtyFilled) newErrors.add(`${prefix}-qty-${index}`);
      if (!item.unit.trim()) newErrors.add(`${prefix}-unit-${index}`);
      if (!priceFilled) newErrors.add(`${prefix}-price-${index}`);
      return "partial";
    };

    let hasPartialRows = false;

    // Check base ingredients
    const cleanedIngredients: BaseIngredient[] = [];
    baseIngredients.forEach((ing, index) => {
      const result = validateRow(ing, "ing", index);
      if (result === "valid") cleanedIngredients.push(ing);
      if (result === "partial") { hasPartialRows = true; cleanedIngredients.push(ing); }
      // "empty" → silently dropped
    });

    // Check spices
    const cleanedSpices: Spice[] = [];
    spices.forEach((sp, index) => {
      const result = validateRow(sp, "sp", index);
      if (result === "valid") cleanedSpices.push(sp);
      if (result === "partial") { hasPartialRows = true; cleanedSpices.push(sp); }
    });

    // Check category items
    const cleanedCategories: ProductCategory[] = [];
    categories.forEach((cat, catIndex) => {
      const cleanedItems: CategoryItem[] = [];
      cat.items.forEach((item, itemIndex) => {
        const result = validateRow(item, `cat-${catIndex}`, itemIndex);
        if (result === "valid") cleanedItems.push(item);
        if (result === "partial") { hasPartialRows = true; cleanedItems.push(item); }
      });
      cleanedCategories.push({ ...cat, items: cleanedItems });
    });

    // If partial rows exist, show error and highlight fields
    if (hasPartialRows) {
      setErrorFields(newErrors);
      Alert.alert("Error", "Not all fields are filled. Please complete the fields marked in red");
      return;
    }

    // Silently remove empty rows from state
    setBaseIngredients(cleanedIngredients);
    setSpices(cleanedSpices);
    setCategories(cleanedCategories);

    const totalItems = cleanedIngredients.length + cleanedSpices.length + cleanedCategories.reduce((sum, cat) => sum + cat.items.length, 0);
    if (totalItems === 0) {
      Alert.alert("Error", "Please add at least one item in one of the categories");
      return;
    }

    // Validate customer price
    if (!customerPriceText.trim()) {
      newErrors.add("customerPrice");
      setErrorFields((prev) => new Set([...prev, "customerPrice"]));
      Alert.alert("Error", "Please enter a customer price");
      return;
    }

    const validCategories = cleanedCategories.filter((cat) => cat.items.length > 0);

    // Helper: detect rows where quantity changed but price did not
    const qtyChangedNoPriceChange: string[] = [];
    if (isEditing && product) {
      const origIngMap = new Map<string, { quantity: number; price: number }>();
      (product.baseIngredients ?? []).forEach((ing) => origIngMap.set(ing.id, { quantity: ing.quantity, price: ing.price }));
      cleanedIngredients.forEach((ing) => {
        const orig = origIngMap.get(ing.id);
        if (orig && ing.quantity !== orig.quantity && ing.price === orig.price) {
          qtyChangedNoPriceChange.push(ing.name || "Ingredient");
        }
      });
      const origSpMap = new Map<string, { quantity: number; price: number }>();
      (product.spices ?? []).forEach((sp) => origSpMap.set(sp.id, { quantity: sp.quantity ?? 0, price: sp.price ?? 0 }));
      cleanedSpices.forEach((sp) => {
        const orig = origSpMap.get(sp.id);
        if (orig && sp.quantity !== orig.quantity && sp.price === orig.price) {
          qtyChangedNoPriceChange.push(sp.name || "Spice");
        }
      });
      (product.categories ?? []).forEach((origCat) => {
        const origItemMap = new Map<string, { quantity: number; price: number }>();
        origCat.items.forEach((item) => origItemMap.set(item.id, { quantity: item.quantity, price: item.price }));
        const matchCat = validCategories.find((c) => c.categoryId === origCat.categoryId);
        if (matchCat) {
          matchCat.items.forEach((item) => {
            const orig = origItemMap.get(item.id);
            if (orig && item.quantity !== orig.quantity && item.price === orig.price) {
              qtyChangedNoPriceChange.push(item.name || "Item");
            }
          });
        }
      });
    }

    // Continuation helper that chains remaining checks (price 0, then save)
    const proceedAfterQtyCheck = () => {
      if (customerPrice === 0) {
        Alert.alert(
          "Customer price 0",
          "The product price for the customer is set to 0. Continue and save?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Save",
              onPress: () => doSave(cleanedIngredients, cleanedSpices, validCategories) },
          ]
        );
        return;
      }
      doSave(cleanedIngredients, cleanedSpices, validCategories);
    };

    // If quantity changed without price change, warn user
    if (qtyChangedNoPriceChange.length > 0) {
      const names = qtyChangedNoPriceChange.join(", ");
      Alert.alert(
        "Attention",
        `You changed the quantity in: ${names} but did not update the price. Continue and save?`,
        [
          { text: "Back to editing", style: "cancel" },
          { text: "Save anyway", onPress: proceedAfterQtyCheck },
        ]
      );
      return;
    }

    proceedAfterQtyCheck();
  };

  const doSave = async (
    cleanedIngredients: BaseIngredient[],
    cleanedSpices: Spice[],
    validCategories: ProductCategory[],
  ) => {
    setSaving(true);
    try {
      const productData = {
        name: name.trim(),
        baseIngredients: cleanedIngredients,
        spices: cleanedSpices,
        categories: validCategories,
        customerPrice: customerPrice,
        markupType,
        markupValue: parseFloat(markupValue) || 0,
        baseLabel: baseLabel || undefined,
        spiceLabel: spiceLabel || undefined };

      if (isEditing && product) {
        await updateProduct(product.id, productData);
      } else {
        await addProduct(productData);
      }
      const hasLinkedOrders = isEditing && product
        ? orders.some((o) => o.products.some((p) => p.productId === product.id))
        : false;
      Alert.alert(
        "Success",
        isEditing && isDirty && hasLinkedOrders
          ? "Product updated successfully.\nThe update will apply to new orders from now on.\nFor existing orders, you can update them according to this change when you open them."
          : "Product updated successfully"
      );
      onClose(!isEditing);
    } catch (e: any) {
      // Network errors: the server may have saved the product even though
      // the response didn't arrive. Refresh and check before showing error.
      const isNetworkError =
        !e.message?.includes("Already exists") &&
        (e.message?.toLowerCase()?.includes("network") ||
         e.message?.toLowerCase()?.includes("fetch") ||
         e.message?.toLowerCase()?.includes("timeout") ||
         e.message?.toLowerCase()?.includes("failed") ||
         e.cause?.code === "ECONNABORTED");

      if (isNetworkError && !isEditing) {
        try {
          await refreshProducts();
          // Check if the product now exists in the refreshed list
          const savedName = name.trim().toLowerCase();
          const found = allProducts.find(
            (p) => p.name.trim().toLowerCase() === savedName
          );
          if (found) {
            // Product was actually saved — show success
            Alert.alert("Success", "Product saved successfully");
            onClose(true);
            return;
          }
        } catch {
          // Refresh also failed — show original error
        }
      }
      Alert.alert("Error", e.message || "Error saving the product");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (fieldKey: string) => [
    s.input,
    focusedField === fieldKey && s.inputFocused,
    errorFields.has(fieldKey) && s.inputError,
  ];

  // Get selected unit for the unit picker
  const getSelectedUnit = (): string => {
    if (!unitPickerTarget) return "";
    if (unitPickerTarget.type === "ingredient") {
      return baseIngredients[unitPickerTarget.index]?.unit ?? "";
    }
    if (unitPickerTarget.type === "spice") {
      return spices[unitPickerTarget.index]?.unit ?? "";
    }
    if (unitPickerTarget.type === "category" && unitPickerTarget.catIndex !== undefined) {
      return categories[unitPickerTarget.catIndex]?.items[unitPickerTarget.index]?.unit ?? "";
    }
    return "";
  };

  const handleUnitSelect = (unit: string) => {
    if (!unitPickerTarget) return;
    const { type: uType, index: uIndex, catIndex: uCatIndex } = unitPickerTarget;
    if (uType === "ingredient") {
      updateIngredient(uIndex, "unit", unit);
    } else if (uType === "spice") {
      updateSpice(uIndex, "unit", unit);
    } else if (uType === "category" && uCatIndex !== undefined) {
      updateCategoryItem(uCatIndex, uIndex, "unit", unit);
    }
    // Clear unit error field when a unit is selected
    const prefix = uType === "ingredient" ? "ing" : uType === "spice" ? "sp" : `cat-${uCatIndex}`;
    const unitFieldKey = `${prefix}-unit-${uIndex}`;
    if (errorFields.has(unitFieldKey)) {
      setErrorFields((prev) => { const next = new Set(prev); next.delete(unitFieldKey); return next; });
    }
  };

  // ── Render ingredient-like row (reused for base, spices, categories) ──
  const renderItemRow = (
    item: { id: string; name: string; quantity: number; unit: string; price: number },
    index: number,
    type: "ingredient" | "spice" | "category",
    catIndex?: number,
    updateFn?: (idx: number, field: string, value: string | number) => void,
    removeFn?: (idx: number) => void,
  ) => {
    const qtyKey = type === "ingredient"
      ? `ing-${item.id}`
      : type === "spice"
        ? `sp-${item.id}`
        : `cat-${categories[catIndex!]?.categoryId}-${item.id}`;
    const priceKey = qtyKey; // same key scheme for price tracking
    const fieldPrefix = type === "ingredient"
      ? `ing`
      : type === "spice"
        ? `sp`
        : `cat-${catIndex}`;

    return (
      <View key={item.id} style={s.ingredientRow}>
        <TouchableOpacity
          onPress={() => removeFn?.(index)}
          style={s.removeBtn}
          activeOpacity={0.7}
        >
          <MaterialIcons name="delete-outline" size={18} color={DS_COLORS.error} />
        </TouchableOpacity>
        <View style={s.ingredientFieldsWrap}>
          <View style={s.ingredientFields}>
            <TextInput
              style={[inputStyle(`${fieldPrefix}-name-${index}`), { flex: 3 }]}
              value={item.name}
              onChangeText={(v) => {
                updateFn?.(index, "name", v);
                setIsDirty(true);
                if (errorFields.has(`${fieldPrefix}-name-${index}`)) {
                  setErrorFields((prev) => { const next = new Set(prev); next.delete(`${fieldPrefix}-name-${index}`); return next; });
                }
              }}
              placeholder="Name"
              placeholderTextColor={DS_COLORS.textSecondary}
              textAlign="left"
              returnKeyType="done"
              onFocus={() => setFocusedField(`${fieldPrefix}-name-${index}`)}
              onBlur={() => setFocusedField(null)}
            />
            <TextInput
              style={[inputStyle(`${fieldPrefix}-qty-${index}`), { flex: 2 }]}
              value={qtyKey in qtyTexts ? qtyTexts[qtyKey] : (item.quantity != null ? String(item.quantity) : "")}
              onChangeText={(v) => {
                const sanitized = sanitizeQuantity(v);
                setQtyTexts((prev) => ({ ...prev, [qtyKey]: sanitized }));
                const num = parseFloat(sanitized) || 0;
                updateFn?.(index, "quantity", num);
                setIsDirty(true);
                if (errorFields.has(`${fieldPrefix}-qty-${index}`)) {
                  setErrorFields((prev) => { const next = new Set(prev); next.delete(`${fieldPrefix}-qty-${index}`); return next; });
                }
              }}
              placeholder="Quantity"
              placeholderTextColor={DS_COLORS.textSecondary}
              keyboardType="decimal-pad"
              textAlign="center"
              returnKeyType="done"
              selectTextOnFocus
              onFocus={() => setFocusedField(`${fieldPrefix}-qty-${index}`)}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={[
                s.unitSelector,
                focusedField === `${fieldPrefix}-unit-${index}` && s.inputFocused,
                errorFields.has(`${fieldPrefix}-unit-${index}`) && s.inputError,
              ]}
              onPress={() =>
                setUnitPickerTarget({ type, index, catIndex })
              }
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.unitSelectorText,
                  !item.unit && { color: DS_COLORS.textSecondary },
                ]}
                numberOfLines={1}
              >
                {item.unit ? getUnitLabel(item.unit, item.quantity, units) : "Unit"}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={18} color={DS_COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <Pressable style={[s.priceRow, errorFields.has(`${fieldPrefix}-price-${index}`) && { borderColor: DS_COLORS.error, borderWidth: 2, backgroundColor: 'rgba(239,68,68,0.04)' }]} onPress={() => priceInputRefs.current[`${fieldPrefix}-${index}`]?.focus()}>
            <TextInput
              ref={(r) => { if (r) priceInputRefs.current[`${fieldPrefix}-${index}`] = r; }}
              style={[inputStyle(`${fieldPrefix}-price-${index}`), s.priceInput]}
              value={priceKey in priceTexts ? priceTexts[priceKey] : (item.price != null ? String(item.price) : "")}
              onChangeText={(v) => {
                const sanitized = sanitizeQuantity(v);
                setPriceTexts((prev) => ({ ...prev, [priceKey]: sanitized }));
                const num = parseFloat(sanitized) || 0;
                updateFn?.(index, "price", num);
                setIsDirty(true);
                if (errorFields.has(`${fieldPrefix}-price-${index}`)) {
                  setErrorFields((prev) => { const next = new Set(prev); next.delete(`${fieldPrefix}-price-${index}`); return next; });
                }
              }}
              placeholder="Price"
              placeholderTextColor={DS_COLORS.textSecondary}
              keyboardType="decimal-pad"
              textAlign="center"
              returnKeyType="done"
              selectTextOnFocus
              onFocus={() => setFocusedField(`${fieldPrefix}-price-${index}`)}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={s.priceSuffix}>$</Text>
            {(item.quantity > 0 && item.unit) ? (
              <Text style={s.priceSuffix}>for {item.quantity} {getUnitLabel(item.unit, item.quantity, units)}</Text>
            ) : null}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleClose} style={s.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {isEditing ? "Edit product" : "New product"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Sticky: 3-Tab Price Display (same as product detail view) */}
        <View style={s.prodTabContainer}>
          <View style={s.prodTabRow}>
            <TouchableOpacity
              onPress={() => setActiveTab("customer")}
              style={[s.prodTabBtn, activeTab === "customer" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "customer" && s.prodTabBtnTextActive]}>Customer price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("cost")}
              style={[s.prodTabBtn, activeTab === "cost" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "cost" && s.prodTabBtnTextActive]}>Price Cost</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("profit")}
              style={[s.prodTabBtn, activeTab === "profit" && s.prodTabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.prodTabBtnText, activeTab === "profit" && s.prodTabBtnTextActive]}>Our profit</Text>
            </TouchableOpacity>
          </View>

          <View style={s.prodTabContentRow}>
            <View style={s.prodTabContentCell}>
              {activeTab === "customer" && (
                <View style={s.formTabPriceInputWrap}>
                  <Text style={s.formTabPriceCurrency}>$</Text>
                  <TextInput
                    style={[
                      s.formTabPriceInput,
                      errorFields.has("customerPrice") && s.inputError,
                    ]}
                    value={customerPriceText}
                    onChangeText={(v) => {
                      const sanitized = sanitizeQuantity(v);
                      setCustomerPriceText(sanitized);
                      setCustomerPrice(parseFloat(sanitized) || 0);
                      setIsDirty(true);
                      if (errorFields.has("customerPrice")) {
                        setErrorFields((prev) => { const next = new Set(prev); next.delete("customerPrice"); return next; });
                      }
                    }}
                    placeholder="0"
                    placeholderTextColor={DS_COLORS.textSecondary}
                    keyboardType="decimal-pad"
                    textAlign="center"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                </View>
              )}
            </View>
            <View style={s.prodTabContentCell}>
              {activeTab === "cost" && (
                <Text style={s.prodTabValueAmount}>${formatPrice(finalCost)}</Text>
              )}
            </View>
            <View style={s.prodTabContentCell}>
              {activeTab === "profit" && (
                <Text style={[
                  s.prodTabValueAmount,
                  formProfit < 0 && { color: DS_COLORS.error },
                ]}>${formatPrice(formProfit)}</Text>
              )}
            </View>
          </View>
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

            {/* Product Name */}
            <View style={s.formCard}>
              <Text style={s.formLabel}>Name Product</Text>
              <TextInput
                style={inputStyle("name")}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setIsDirty(true);
                  if (errorFields.has("name")) {
                    setErrorFields((prev) => { const next = new Set(prev); next.delete("name"); return next; });
                  }
                }}
                placeholder="Enter product name"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="left"
                returnKeyType="done"
                onFocus={() => setFocusedField("name")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Markup */}
            <View style={s.formCard}>
              <Text style={s.formLabel}>Price markup (on cost price)</Text>
              <View style={s.markupRow}>
                <View style={s.markupToggle}>
                  <TouchableOpacity
                    onPress={() => setMarkupType("percent")}
                    style={[
                      s.markupToggleBtn,
                      markupType === "percent" && s.markupToggleBtnActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        s.markupToggleBtnText,
                        markupType === "percent" && s.markupToggleBtnTextActive,
                      ]}
                    >
                      %
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMarkupType("fixed")}
                    style={[
                      s.markupToggleBtn,
                      markupType === "fixed" && s.markupToggleBtnActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        s.markupToggleBtnText,
                        markupType === "fixed" && s.markupToggleBtnTextActive,
                      ]}
                    >
                      $
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[inputStyle("markup"), s.markupInput]}
                  value={markupValue}
                   onChangeText={(v) => { setMarkupValue(sanitizeQuantity(v)); setIsDirty(true); }}
                  keyboardType="decimal-pad"
                  textAlign="center"
                  placeholder={markupType === "percent" ? "Percent" : "Amount"}
                  placeholderTextColor={DS_COLORS.textSecondary}
                  returnKeyType="done"
                  selectTextOnFocus
                  onFocus={() => setFocusedField("markup")}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <Text style={s.markupHint}>
                {markupType === "percent"
                  ? "The markup will be calculated as a percentage of the cost price"
                  : "The markup will be added as a fixed amount to the cost price"}
              </Text>
            </View>

            {/* Base Ingredients */}
            {!!baseLabel && (
            <View style={s.formCard}>
              <View style={s.formCardHeader}>
                <Text style={s.formLabel}>{baseLabel}</Text>
                <TouchableOpacity onPress={addIngredient} style={s.addSmallBtn} activeOpacity={0.8}>
                  <MaterialIcons name="add" size={16} color={DS_COLORS.accent} />
                  <Text style={s.addSmallBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {baseIngredients.length === 0 && (
                <Text style={s.hint}>To add an item, tap "Add"</Text>
              )}
              {baseIngredients.map((ingredient, index) =>
                renderItemRow(
                  ingredient,
                  index,
                  "ingredient",
                  undefined,
                  (idx, field, value) => updateIngredient(idx, field as keyof BaseIngredient, value),
                  removeIngredient,
                )
              )}
            </View>
            )}

            {/* Spices (now with full fields) */}
            {!!spiceLabel && (
            <View style={s.formCard}>
              <View style={s.formCardHeader}>
                <Text style={s.formLabel}>{spiceLabel}</Text>
                <TouchableOpacity onPress={addSpice} style={s.addSmallBtn} activeOpacity={0.8}>
                  <MaterialIcons name="add" size={16} color={DS_COLORS.accent} />
                  <Text style={s.addSmallBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {spices.length === 0 && (
                <Text style={s.hint}>To add an item, tap "Add"</Text>
              )}
              {spices.map((spice, index) =>
                renderItemRow(
                  spice,
                  index,
                  "spice",
                  undefined,
                  (idx, field, value) => updateSpice(idx, field as keyof Spice, value),
                  removeSpice,
                )
              )}
            </View>
            )}

            {/* Dynamic Categories */}
            {categories.map((cat, catIndex) => (
              <View key={cat.categoryId} style={s.formCard}>
                <View style={s.formCardHeader}>
                  <Text style={s.formLabel}>{cat.categoryName}</Text>
                  <TouchableOpacity
                    onPress={() => addCategoryItem(catIndex)}
                    style={s.addSmallBtn}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="add" size={16} color={DS_COLORS.accent} />
                    <Text style={s.addSmallBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {cat.items.length === 0 && (
                  <Text style={s.hint}>To add an item, tap "Add"</Text>
                )}
                {cat.items.map((item, itemIndex) =>
                  renderItemRow(
                    item,
                    itemIndex,
                    "category",
                    catIndex,
                    (idx, field, value) => updateCategoryItem(catIndex, idx, field as keyof CategoryItem, value),
                    (idx) => removeCategoryItem(catIndex, idx),
                  )
                )}
              </View>
            ))}

            {/* Add Category Button */}
            <TouchableOpacity
              onPress={() => setShowCategoryModal(true)}
              style={s.addCategoryBtn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="edit" size={20} color={DS_COLORS.accent} />
              <Text style={s.addCategoryBtnText}>Add / Delete / Rename categories</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky Save Button */}
        <View style={[s.stickyBottomBar, { paddingBottom: Math.max(DS_SPACING.xxl, insets.bottom + DS_SPACING.md) }]}>
          <TouchableOpacity
            onPress={handleSave}
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unit Picker Modal */}
      <UnitPickerModal
        visible={unitPickerTarget !== null}
        units={units}
        selectedUnit={getSelectedUnit()}
        onSelect={handleUnitSelect}
        onClose={() => setUnitPickerTarget(null)}
        onAddUnit={addUnit}
      />

      {/* Category Management Modal */}
      <CategoryManageModal
        visible={showCategoryModal}
        allCategories={[
          ...(baseLabel ? [{ id: "__base__", name: baseLabel, isBuiltIn: true }] : []),
          ...(spiceLabel ? [{ id: "__spice__", name: spiceLabel, isBuiltIn: true }] : []),
          ...customCategories.map((cc) => ({ id: cc.id, name: cc.name, isBuiltIn: false })),
        ]}
        onAdd={async (name) => {
          const allowed = await guardMutation();
          if (!allowed) return;
          const created = await addCustomCategory(name);
          // Auto-add to current form using the server-assigned ID
          const newCat: ProductCategory = {
            categoryId: created.id,
            categoryName: created.name,
            items: [] };
          // Only add if not already present (syncCategories may have added it)
          setCategories((prev) => {
            if (prev.some((c) => c.categoryId === created.id)) return prev;
            return [...prev, newCat];
          });
        }}
        onRename={async (id, newName) => {
          if (id === "__base__") {
            setBaseLabel(newName);
            setIsDirty(true);
          } else if (id === "__spice__") {
            setSpiceLabel(newName);
            setIsDirty(true);
          } else {
            const allowed = await guardMutation();
            if (!allowed) return;
            await renameCustomCategory(id, newName);
            // Update form categories name
            setCategories((prev) =>
              prev.map((c) => c.categoryId === id ? { ...c, categoryName: newName } : c)
            );
            setIsDirty(true);
          }
        }}
        onDelete={async (id) => {
          if (id === "__base__") {
            // Remove base ingredients section from form
            setBaseIngredients([]);
            setBaseLabel("");
            setIsDirty(true);
          } else if (id === "__spice__") {
            // Remove spices section from form
            setSpices([]);
            setSpiceLabel("");
            setIsDirty(true);
          } else {
            const allowed = await guardMutation();
            if (!allowed) return;
            try {
              await deleteCustomCategory(id);
            } catch (e: any) {
              Alert.alert("Error", e.message);
              return;
            }
            // Remove from form
            setCategories((prev) => prev.filter((c) => c.categoryId !== id));
            setIsDirty(true);
          }
        }}
        onClose={() => setShowCategoryModal(false)}
      />

    </ScreenContainer>
  );
}

// ============ Styles ============
function _make_s() { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.background,
    writingDirection: "rtl",
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.accentLight,
  },
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.accent,
    ...DS_SHADOW.button,
  },
  editHeaderBtn: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  editHeaderBtnText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
  },

  // ── Empty State ──
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
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
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

  // ── Product List ──
  listContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.md,
  },
  productCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    ...DS_SHADOW.card,
  },
  productCardInner: {
    flexDirection: "row",
    writingDirection: "rtl",
    alignItems: "center",
    gap: DS_SPACING.md,
  },
  productIconWrap: {
    width: 44,
    height: 44,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  productName: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  productMeta: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
  },
  productActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },

  // ── Product Detail View ──
  detailContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  detailCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.md,
    writingDirection: "rtl",
    ...DS_SHADOW.card,
  },
  detailCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    paddingBottom: DS_SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  detailCardTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.sm,
    writingDirection: "rtl" as const,
    borderBottomWidth: 0.5,
    borderBottomColor: DS_COLORS.border,
  },
  detailItemName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
  },
  detailItemQty: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.medium,
  },
  detailItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.md,
  },
  detailItemPrice: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold,
  },
  detailEmpty: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    paddingVertical: DS_SPACING.md,
  },

  // ── Form ──
  formContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  formCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.md,
    writingDirection: "rtl",
    ...DS_SHADOW.card,
  },
  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formLabel: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  hint: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
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
    backgroundColor: "rgba(239,68,68,0.04)",
  },
  addSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
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
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  ingredientFieldsWrap: {
    flex: 1,
    gap: 6,
  },
  ingredientFields: {
    flex: 1,
    flexDirection: "row",
    gap: DS_SPACING.sm,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.inputBg,
  },
  priceInput: {
    fontSize: DS_FONT.bodySmall,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 40,
    textAlign: "center" as any,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  priceSuffix: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.medium as any,
  },
  priceUnitLabel: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },

  // ── Unit Selector ──
  unitSelector: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.sm,
    paddingVertical: DS_SPACING.md + 2,
    gap: 2,
  },
  unitSelectorText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
  },

  // ── Sync Categories Button ──
  addCategoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    writingDirection: "rtl" as const,
  },
  addCategoryBtnText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
  },

  // ── Sticky Bottom Bar ──
  stickyBottomBar: {
    paddingHorizontal: DS_SPACING.xl,
    paddingTop: DS_SPACING.md,
    paddingBottom: DS_SPACING.xxl,
    backgroundColor: DS_COLORS.background,
    borderTopWidth: 1,
    borderTopColor: DS_COLORS.border,
  },

  // ── Save Button ──
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

  // ── Category Row ──
  catRow: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: DS_SPACING.md,
    paddingVertical: DS_SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  catRowText: {
    flex: 1,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
  },
  catRowInput: {
    flex: 1,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    borderBottomWidth: 1.5,
    borderBottomColor: DS_COLORS.accent,
    paddingVertical: DS_SPACING.xs,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(30,30,46,0.4)",
    justifyContent: "flex-end",
  },
  unitModalContent: {
    backgroundColor: DS_COLORS.card,
    borderTopLeftRadius: DS_RADIUS.xl,
    borderTopRightRadius: DS_RADIUS.xl,
    maxHeight: "70%",
    writingDirection: "rtl",
    paddingBottom: DS_SPACING.xl,
  },
  unitModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: DS_SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  unitModalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  unitOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: DS_SPACING.md + 2,
    paddingHorizontal: DS_SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.sm,
  },
  unitOptionSelected: {
    backgroundColor: DS_COLORS.accentLight,
  },
  unitOptionText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
  },
  unitOptionTextSelected: {
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold,
  },
  addUnitSection: {
    padding: DS_SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: DS_COLORS.border,
  },
  addUnitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  addUnitInput: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  addUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
  },
  addUnitBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
  },
  costSummaryCard: {
    backgroundColor: DS_COLORS.accentLight,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costLabel: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
  },
  costValue: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.accent,
  },
  costDivider: {
    height: 1,
    backgroundColor: DS_COLORS.accent,
    opacity: 0.3,
    marginVertical: DS_SPACING.sm,
  },
  costLabelProfit: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  costValueProfit: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.accent,
  },
  costValueSecondary: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textSecondary,
  },
  costLabelFinal: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  costValueFinal: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.accent,
  },
  markupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  markupToggle: {
    flexDirection: "row",
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    overflow: "hidden",
  },
  markupToggleBtn: {
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm + 2,
    backgroundColor: DS_COLORS.card,
  },
  markupToggleBtnActive: {
    backgroundColor: DS_COLORS.accent,
  },
  markupToggleBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textSecondary,
  },
  markupToggleBtnTextActive: {
    color: DS_COLORS.white,
  },
  markupInput: {
    flex: 1,
  },
  markupHint: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
    marginTop: DS_SPACING.xs,
  },

  // ── Product Detail 3-Tab Price Display ──
  prodTabContainer: {
    marginHorizontal: DS_SPACING.lg,
    marginTop: DS_SPACING.xs,
    borderRadius: DS_RADIUS.lg,
    backgroundColor: DS_COLORS.card,
    ...DS_SHADOW.card,
    overflow: "hidden" as const,
  },
  prodTabRow: {
    flexDirection: "row" as const,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
    writingDirection: "rtl" as const,
  },
  prodTabBtn: {
    flex: 1,
    paddingVertical: DS_SPACING.sm + 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: DS_COLORS.inputBg,
  },
  prodTabBtnActive: {
    backgroundColor: DS_COLORS.accent,
  },
  prodTabBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textSecondary,
  },
  prodTabBtnTextActive: {
    color: DS_COLORS.white,
  },
  prodTabContent: {
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
  },
  prodTabContentRow: {
    flexDirection: "row" as const,
    writingDirection: "rtl" as const,
  },
  prodTabContentCell: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: DS_SPACING.md,
  },
  prodTabValueRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-start" as const,
    writingDirection: "rtl" as const,
    gap: DS_SPACING.sm,
  },
  prodTabValueLabel: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium as any,
    color: DS_COLORS.textPrimary,
  },
  prodTabValueAmount: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.accent,
  },
  formTabPriceInputWrap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: DS_COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    minHeight: 48,
  },
  formTabPriceCurrency: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.accent,
  },
  formTabPriceInput: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.accent,
    minWidth: 60,
    textAlign: "center" as any,
    paddingVertical: 4,
    paddingHorizontal: 0,
    minHeight: 44,
    textAlignVertical: "center" as any,
    includeFontPadding: false,
  },
}); }
