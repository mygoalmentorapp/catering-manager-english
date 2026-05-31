/**
 * Changes Review Screen — Central screen for reviewing product changes in an order.
 *
 * Route params:
 *   orderId: string — the order to review changes for
 *   fromShoppingList?: "1" — if navigated from a shopping list
 *
 * Logic:
 * - Ingredients are split into 2 categories:
 *   1. "ingredientQtyUnit" — qty/unit changes (CRITICAL — causes locking)
 *   2. "ingredientPrice" — price changes (NON-CRITICAL — no locking)
 * - "המשך ללא עדכון" = cancel (nothing saved, all changes shown again on next entry)
 * - "עדכן" with unchecked items = dismissed (won't show again), only critical unresolved = stays locked
 * - detectProductChanges still finds ALL changes (lastHandledProductChangeAt not bumped on partial)
 * - We filter OUT categories in order.dismissedChangeCategories
 * - "ingredientQtyUnit" is NEVER filtered — always shows until explicitly updated
 * - On "עדכן": selected categories get applied, unselected categories get dismissed
 *   (except ingredientQtyUnit which is never dismissed)
 * - When ALL changes resolved (including ingredientQtyUnit), lastHandledProductChangeAt is bumped
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import {
  analyzeOrderChanges,
  selectiveRefreshOrderProducts,
  markAllChangesHandled,
  applyDelta,
  type ProductChanges,
} from "@/lib/order-logic";
import type { MarkupType } from "@/lib/types";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
} from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
import { useThemeContext } from "@/lib/theme-provider";

// ============ Helpers ============
function formatPrice(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) return String(Math.round(value));
  return fixed;
}

function formatMarkup(type: MarkupType, value: number): string {
  if (type === "percent") return `${value}%`;
  return `₪${formatPrice(value)}`;
}

// ============ Checkbox categories ============
type CheckKey = "ingredientQtyUnit" | "ingredientPrice" | "customerPrice" | "markup" | "name";

/**
 * Filter out changes that have already been dismissed by the user.
 * "ingredientQtyUnit" is NEVER dismissed — always shows if present.
 */
function filterDismissedChanges(
  allChanges: ProductChanges[],
  dismissed: Record<string, string[]> | undefined
): {
  filteredChanges: ProductChanges[];
  hasAnyIngredientQtyUnitChanges: boolean;
  hasAnyIngredientPriceChanges: boolean;
  customerPriceChanges: ProductChanges[];
  markupChanges: ProductChanges[];
  nameChanges: ProductChanges[];
} {
  const dm = dismissed ?? {};

  const filteredChanges: ProductChanges[] = [];

  for (const change of allChanges) {
    const dismissedCats = new Set(dm[change.productId] ?? []);

    const filtered: ProductChanges = {
      ...change,
      // ingredientQtyUnit is NEVER dismissed (critical)
      hasIngredientQtyUnitChanges: change.hasIngredientQtyUnitChanges,
      // ingredientPrice can be dismissed (non-critical)
      hasIngredientPriceChanges: change.hasIngredientPriceChanges && !dismissedCats.has("ingredientPrice"),
      // Other categories: only show if NOT dismissed
      hasCustomerPriceChange: change.hasCustomerPriceChange && !dismissedCats.has("customerPrice"),
      hasMarkupChange: change.hasMarkupChange && !dismissedCats.has("markup"),
      hasNameChange: change.hasNameChange && !dismissedCats.has("name"),
    };

    // Only include if at least one category is still active
    if (
      filtered.hasIngredientQtyUnitChanges ||
      filtered.hasIngredientPriceChanges ||
      filtered.hasCustomerPriceChange ||
      filtered.hasMarkupChange ||
      filtered.hasNameChange
    ) {
      filteredChanges.push(filtered);
    }
  }

  return {
    filteredChanges,
    hasAnyIngredientQtyUnitChanges: filteredChanges.some((c) => c.hasIngredientQtyUnitChanges),
    hasAnyIngredientPriceChanges: filteredChanges.some((c) => c.hasIngredientPriceChanges),
    customerPriceChanges: filteredChanges.filter((c) => c.hasCustomerPriceChange),
    markupChanges: filteredChanges.filter((c) => c.hasMarkupChange),
    nameChanges: filteredChanges.filter((c) => c.hasNameChange),
  };
}

