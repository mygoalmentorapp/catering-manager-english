import React, { useMemo, useCallback, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  Share } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import type { ShoppingListIngredientRow, UnitDef } from "@/lib/types";
import { getLockedOrdersForList, shouldLockShoppingList } from "@/lib/order-logic";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import { imageUriToBase64, getDefaultLogoBase64 } from "@/lib/image-to-base64";
import { useThemeContext } from "@/lib/theme-provider";

// ============ Get plural unit ============
function getPluralUnit(unit: string, qty: number, units: UnitDef[]): string {
  if (!unit) return unit;
  // Find matching unit definition (check both singular and plural)
  const match = units.find((u) => u.singular === unit || u.plural === unit);
  if (!match) return unit;
  return qty > 1 ? match.plural : match.singular;
}

// ============ Smart decimal formatting ============
function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(1);
  if (fixed.endsWith(".0")) return String(Math.round(value));
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

// ============ Group rows by category ============
interface GroupedSection {
  category: string;
  label: string;
  emoji: string;
  rows: ShoppingListIngredientRow[];
}

function groupByCategory(rows: ShoppingListIngredientRow[]): GroupedSection[] {
  const map = new Map<string, ShoppingListIngredientRow[]>();
  for (const row of rows) {
    const cat = row.category || "other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(row);
  }

  const groups: GroupedSection[] = [];
  const categoryLabels: Record<string, { label: string; emoji: string }> = {
    base: { label: "Base ingredients", emoji: "🛒" },
    spice: { label: "Spices", emoji: "🧂" },
    manual: { label: "Additional items", emoji: "📝" } };

  const order = ["base", "spice"];
  const dynamicCats = [...map.keys()].filter((k) => !["base", "spice", "manual"].includes(k));
  const finalOrder = [...order.filter((k) => map.has(k)), ...dynamicCats, ...(map.has("manual") ? ["manual"] : [])];

  for (const cat of finalOrder) {
    const catRows = map.get(cat);
    if (!catRows || catRows.length === 0) continue;
    const info = categoryLabels[cat] || { label: cat, emoji: "📦" };
    groups.push({ category: cat, label: info.label, emoji: info.emoji, rows: catRows });
  }

  return groups;
}

// ============ Diff calculation ============
function calcDiffs(rows: ShoppingListIngredientRow[]): { name: string; unit: string; diff: number }[] {
  const result: { name: string; unit: string; diff: number }[] = [];
  for (const row of rows) {
    if (row.manualDelta !== 0) {
      result.push({
        name: row.name,
        unit: row.unit,
        diff: Math.round(row.manualDelta * 10) / 10 });
    }
  }
  return result;
}

