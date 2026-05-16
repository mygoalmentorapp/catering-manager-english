import React from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============ DARK PREMIUM PALETTE ============
const DK = {
  bg: "#0A0A0F",
  bgCard: "rgba(255,255,255,0.06)",
  bgCardHover: "rgba(255,255,255,0.10)",
  surface: "#12121A",
  surfaceLight: "#1A1A25",
  accent: "#00D4AA",
  accentSoft: "rgba(0,212,170,0.12)",
  accentGlow: "rgba(0,212,170,0.25)",
  purple: "#8B5CF6",
  purpleSoft: "rgba(139,92,246,0.12)",
  blue: "#3B82F6",
  blueSoft: "rgba(59,130,246,0.12)",
  orange: "#F59E0B",
  orangeSoft: "rgba(245,158,11,0.12)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.55)",
  textTertiary: "rgba(255,255,255,0.35)",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.04)",
  error: "#EF4444",
  success: "#22C55E",
  white: "#FFFFFF" } as const;

// ============ MOCK DATA ============
const MOCK_ORDER = {
  customerName: "John Smith",
  customerPhone: "054-1234567",
  customerAddress: "42 Main St, New York",
  eventDate: "2026-05-20",
  notes: "No peanuts, allergy. Arrive one hour early.",
  products: [
    { name: "Premium sushi platter", quantity: 3, price: 280 },
    { name: "Tropical fruit platter", quantity: 2, price: 180 },
    { name: "Sandwich platter", quantity: 4, price: 120 },
    { name: "Belgian chocolate cake", quantity: 1, price: 350 },
  ] };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ============ Glass Card Component ============
function GlassCard({
  children,
  style,
  noPadding }: {
  children: React.ReactNode;
  style?: any;
  noPadding?: boolean;
}) {
  const cardContent = (
    <View style={[s.glassCard, noPadding && { padding: 0 }, style]}>
      {children}
    </View>
  );

  if (Platform.OS !== "web") {
    return (
      <BlurView
        intensity={20}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={[s.glassCardOuter, style]}
      >
        <View style={[s.glassCard, noPadding && { padding: 0 }]}>
          {children}
        </View>
      </BlurView>
    );
  }

  return cardContent;
}

