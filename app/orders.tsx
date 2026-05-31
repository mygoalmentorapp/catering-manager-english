import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { setOneSignalScreenTrigger } from "@/lib/onesignal-bootstrap";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Linking,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import type { Order, Product, OrderProductRow } from "@/lib/types";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
import { generatePriceQuoteHtml, generateExecutionListHtml } from "@/lib/print-documents";
import { imageUriToBase64, getDefaultLogoBase64 } from "@/lib/image-to-base64";
import {
  analyzeOrderChanges,

  generateShoppingListRows,
} from "@/lib/order-logic";
import { useThemeContext } from "@/lib/theme-provider";

// ============ Smart decimal formatting ============
function formatPrice(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) return String(Math.round(value));
  return fixed;
}

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

// ============ Helpers ============
function calcOrderCustomerTotal(order: Order): number {
  let total = 0;
  for (const op of order.products) {
    total += (op.customerPriceAtAdd ?? 0) * (op.quantity || 1);
  }
  return Math.round(total * 10) / 10;
}

function calcOrderCostTotal(order: Order): number {
  let total = 0;
  for (const op of order.products) {
    total += (op.costAtAdd ?? 0) * (op.quantity || 1);
  }
  return Math.round(total * 10) / 10;
}

// ============ Change Detection Dialog System ============

type DialogStep =
  | { type: "was_completed" }
  | { type: "archive_confirm" }
  | null;

