import React, { useMemo, useCallback, useState } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Animated,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import type { SavedShoppingList, Order } from "@/lib/types";
import { shouldLockShoppingList, analyzeOrderChanges, getLockedOrdersForList } from "@/lib/order-logic";
import type { Product } from "@/lib/types";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
import { useThemeContext } from "@/lib/theme-provider";

function formatDate(isoDate: string): string {
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

// ============ Shopping List Card ============
function ShoppingListCard({
  item,
  onView,
  onDelete,
  orders,
}: {
  item: SavedShoppingList;
  onView: () => void;
  onDelete: () => void;
  orders: Order[];
}) {
  const { colorScheme } = useThemeContext();
  const ls = React.useMemo(() => _make_ls(), [DS_COLORS.accent, colorScheme]);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const isDirectlyLocked = item.status === "needs_refresh_locked";
  const hasLockedLinkedOrder = shouldLockShoppingList(item, orders);
  const isLocked = isDirectlyLocked || hasLockedLinkedOrder;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={onView}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={[ls.card, isLocked && ls.cardLocked]}
      >
        <View style={ls.cardInner}>
          {/* Icon */}
          <View style={[ls.iconWrap, isLocked && ls.iconWrapLocked]}>
            <MaterialIcons name="shopping-cart" size={22} color={isLocked ? DS_COLORS.warning : DS_COLORS.accent} />
          </View>

          {/* Info */}
          <View style={ls.cardInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, direction: "rtl" as const }}>
              <Text style={ls.cardNames} numberOfLines={2}>
                {(() => {
                  const linkedOrders = orders.filter((o) => item.orderIds.includes(o.id));
                  if (linkedOrders.length > 0) {
                    return linkedOrders.map((o) => o.customerName).join(", ");
                  }
                  return item.orderNames.join(", ");
                })()}
              </Text>
              {isLocked && (
                <View style={ls.lockedBadge}>
                  <MaterialIcons name="lock" size={12} color={DS_COLORS.warning} />
                  <Text style={ls.lockedBadgeText}>נעולה</Text>
                </View>
              )}
            </View>
            <View style={ls.cardMeta}>
              <MaterialIcons name="event" size={14} color={DS_COLORS.textSecondary} />
              <Text style={ls.cardDate}>
                תאריך אירוע: {(() => {
                  const linkedOrders = orders.filter((o) => item.orderIds.includes(o.id));
                  if (linkedOrders.length === 0) return formatDate(item.createdAt);
                  const sorted = [...linkedOrders].sort(
                    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
                  );
                  const first = formatDate(sorted[0].eventDate);
                  if (sorted.length === 1) return first;
                  const last = formatDate(sorted[sorted.length - 1].eventDate);
                  return first === last ? first : `${first} - ${last}`;
                })()}
              </Text>
            </View>
            {isLocked && (
              <Text style={ls.lockedHint}>רשימה לא מעודכנת — לחץ לצפייה</Text>
            )}
          </View>

          {/* Actions */}
          <View style={ls.cardActions}>
            <TouchableOpacity
              onPress={onDelete}
              style={ls.deleteBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete-outline" size={18} color={DS_COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============ Main Screen ============
export default function ShoppingListsScreen() {
  const { colorScheme } = useThemeContext();
  const ls = React.useMemo(() => _make_ls(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const { savedShoppingLists, deleteSavedShoppingList, orders, products, archiveOrder, updateOrder, refreshOrders } = useData();
  const { guardMutation } = useMutationGuard();

  // Dialog state for the question flow
  const [dialogList, setDialogList] = useState<SavedShoppingList | null>(null);
  const [dialogStep, setDialogStep] = useState<"was_completed" | "archive_confirm" | null>(null);
  const [dialogOrderId, setDialogOrderId] = useState<string | null>(null);

  const sortedLists = useMemo(() => {
    return [...savedShoppingLists].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [savedShoppingLists]);

  const handleView = useCallback(
    (list: SavedShoppingList) => {
      // Check if any linked order is already locked (needs_refresh_locked)
      const lockedOrders = getLockedOrdersForList(list, orders);
      if (lockedOrders.length > 0) {
        // Already locked — show dialog (cancel = enter view-only)
        setDialogList(list);
        setDialogOrderId(lockedOrders[0].id);
        setDialogStep("was_completed");
        return;
      }

      // Check for non-locked orders with pending changes (not yet locked)
      const linkedOrders = orders.filter((o) => list.orderIds.includes(o.id) && o.status !== "archived");
      for (const o of linkedOrders) {
        const analysis = analyzeOrderChanges(o, products);
        // Only critical (qty/unit) changes trigger the dialog for not-yet-locked
        if (analysis.hasAnyIngredientQtyUnitChanges) {
          // Not yet locked — show dialog (cancel = stay, don't enter)
          setDialogList(list);
          setDialogOrderId(o.id);
          setDialogStep("was_completed");
          return;
        }
      }

      // No critical changes — navigate normally
      router.push({ pathname: "/shopping-list-view", params: { listId: list.id } } as any);
    },
    [router, orders, products]
  );

  const handleDialogAnswer = useCallback(async (answer: "yes" | "no" | "cancel") => {
    if (!dialogList || !dialogOrderId) {
      setDialogStep(null);
      setDialogList(null);
      setDialogOrderId(null);
      return;
    }

    if (answer === "cancel") {
      // Distinguish: already locked → enter view-only; not yet locked → stay (don't enter)
      const order = orders.find((o) => o.id === dialogOrderId);
      const isAlreadyLocked = order?.status === "needs_refresh_locked";

      setDialogStep(null);
      setDialogList(null);
      setDialogOrderId(null);

      if (isAlreadyLocked) {
        // Already locked — enter view-only (no edit, banner shown inside)
        router.push({ pathname: "/shopping-list-view", params: { listId: dialogList.id } } as any);
      }
      // Not yet locked — just close dialog, don't navigate
      return;
    }

    const order = orders.find((o) => o.id === dialogOrderId);
    if (!order) {
      setDialogStep(null);
      setDialogList(null);
      setDialogOrderId(null);
      return;
    }

    if (answer === "yes") {
      const allowed = await guardMutation();
      if (!allowed) return;
      // Check if order has shopping lists
      const linkedLists = savedShoppingLists.filter(
        (sl) => sl.status !== "deleted" && sl.orderIds.includes(order.id)
      );
      if (linkedLists.length > 0) {
        setDialogStep("archive_confirm");
      } else {
        try {
          await archiveOrder(order.id);
          Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
        } catch {
          Alert.alert("שגיאה", "ההעברה לארכיון נכשלה.");
        }
        setDialogStep(null);
        setDialogList(null);
        setDialogOrderId(null);
      }
      return;
    }

    // answer === "no" — Lock order and navigate to changes review
    const allowed2 = await guardMutation();
    if (!allowed2) return;
    const analysis = analyzeOrderChanges(order, products);
    if (analysis.hasAnyIngredientChanges) {
      try {
        await updateOrder(order.id, { status: "needs_refresh_locked" });
        await refreshOrders();
      } catch { /* continue anyway */ }
    }
    setDialogStep(null);
    setDialogList(null);
    setDialogOrderId(null);
    router.push({
      pathname: "/changes-review",
      params: { orderId: order.id, fromShoppingList: "1" },
    } as any);
  }, [dialogList, dialogOrderId, orders, products, savedShoppingLists, archiveOrder, updateOrder, refreshOrders, router, guardMutation]);

  const handleArchiveConfirm = useCallback(async (confirm: boolean) => {
    if (!confirm || !dialogOrderId) {
      setDialogStep(null);
      setDialogList(null);
      setDialogOrderId(null);
      return;
    }
    const allowed = await guardMutation();
    if (!allowed) return;
    try {
      await archiveOrder(dialogOrderId);
      Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
    } catch {
      Alert.alert("שגיאה", "ההעברה לארכיון נכשלה.");
    }
    setDialogStep(null);
    setDialogList(null);
    setDialogOrderId(null);
  }, [dialogOrderId, archiveOrder, guardMutation]);

  const handleDelete = useCallback(
    (list: SavedShoppingList) => {
      Alert.alert("מחיקת רשימה", "האם אתה בטוח שברצונך למחוק רשימה זו?", [
        { text: "ביטול", style: "cancel" },
        {
          text: "מחיקה",
          style: "destructive",
          onPress: async () => {
            const allowed = await guardMutation();
            if (!allowed) return;
            try {
              await deleteSavedShoppingList(list.id);
            } catch (e: any) {
              Alert.alert("שגיאה", e.message);
            }
          },
        },
      ]);
    },
    [deleteSavedShoppingList, guardMutation]
  );

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={ls.container}>
        {/* Header */}
        <View style={ls.header}>
          <View style={{ width: 40 }} />
          <Text style={ls.headerTitle}>רשימות קניות</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={ls.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {sortedLists.length === 0 ? (
          <View style={ls.emptyState}>
            <View style={ls.emptyIconCircle}>
              <MaterialIcons name="shopping-cart" size={40} color={DS_COLORS.accent} />
            </View>
            <Text style={ls.emptyTitle}>אין רשימות קניות</Text>
            <Text style={ls.emptySubtitle}>
              צור רשימת קניות ממסך ההזמנות
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedLists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={ls.listContent}
            renderItem={({ item }) => (
              <ShoppingListCard
                item={item}
                onView={() => handleView(item)}
                onDelete={() => handleDelete(item)}
                orders={orders}
              />
            )}
          />
        )}
      </View>

      {/* ═══ Dialog Modals ═══ */}

      {/* Was Completed Dialog */}
      <Modal visible={dialogStep === "was_completed"} transparent animationType="fade">
        <View style={ls.modalOverlay}>
          <View style={ls.modalCard}>
            <Text style={ls.modalTitle}>רשימת קניות זו נוצרה מהזמנה שהשתנו בה מוצרים</Text>
            <Text style={ls.modalBody}>
              בוצעו שינויים במוצרים הקשורים להזמנה שממנה נוצרה רשימת הקניות.{"\n"}
              אם ההזמנה כבר בוצעה — היא תועבר לארכיון וכל רשימות הקניות שלה יימחקו.{"\n"}
              אם עדיין לא בוצעה — תוכל לעדכן את הנתונים.
            </Text>
            <View style={ls.modalBtnCol}>
              <TouchableOpacity style={ls.modalBtnPrimary} onPress={() => handleDialogAnswer("yes")} activeOpacity={0.8}>
                <Text style={ls.modalBtnPrimaryText}>כן, בוצעה</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ls.modalBtnOutline} onPress={() => handleDialogAnswer("no")} activeOpacity={0.8}>
                <Text style={ls.modalBtnOutlineText}>לא, עדיין לא בוצעה</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ls.modalBtnGhost} onPress={() => handleDialogAnswer("cancel")} activeOpacity={0.8}>
                <Text style={ls.modalBtnGhostText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Archive Confirm Dialog */}
      <Modal visible={dialogStep === "archive_confirm"} transparent animationType="fade">
        <View style={ls.modalOverlay}>
          <View style={ls.modalCard}>
            <Text style={ls.modalTitle}>העברת הזמנה לארכיון</Text>
            <Text style={ls.modalBody}>
              כל רשימות הקניות שמכילות את ההזמנה יימחקו לצמיתות — גם אם הן משותפות להזמנות אחרות. פעולה זו אינה ניתנת לשחזור.
            </Text>
            <View style={ls.modalBtnCol}>
              <TouchableOpacity style={[ls.modalBtnPrimary, { backgroundColor: DS_COLORS.error }]} onPress={() => handleArchiveConfirm(true)} activeOpacity={0.8}>
                <Text style={ls.modalBtnPrimaryText}>העבר לארכיון</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ls.modalBtnGhost} onPress={() => handleArchiveConfirm(false)} activeOpacity={0.8}>
                <Text style={ls.modalBtnGhostText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScreenContainer>
  );
}

function _make_ls() { return StyleSheet.create({
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
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.lg,
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
  listContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.md,
    paddingBottom: 100,
  },

  // ── Card ──
  card: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    ...DS_SHADOW.card,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.md,
    direction: "rtl" as const,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    alignItems: "flex-start",
    gap: 4,
  },
  cardNames: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    direction: "rtl" as const,
  },
  cardDate: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },

  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    direction: "rtl" as const,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  lockedBadge: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    gap: 3,
    backgroundColor: DS_COLORS.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockedBadgeText: {
    fontSize: 10,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.warning,
  },
  cardLocked: {
    backgroundColor: DS_COLORS.warningBg,
    borderWidth: 1,
    borderColor: DS_COLORS.warning,
  },
  iconWrapLocked: {
    backgroundColor: DS_COLORS.warningBg,
  },
  lockedHint: {
    fontSize: 11,
    color: DS_COLORS.warning,
    fontWeight: DS_WEIGHT.medium as any,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
    marginTop: 2,
  },

  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: DS_SPACING.xl,
  },
  modalCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
    marginBottom: DS_SPACING.sm,
  },
  modalBody: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
    lineHeight: 22,
    marginBottom: DS_SPACING.lg,
  },
  modalBtnCol: {
    gap: DS_SPACING.sm,
  },
  modalBtnPrimary: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md,
    alignItems: "center" as const,
  },
  modalBtnPrimaryText: {
    color: "#fff",
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  modalBtnOutline: {
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md,
    alignItems: "center" as const,
  },
  modalBtnOutlineText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  modalBtnGhost: {
    paddingVertical: DS_SPACING.sm,
    alignItems: "center" as const,
  },
  modalBtnGhostText: {
    color: DS_COLORS.textSecondary,
    fontSize: DS_FONT.bodySmall,
  },
}); }