export default function ChangesReviewScreen() {
  const { colorScheme } = useThemeContext();
  const cs = React.useMemo(() => _make_cs(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const params = useLocalSearchParams<{ orderId: string; fromShoppingList?: string }>();
  const {
    orders,
    products,
    updateOrder,
    savedShoppingLists,
    updateSavedShoppingList,
    refreshOrders,
    refreshShoppingLists,
  } = useData();
  const { guardMutation } = useMutationGuard();

  const [checked, setChecked] = useState<Record<CheckKey, boolean>>({
    ingredientQtyUnit: true,
    ingredientPrice: true,
    customerPrice: true,
    markup: true,
    name: true,
  });
  const [loading, setLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);

  const order = useMemo(
    () => orders.find((o) => o.id === params.orderId),
    [orders, params.orderId]
  );

  // Raw analysis — finds ALL changes
  const rawAnalysis = useMemo(() => {
    if (!order) return null;
    return analyzeOrderChanges(order, products);
  }, [order, products]);

  // Filtered analysis — removes dismissed categories
  const analysis = useMemo(() => {
    if (!rawAnalysis) return null;
    return filterDismissedChanges(rawAnalysis.allChanges, order?.dismissedChangeCategories);
  }, [rawAnalysis, order?.dismissedChangeCategories]);

  const fromShoppingList = params.fromShoppingList === "1";

  const toggleCheck = useCallback((key: CheckKey) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Update handler ──
  const handleUpdate = useCallback(async () => {
    if (!order || !analysis || !rawAnalysis) return;
    const allowed = await guardMutation();
    if (!allowed) return;
    setLoading(true);
    try {
      const oldProducts = [...order.products];
      const newProducts = selectiveRefreshOrderProducts(order.products, products, {
        updateIngredientQtyUnit: checked.ingredientQtyUnit,
        updateIngredientPrice: checked.ingredientPrice,
        updateCustomerPrice: checked.customerPrice,
        updateMarkup: checked.markup,
        updateName: checked.name,
      });

      // Apply Delta to linked shopping list if ingredient qty/unit changed
      if (checked.ingredientQtyUnit) {
        const linkedList = savedShoppingLists.find(
          (sl) => sl.status !== "deleted" && sl.orderIds.includes(order.id)
        );
        if (linkedList) {
          const updatedRows = applyDelta(linkedList.rows, order.id, oldProducts, newProducts);
          await updateSavedShoppingList(linkedList.id, {
            rows: updatedRows,
            status: "valid",
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Build dismissed categories:
      // - Categories that were shown but user unchecked → add to dismissed
      // - Categories that were checked → remove from dismissed (resolved)
      // - "ingredientQtyUnit" is NEVER dismissed
      const existingDismissed = { ...(order.dismissedChangeCategories ?? {}) };

      for (const change of rawAnalysis.allChanges) {
        const pid = change.productId;
        const currentDismissed = new Set(existingDismissed[pid] ?? []);

        const catMap: { key: CheckKey; hasChange: boolean }[] = [
          { key: "ingredientPrice", hasChange: change.hasIngredientPriceChanges },
          { key: "customerPrice", hasChange: change.hasCustomerPriceChange },
          { key: "markup", hasChange: change.hasMarkupChange },
          { key: "name", hasChange: change.hasNameChange },
        ];

        for (const { key, hasChange } of catMap) {
          if (!hasChange) continue;
          if (checked[key]) {
            currentDismissed.delete(key);
          } else {
            currentDismissed.add(key);
          }
        }

        if (currentDismissed.size > 0) {
          existingDismissed[pid] = Array.from(currentDismissed);
        } else {
          delete existingDismissed[pid];
        }
      }

      // Determine if ALL changes are now resolved
      // Only ingredientQtyUnit (critical) causes locking
      const hasUnresolvedCritical =
        analysis.hasAnyIngredientQtyUnitChanges && !checked.ingredientQtyUnit;

      // Check if there are any remaining non-dismissed, non-critical changes
      const hasRemainingChanges = rawAnalysis.allChanges.some((change) => {
        const dismissedSet = new Set(existingDismissed[change.productId] ?? []);
        return (
          (change.hasIngredientPriceChanges && !dismissedSet.has("ingredientPrice") && !checked.ingredientPrice) ||
          (change.hasCustomerPriceChange && !dismissedSet.has("customerPrice") && !checked.customerPrice) ||
          (change.hasMarkupChange && !dismissedSet.has("markup") && !checked.markup) ||
          (change.hasNameChange && !dismissedSet.has("name") && !checked.name)
        );
      });

      const allResolved = !hasUnresolvedCritical && !hasRemainingChanges;

      let finalProducts = newProducts;
      let finalDismissed: Record<string, string[]> | undefined = existingDismissed;
      if (allResolved) {
        finalProducts = markAllChangesHandled(newProducts, products);
        finalDismissed = undefined;
      }

      await updateOrder(order.id, {
        products: finalProducts,
        // Only critical (qty/unit) causes locking
        status: hasUnresolvedCritical ? "needs_refresh_locked" : "open",
        dismissedChangeCategories: finalDismissed ?? {},
      });
      await refreshOrders();
      await refreshShoppingLists();

      const linkedList = savedShoppingLists.find(
        (sl) => sl.status !== "deleted" && sl.orderIds.includes(order.id)
      );
      if (linkedList && checked.ingredientQtyUnit) {
        Alert.alert("הצלחה", "ההזמנה עודכנה בהצלחה.\nרשימת הקניות עודכנה בהתאם לשינויים שביצעת.");
      } else {
        Alert.alert("הצלחה", "ההזמנה עודכנה בהצלחה.");
      }

      router.back();
    } catch (e: any) {
      Alert.alert("שגיאה", "העדכון נכשל. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }, [order, analysis, rawAnalysis, products, checked, savedShoppingLists, updateOrder, updateSavedShoppingList, refreshOrders, refreshShoppingLists, router, guardMutation]);

  // ── "המשך ללא עדכון" = CANCEL — nothing saved, all changes shown again next time ──
  const handleSkip = useCallback(async () => {
    // Simply go back without saving anything — this is a cancel operation
    router.back();
  }, [router]);

  // ── No data guard ──
  if (!order || !analysis || analysis.filteredChanges.length === 0) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
        <View style={cs.container}>
          <View style={cs.header}>
            <TouchableOpacity onPress={() => router.back()} style={cs.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={cs.headerTitle}>שינויים במוצרים</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={cs.emptyContainer}>
            <Text style={cs.emptyText}>אין שינויים לעדכון</Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ── Build sections ──
  const sections: { key: CheckKey; title: string; icon: string; critical?: boolean; items: React.ReactNode[] }[] = [];

  // 1. Ingredient Qty/Unit (CRITICAL)
  if (analysis.hasAnyIngredientQtyUnitChanges) {
    const items: React.ReactNode[] = [];
    for (const change of analysis.filteredChanges) {
      if (!change.hasIngredientQtyUnitChanges) continue;
      items.push(
        <View key={`iqty-${change.productId}`} style={cs.changeGroup}>
          <Text style={cs.productName}>{change.productName}</Text>
          {change.ingredientQtyUnitDiffs.map((diff, i) => {
            if (diff.type === "added") {
              return <Text key={i} style={cs.diffText}>• נוסף: {diff.name}</Text>;
            }
            if (diff.type === "removed") {
              return <Text key={i} style={cs.diffText}>• הוסר: {diff.name}</Text>;
            }
            const hasNameChange = diff.oldName != null && diff.newName != null && diff.oldName !== diff.newName;
            const hasUnitChange = diff.oldUnit != null && diff.newUnit != null && diff.oldUnit !== diff.newUnit;
            const hasQtyChange = diff.oldQty != null && diff.newQty != null && diff.oldQty !== diff.newQty;
            if (!hasNameChange && !hasUnitChange && !hasQtyChange) return null;
            const lines: string[] = [];
            if (hasNameChange) lines.push(`שם השתנה מ-"${diff.oldName}" ל-"${diff.newName}"`);
            if (hasUnitChange) lines.push(`יחידה השתנתה מ-${diff.oldUnit} ל-${diff.newUnit}`);
            if (hasQtyChange) lines.push(`כמות השתנתה מ-${diff.oldQty} ל-${diff.newQty}`);
            return (
              <View key={i} style={cs.ingredientChangeBlock}>
                <Text style={cs.ingredientName}>{diff.name}</Text>
                {lines.map((line, j) => (
                  <Text key={j} style={cs.diffText}>  • {line}</Text>
                ))}
              </View>
            );
          })}
        </View>
      );
    }
    sections.push({ key: "ingredientQtyUnit", title: "כמות / יחידה של רכיבים", icon: "restaurant", critical: true, items });
  }

  // 2. Ingredient Price (NON-CRITICAL)
  if (analysis.hasAnyIngredientPriceChanges) {
    const items: React.ReactNode[] = [];
    for (const change of analysis.filteredChanges) {
      if (!change.hasIngredientPriceChanges) continue;
      items.push(
        <View key={`iprice-${change.productId}`} style={cs.changeGroup}>
          <Text style={cs.productName}>{change.productName}</Text>
          {change.ingredientPriceDiffs.map((diff, i) => (
            <View key={i} style={cs.ingredientChangeBlock}>
              <Text style={cs.ingredientName}>{diff.name}</Text>
              <Text style={cs.diffText}>  • מחיר השתנה מ-{formatPrice(diff.oldPrice!)}₪ ל-{formatPrice(diff.newPrice!)}₪</Text>
            </View>
          ))}
        </View>
      );
    }
    sections.push({ key: "ingredientPrice", title: "מחיר רכיבים", icon: "attach-money", items });
  }

  // 3. Customer Price
  if (analysis.customerPriceChanges.length > 0) {
    const items = analysis.customerPriceChanges.map((c) => (
      <View key={`cp-${c.productId}`} style={cs.changeGroup}>
        <Text style={cs.productName}>{c.productName}</Text>
        <Text style={cs.diffText}>• השתנה מ-{formatPrice(c.oldCustomerPrice)}₪ ל-{formatPrice(c.newCustomerPrice)}₪</Text>
      </View>
    ));
    sections.push({ key: "customerPrice", title: "מחיר ללקוח", icon: "sell", items });
  }

  // 4. Markup
  if (analysis.markupChanges.length > 0) {
    const items = analysis.markupChanges.map((c) => (
      <View key={`mk-${c.productId}`} style={cs.changeGroup}>
        <Text style={cs.productName}>{c.productName}</Text>
        <Text style={cs.diffText}>
          • השתנה מ-{formatMarkup(c.oldMarkupType, c.oldMarkupValue)} ל-{formatMarkup(c.newMarkupType, c.newMarkupValue)}
        </Text>
      </View>
    ));
    sections.push({ key: "markup", title: "תוספת מחיר", icon: "trending-up", items });
  }

  // 5. Name
  if (analysis.nameChanges.length > 0) {
    const items = analysis.nameChanges.map((c) => (
      <View key={`nm-${c.productId}`} style={cs.changeGroup}>
        <Text style={cs.diffText}>• השתנה מ-"{c.oldName}" ל-"{c.newName}"</Text>
      </View>
    ));
    sections.push({ key: "name", title: "שם מוצר", icon: "label", items });
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={cs.container}>
        {/* Header */}
        <View style={cs.header}>
          <TouchableOpacity onPress={() => router.back()} style={cs.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={cs.headerTitle}>שינויים במוצרים</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* "Explanation" button */}
        <TouchableOpacity
          onPress={() => setShowExplanation(true)}
          style={cs.explanationBtn}
          activeOpacity={0.7}
        >
          <MaterialIcons name="info-outline" size={18} color={DS_COLORS.accent} />
          <Text style={cs.explanationBtnText}>הסבר למסך זה</Text>
        </TouchableOpacity>

        {/* Explanation Modal */}
        <Modal
          visible={showExplanation}
          transparent
          animationType="fade"
          onRequestClose={() => setShowExplanation(false)}
        >
          <View style={cs.modalOverlay}>
            <View style={cs.modalCard}>
              <Text style={cs.modalTitle}>הסבר</Text>
              <View style={cs.modalBody}>
                <Text style={cs.modalText}>
                  מאז שנוצרה ההזמנה, בוצעו שינויים במוצרים שמשפיעים עליה.
                </Text>
                <Text style={cs.modalText}>
                  כל השינויים מסומנים לעדכון אוטומטי. לחץ "עדכן" כדי להחיל אותם על ההזמנה.
                </Text>
                <Text style={cs.modalText}>
                  אם אינך רוצה להחיל שינוי מסוים — בטל את הסימון שלו.
                </Text>
                <Text style={cs.modalWarningLabel}>שים לב:</Text>
                <Text style={cs.modalWarningText}>
                  שינויים בכמות או ביחידה של רכיבים הם שינויים קריטיים. כל עוד לא תעדכן אותם, ההזמנה ורשימת הקניות יהיו חסומות לעריכה.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowExplanation(false)}
                style={cs.modalOkBtn}
                activeOpacity={0.8}
              >
                <Text style={cs.modalOkBtnText}>הבנתי</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Scrollable content */}
        <ScrollView contentContainerStyle={cs.scrollContent} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.key} style={[cs.section, section.critical && cs.sectionCritical]}>
              {/* Section header with checkbox */}
              <TouchableOpacity
                onPress={() => toggleCheck(section.key)}
                style={[cs.sectionHeader, section.critical && cs.sectionHeaderCritical]}
                activeOpacity={0.7}
              >
                <View style={cs.sectionHeaderLeft}>
                  <View style={[cs.checkbox, checked[section.key] && cs.checkboxChecked]}>
                    {checked[section.key] && (
                      <MaterialIcons name="check" size={16} color={DS_COLORS.white} />
                    )}
                  </View>
                  <MaterialIcons name={section.icon as any} size={20} color={section.critical ? "#D97706" : DS_COLORS.accent} />
                  <Text style={cs.sectionTitle}>{section.title}</Text>
                  {section.critical && (
                    <View style={cs.criticalBadge}>
                      <Text style={cs.criticalBadgeText}>קריטי</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* Section items */}
              <View style={cs.sectionBody}>
                {section.items}
              </View>
            </View>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom buttons */}
        <View style={cs.bottomBar}>
          <TouchableOpacity
            onPress={handleUpdate}
            style={cs.updateBtn}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={DS_COLORS.white} />
            ) : (
              <Text style={cs.updateBtnText}>עדכן</Text>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </ScreenContainer>
  );
}

// ============ Styles ============
function _make_cs() { return StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row-reverse" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: DS_COLORS.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
  },
  explanationBtn: {
    flexDirection: "row-reverse" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: DS_SPACING.sm,
    paddingHorizontal: DS_SPACING.lg,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 0.5,
    borderBottomColor: DS_COLORS.border,
  },
  explanationBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.accent,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: DS_SPACING.xl,
  },
  modalCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    paddingVertical: DS_SPACING.xl,
    paddingHorizontal: DS_SPACING.lg,
    width: "100%" as const,
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
    textAlign: "center" as const,
    marginBottom: DS_SPACING.md,
  },
  modalBody: {
    direction: "rtl" as const,
    gap: 6,
    marginBottom: DS_SPACING.lg,
  },
  modalText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    lineHeight: 20,
  },
  modalWarningLabel: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold as any,
    color: "#D97706",
    marginTop: 8,
  },
  modalWarningText: {
    fontSize: DS_FONT.bodySmall,
    color: "#92400E",
    lineHeight: 20,
  },
  modalOkBtn: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalOkBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.white,
  },
  scrollContent: {
    paddingHorizontal: DS_SPACING.lg,
    paddingTop: DS_SPACING.md,
  },
  section: {
    marginBottom: DS_SPACING.lg,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.md,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  sectionCritical: {
    borderColor: DS_COLORS.warning,
    backgroundColor: DS_COLORS.warningBg,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: DS_COLORS.border,
  },
  sectionHeaderCritical: {
    backgroundColor: DS_COLORS.warningBg,
    borderBottomColor: DS_COLORS.warning,
  },
  sectionHeaderLeft: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
  },
  sectionTitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textPrimary,
  },
  criticalBadge: {
    backgroundColor: DS_COLORS.warningBg,
    borderWidth: 1,
    borderColor: DS_COLORS.warning,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  criticalBadgeText: {
    fontSize: 10,
    fontWeight: DS_WEIGHT.bold as any,
    color: "#D97706",
  },
  sectionBody: {
    direction: "rtl" as const,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
  },
  changeGroup: {
    marginBottom: DS_SPACING.sm,
  },
  ingredientChangeBlock: {
    marginBottom: 4,
  },
  ingredientName: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textPrimary,
    marginTop: 2,
  },
  productName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textPrimary,
    marginBottom: 2,
  },
  diffText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    lineHeight: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: DS_COLORS.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: DS_COLORS.inputBg,
  },
  checkboxChecked: {
    backgroundColor: DS_COLORS.accent,
    borderColor: DS_COLORS.accent,
  },
  bottomBar: {
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    borderTopWidth: 0.5,
    borderTopColor: DS_COLORS.border,
    backgroundColor: DS_COLORS.card,
    gap: DS_SPACING.sm,
  },
  updateBtn: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  updateBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.white,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
  },
}); }