// ============ Order Detail View ============
function OrderDetailView({
  order,
  products,
  onClose,
  onEdit,
  fromShoppingList,
}: {
  order: Order;
  products: Product[];
  onClose: () => void;
  onEdit: () => void;
  fromShoppingList?: boolean;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const {
    businessName,
    businessLogo,
    updateOrder,
    archiveOrder,
    savedShoppingLists,
    refreshOrders,
  } = useData();
  const { guardMutation } = useMutationGuard();
  const [activeTab, setActiveTab] = useState<"customer" | "cost" | "profit">("customer");
  const [printing, setPrinting] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>(null);

  const [dialogChecked, setDialogChecked] = useState(false);
  const [noButtonLoading, setNoButtonLoading] = useState(false);
  const [dotCount, setDotCount] = useState(0);
  const router = useRouter();

  // Animated dots for "no" button loading state
  React.useEffect(() => {
    if (!noButtonLoading) {
      setDotCount(0);
      return;
    }
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, [noButtonLoading]);

  // Run change detection on mount (once per open)
  useEffect(() => {
    if (dialogChecked) return;
    if (order.status === "archived") { setDialogChecked(true); return; }

    const analysis = analyzeOrderChanges(order, products);
    if (analysis.allChanges.length === 0) {
      setDialogChecked(true);
      return;
    }

    // Show "Was order completed?" dialog
    setDialogStep({ type: "was_completed" });
    setDialogChecked(true);
  }, [order.id, dialogChecked]);

  // Snapshot totals from order rows
  const customerTotal = useMemo(() => calcOrderCustomerTotal(order), [order]);
  const orderCost = useMemo(() => calcOrderCostTotal(order), [order]);
  const orderProfit = Math.round((customerTotal - orderCost) * 10) / 10;

  // ── Dialog Handlers ──

  const handleWasCompleted = useCallback(async (answer: "yes" | "no" | "cancel") => {
    if (answer === "cancel") {
      setDialogStep(null);
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
        setDialogStep({ type: "archive_confirm" });
      } else {
        // Archive directly
        try {
          await archiveOrder(order.id);
          Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
          onClose();
        } catch {
          Alert.alert("שגיאה", "ההעברה לארכיון נכשלה. לא בוצעו שינויים.");
        }
        setDialogStep(null);
      }
      return;
    }

    // answer === "no" → Lock order and navigate to changes review screen
    setNoButtonLoading(true);
    try {
      const allowed2 = await guardMutation();
      if (!allowed2) { setNoButtonLoading(false); return; }
      const analysis = analyzeOrderChanges(order, products);
      if (analysis.hasAnyIngredientChanges) {
        try {
          await updateOrder(order.id, { status: "needs_refresh_locked" });
          await refreshOrders();
        } catch { /* continue anyway */ }
      }
      setDialogStep(null);
      router.push({
        pathname: "/changes-review",
        params: { orderId: order.id, fromShoppingList: fromShoppingList ? "1" : "0" },
      } as any);
    } finally {
      setNoButtonLoading(false);
    }
  }, [order, products, savedShoppingLists, archiveOrder, updateOrder, refreshOrders, onClose, guardMutation]);

  const handleArchiveConfirm = useCallback(async (confirm: boolean) => {
    if (!confirm) {
      setDialogStep(null);
      return;
    }
    const allowed = await guardMutation();
    if (!allowed) return;
    try {
      await archiveOrder(order.id);
      Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
      onClose();
    } catch {
      Alert.alert("שגיאה", "ההעברה לארכיון נכשלה. לא בוצעו שינויים.");
    }
    setDialogStep(null);
  }, [order.id, archiveOrder, onClose, guardMutation]);



  // ── Print Handler ──
  const handlePrint = useCallback(async (type: "quote" | "execution") => {
    setPrinting(true);
    try {
      let logoBase64 = "";
      if (businessLogo) {
        logoBase64 = await imageUriToBase64(businessLogo);
      } else {
        logoBase64 = await getDefaultLogoBase64();
      }
      const displayName = businessName.trim() || "שם העסק שלך";
      const opts = { order, products, businessName: displayName, logoBase64 };
      const html = type === "quote"
        ? generatePriceQuoteHtml(opts)
        : generateExecutionListHtml(opts);

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 300);
        }
      } else {
        const Print = require("expo-print");
        const Sharing = require("expo-sharing");
        const { uri } = await Print.printToFileAsync({ html });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          const docName = type === "quote" ? "הצעת_מחיר" : "רשימת_ביצוע";
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: docName,
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ html });
        }
      }
    } catch (e: any) {
      Alert.alert("שגיאה", "לא ניתן להדפיס: " + (e.message || ""));
    } finally {
      setPrinting(false);
    }
  }, [order, products, businessName, businessLogo]);

  // ── WhatsApp Handler ──
  const handleWhatsApp = useCallback(async (type: "quote" | "execution") => {
    const displayName = businessName.trim() || "שם העסק שלך";
    const dateStr = order.eventDate ? formatDate(order.eventDate) : "";
    let text = "";

    if (type === "quote") {
      // Price quote format
      const lines: string[] = [];
      lines.push(`📋 *הזמנה עם מחירים*`);
      lines.push(`🏢 ${displayName}`);
      lines.push(``);
      lines.push(`👤 *לקוח:* ${order.customerName}`);
      if (dateStr) lines.push(`📅 *תאריך אירוע:* ${dateStr}`);
      if (order.customerPhone) lines.push(`📞 *טלפון:* ${order.customerPhone}`);
      if (order.customerAddress) lines.push(`📍 *כתובת:* ${order.customerAddress}`);
      lines.push(``);
      lines.push(`*פירוט:*`);
      let total = 0;
      order.products.forEach((op, idx) => {
        const prod = products.find((p) => p.id === op.productId);
        const unitPrice = prod ? (prod.customerPrice ?? 0) : op.customerPriceAtAdd;
        const lineTotal = Math.round(unitPrice * op.quantity * 10) / 10;
        total += lineTotal;
        lines.push(`${idx + 1}. ${op.productNameAtAdd} × ${op.quantity} — ₪${formatPrice(unitPrice)} = *₪${formatPrice(lineTotal)}*`);
      });
      total = Math.round(total * 10) / 10;
      lines.push(``);
      lines.push(`💰 *סה"כ לתשלום: ₪${formatPrice(total)}*`);
      if (order.notes) {
        lines.push(``);
        lines.push(`📝 *הערות:* ${order.notes}`);
      }
      text = lines.join("\n");
    } else {
      // Execution list format (no prices)
      const lines: string[] = [];
      lines.push(`📋 *הזמנה לביצוע*`);
      lines.push(`🏢 ${displayName}`);
      lines.push(``);
      lines.push(`👤 *לקוח:* ${order.customerName}`);
      if (dateStr) lines.push(`📅 *תאריך אירוע:* ${dateStr}`);
      lines.push(``);
      lines.push(`*מוצרים:*`);
      order.products.forEach((op, idx) => {
        lines.push(`${idx + 1}. ${op.productNameAtAdd} — כמות: ${op.quantity}`);
      });
      if (order.notes) {
        lines.push(``);
        lines.push(`📝 *הערות:* ${order.notes}`);
      }
      text = lines.join("\n");
    }

    try {
      const encoded = encodeURIComponent(text);
      const url = `whatsapp://send?text=${encoded}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: text });
      }
    } catch {
      try {
        await Share.share({ message: text });
      } catch {
        Alert.alert("שגיאה", "לא ניתן לשתף כרגע");
      }
    }
  }, [order, products, businessName]);

  // ── Check for change badge per product ──
  const productHasChanges = useCallback((row: OrderProductRow): boolean => {
    const prod = products.find((p) => p.id === row.productId);
    if (!prod) return false;
    return prod.updatedAt > row.lastHandledProductChangeAt;
  }, [products]);

  const isLocked = order.status === "needs_refresh_locked";
  const isArchived = order.status === "archived";

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          {!isLocked && !isArchived ? (
            <TouchableOpacity onPress={onEdit} style={s.editHeaderBtn} activeOpacity={0.8}>
              <MaterialIcons name="edit" size={18} color={DS_COLORS.accent} />
              <Text style={s.editHeaderBtnText}>עריכה</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
          <Text style={s.headerTitle} numberOfLines={1}>
            פרטי הזמנה
          </Text>
          <TouchableOpacity onPress={onClose} style={s.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Locked Banner — clickable, navigates to changes review */}
        {isLocked && (
          <TouchableOpacity
            style={s.lockedBanner}
            activeOpacity={0.7}
            onPress={() => router.push({
              pathname: "/changes-review",
              params: { orderId: order.id, fromShoppingList: fromShoppingList ? "1" : "0" },
            } as any)}
          >
            <MaterialIcons name="lock" size={18} color={DS_COLORS.warning} />
            <Text style={s.lockedBannerText}>ההזמנה דורשת רענון — לחץ לעדכון</Text>
            <MaterialIcons name="chevron-left" size={18} color={DS_COLORS.warning} />
          </TouchableOpacity>
        )}

        {/* Archived Banner */}
        {isArchived && (
          <View style={s.archivedBanner}>
            <MaterialIcons name="archive" size={18} color={DS_COLORS.textSecondary} />
            <Text style={s.archivedBannerText}>הזמנה בארכיון</Text>
          </View>
        )}

        {/* Purple Banner: Name + Date */}
        <View style={s.purpleBanner}>
          <Text style={s.purpleBannerTitle}>{order.customerName}</Text>
          <View style={s.purpleBannerDateRow}>
            <MaterialIcons name="event" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={s.purpleBannerDate}>
              תאריך אירוע: {formatDate(order.eventDate)}
            </Text>
          </View>
        </View>

        {/* Sticky: 3-Tab Price Display */}
        <View style={s.tabContainerSticky}>
          <View style={s.tabRow}>
            <TouchableOpacity
              onPress={() => setActiveTab("customer")}
              style={[s.tabBtn, activeTab === "customer" && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabBtnText, activeTab === "customer" && s.tabBtnTextActive]}>מחיר ללקוח</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("cost")}
              style={[s.tabBtn, activeTab === "cost" && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabBtnText, activeTab === "cost" && s.tabBtnTextActive]}>מחיר עלות</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("profit")}
              style={[s.tabBtn, activeTab === "profit" && s.tabBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabBtnText, activeTab === "profit" && s.tabBtnTextActive]}>ריווח שלנו</Text>
            </TouchableOpacity>
          </View>

          <View style={s.tabContentRow}>
            <View style={s.tabContentCell}>
              {activeTab === "customer" && (
                <Text style={s.tabValueAmount}>₪{formatPrice(customerTotal)}</Text>
              )}
            </View>
            <View style={s.tabContentCell}>
              {activeTab === "cost" && (
                <Text style={s.tabValueAmount}>₪{formatPrice(orderCost)}</Text>
              )}
            </View>
            <View style={s.tabContentCell}>
              {activeTab === "profit" && (
                <Text style={[
                  s.tabValueAmount,
                  orderProfit < 0 && { color: DS_COLORS.error },
                ]}>₪{formatPrice(orderProfit)}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Scrollable: Products List */}
        <ScrollView contentContainerStyle={s.detailContent}>
          {/* Customer Details */}
          {(order.customerPhone || order.customerAddress) && (
            <View style={s.detailCustomerCard}>
              <View style={s.detailCustomerRow}>
                <MaterialIcons name="person-outline" size={18} color={DS_COLORS.accent} />
                <Text style={s.detailCustomerLabel}>פרטי לקוח</Text>
              </View>
              {order.customerPhone ? (
                <View style={s.detailCustomerInfoRow}>
                  <MaterialIcons name="phone" size={15} color={DS_COLORS.textSecondary} />
                  <Text style={s.detailCustomerInfoText}>{order.customerPhone}</Text>
                </View>
              ) : null}
              {order.customerAddress ? (
                <View style={s.detailCustomerInfoRow}>
                  <MaterialIcons name="location-on" size={15} color={DS_COLORS.textSecondary} />
                  <Text style={s.detailCustomerInfoText}>{order.customerAddress}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Products */}
          {order.products.map((op) => {
            const unitCost = op.costAtAdd ?? 0;
            const customerUnitPrice = op.customerPriceAtAdd ?? 0;
            const lineCost = Math.round(unitCost * op.quantity * 10) / 10;
            const lineCustomer = Math.round(customerUnitPrice * op.quantity * 10) / 10;
            const displayPrice = activeTab === "customer" ? customerUnitPrice
              : activeTab === "cost" ? unitCost
              : (customerUnitPrice - unitCost);
            const displayTotal = activeTab === "customer" ? lineCustomer
              : activeTab === "cost" ? lineCost
              : Math.round((lineCustomer - lineCost) * 10) / 10;
            const hasChanges = productHasChanges(op);
            return (
              <View key={op.productId} style={s.detailProductCard}>
                <View style={s.detailProductTitleRow}>
                  <Text style={s.detailProductTitle}>
                    {op.quantity} {op.productNameAtAdd}
                  </Text>
                  {hasChanges && (
                    <View style={s.changeBadge}>
                      <MaterialIcons name="warning" size={14} color={DS_COLORS.warning} />
                    </View>
                  )}
                </View>
                <Text style={s.detailProductCalc}>
                  {op.quantity} × ₪{formatPrice(displayPrice)} = ₪{formatPrice(displayTotal)}
                </Text>
              </View>
            );
          })}

          {/* Notes */}
          {order.notes ? (
            <View style={s.detailNotesCard}>
              <View style={s.detailCustomerRow}>
                <MaterialIcons name="notes" size={18} color={DS_COLORS.accent} />
                <Text style={s.detailCustomerLabel}>הערות</Text>
              </View>
              <Text style={s.detailNotesText}>{order.notes}</Text>
            </View>
          ) : null}

          {/* Print & WhatsApp Buttons — always available */}
          <View style={s.printSection}>
            <Text style={s.printSectionTitle}>הפקת מסמכים</Text>
            {/* PDF Buttons Row */}
            <View style={s.printBtnRow}>
              <TouchableOpacity
                onPress={() => handlePrint("quote")}
                style={s.printBtn}
                activeOpacity={0.8}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator size="small" color={DS_COLORS.white} />
                ) : (
                  <>
                    <MaterialIcons name="picture-as-pdf" size={20} color={DS_COLORS.white} />
                    <Text style={s.printBtnText}>הזמנה עם מחירים</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePrint("execution")}
                style={s.printBtn}
                activeOpacity={0.8}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator size="small" color={DS_COLORS.white} />
                ) : (
                  <>
                    <MaterialIcons name="picture-as-pdf" size={20} color={DS_COLORS.white} />
                    <Text style={s.printBtnText}>הזמנה לביצוע</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {/* WhatsApp Buttons Row */}
            <View style={s.whatsappBtnRow}>
              <TouchableOpacity
                onPress={() => handleWhatsApp("quote")}
                style={s.whatsappBtn}
                activeOpacity={0.8}
              >
                <MaterialIcons name="send" size={20} color={DS_COLORS.white} />
                <Text style={s.whatsappBtnText}>הזמנה עם מחירים</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWhatsApp("execution")}
                style={s.whatsappBtn}
                activeOpacity={0.8}
              >
                <MaterialIcons name="send" size={20} color={DS_COLORS.white} />
                <Text style={s.whatsappBtnText}>הזמנה לביצוע</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* ═══ Dialog Modals ═══ */}

      {/* Was Completed Dialog */}
      <Modal visible={dialogStep?.type === "was_completed"} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>האם ההזמנה כבר בוצעה?</Text>
            <Text style={s.modalBody}>
              בוצעו שינויים במוצרים הקשורים להזמנה זו.{"\n"}
              אם ההזמנה כבר בוצעה — היא תועבר לארכיון וכל רשימות הקניות שלה יימחקו.{"\n"}
              אם עדיין לא בוצעה — תוכל לעדכן את הנתונים.
            </Text>
            <View style={s.modalBtnCol}>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={() => handleWasCompleted("yes")} activeOpacity={0.8} disabled={noButtonLoading}>
                <Text style={s.modalBtnPrimaryText}>כן, בוצעה</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtnOutline, noButtonLoading && { opacity: 0.7 }]}
                onPress={() => handleWasCompleted("no")}
                activeOpacity={0.8}
                disabled={noButtonLoading}
              >
                <Text style={s.modalBtnOutlineText}>
                  {noButtonLoading
                    ? `טוען${".".repeat(dotCount)}${"\u00A0".repeat(3 - dotCount)}`
                    : "לא, עדיין לא בוצעה"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnGhost} onPress={() => handleWasCompleted("cancel")} activeOpacity={0.8} disabled={noButtonLoading}>
                <Text style={s.modalBtnGhostText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Archive Confirm Dialog */}
      <Modal visible={dialogStep?.type === "archive_confirm"} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>העברת הזמנה לארכיון</Text>
            <Text style={s.modalBody}>
              כל רשימות הקניות שמכילות את ההזמנה יימחקו לצמיתות — גם אם הן משותפות להזמנות אחרות. פעולה זו אינה ניתנת לשחזור.
            </Text>
            <View style={s.modalBtnCol}>
              <TouchableOpacity style={[s.modalBtnPrimary, { backgroundColor: DS_COLORS.error }]} onPress={() => handleArchiveConfirm(true)} activeOpacity={0.8}>
                <Text style={s.modalBtnPrimaryText}>העבר לארכיון</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnGhost} onPress={() => handleArchiveConfirm(false)} activeOpacity={0.8}>
                <Text style={s.modalBtnGhostText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


    </ScreenContainer>
  );
}

// ============ Order Card ============
function OrderCard({
  item,
  isSelected,
  onToggle,
  onView,
  onDelete,
  onArchive,
}: {
  item: Order;
  isSelected: boolean;
  onToggle: () => void;
  onView: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isLocked = item.status === "needs_refresh_locked";

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onView}
        onPressIn={() =>
          Animated.timing(scaleAnim, {
            toValue: 0.97,
            duration: 80,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }).start()
        }
        activeOpacity={1}
        style={[
          s.orderCard,
          isSelected && s.orderCardSelected,
          isLocked && s.orderCardLocked,
        ]}
      >
        <View style={s.orderCardInner}>
          {/* Checkbox — first child = right side in RTL */}
          <TouchableOpacity
            onPress={onToggle}
            style={s.checkboxWrap}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
              {isSelected && (
                <MaterialIcons name="check" size={16} color={DS_COLORS.white} />
              )}
            </View>
          </TouchableOpacity>

          {/* Info — middle */}
          <View style={s.orderInfo}>
            <View style={s.orderNameRow}>
              <Text style={s.customerName}>{item.customerName}</Text>
              {isLocked && (
                <MaterialIcons name="lock" size={14} color={DS_COLORS.warning} style={{ marginLeft: 4 }} />
              )}
            </View>
            <View style={s.orderMeta}>
              <MaterialIcons name="event" size={14} color={DS_COLORS.textSecondary} />
              <Text style={s.orderDate}>{formatDate(item.eventDate)}</Text>
              <Text style={s.orderDot}>•</Text>
              <Text style={s.customerPrice}>₪{formatPrice(calcOrderCustomerTotal(item))}</Text>
            </View>
          </View>

          {/* Actions — last child = left side in RTL */}
          <View style={s.orderActions}>
            <TouchableOpacity
              onPress={onArchive}
              style={s.archiveBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="archive" size={18} color={DS_COLORS.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDelete}
              style={s.deleteBtn}
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

// ============ Archive Card ============
function ArchiveCard({
  item,
  onView,
  onUnarchive,
}: {
  item: Order;
  onView: () => void;
  onUnarchive: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  return (
    <View style={s.archiveCard}>
      <View style={s.archiveCardInner}>
        <View style={s.orderInfo}>
          <Text style={s.customerName}>{item.customerName}</Text>
          <View style={s.orderMeta}>
            <MaterialIcons name="event" size={14} color={DS_COLORS.textSecondary} />
            <Text style={s.orderDate}>{formatDate(item.eventDate)}</Text>
            <Text style={s.orderDot}>•</Text>
            <Text style={s.customerPrice}>₪{formatPrice(calcOrderCustomerTotal(item))}</Text>
          </View>
          {item.archivedAt && (
            <Text style={s.archivedAtText}>ארכוב: {formatDate(item.archivedAt)}</Text>
          )}
        </View>
        <View style={s.archiveActions}>
          <TouchableOpacity onPress={onView} style={s.archiveActionBtn} activeOpacity={0.7}>
            <MaterialIcons name="visibility" size={18} color={DS_COLORS.accent} />
            <Text style={s.archiveActionText}>פתח</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onUnarchive} style={s.archiveActionBtn} activeOpacity={0.7}>
            <MaterialIcons name="unarchive" size={18} color={DS_COLORS.accent} />
            <Text style={[s.archiveActionText, { color: DS_COLORS.accent }]}>החזר</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============ Main Orders Screen ============
export default function OrdersScreen() {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);
  const router = useRouter();

  // OneSignal in-app message trigger
  useEffect(() => { setOneSignalScreenTrigger("orders"); }, []);
  const params = useLocalSearchParams<{ fromShoppingList?: string }>();
  const {
    orders,
    products,
    deleteOrder,
    savedShoppingLists,
    unarchiveOrder,
    archiveOrder,
    deleteSavedShoppingList,
    updateOrder,
    refreshOrders,
    refreshShoppingLists,
  } = useData();
  const { guardMutation } = useMutationGuard();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  // Filter: active orders (open + needs_refresh_locked), archived separate
  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => o.status !== "archived")
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [orders]);

  const archivedOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === "archived")
      .sort((a, b) => {
        const aDate = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
        const bDate = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
        return bDate - aDate; // newest first
      });
  }, [orders]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleView = useCallback((order: Order) => {
    setViewingOrder(order);
  }, []);

  const handleEdit = useCallback(
    (order: Order) => {
      setViewingOrder(null);
      router.push({ pathname: "/order", params: { id: order.id } } as any);
    },
    [router]
  );

  const handleArchiveFromList = useCallback(
    (order: Order) => {
      const linkedLists = savedShoppingLists.filter(
        (sl) => sl.orderIds.includes(order.id) && sl.status !== "needs_refresh_locked"
      );
      if (linkedLists.length > 0) {
        Alert.alert(
          "העברה לארכיון",
          "להזמנה זו קיימת רשימת קניות מקושרת.\nהעברה לארכיון תמחק גם את רשימות הקניות הרלוונטיות.",
          [
            { text: "ביטול", style: "cancel" },
            {
              text: "העבר לארכיון",
              style: "destructive",
              onPress: async () => {
                const allowed = await guardMutation();
                if (!allowed) return;
                try {
                  for (const sl of linkedLists) {
                    await deleteSavedShoppingList(sl.id);
                  }
                  await archiveOrder(order.id);
                  Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
                } catch {
                  Alert.alert("שגיאה", "ההעברה לארכיון נכשלה.");
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "העברה לארכיון",
          `האם להעביר את ההזמנה של "${order.customerName}" לארכיון?`,
          [
            { text: "ביטול", style: "cancel" },
            {
              text: "העבר לארכיון",
              onPress: async () => {
                const allowed = await guardMutation();
                if (!allowed) return;
                try {
                  await archiveOrder(order.id);
                  Alert.alert("הצלחה", "ההזמנה הועברה לארכיון.");
                } catch {
                  Alert.alert("שגיאה", "ההעברה לארכיון נכשלה.");
                }
              },
            },
          ]
        );
      }
    },
    [savedShoppingLists, archiveOrder, deleteSavedShoppingList, guardMutation]
  );

  const handleDelete = useCallback(
    (order: Order) => {
      Alert.alert("מחיקת הזמנה", "האם אתה בטוח שברצונך למחוק?", [
        { text: "ביטול", style: "cancel" },
        {
          text: "מחיקה",
          style: "destructive",
          onPress: async () => {
            const allowed = await guardMutation();
            if (!allowed) return;
            try {
              await deleteOrder(order.id);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(order.id);
                return next;
              });
            } catch (e: any) {
              Alert.alert("שגיאה", e.message);
            }
          },
        },
      ]);
    },
    [deleteOrder, guardMutation]
  );

  const handleShoppingList = useCallback(() => {
    if (selectedIds.size === 0) {
      Alert.alert("שגיאה", "יש לבחור לפחות הזמנה אחת");
      return;
    }

    // Check: no locked or archived orders
    const selectedIdArr = Array.from(selectedIds);
    const lockedOrders = selectedIdArr.filter((id) => {
      const o = orders.find((ord) => ord.id === id);
      return o && o.status !== "open";
    });
    if (lockedOrders.length > 0) {
      Alert.alert("שגיאה", "לא ניתן ליצור רשימת קניות מהזמנות נעולות או בארכיון.");
      return;
    }

    const duplicateOrders: string[] = [];
    for (const orderId of selectedIdArr) {
      const existingList = savedShoppingLists.find(
        (sl) => sl.status !== "deleted" && sl.orderIds.includes(orderId)
      );
      if (existingList) {
        const order = orders.find((o) => o.id === orderId);
        duplicateOrders.push(order?.customerName || "הזמנה");
      }
    }

    const proceedToEdit = () => {
      const ids = selectedIdArr.join(",");
      router.push({ pathname: "/shopping-list-edit", params: { ids } } as any);
    };

    if (duplicateOrders.length > 0) {
      Alert.alert(
        "רשימת קניות כבר קיימת",
        "כבר נוצרה רשימת קניות מהזמנה זו. לא ניתן ליצור רשימה נוספת מאותה הזמנה.",
        [{ text: "הבנתי" }]
      );
      return;
    }

    proceedToEdit();
  }, [selectedIds, router, savedShoppingLists, orders]);

  const handleUnarchive = useCallback(async (order: Order) => {
    Alert.alert(
      "החזרת הזמנה לפעילה",
      "ההזמנה תועבר חזרה לסטטוס פעיל.\nשים לב: רשימות הקניות שנמחקו בעת הארכוב אינן משוחזרות — יש ליצור אותן מחדש אם נדרש.",
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "החזר לפעילה",
          onPress: async () => {
            const allowed = await guardMutation();
            if (!allowed) return;
            try {
              const result = await unarchiveOrder(order.id);
              await refreshOrders();

              // Check for product changes
              const analysis = analyzeOrderChanges(result, products);
              if (analysis.allChanges.length === 0) {
                Alert.alert("הצלחה", "ההזמנה הוחזרה לפעילה בהצלחה.");
              } else if (analysis.hasAnyIngredientChanges) {
                await updateOrder(result.id, { status: "needs_refresh_locked" });
                await refreshOrders();
                Alert.alert("הצלחה", "ההזמנה הוחזרה לפעילה ודורשת רענון עקב שינויים במוצרים.");
                // Open the order to trigger refresh dialog
                const freshOrder = orders.find((o) => o.id === result.id) ?? result;
                setShowArchive(false);
                setViewingOrder(freshOrder);
              } else {
                Alert.alert("הצלחה", "ההזמנה הוחזרה לפעילה. נמצאו שינויי מחיר/שם הדורשים טיפול.");
                const freshOrder = orders.find((o) => o.id === result.id) ?? result;
                setShowArchive(false);
                setViewingOrder(freshOrder);
              }
            } catch {
              Alert.alert("שגיאה", "הפעולה נכשלה. לא בוצעו שינויים. ההזמנה נשארת בארכיון.");
            }
          },
        },
      ]
    );
  }, [unarchiveOrder, updateOrder, refreshOrders, products, orders, guardMutation]);

  // If viewing an order detail
  if (viewingOrder) {
    const freshOrder = orders.find((o) => o.id === viewingOrder.id) ?? viewingOrder;
    return (
      <OrderDetailView
        order={freshOrder}
        products={products}
        onClose={() => setViewingOrder(null)}
        onEdit={() => handleEdit(freshOrder)}
        fromShoppingList={params.fromShoppingList === "true"}
      />
    );
  }

  // Archive screen
  if (showArchive) {
    return (
      <ScreenContainer
        edges={["top", "left", "right", "bottom"]}
        containerClassName="bg-background"
      >
        <View style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowArchive(false)} style={s.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>ארכיון הזמנות</Text>
            <View style={{ width: 40 }} />
          </View>

          {archivedOrders.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <MaterialIcons name="archive" size={40} color={DS_COLORS.accent} />
              </View>
              <Text style={s.emptyTitle}>אין הזמנות בארכיון</Text>
              <Text style={s.emptySubtitle}>הזמנות שתעביר לארכיון יופיעו כאן</Text>
            </View>
          ) : (
            <FlatList
              data={archivedOrders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.listContent}
              renderItem={({ item }) => (
                <ArchiveCard
                  item={item}
                  onView={() => handleView(item)}
                  onUnarchive={() => handleUnarchive(item)}
                />
              )}
            />
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => setShowArchive(true)}
            style={s.archiveHeaderBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="archive" size={16} color={DS_COLORS.accent} />
            <Text style={s.archiveHeaderBtnText}>ארכיון</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>רשימת הזמנות</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {activeOrders.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconCircle}>
              <MaterialIcons name="list-alt" size={40} color={DS_COLORS.accent} />
            </View>
            <Text style={s.emptyTitle}>אין הזמנות</Text>
            <Text style={s.emptySubtitle}>הזמנות שתיצור יופיעו כאן</Text>
          </View>
        ) : (
          <>
            {/* Selection Badge */}
            {selectedIds.size > 0 && (
              <View style={s.selectionBadge}>
                <MaterialIcons name="check-circle" size={16} color={DS_COLORS.accent} />
                <Text style={s.selectionText}>
                  {selectedIds.size} הזמנות נבחרו
                </Text>
              </View>
            )}

            <FlatList
              data={activeOrders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.listContent}
              renderItem={({ item }) => (
                <OrderCard
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  onToggle={() => toggleSelection(item.id)}
                  onView={() => handleView(item)}
                  onDelete={() => handleDelete(item)}
                  onArchive={() => handleArchiveFromList(item)}
                />
              )}
            />
          </>
        )}

        {/* Shopping List Button */}
        {activeOrders.length > 0 && (
          <View style={s.bottomBar}>
            <TouchableOpacity
              onPress={handleShoppingList}
              style={s.shoppingBtn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="shopping-cart" size={22} color={DS_COLORS.white} />
              <Text style={s.shoppingBtnText}>צור רשימת קניות</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

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
  editHeaderBtn: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  editHeaderBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
  archiveHeaderBtn: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: DS_SPACING.sm + 2,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accentLight,
  },
  archiveHeaderBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.accent,
  },

  // ── Banners ──
  lockedBanner: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    marginHorizontal: DS_SPACING.lg,
    marginBottom: DS_SPACING.xs,
    paddingVertical: DS_SPACING.sm + 2,
    paddingHorizontal: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.warningBg,
    borderWidth: 1,
    borderColor: DS_COLORS.warning,
  },
  lockedBannerText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.warningText,
  },
  archivedBanner: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    marginHorizontal: DS_SPACING.lg,
    marginBottom: DS_SPACING.xs,
    paddingVertical: DS_SPACING.sm + 2,
    paddingHorizontal: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  archivedBannerText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textSecondary,
  },

  // ── Empty State ──
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

  // ── Selection Badge ──
  selectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.xs,
    alignSelf: "flex-start",
    direction: "rtl" as const,
    marginHorizontal: DS_SPACING.xl,
    marginTop: DS_SPACING.sm,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.full,
    backgroundColor: DS_COLORS.accentLight,
  },
  selectionText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },

  // ── List ──
  listContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.md,
    paddingBottom: 100,
  },

  // ── Order Card ──
  orderCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    ...DS_SHADOW.card,
  },
  orderCardSelected: {
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    backgroundColor: DS_COLORS.accentLight,
  },
  orderCardLocked: {
    borderWidth: 1.5,
    borderColor: DS_COLORS.warning,
    backgroundColor: DS_COLORS.warningBg,
  },
  orderCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.md,
    direction: "rtl" as const,
  },
  checkboxWrap: {
    padding: DS_SPACING.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: DS_RADIUS.sm,
    borderWidth: 2,
    borderColor: DS_COLORS.textSecondary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.inputBg,
  },
  checkboxChecked: {
    borderColor: DS_COLORS.accent,
    backgroundColor: DS_COLORS.accent,
  },
  orderInfo: {
    flex: 1,
    alignItems: "flex-start",
    gap: 4,
  },
  orderNameRow: {
    flexDirection: "row",
    alignItems: "center",
    direction: "rtl" as const,
  },
  customerName: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  orderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    direction: "rtl" as const,
  },
  orderDate: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  orderDot: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  customerPrice: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold as any,
  },
  orderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    direction: "rtl" as const,
  },
  archiveBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: DS_COLORS.accentLight,
    marginLeft: 4,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.08)",
  },

  // ── Archive Card ──
  archiveCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    ...DS_SHADOW.card,
  },
  archiveCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.md,
    direction: "rtl" as const,
  },
  archiveActions: {
    flexDirection: "column",
    gap: DS_SPACING.sm,
  },
  archiveActionBtn: {
    flexDirection: "row",
    direction: "rtl" as const,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  archiveActionText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
  archivedAtText: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
  },

  // ── Bottom Bar ──
  bottomBar: {
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    backgroundColor: DS_COLORS.background,
    borderTopWidth: 1,
    borderTopColor: DS_COLORS.border,
  },
  shoppingBtn: {
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
  shoppingBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
  },

  // ── Order Detail View ──
  detailContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  purpleBanner: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.lg,
    marginHorizontal: DS_SPACING.lg,
    marginTop: DS_SPACING.xs,
    marginBottom: DS_SPACING.xs,
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.lg,
    alignItems: "center" as const,
    gap: 4,
  },
  purpleBannerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: "#FFFFFF",
    textAlign: "right" as const,
  },
  purpleBannerDateRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.xs,
  },
  purpleBannerDate: {
    fontSize: DS_FONT.caption,
    color: "rgba(255,255,255,0.85)",
    fontWeight: DS_WEIGHT.medium,
  },

  // ── 3-Tab Price Display ──
  tabContainerSticky: {
    marginHorizontal: DS_SPACING.lg,
    marginTop: DS_SPACING.xs,
    marginBottom: DS_SPACING.xs,
    borderRadius: DS_RADIUS.lg,
    backgroundColor: DS_COLORS.inputBg,
    ...DS_SHADOW.card,
    overflow: "hidden" as const,
  },
  tabRow: {
    flexDirection: "row" as const,
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
    direction: "rtl" as const,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: DS_SPACING.sm + 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: DS_COLORS.inputBg,
  },
  tabBtnActive: {
    backgroundColor: DS_COLORS.accent,
  },
  tabBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textSecondary,
  },
  tabBtnTextActive: {
    color: DS_COLORS.white,
  },
  tabContent: {
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
  },
  tabContentRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
  },
  tabContentCell: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: DS_SPACING.md,
  },
  tabValueRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-start" as const,
    direction: "rtl" as const,
    gap: DS_SPACING.sm,
  },
  tabValueLabel: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium as any,
    color: DS_COLORS.textPrimary,
  },
  tabValueAmount: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.accent,
  },

  // ── Detail Product Cards ──
  detailProductCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.xs,
    direction: "rtl" as const,
    ...DS_SHADOW.card,
  },
  detailProductTitleRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
  },
  detailProductTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
    flex: 1,
  },
  detailProductCalc: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    writingDirection: "ltr" as const,
    textAlign: "left" as const,
  },
  changeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: DS_COLORS.warningBg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  // ── Customer Details in Order Detail ──
  detailCustomerCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.sm,
  },
  detailCustomerRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.xs,
  },
  detailCustomerLabel: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textPrimary,
  },
  detailCustomerInfoRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
    paddingRight: DS_SPACING.md,
  },
  detailCustomerInfoText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right" as const,
  },

  // ── Notes in Order Detail ──
  detailNotesCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xl,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    gap: DS_SPACING.xs,
    marginTop: DS_SPACING.sm,
  },
  detailNotesText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right" as const,
    lineHeight: 22,
  },

  // ── Print Section ──
  printSection: {
    marginTop: DS_SPACING.lg,
    gap: DS_SPACING.md,
    direction: "rtl" as const,
  },
  printSectionTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold as any,
    color: DS_COLORS.textPrimary,
  },
  printBtnRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    gap: DS_SPACING.md,
  },
  printBtn: {
    flex: 1,
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    ...DS_SHADOW.button,
  },
  printBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.white,
  },
  whatsappBtnRow: {
    flexDirection: "row" as const,
    direction: "rtl" as const,
    gap: DS_SPACING.md,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: "row" as const,
    direction: "rtl" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    ...DS_SHADOW.button,
  },
  whatsappBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.white,
  },

  // ── Modal Dialogs ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: DS_SPACING.xl,
  },
  modalCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.xl,
    padding: DS_SPACING.xxl,
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    direction: "rtl" as const,
    ...DS_SHADOW.card,
  },
  modalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md,
  },
  modalBody: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: DS_SPACING.md,
  },
  modalBtnCol: {
    gap: DS_SPACING.sm,
    marginTop: DS_SPACING.md,
  },
  modalBtnPrimary: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md + 2,
    alignItems: "center" as const,
    ...DS_SHADOW.button,
  },
  modalBtnPrimaryText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  modalBtnOutline: {
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md + 2,
    alignItems: "center" as const,
  },
  modalBtnOutlineText: {
    color: DS_COLORS.accent,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  modalBtnGhost: {
    paddingVertical: DS_SPACING.md,
    alignItems: "center" as const,
  },
  modalBtnGhostText: {
    color: DS_COLORS.textSecondary,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
  },

  // ── Change Details in Dialogs ──
  changesList: {
    gap: DS_SPACING.md,
    marginBottom: DS_SPACING.sm,
  },
  changeItem: {
    gap: 2,
  },
  changeProductName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right" as const,
  },
  changeDiffText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right" as const,
    lineHeight: 20,
  },
  showMoreText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.accent,
    fontWeight: DS_WEIGHT.semibold,
    textAlign: "right" as const,
    marginTop: DS_SPACING.xs,
  },
}); }
