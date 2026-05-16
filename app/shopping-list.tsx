import React, { useMemo } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Share } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import {
  generateShoppingList,
  formatShoppingListText } from "@/lib/shopping-list";
import type { ShoppingListItem } from "@/lib/types";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import { useThemeContext } from "@/lib/theme-provider";

function ItemRow({
  item,
  isLast }: {
  item: ShoppingListItem;
  isLast: boolean;
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  return (
    <View style={[s.ingredientRow, !isLast && s.ingredientRowBorder]}>
      <Text style={s.ingredientName}>{item.name}</Text>
      {item.quantity > 0 && item.unit ? (
        <View style={s.qtyBadge}>
          <Text style={s.qtyText}>
            {item.quantity} {item.unit}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SectionCard({
  emoji,
  title,
  items }: {
  emoji: string;
  title: string;
  items: ShoppingListItem[];
}) {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  if (items.length === 0) return null;
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHeader}>
        <View style={s.sectionIconWrap}>
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {items.map((item, index) => (
        <ItemRow
          key={`${item.name}-${item.unit}-${index}`}
          item={item}
          isLast={index === items.length - 1}
        />
      ))}
    </View>
  );
}

export default function ShoppingListScreen() {
  const { colorScheme } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);

  const router = useRouter();
  const params = useLocalSearchParams<{ ids: string }>();
  const { orders, products } = useData();

  const selectedOrders = useMemo(() => {
    const idSet = new Set((params.ids ?? "").split(",").filter(Boolean));
    return orders.filter((o) => idSet.has(o.id));
  }, [params.ids, orders]);

  const shoppingList = useMemo(
    () => generateShoppingList(selectedOrders, products),
    [selectedOrders, products]
  );

  const formattedText = useMemo(
    () => formatShoppingListText(shoppingList),
    [shoppingList]
  );

  const handleShareWhatsApp = async () => {
    try {
      const encodedText = encodeURIComponent(formattedText);
      const whatsappUrl = `whatsapp://send?text=${encodedText}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({ message: formattedText });
      }
    } catch {
      try {
        await Share.share({ message: formattedText });
      } catch {
        Alert.alert("Error", "Unable to share right now");
      }
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: formattedText });
    } catch {
      Alert.alert("Error", "Unable to share right now");
    }
  };

  const hasContent =
    shoppingList.baseIngredients.length > 0 ||
    shoppingList.spices.length > 0 ||
    shoppingList.categories.length > 0;

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>Shopping list</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
        >
          {/* Order count badge */}
          <View style={s.badge}>
            <MaterialIcons name="receipt-long" size={16} color={DS_COLORS.accent} />
            <Text style={s.badgeText}>
              {shoppingList.orderCount} Orders
            </Text>
          </View>

          {/* Base Ingredients */}
          <SectionCard
            emoji="🛒"
            title="Base ingredients"
            items={shoppingList.baseIngredients}
          />

          {/* Spices */}
          <SectionCard
            emoji="🧂"
            title="Spices"
            items={shoppingList.spices}
          />

          {/* Dynamic Categories */}
          {shoppingList.categories.map((cat) => (
            <SectionCard
              key={cat.categoryName}
              emoji="📦"
              title={cat.categoryName}
              items={cat.items}
            />
          ))}

          {!hasContent && (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <MaterialIcons name="shopping-cart" size={40} color={DS_COLORS.accent} />
              </View>
              <Text style={s.emptyTitle}>The shopping list is empty</Text>
            </View>
          )}
        </ScrollView>

        {/* Share Buttons */}
        {hasContent && (
          <View style={s.bottomBar}>
            <TouchableOpacity
              onPress={handleShareWhatsApp}
              style={s.whatsappBtn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="send" size={20} color={DS_COLORS.white} />
              <Text style={s.whatsappBtnText}>Share via WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={s.shareBtn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="share" size={20} color={DS_COLORS.accent} />
              <Text style={s.shareBtnText}>Share</Text>
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
    textAlign: "right",
  },
  scrollContent: {
    padding: DS_SPACING.xl,
    gap: DS_SPACING.lg,
  },
  badge: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: DS_SPACING.xs,
    alignSelf: "flex-end",
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    borderRadius: DS_RADIUS.full,
    backgroundColor: DS_COLORS.accentLight,
  },
  badgeText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
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
    textAlign: "right",
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    writingDirection: "rtl" as const,
    paddingVertical: DS_SPACING.md,
  },
  ingredientRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DS_COLORS.border,
  },
  ingredientName: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.lg,
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
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
    backgroundColor: "#25D366",
    gap: DS_SPACING.sm,
    ...DS_SHADOW.button,
  },
  whatsappBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
  },
  shareBtn: {
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.accent,
    gap: DS_SPACING.sm,
  },
  shareBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.accent,
  },
}); }
