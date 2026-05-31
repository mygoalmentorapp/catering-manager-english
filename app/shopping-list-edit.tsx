import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  BackHandler,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import { generateShoppingListRows } from "@/lib/order-logic";
import { generateId } from "@/lib/uuid";
import type { ShoppingListIngredientRow, SavedShoppingList, UnitDef } from "@/lib/types";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
// useEditGuard removed — offline editing is seamless now
// OfflineInfoBanner removed — smooth UX, toast on save only
import { useThemeContext } from "@/lib/theme-provider";

// ============ Smart decimal formatting ============
function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(1);
  if (fixed.endsWith(".0")) return String(Math.round(value));
  return fixed;
}

// ============ Unit Picker Modal (same as products.tsx) ============
function UnitPickerModal({
  visible,
  units,
  selectedUnit,
  onSelect,
  onClose,
  onAddUnit,
  onDeleteUnit,
}: {
  visible: boolean;
  units: UnitDef[];
  selectedUnit: string;
  onSelect: (unit: string) => void;
  onClose: () => void;
  onAddUnit: (unit: UnitDef) => Promise<void>;
  onDeleteUnit: (singular: string) => Promise<void>;
}) {
  const { colorScheme } = useThemeContext();
  const es = React.useMemo(() => _make_es(), [DS_COLORS.accent, colorScheme]);
  const ms = React.useMemo(() => _make_ms(), [DS_COLORS.accent, colorScheme]);

  const DEFAULT_UNIT_SINGULARS = ["קילו", "גרם", "ליטר", 'מ"ל', "יחידה", "כוס", "כף", "קופסא"];

  const [newSingular, setNewSingular] = useState("");
  const [newPlural, setNewPlural] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddUnit = async () => {
    if (!newSingular.trim()) return;
    if (!newPlural.trim()) {
      Alert.alert("שגיאה", "יש למלא גם צורת רבים");
      return;
    }
    // Check for duplicates client-side
    const exists = units.some(
      (u) => u.singular.trim() === newSingular.trim()
    );
    if (exists) {
      Alert.alert("שגיאה", "יחידת מידה זו כבר קיימת");
      return;
    }
    setAdding(true);
    try {
      await onAddUnit({ singular: newSingular.trim(), plural: newPlural.trim() });
      onSelect(newSingular.trim());
      setNewSingular("");
      setNewPlural("");
    } catch (e: any) {
      Alert.alert("שגיאה", e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUnit = (unitDef: UnitDef) => {
    Alert.alert(
      "מחיקת יחידת מידה",
      `האם למחוק את "${unitDef.singular}/${unitDef.plural}"?`,
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "מחיקה",
          style: "destructive",
          onPress: () => onDeleteUnit(unitDef.singular),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={ms.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={ms.unitModalContent}>
          <View style={ms.unitModalHeader}>
            <View style={{ width: 40 }} />
            <Text style={ms.unitModalTitle}>בחירת יחידת מידה</Text>
            <TouchableOpacity onPress={onClose} style={es.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ padding: DS_SPACING.lg }}>
            {units.map((unitDef) => {
              const isDefault = DEFAULT_UNIT_SINGULARS.includes(unitDef.singular);
              return (
                <View key={unitDef.singular} style={[ms.unitOption, selectedUnit === unitDef.singular && ms.unitOptionSelected, { flexDirection: "row", direction: "rtl", alignItems: "center" }]}>
                  <TouchableOpacity
                    onPress={() => { onSelect(unitDef.singular); onClose(); }}
                    style={{ flex: 1 }}
                    activeOpacity={0.7}
                  >
                    <Text style={[ms.unitOptionText, selectedUnit === unitDef.singular && ms.unitOptionTextSelected]}>
                      {unitDef.singular}/{unitDef.plural}
                    </Text>
                  </TouchableOpacity>
                  {selectedUnit === unitDef.singular && (
                    <MaterialIcons name="check" size={20} color={DS_COLORS.accent} />
                  )}
                  {!isDefault && (
                    <TouchableOpacity
                      onPress={() => handleDeleteUnit(unitDef)}
                      style={ms.removeBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={DS_COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={ms.addUnitSection}>
            <View style={ms.addUnitRow}>
              <TextInput
                style={[ms.addUnitInput, { flex: 1 }]}
                value={newSingular}
                onChangeText={setNewSingular}
                placeholder="יחיד (למשל: קילו)"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="right"
                returnKeyType="next"
              />
              <TextInput
                style={[ms.addUnitInput, { flex: 1 }]}
                value={newPlural}
                onChangeText={setNewPlural}
                placeholder="רבים (למשל: קילו)"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleAddUnit}
              />
            </View>
            <TouchableOpacity
              onPress={handleAddUnit}
              style={[ms.addUnitBtn, (!newSingular.trim() || adding) && { opacity: 0.5 }]}
              activeOpacity={0.8}
              disabled={!newSingular.trim() || adding}
            >
              <MaterialIcons name="add" size={18} color={DS_COLORS.white} />
              <Text style={ms.addUnitBtnText}>הוסף</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ============ Editable Row Component ============
function getDisplayUnit(unit: string, qty: number, units: UnitDef[]): string {
  if (!unit.trim()) return unit;
  const def = units.find((u) => u.singular === unit || u.plural === unit);
  if (!def) return unit;
  return qty > 1 ? def.plural : def.singular;
}

function EditableRow({
  row,
  onUpdate,
  onDelete,
  isLast,
  showErrors,
  isManual,
  onOpenUnitPicker,
  units,
}: {
  row: ShoppingListIngredientRow & { _localId: string };
  onUpdate: (localId: string, field: string, value: string | number) => void;
  onDelete?: (localId: string) => void;
  isLast: boolean;
  showErrors: boolean;
  isManual?: boolean;
  onOpenUnitPicker?: (localId: string) => void;
  units: UnitDef[];
}) {
  const { colorScheme } = useThemeContext();
  const es = React.useMemo(() => _make_es(), [DS_COLORS.accent, colorScheme]);

  const [qtyText, setQtyText] = useState(row.finalQty >= 0 ? formatQty(row.finalQty) : "");

  useEffect(() => {
    setQtyText(row.finalQty >= 0 ? formatQty(row.finalQty) : "");
  }, [row.finalQty]);

  const handleQtyChange = (text: string) => {
    const sanitized = text.replace(/[^0-9.]/g, "");
    const parts = sanitized.split(".");
    let final = parts[0];
    if (parts.length > 1) {
      final += "." + parts[1].slice(0, 1);
    }
    setQtyText(final);
    const num = parseFloat(final);
    if (!isNaN(num)) {
      onUpdate(row._localId, "finalQty", Math.round(num * 10) / 10);
    } else if (final === "" || final === ".") {
      onUpdate(row._localId, "finalQty", 0);
    }
  };

  const nameEmpty = showErrors && row.name.trim() === "";
  const qtyEmpty = showErrors && row.finalQty < 0;
  const unitEmpty = showErrors && row.unit.trim() === "";

  return (
    <View style={[es.row, !isLast && es.rowBorder]}>
      {isManual && onDelete && (
        <TouchableOpacity
          onPress={() => onDelete(row._localId)}
          style={es.deleteBtn}
          activeOpacity={0.7}
        >
          <MaterialIcons name="close" size={16} color={DS_COLORS.error} />
        </TouchableOpacity>
      )}

      <View style={es.nameField}>
        {isManual ? (
          <TextInput
            style={[es.nameInput, nameEmpty && es.inputError]}
            value={row.name}
            onChangeText={(text) => onUpdate(row._localId, "name", text)}
            placeholder="שם פריט"
            placeholderTextColor={nameEmpty ? DS_COLORS.error : DS_COLORS.textSecondary}
            textAlign="right"
          />
        ) : (
          <Text style={es.nameDisplay} numberOfLines={1}>
            {row.name || "—"}
          </Text>
        )}
      </View>

      <View style={es.qtyField}>
        <TextInput
          style={[es.qtyInput, qtyEmpty && es.inputError]}
          value={qtyText}
          onChangeText={handleQtyChange}
          placeholder="כמות"
          placeholderTextColor={qtyEmpty ? DS_COLORS.error : DS_COLORS.textSecondary}
          keyboardType="decimal-pad"
          textAlign="center"
          selectTextOnFocus
        />
      </View>

      <View style={es.unitField}>
        {isManual && onOpenUnitPicker ? (
          <TouchableOpacity
            onPress={() => onOpenUnitPicker(row._localId)}
            style={[es.unitButton, unitEmpty && es.inputError]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                es.unitButtonText,
                !row.unit.trim() && { color: unitEmpty ? DS_COLORS.error : DS_COLORS.textSecondary },
              ]}
              numberOfLines={1}
            >
              {row.unit.trim() ? getDisplayUnit(row.unit, row.finalQty, units) : "יחידה"}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={16} color={DS_COLORS.textSecondary} />
          </TouchableOpacity>
        ) : (
          <Text style={es.unitDisplay} numberOfLines={1}>
            {row.unit ? getDisplayUnit(row.unit, row.finalQty, units) : "—"}
          </Text>
        )}
      </View>
    </View>
  );
}

type EditableRow_ = ShoppingListIngredientRow & { _localId: string };

function toEditable(rows: ShoppingListIngredientRow[]): EditableRow_[] {
  return rows.map((r) => ({ ...r, _localId: generateId() }));
}

function fromEditable(rows: EditableRow_[]): ShoppingListIngredientRow[] {
  return rows.map(({ _localId, ...rest }) => rest);
}

// ============ Main Edit Screen ============
export default function ShoppingListEditScreen() {
  const { colorScheme } = useThemeContext();
  const es = React.useMemo(() => _make_es(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const params = useLocalSearchParams<{ ids?: string; listId?: string }>();
  const {
    orders,
    products,
    savedShoppingLists,
    addSavedShoppingList,
    updateSavedShoppingList,
    refreshShoppingLists,
    units,
    addUnit,
    deleteUnit,
  } = useData();
  const { guardMutation } = useMutationGuard();


  // Unit picker state
  const [unitPickerTarget, setUnitPickerTarget] = useState<string | null>(null);

  const existingList = useMemo(() => {
    if (params.listId) {
      return savedShoppingLists.find((l) => l.id === params.listId) || null;
    }
    return null;
  }, [params.listId, savedShoppingLists]);

  const { initialRows, orderIds, orderNames } = useMemo(() => {
    if (existingList) {
      return {
        initialRows: existingList.rows,
        orderIds: existingList.orderIds,
        orderNames: existingList.orderNames,
      };
    }

    // New list from selected order IDs
    const idSet = new Set((params.ids ?? "").split(",").filter(Boolean));
    const selectedOrders = orders.filter((o) => idSet.has(o.id));
    const rows = generateShoppingListRows(selectedOrders);
    return {
      initialRows: rows,
      orderIds: selectedOrders.map((o) => o.id),
      orderNames: selectedOrders.map((o) => o.customerName),
    };
  }, [existingList, params.ids, orders, products]);

  const [originalRows] = useState<ShoppingListIngredientRow[]>(initialRows);
  const [editableRows, setEditableRows] = useState<EditableRow_[]>(toEditable(initialRows));
  const [isDirty, setIsDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Calculate diff between original totalQty and current finalQty
  const diffs = useMemo(() => {
    const result: { name: string; unit: string; diff: number }[] = [];
    const origMap = new Map<string, number>();
    for (const r of originalRows) {
      const key = `${r.name}|${r.unit}`;
      origMap.set(key, (origMap.get(key) || 0) + r.totalQty);
    }
    const editMap = new Map<string, number>();
    for (const r of editableRows) {
      const key = `${r.name}|${r.unit}`;
      editMap.set(key, (editMap.get(key) || 0) + r.finalQty);
    }
    const allKeys = new Set([...origMap.keys(), ...editMap.keys()]);
    for (const key of allKeys) {
      const origQty = origMap.get(key) || 0;
      const editQty = editMap.get(key) || 0;
      const d = Math.round((editQty - origQty) * 10) / 10;
      if (d !== 0) {
        const [name, unit] = key.split("|");
        result.push({ name, unit, diff: d });
      }
    }
    return result;
  }, [originalRows, editableRows]);

  const handleUpdateRow = useCallback(
    (localId: string, field: string, value: string | number) => {
      setEditableRows((prev) =>
        prev.map((r) => {
          if (r._localId !== localId) return r;
          const updated = { ...r, [field]: value };
          // If finalQty changed, recalculate manualDelta
          if (field === "finalQty") {
            updated.manualDelta = (value as number) - updated.totalQty;
          }
          return updated;
        })
      );
      setIsDirty(true);
    },
    []
  );

  const handleDeleteRow = useCallback((localId: string) => {
    setEditableRows((prev) => prev.filter((r) => r._localId !== localId));
    setIsDirty(true);
  }, []);

  const handleAddRow = useCallback(() => {
    const newRow: EditableRow_ = {
      _localId: generateId(),
      ingredientId: generateId(),
      name: "",
      unit: "",
      category: "manual",
      totalQty: 0,
      sourceBreakdown: {},
      manualDelta: 0,
      finalQty: 0,
    };
    setEditableRows((prev) => [...prev, newRow]);
    setIsDirty(true);
  }, []);

  const handleReset = useCallback(() => {
    Alert.alert("איפוס רשימה", "לחזור לרשימה המקורית? כל השינויים הידניים יימחקו.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "איפוס",
        style: "destructive",
        onPress: () => {
          // Reset all rows: clear manualDelta and set finalQty back to totalQty.
          // Also remove any manually-added rows (category === "manual" with totalQty === 0).
          const resetRows = originalRows
            .filter((r) => r.category !== "manual" || r.totalQty > 0)
            .map((r) => ({
              ...r,
              manualDelta: 0,
              finalQty: r.totalQty,
            }));
          setEditableRows(toEditable(resetRows));
          setIsDirty(false);
          setShowErrors(false);
        },
      },
    ]);
  }, [originalRows]);

  const handleUnitSelect = useCallback(
    (unit: string) => {
      if (unitPickerTarget) {
        handleUpdateRow(unitPickerTarget, "unit", unit);
      }
      setUnitPickerTarget(null);
    },
    [unitPickerTarget, handleUpdateRow]
  );

  const getSelectedUnit = useCallback(() => {
    if (!unitPickerTarget) return "";
    const row = editableRows.find((r) => r._localId === unitPickerTarget);
    return row?.unit || "";
  }, [unitPickerTarget, editableRows]);

  const handleSave = useCallback(async () => {
    const allowed = await guardMutation();
    if (!allowed) return;

    const nonEmptyRows = editableRows.filter(
      (r) => r.name.trim() !== "" || r.finalQty > 0 || r.unit.trim() !== ""
    );

    if (nonEmptyRows.length === 0) {
      Alert.alert("שגיאה", "הרשימה ריקה — יש להוסיף לפחות פריט אחד");
      return;
    }

    const invalidRows = nonEmptyRows.filter(
      (r) => r.name.trim() === "" || r.finalQty < 0 || r.unit.trim() === ""
    );

    if (invalidRows.length > 0) {
      setShowErrors(true);
      Alert.alert("שדות חסרים", "יש למלא שם, כמות ויחידה בכל השורות");
      return;
    }

    setSaving(true);
    try {
      let savedId: string;
      const rowsToSave = fromEditable(nonEmptyRows);

      if (existingList) {
        const updated = await updateSavedShoppingList(existingList.id, {
          rows: rowsToSave,
        });
        savedId = updated.id;
      } else {
        const created = await addSavedShoppingList({
          orderIds,
          orderNames,
          rows: rowsToSave,
          status: "valid",
        });
        savedId = created.id;
      }

      setIsDirty(false);
      setShowErrors(false);
      Alert.alert("הצלחה", existingList ? "הרשימה עודכנה בהצלחה" : "הרשימה נשמרה בהצלחה", [
        { text: "אישור", onPress: () => router.replace({ pathname: "/shopping-list-view", params: { listId: savedId } } as any) },
      ]);
    } catch (e: any) {
      // Network errors: server may have saved the list even though response didn't arrive.
      const isNetworkError =
        (e.message?.toLowerCase()?.includes("network") ||
         e.message?.toLowerCase()?.includes("fetch") ||
         e.message?.toLowerCase()?.includes("timeout") ||
         e.message?.toLowerCase()?.includes("failed") ||
         e.cause?.code === "ECONNABORTED");

      if (isNetworkError && !existingList) {
        try {
          await refreshShoppingLists();
          // Check if a new list was created for these order IDs
          const found = savedShoppingLists.find(
            (sl) =>
              sl.status !== "deleted" &&
              orderIds.every((oid) => sl.orderIds.includes(oid))
          );
          if (found) {
            setIsDirty(false);
            setShowErrors(false);
            router.replace({ pathname: "/shopping-list-view", params: { listId: found.id } } as any);
            return;
          }
        } catch {
          // Refresh also failed
        }
      }
      Alert.alert("שגיאה", e.message || "לא ניתן לשמור");
    } finally {
      setSaving(false);
    }
  }, [editableRows, existingList, orderIds, orderNames, addSavedShoppingList, updateSavedShoppingList, refreshShoppingLists, savedShoppingLists, router, guardMutation]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      Alert.alert("שינויים לא נשמרו", "האם לצאת ללא שמירה?", [
        { text: "המשך עריכה", style: "cancel" },
        { text: "צא ללא שמירה", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }, [isDirty, router]);

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
  }, [isDirty, handleClose]);

  const renderRow = useCallback(
    ({ item, index }: { item: EditableRow_; index: number }) => {
      const isManual = item.category === "manual";
      return (
        <EditableRow
          row={item}
          onUpdate={handleUpdateRow}
          onDelete={isManual ? handleDeleteRow : undefined}
          isLast={index === editableRows.length - 1}
          showErrors={showErrors}
          isManual={isManual}
          onOpenUnitPicker={isManual ? (localId: string) => setUnitPickerTarget(localId) : undefined}
          units={units}
        />
      );
    },
    [handleUpdateRow, handleDeleteRow, editableRows.length, showErrors, units]
  );

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 40}
      >
        <View style={es.container}>
          {/* Header */}
          <View style={es.header}>
            <TouchableOpacity onPress={handleReset} style={es.resetBtn} activeOpacity={0.7}>
              <MaterialIcons name="refresh" size={18} color={DS_COLORS.accent} />
              <Text style={es.resetBtnText}>איפוס שינויים</Text>
            </TouchableOpacity>
            <Text style={es.headerTitle}>עריכת רשימת קניות</Text>
            <TouchableOpacity onPress={handleClose} style={es.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>


          {/* Customer name banner */}
          <View style={es.customerBanner}>
            <Text style={es.customerBannerText} numberOfLines={1}>
              {orderNames.join(", ")}
            </Text>
          </View>

          {/* Column headers */}
          <View style={es.columnHeaders}>
            <Text style={[es.colHeaderText, { flex: 2 }]}>שם פריט</Text>
            <Text style={[es.colHeaderText, { flex: 1, textAlign: "center" }]}>כמות</Text>
            <Text style={[es.colHeaderText, { flex: 1, textAlign: "center" }]}>יחידה</Text>
          </View>

          {/* Editable rows */}
          <FlatList
            data={editableRows}
            keyExtractor={(item) => item._localId}
            renderItem={renderRow}
            contentContainerStyle={es.listContent}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              <View>
                <TouchableOpacity
                  onPress={handleAddRow}
                  style={es.addRowBtn}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="add" size={20} color={DS_COLORS.accent} />
                  <Text style={es.addRowBtnText}>הוסף שורה</Text>
                </TouchableOpacity>

                {diffs.length > 0 && (
                  <View style={es.diffSection}>
                    <View style={es.diffDivider} />
                    <Text style={es.diffTitle}>שינויים מהרשימה המקורית</Text>
                    {diffs.map((d, i) => (
                      <View key={`diff-${i}`} style={es.diffRow}>
                        <Text style={es.diffName}>{d.name}</Text>
                        <Text
                          style={[
                            es.diffValue,
                            d.diff > 0
                              ? { color: "#22C55E" }
                              : { color: DS_COLORS.error },
                          ]}
                        >
                          {d.diff > 0 ? "+" : ""}
                          {formatQty(d.diff)} {d.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            }
          />

          {/* Save button */}
          <View style={es.bottomBar}>
            <TouchableOpacity
              onPress={handleSave}
              style={[es.saveBtn, saving && { opacity: 0.6 }]}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={DS_COLORS.white} />
              ) : (
                <MaterialIcons name="save" size={22} color={DS_COLORS.white} />
              )}
              <Text style={es.saveBtnText}>{saving ? "שומר..." : "שמירה"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Unit Picker Modal */}
      <UnitPickerModal
        visible={unitPickerTarget !== null}
        units={units}
        selectedUnit={getSelectedUnit()}
        onSelect={handleUnitSelect}
        onClose={() => setUnitPickerTarget(null)}
        onAddUnit={addUnit}
        onDeleteUnit={deleteUnit}
      />

    </ScreenContainer>
  );
}

function _make_es() { return StyleSheet.create({
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
    direction: "rtl" as const,
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
  resetBtn: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  resetBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
  customerBanner: {
    backgroundColor: "#7C3AED",
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.xl,
    marginBottom: DS_SPACING.sm,
    alignItems: "center",
  },
  customerBannerText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
    color: "#FFFFFF",
  },
  columnHeaders: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.xs,
    gap: DS_SPACING.xs,
  },
  colHeaderText: {
    fontSize: DS_FONT.caption,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: DS_SPACING.lg,
    paddingBottom: DS_SPACING.xl,
  },
  row: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    paddingVertical: DS_SPACING.sm,
    gap: DS_SPACING.xs,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: DS_COLORS.border,
  },
  deleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  nameField: {
    flex: 2,
  },
  nameInput: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    paddingVertical: DS_SPACING.xs + 2,
    paddingHorizontal: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.sm,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  qtyField: {
    flex: 1,
  },
  qtyInput: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    paddingVertical: DS_SPACING.xs + 2,
    paddingHorizontal: DS_SPACING.xs,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.sm,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    textAlign: "center",
  },
  unitField: {
    flex: 1,
  },
  unitButton: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.xs + 2,
    paddingHorizontal: DS_SPACING.xs,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.sm,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    gap: 2,
  },
  unitButtonText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    flexShrink: 1,
  },
  nameDisplay: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    paddingVertical: DS_SPACING.xs + 2,
  },
  unitDisplay: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: DS_SPACING.xs + 2,
  },
  inputError: {
    borderColor: DS_COLORS.error,
    borderWidth: 1.5,
    backgroundColor: "rgba(239,68,68,0.04)",
  },
  addRowBtn: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.xs,
    paddingVertical: DS_SPACING.md,
    marginTop: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
  },
  addRowBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
  diffSection: {
    marginTop: DS_SPACING.xl,
    gap: DS_SPACING.sm,
  },
  diffDivider: {
    height: 2,
    backgroundColor: DS_COLORS.accent,
    opacity: 0.3,
    marginBottom: DS_SPACING.sm,
  },
  diffTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    marginBottom: DS_SPACING.xs,
  },
  diffRow: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: DS_SPACING.xs + 2,
    paddingHorizontal: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.sm,
  },
  diffName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  diffValue: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  bottomBar: {
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.background,
    borderTopWidth: 1,
    borderTopColor: DS_COLORS.border,
  },
  saveBtn: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    gap: DS_SPACING.sm,
    ...DS_SHADOW.button,
  },
  saveBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
  },
}); }

// ============ Unit Picker Modal Styles ============
function _make_ms() { return StyleSheet.create({
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
  },
  unitModalHeader: {
    flexDirection: "row",
    direction: "rtl" as const,
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
    direction: "rtl" as const,
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
    direction: "rtl" as const,
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
    direction: "rtl" as const,
    alignItems: "center",
    gap: 4,
    backgroundColor: DS_COLORS.accent,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    marginTop: DS_SPACING.sm,
  },
  addUnitBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
}); }