// ============ Info Row ============
function InfoRow({
  icon,
  label,
  value,
  iconColor,
  iconBg }: {
  icon: string;
  label: string;
  value: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <View style={s.infoRow}>
      <View style={[s.infoIconWrap, { backgroundColor: iconBg || DK.accentSoft }]}>
        <MaterialIcons
          name={icon as any}
          size={18}
          color={iconColor || DK.accent}
        />
      </View>
      <View style={s.infoContent}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// ============ Product Row ============
function ProductRow({
  item,
  index,
  isLast }: {
  item: (typeof MOCK_ORDER.products)[0];
  index: number;
  isLast: boolean;
}) {
  const total = item.quantity * item.price;
  return (
    <View style={[s.productRow, !isLast && s.productRowBorder]}>
      <View style={s.productIndex}>
        <Text style={s.productIndexText}>{index + 1}</Text>
      </View>
      <View style={s.productInfo}>
        <Text style={s.productName}>{item.name}</Text>
        <Text style={s.productMeta}>
          {item.quantity} × ${item.price}
        </Text>
      </View>
      <Text style={s.productTotal}>${total.toLocaleString()}</Text>
    </View>
  );
}

// ============ MAIN SCREEN ============
export default function DemoOrderDetailScreen() {
  const router = useRouter();

  const totalPrice = MOCK_ORDER.products.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0
  );

  return (
    <View style={s.root}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#0F1923", "#0A0A0F", "#0A0A0F"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      {/* Accent glow at top */}
      <View style={s.glowOrb} />

      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DK.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Order details</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Customer Hero Card */}
          <GlassCard>
            <View style={s.heroTop}>
              <View style={s.avatarWrap}>
                <LinearGradient
                  colors={[DK.accent, DK.purple]}
                  style={s.avatarGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={s.avatarText}>
                    {MOCK_ORDER.customerName.charAt(0)}
                  </Text>
                </LinearGradient>
              </View>
              <Text style={s.heroName}>{MOCK_ORDER.customerName}</Text>
              <View style={s.dateBadge}>
                <MaterialIcons name="event" size={14} color={DK.accent} />
                <Text style={s.dateBadgeText}>
                  {formatDate(MOCK_ORDER.eventDate)}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Contact Info */}
          <GlassCard>
            <Text style={s.sectionTitle}>Customer details</Text>
            <View style={s.infoList}>
              <InfoRow
                icon="phone"
                label="Phone"
                value={MOCK_ORDER.customerPhone}
                iconColor={DK.blue}
                iconBg={DK.blueSoft}
              />
              <InfoRow
                icon="location-on"
                label="Address"
                value={MOCK_ORDER.customerAddress}
                iconColor={DK.purple}
                iconBg={DK.purpleSoft}
              />
            </View>
          </GlassCard>

          {/* Products */}
          <GlassCard noPadding>
            <View style={s.productsHeader}>
              <Text style={s.sectionTitle}>Products</Text>
              <View style={s.productCountBadge}>
                <Text style={s.productCountText}>
                  {MOCK_ORDER.products.length}
                </Text>
              </View>
            </View>
            <View style={s.productsList}>
              {MOCK_ORDER.products.map((item, i) => (
                <ProductRow
                  key={i}
                  item={item}
                  index={i}
                  isLast={i === MOCK_ORDER.products.length - 1}
                />
              ))}
            </View>
            {/* Total */}
            <LinearGradient
              colors={[DK.accentSoft, "rgba(0,212,170,0.04)"]}
              style={s.totalBar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>${totalPrice.toLocaleString()}</Text>
            </LinearGradient>
          </GlassCard>

          {/* Notes */}
          {MOCK_ORDER.notes ? (
            <GlassCard>
              <View style={s.notesHeader}>
                <MaterialIcons name="sticky-note-2" size={18} color={DK.orange} />
                <Text style={s.sectionTitle}>Notes</Text>
              </View>
              <Text style={s.notesText}>{MOCK_ORDER.notes}</Text>
            </GlassCard>
          ) : null}

          {/* Action Buttons */}
          <View style={s.actionsRow}>
            <TouchableOpacity style={s.actionBtn} activeOpacity={0.8}>
              <LinearGradient
                colors={[DK.accent, "#00B894"]}
                style={s.actionBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialIcons name="description" size={22} color={DK.bg} />
                <Text style={s.actionBtnText}>Price quote</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} activeOpacity={0.8}>
              <View style={s.actionBtnOutline}>
                <MaterialIcons name="checklist" size={22} color={DK.accent} />
                <Text style={s.actionBtnOutlineText}>Execution list</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Edit Button */}
          <TouchableOpacity style={s.editBtnWrap} activeOpacity={0.8}>
            <LinearGradient
              colors={[DK.purple, "#7C3AED"]}
              style={s.editBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialIcons name="edit" size={20} color={DK.white} />
              <Text style={s.editBtnText}>Edit order</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ============ STYLES ============
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DK.bg },

  // Glow orb at top
  glowOrb: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: DK.accentGlow,
    opacity: 0.3,
    ...(Platform.OS === "web"
      ? { filter: "blur(80px)" }
      : {}) },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)" },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: DK.textPrimary,
    letterSpacing: 0.3 },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14 },

  // ── Glass Card ──
  glassCardOuter: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: DK.border },
  glassCard: {
    backgroundColor: DK.bgCard,
    borderRadius: 20,
    padding: 20,
    borderWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: DK.border,
    ...(Platform.OS === "web"
      ? { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }
      : {}) },

  // ── Hero ──
  heroTop: {
    alignItems: "center",
    gap: 10 },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    marginBottom: 4 },
  avatarGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center" },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: DK.white },
  heroName: {
    fontSize: 26,
    fontWeight: "800",
    color: DK.textPrimary,
    letterSpacing: 0.5 },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: DK.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20 },
  dateBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: DK.accent },

  // ── Section ──
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: DK.textPrimary,
    textAlign: "left",
    marginBottom: 14 },

  // ── Info Rows ──
  infoList: {
    gap: 12 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12 },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center" },
  infoContent: {
    flex: 1,
    alignItems: "flex-end" },
  infoLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: DK.textTertiary,
    marginBottom: 2 },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: DK.textPrimary },

  // ── Products ──
  productsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20 },
  productCountBadge: {
    backgroundColor: DK.accentSoft,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center" },
  productCountText: {
    fontSize: 14,
    fontWeight: "700",
    color: DK.accent },
  productsList: {
    paddingHorizontal: 20,
    marginTop: 4 },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12 },
  productRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DK.borderLight },
  productIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center" },
  productIndexText: {
    fontSize: 13,
    fontWeight: "700",
    color: DK.textTertiary },
  productInfo: {
    flex: 1,
    alignItems: "flex-end" },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: DK.textPrimary,
    marginBottom: 2 },
  productMeta: {
    fontSize: 13,
    fontWeight: "500",
    color: DK.textSecondary,
    writingDirection: "ltr" as const,
    textAlign: "left" as const },
  productTotal: {
    fontSize: 17,
    fontWeight: "700",
    color: DK.accent },

  // ── Total Bar ──
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20 },
  totalLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: DK.textSecondary },
  totalValue: {
    fontSize: 24,
    fontWeight: "800",
    color: DK.accent,
    letterSpacing: 0.5 },

  // ── Notes ──
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10 },
  notesText: {
    fontSize: 15,
    fontWeight: "500",
    color: DK.textSecondary,
    textAlign: "left",
    lineHeight: 24 },

  // ── Action Buttons ──
  actionsRow: {
    flexDirection: "row",
    gap: 10 },
  actionBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden" },
  actionBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16 },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: DK.bg },
  actionBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: DK.accent },
  actionBtnOutlineText: {
    fontSize: 15,
    fontWeight: "700",
    color: DK.accent },

  // ── Edit Button ──
  editBtnWrap: {
    borderRadius: 16,
    overflow: "hidden" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16 },
  editBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: DK.white } });