// ============ Generate print HTML ============
function generateShoppingListHtml(
  rows: ShoppingListIngredientRow[],
  orderNames: string[],
  businessName: string,
  logoBase64: string,
  diffs: { name: string; unit: string; diff: number }[],
  unitDefs: UnitDef[],
  linkedOrders: { customerName: string; eventDate: string }[]
): string {
  const groups = groupByCategory(rows);

  let itemsHtml = "";
  for (const group of groups) {
    itemsHtml += `<div class="section-title">${group.emoji} ${group.label}</div>`;
    for (const row of group.rows) {
      const qtyStr = row.finalQty > 0 ? `<span class="item-qty">${formatQty(row.finalQty)} ${getPluralUnit(row.unit, row.finalQty, unitDefs)}</span>` : "";
      itemsHtml += `<div class="item-row"><span class="item-name">${row.name}</span>${qtyStr}</div>`;
    }
  }

  let diffHtml = "";
  if (diffs.length > 0) {
    diffHtml = `<div class="diff-section">
      <div class="diff-divider"></div>
      <div class="diff-title">Changes from the original list</div>`;
    for (const d of diffs) {
      const sign = d.diff > 0 ? "+" : "";
      const color = d.diff > 0 ? "#22C55E" : "#EF4444";
      diffHtml += `<div class="diff-row"><span class="diff-name">${d.name}</span><span class="diff-value" style="color:${color}">${sign}${formatQty(d.diff)} ${getPluralUnit(d.unit, Math.abs(d.diff), unitDefs)}</span></div>`;
    }
    diffHtml += `</div>`;
  }

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" class="logo" />`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; direction: ltr; padding: 20px 30px; color: #1E1E2E; }
  .header { text-align: center; margin-bottom: 16px; }
  .logo { width: 50px; height: 50px; border-radius: 50%; margin-bottom: 6px; }
  .biz-name { font-size: 18px; font-weight: bold; margin-bottom: 2px; }
  .doc-title { font-size: 15px; color: #3AAFA9; margin-bottom: 2px; }
  .orders-label { font-size: 12px; color: #7A7A90; }
  .items-content {
    column-count: 2;
    column-gap: 24px;
    column-rule: 1.5px solid #D0D0E0;
    column-fill: balance;
  }
  .section-title {
    font-size: 14px;
    font-weight: bold;
    margin-top: 12px;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #E8E8F0;
    break-inside: avoid;
    break-after: avoid;
  }
  .item-row {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 12px;
    padding: 4px 0;
    border-bottom: 0.5px solid #F0F0F4;
    font-size: 13px;
    break-inside: avoid;
  }
  .item-name { text-align: right; }
  .item-qty { color: #3AAFA9; font-weight: 600; white-space: nowrap; }
  .diff-section { margin-top: 24px; padding-top: 16px; break-inside: avoid; }
  .diff-divider { height: 2px; background: #1E1E2E; opacity: 0.25; margin-bottom: 12px; }
  .diff-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
  .diff-row {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 12px;
    padding: 3px 0;
    font-size: 13px;
  }
  .diff-name { text-align: right; }
  .diff-value { font-weight: bold; white-space: nowrap; }
  @media print {
    body { padding: 12px 20px; }
  }
</style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div class="biz-name">${businessName}</div>
    <div class="doc-title">Shopping list</div>
    <div class="orders-label">${linkedOrders.length > 0
      ? linkedOrders.map(o => `\u{1F4C5} ${o.customerName} \u2014 ${formatDate(o.eventDate)}`).join('<br/>')
      : orderNames.join(", ")}</div>
  </div>
  <div class="items-content">
    ${itemsHtml}
  </div>
  ${diffHtml}
</body>
</html>`;
}

// ============ Main View Screen ============
export default function ShoppingListViewScreen() {
  const { colorScheme } = useThemeContext();
  const vs = React.useMemo(() => _make_vs(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const params = useLocalSearchParams<{ listId: string }>();
  const { savedShoppingLists, businessName, businessLogo, orders, units } = useData();
  const [printing, setPrinting] = useState(false);

  const list = useMemo(() => {
    return savedShoppingLists.find((l) => l.id === params.listId) || null;
  }, [params.listId, savedShoppingLists]);

  const groups = useMemo(() => {
    if (!list) return [];
    return groupByCategory(list.rows);
  }, [list]);

  const diffs = useMemo(() => {
    if (!list) return [];
    return calcDiffs(list.rows);
  }, [list]);

  // Get linked orders with event dates
  const linkedOrders = useMemo(() => {
    if (!list) return [];
    return orders
      .filter((o) => list.orderIds.includes(o.id))
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [list, orders]);

  const isDirectlyLocked = list?.status === "needs_refresh_locked";
  const hasLockedLinkedOrder = list ? shouldLockShoppingList(list, orders) : false;
  const isLocked = isDirectlyLocked || hasLockedLinkedOrder;

  const lockedOrders = useMemo(() => {
    if (!list) return [];
    return getLockedOrdersForList(list, orders);
  }, [list, orders]);

  const handleEdit = useCallback(() => {
    if (!list) return;
    if (isLocked) {
      if (lockedOrders.length > 0) {
        // Navigate to changes-review for the first locked order
        router.push({
          pathname: "/changes-review",
          params: { orderId: lockedOrders[0].id, fromShoppingList: "1" } } as any);
      } else {
        Alert.alert("Locked list", "Please refresh the locked orders first.");
      }
      return;
    }
    router.push({ pathname: "/shopping-list-edit", params: { listId: list.id } } as any);
  }, [list, isLocked, lockedOrders, router]);

  // ── Build plain text for sharing ──
  const shareText = useMemo(() => {
    if (!list) return "";
    const groups2 = groupByCategory(list.rows);
    let text = `\u{1F6D2} Shopping List\n`;
    if (linkedOrders.length > 0) {
      for (const order of linkedOrders) {
        text += `\u{1F4C5} ${order.customerName} — ${formatDate(order.eventDate)}\n`;
      }
    } else {
      text += `${list.orderNames.join(", ")}\n`;
    }
    text += `${"-".repeat(20)}\n`;
    for (const g of groups2) {
      text += `\n${g.emoji} ${g.label}:\n`;
      for (const row of g.rows) {
        const qty = row.finalQty > 0 ? ` — ${formatQty(row.finalQty)} ${getPluralUnit(row.unit, row.finalQty, units)}` : "";
        text += `• ${row.name}${qty}\n`;
      }
    }
    if (diffs.length > 0) {
      text += `\n${"-".repeat(20)}\n`;
      text += `\u{1F504} Changes:\n`;
      for (const d of diffs) {
        const sign = d.diff > 0 ? "+" : "-";
        text += `${d.name}: ${sign}${formatQty(Math.abs(d.diff))} ${getPluralUnit(d.unit, Math.abs(d.diff), units)}\n`;
      }
    }
    return text;
  }, [list, linkedOrders, diffs, units]);

  const handleShareWhatsApp = useCallback(async () => {
    try {
      const encoded = encodeURIComponent(shareText);
      const url = `whatsapp://send?text=${encoded}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: shareText });
      }
    } catch {
      try {
        await Share.share({ message: shareText });
      } catch {
        Alert.alert("Error", "Unable to share right now");
      }
    }
  }, [shareText]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: shareText });
    } catch {
      Alert.alert("Error", "Unable to share right now");
    }
  }, [shareText]);

  const handlePrint = useCallback(async () => {
    if (!list) return;
    setPrinting(true);
    try {
      let logoBase64 = "";
      if (businessLogo) {
        logoBase64 = await imageUriToBase64(businessLogo);
      } else {
        logoBase64 = await getDefaultLogoBase64();
      }

      const displayName = businessName.trim() || "Your business name";
      const html = generateShoppingListHtml(
        list.rows,
        list.orderNames,
        displayName,
        logoBase64,
        diffs,
        units,
        linkedOrders
      );

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
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "shopping_list",
            UTI: "com.adobe.pdf" });
        } else {
          await Print.printAsync({ html });
        }
      }
    } catch (e: any) {
      Alert.alert("Error", "Unable to print: " + (e.message || ""));
    } finally {
      setPrinting(false);
    }
  }, [list, businessName, businessLogo, diffs]);

  if (!list) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
        <View style={vs.container}>
          <View style={vs.header}>
            <View style={{ width: 40 }} />
            <Text style={vs.headerTitle}>Shopping list</Text>
            <TouchableOpacity onPress={() => router.back()} style={vs.headerBtn} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={vs.emptyState}>
            <Text style={vs.emptyTitle}>List not found</Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={vs.container}>
        {/* Header */}
        <View style={vs.header}>
          {!isLocked ? (
            <TouchableOpacity onPress={handleEdit} style={vs.editBtn} activeOpacity={0.7}>
              <MaterialIcons name="edit" size={18} color={DS_COLORS.accent} />
              <Text style={vs.editBtnText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
          <Text style={vs.headerTitle}>Shopping list</Text>
          <TouchableOpacity onPress={() => router.back()} style={vs.headerBtn} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Purple Banner: Event names with dates */}
        <View style={vs.purpleBanner}>
          {linkedOrders.length > 0 ? (
            <View style={vs.eventsList}>
              {linkedOrders.map((order) => (
                <View key={order.id} style={vs.eventRow}>
                  <MaterialIcons name="event" size={18} color="rgba(255,255,255,0.9)" />
                  <Text style={vs.eventName} numberOfLines={1}>{order.customerName}</Text>
                  <Text style={vs.eventDate}>{formatDate(order.eventDate)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={vs.purpleBannerTitle}>{list.orderNames.join(", ")}</Text>
          )}
        </View>

        {/* Locked Banner */}
        {isLocked && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (lockedOrders.length > 0) {
                router.push({ pathname: "/changes-review", params: { orderId: lockedOrders[0].id, fromShoppingList: "1" } } as any);
              }
            }}
            style={vs.lockedBanner}
          >
            <View style={vs.lockedBannerRow}>
              <MaterialIcons name="lock" size={18} color={DS_COLORS.warning} />
              <Text style={vs.lockedBannerText}>
                The shopping list is not updated
              </Text>
            </View>
            <Text style={vs.lockedBannerSub}>
              There are changes in the linked order — tap to view and update
            </Text>
            {lockedOrders.length > 0 && (
              <View style={vs.lockedOrdersList}>
                {lockedOrders.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => router.push({ pathname: "/changes-review", params: { orderId: o.id, fromShoppingList: "1" } } as any)}
                    style={vs.lockedOrderBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={vs.lockedOrderName}>{o.customerName}</Text>
                    <MaterialIcons name="chevron-left" size={16} color={DS_COLORS.warning} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={vs.scrollContent}>
          {groups.map((group) => (
            <View key={group.category} style={vs.sectionCard}>
              <View style={vs.sectionHeader}>
                <View style={vs.sectionIconWrap}>
                  <Text style={{ fontSize: 18 }}>{group.emoji}</Text>
                </View>
                <Text style={vs.sectionTitle}>{group.label}</Text>
              </View>
              {group.rows.map((row, i) => (
                <View
                  key={row.ingredientId + i}
                  style={[vs.itemRow, i < group.rows.length - 1 && vs.itemRowBorder]}
                >
                  <Text style={vs.itemName}>{row.name}</Text>
                  {row.finalQty > 0 ? (
                    <View style={vs.qtyBadge}>
                      <Text style={vs.qtyText}>
                        {formatQty(row.finalQty)} {getPluralUnit(row.unit, row.finalQty, units)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

          {/* Changes summary */}
          {diffs.length > 0 && (
            <View style={vs.diffCard}>
              <View style={vs.diffDivider} />
              <Text style={vs.diffTitle}>Changes from the original list</Text>
              {diffs.map((d, i) => (
                <View key={`diff-${i}`} style={vs.diffRow}>
                  <Text style={vs.diffName}>{d.name}</Text>
                  <Text
                    style={[
                      vs.diffValue,
                      d.diff > 0 ? { color: DS_COLORS.success } : { color: DS_COLORS.error },
                    ]}
                  >
                    {d.diff > 0 ? "+" : ""}
                    {formatQty(d.diff)} {getPluralUnit(d.unit, Math.abs(d.diff), units)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom action buttons */}
        <View style={vs.bottomBar}>
          <TouchableOpacity
            onPress={handleShareWhatsApp}
            style={vs.whatsappBtn}
            activeOpacity={0.8}
          >
            <MaterialIcons name="send" size={20} color={DS_COLORS.white} />
            <Text style={vs.whatsappBtnText}>Share via WhatsApp</Text>
          </TouchableOpacity>
          <View style={vs.bottomRow}>
            <TouchableOpacity
              onPress={handleShare}
              style={vs.shareBtn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="share" size={18} color={DS_COLORS.white} />
              <Text style={vs.shareBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePrint}
              style={vs.printBtnSmall}
              activeOpacity={0.8}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color={DS_COLORS.white} size="small" />
              ) : (
                <>
                  <MaterialIcons name="picture-as-pdf" size={18} color={DS_COLORS.white} />
                  <Text style={vs.printBtnSmallText}>Save PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

function _make_vs() { return StyleSheet.create({
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
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  editBtn: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
  },
  editBtnText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
  purpleBanner: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.lg,
    marginHorizontal: DS_SPACING.lg,
    marginTop: DS_SPACING.xs,
    marginBottom: DS_SPACING.sm,
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
    writingDirection: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.xs,
  },
  purpleBannerDate: {
    fontSize: DS_FONT.caption,
    color: "rgba(255,255,255,0.85)",
    fontWeight: DS_WEIGHT.medium,
  },
  eventsList: {
    width: "100%",
    gap: 8,
    alignItems: "center" as const,
  },
  eventRow: {
    flexDirection: "row" as const,
    writingDirection: "rtl" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: DS_SPACING.sm,
  },
  eventName: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold as any,
    color: "#FFFFFF",
    textAlign: "center" as const,
  },
  eventDate: {
    fontSize: DS_FONT.body,
    color: "rgba(255,255,255,0.9)",
    fontWeight: DS_WEIGHT.semibold as any,
  },
  scrollContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  sectionCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.md,
    ...DS_SHADOW.card,
  },
  sectionHeader: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.xs,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: DS_RADIUS.sm,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    writingDirection: "rtl" as const,
    paddingVertical: DS_SPACING.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  itemName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
    flex: 1,
  },
  qtyBadge: {
    backgroundColor: DS_COLORS.accentLight,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs,
    borderRadius: DS_RADIUS.sm,
  },
  qtyText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.accent,
  },
  diffCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    gap: DS_SPACING.sm,
    ...DS_SHADOW.card,
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
    alignItems: "center",
    justifyContent: "space-between",
    writingDirection: "rtl" as const,
    paddingVertical: DS_SPACING.xs + 2,
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
    gap: DS_SPACING.sm,
  },
  whatsappBtn: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.lg,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    gap: DS_SPACING.sm,
    ...DS_SHADOW.button,
  },
  whatsappBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
  },
  bottomRow: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    gap: DS_SPACING.sm,
  },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    gap: DS_SPACING.xs,
    ...DS_SHADOW.button,
  },
  shareBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.white,
  },
  printBtnSmall: {
    flex: 1,
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accent,
    gap: DS_SPACING.xs,
    ...DS_SHADOW.button,
  },
  printBtnSmallText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  lockedBanner: {
    backgroundColor: DS_COLORS.warningBg,
    borderRadius: DS_RADIUS.md,
    marginHorizontal: DS_SPACING.lg,
    marginBottom: DS_SPACING.sm,
    padding: DS_SPACING.md,
    gap: DS_SPACING.sm,
  },
  lockedBannerRow: {
    flexDirection: "row" as const,
    writingDirection: "rtl" as const,
    alignItems: "center" as const,
    gap: DS_SPACING.sm,
  },
  lockedBannerText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.warningText,
    flex: 1,
    textAlign: "right" as const,
  },
  lockedBannerSub: {
    fontSize: 12,
    color: DS_COLORS.warningText,
    textAlign: "right" as const,
    writingDirection: "rtl" as const,
    marginTop: 2,
  },
  lockedOrdersList: {
    gap: DS_SPACING.xs,
    marginTop: DS_SPACING.xs,
  },
  lockedOrderBtn: {
    flexDirection: "row" as const,
    writingDirection: "rtl" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: DS_SPACING.xs + 2,
    paddingHorizontal: DS_SPACING.sm,
    backgroundColor: DS_COLORS.warningBg,
    borderRadius: DS_RADIUS.sm,
  },
  lockedOrderName: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.medium as any,
    color: DS_COLORS.warningText,
    textAlign: "right" as const,
  },
}); }
