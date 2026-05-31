import React, { useState, useEffect } from "react";
import { setOneSignalScreenTrigger } from "@/lib/onesignal-bootstrap";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  AppState,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useData } from "@/lib/data-context";
import { useAuth } from "@/lib/auth-context";
import { useThemeContext } from "@/lib/theme-provider";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ImageCropModal } from "@/components/image-crop-modal";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW,
} from "@/lib/design-system";
import { trpc } from "@/lib/trpc";
import { useMutationGuard } from "@/hooks/use-mutation-guard";
import { useNetwork } from "@/lib/network-context";

const COLOR_OPTIONS = [
  { value: "#3AAFA9", label: "טורקיז" },
  { value: "#6C63FF", label: "סגול" },
  { value: "#3B82F6", label: "כחול" },
  { value: "#06B6D4", label: "תכלת" },
  { value: "#10B981", label: "ירוק" },
  { value: "#22C55E", label: "ירוק בהיר" },
  { value: "#F59E0B", label: "כתום" },
  { value: "#F97316", label: "כתום" },
  { value: "#EF4444", label: "אדום" },
  { value: "#EC4899", label: "ורוד" },
  { value: "#A855F7", label: "סגול בהיר" },
  { value: "#8B5CF6", label: "סגליל" },
  { value: "#64748B", label: "אפור" },
  { value: "#78350F", label: "חום" },
  { value: "#1E1E2E", label: "שחור" },
  { value: "#DC2626", label: "אדום כהה" },
];

export default function SettingsScreen() {
  const { colorScheme, setColorScheme, isDark } = useThemeContext();
  const s = React.useMemo(() => _make_s(), [DS_COLORS.accent, colorScheme]);
  const trpcUtils = trpc.useUtils();

  const router = useRouter();

  // OneSignal in-app message trigger
  useEffect(() => { setOneSignalScreenTrigger("settings"); }, []);
  const { businessName, setBusinessNameValue, businessLogo, setBusinessLogoValue, primaryColor, setPrimaryColorValue } = useData();
  const { guardMutation } = useMutationGuard();
  const { signOut, user, profile } = useAuth();

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const [nameText, setNameText] = useState(businessName);
  const [nameSaved, setNameSaved] = useState(false);
  // Crop preview modal state
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [pickedImageWidth, setPickedImageWidth] = useState(0);
  const [pickedImageHeight, setPickedImageHeight] = useState(0);
  const [cropSaving, setCropSaving] = useState(false);

  const handleCropConfirm = async (cropRegion: { originX: number; originY: number; width: number; height: number }) => {
    if (!pickedImageUri) return;
    const allowed = await guardMutation();
    if (!allowed) return;
    setCropSaving(true);
    try {
      let finalUri = pickedImageUri;
      if (Platform.OS !== "web") {
        try {
          const result = await ImageManipulator.manipulateAsync(
            pickedImageUri,
            [
              { crop: cropRegion },
              { resize: { width: 512, height: 512 } },
            ],
            { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
          );
          finalUri = result.uri;
        } catch (cropErr) {
          console.warn("Crop failed, trying without crop:", cropErr);
          // Fallback: just resize the original without cropping
          try {
            const fallback = await ImageManipulator.manipulateAsync(
              pickedImageUri,
              [{ resize: { width: 512, height: 512 } }],
              { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
            );
            finalUri = fallback.uri;
          } catch (fallbackErr) {
            console.warn("Resize also failed, using original:", fallbackErr);
          }
        }
      }

      // Convert to base64 for upload
      const FileSystem = require("expo-file-system/legacy");
      let base64Raw = "";
      try {
        base64Raw = await FileSystem.readAsStringAsync(finalUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (readErr) {
        console.warn("Failed to read finalUri, trying original:", readErr);
        // Fallback: try reading the original picked image
        base64Raw = await FileSystem.readAsStringAsync(pickedImageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      if (!base64Raw || base64Raw.length < 100) {
        throw new Error("לא הצלחנו לקרוא את התמונה. נסה תמונה אחרת.");
      }

      const { logoUrl } = await trpcUtils.client.cloudData.settings.uploadLogo.mutate({
        base64: base64Raw,
        mimeType: "image/png",
      });
      // Save the public URL to settings (not the local file URI)
      await saveLogoUri(logoUrl);
      setCropModalVisible(false);
      setPickedImageUri(null);
    } catch (saveErr: any) {
      console.error("Save logo error:", saveErr);
      Alert.alert("שגיאה בשמירה", `פרטים: ${saveErr?.message || "לא ידוע"}`);
    } finally {
      setCropSaving(false);
    }
  };

  // Sync local text when context value changes
  useEffect(() => {
    setNameText(businessName);
  }, [businessName]);

  const handleSaveBusinessName = async () => {
    const allowed = await guardMutation();
    if (!allowed) return;
    await setBusinessNameValue(nameText.trim());
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  const saveLogoUri = async (uri: string) => {
    await setBusinessLogoValue(uri);
  };

  const handlePickLogo = async () => {
    // Step 0: Request media library permissions
    if (Platform.OS !== "web") {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "נדרשת הרשאה",
            "כדי לבחור תמונה, יש לאשר גישה לתמונות בהגדרות המכשיר.",
            [
              { text: "ביטול", style: "cancel" },
              { text: "פתח הגדרות", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
      } catch (permErr: any) {
        console.error("Permission request error:", permErr);
      }
    }

    // Step 1: Launch image picker — NO allowsEditing (broken on many Android devices)
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
    } catch (pickerErr: any) {
      console.error("Image picker launch error:", pickerErr);
      Alert.alert("שגיאה בפתיחת גלריה", `פרטים: ${pickerErr?.message || "לא ידוע"}`);
      return;
    }

    if (result.canceled || !result.assets || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    if (!uri) {
      Alert.alert("שגיאה", "לא התקבלה כתובת תמונה מהגלריה.");
      return;
    }

    // Step 2: Show crop preview modal
    setPickedImageUri(uri);
    setPickedImageWidth(asset.width || 1000);
    setPickedImageHeight(asset.height || 1000);
    setCropModalVisible(true);
  };

  const handleCropCancel = () => {
    setCropModalVisible(false);
    setPickedImageUri(null);
  };

  // Handle Android activity destruction during image picker
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active") {
        try {
          const pendingResult = await ImagePicker.getPendingResultAsync();
          if (pendingResult && Array.isArray(pendingResult) && pendingResult.length > 0) {
            const picked = pendingResult[0];
            if ("canceled" in picked && !picked.canceled && picked.assets && picked.assets[0]) {
              const asset = picked.assets[0];
              if (asset.uri) {
                setPickedImageUri(asset.uri);
                setPickedImageWidth(asset.width || 1000);
                setPickedImageHeight(asset.height || 1000);
                setCropModalVisible(true);
              }
            }
          }
        } catch (_) {
          // No pending result
        }
      }
    });
    return () => subscription.remove();
  }, [setBusinessLogoValue]);

  const handleRemoveLogo = () => {
    Alert.alert("הסרת לוגו", "האם להסיר את הלוגו ולחזור ללוגו ברירת המחדל?", [
      { text: "ביטול", style: "cancel" },
      {
        text: "הסר",
        style: "destructive",
        onPress: async () => {
          const allowed = await guardMutation();
          if (!allowed) return;
          await setBusinessLogoValue("");
        },
      },
    ]);
  };

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      containerClassName="bg-background"
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>הגדרות</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 40}
        >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {/* Sync Status Card */}
          <SyncStatusCard />

          {/* Business Logo */}
          <View style={s.businessCard}>
            <View style={s.businessHeader}>
              <MaterialIcons name="image" size={22} color={DS_COLORS.accent} />
              <Text style={s.businessTitle}>לוגו העסק</Text>
            </View>
            <Text style={s.businessHint}>
              הלוגו יוצג במסך הראשי ובמסמכי הדפסה
            </Text>
            <View style={s.logoRow}>
              <View style={s.logoCircle}>
                {businessLogo ? (
                  <Image source={{ uri: businessLogo }} style={s.logoImage} />
                ) : (
                  <Image source={require("@/assets/images/icon.png")} style={s.logoImage} />
                )}
              </View>
              <View style={s.logoBtns}>
                <TouchableOpacity onPress={handlePickLogo} style={s.logoBtn} activeOpacity={0.8}>
                  <MaterialIcons name="photo-library" size={18} color={DS_COLORS.white} />
                  <Text style={s.logoBtnText}>בחר תמונה</Text>
                </TouchableOpacity>
                {businessLogo ? (
                  <TouchableOpacity onPress={handleRemoveLogo} style={s.logoRemoveBtn} activeOpacity={0.8}>
                    <MaterialIcons name="delete-outline" size={18} color={DS_COLORS.error} />
                    <Text style={s.logoRemoveBtnText}>הסר</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {/* Business Name */}
          <View style={s.businessCard}>
            <View style={s.businessHeader}>
              <MaterialIcons name="store" size={22} color={DS_COLORS.accent} />
              <Text style={s.businessTitle}>שם העסק</Text>
            </View>
            <Text style={s.businessHint}>
              השם יוצג במסך הראשי ובמסמכי הדפסה
            </Text>
            <View style={s.businessInputRow}>
              <TextInput
                style={s.businessInput}
                value={nameText}
                onChangeText={setNameText}
                placeholder="הזן את שם העסק שלך"
                placeholderTextColor={DS_COLORS.textSecondary}
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleSaveBusinessName}
                selectTextOnFocus
              />
              <TouchableOpacity
                onPress={handleSaveBusinessName}
                style={[
                  s.businessSaveBtn,
                  nameSaved && { backgroundColor: "#22C55E" },
                ]}
                activeOpacity={0.8}
              >
                {nameSaved ? (
                  <MaterialIcons name="check" size={18} color={DS_COLORS.white} />
                ) : (
                  <Text style={s.businessSaveBtnText}>שמור</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* App Color */}
          <View style={s.businessCard}>
            <View style={s.businessHeader}>
              <MaterialIcons name="palette" size={22} color={DS_COLORS.accent} />
              <Text style={s.businessTitle}>צבע האפליקציה</Text>
            </View>
            <Text style={s.businessHint}>
              בחר צבע מותאם אישית לכפתורים ואלמנטים באפליקציה
            </Text>
            <View style={s.colorGrid}>
              {COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  onPress={async () => {
                    const allowed = await guardMutation();
                    if (!allowed) return;
                    setPrimaryColorValue(c.value);
                  }}
                  style={[
                    s.colorOption,
                    { backgroundColor: c.value },
                    primaryColor === c.value && s.colorOptionSelected,
                  ]}
                  activeOpacity={0.7}
                >
                  {primaryColor === c.value && (
                    <MaterialIcons name="check" size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dark Mode Toggle */}
          <View style={s.businessCard}>
            <TouchableOpacity
              onPress={() => {
                setColorScheme(isDark ? "light" : "dark");
              }}
              activeOpacity={0.7}
              style={s.darkModeRow}
            >
              <View style={s.darkModeLeft}>
                <MaterialIcons name={isDark ? "dark-mode" : "light-mode"} size={22} color={DS_COLORS.accent} />
                <View style={s.darkModeTextWrap}>
                  <Text style={s.businessTitle}>מצב כהה</Text>
                  <Text style={s.businessHint}>{isDark ? "פעיל — עיצוב כהה" : "כבוי — עיצוב בהיר"}</Text>
                </View>
              </View>
              <View style={[s.toggleTrack, isDark && s.toggleTrackActive]}>
                <View style={[s.toggleThumb, isDark && s.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Premium Status / Upgrade */}
          {(profile?.subscription_status === "active" || profile?.subscription_status === "free_access") ? (
            <View style={[s.actionCard, { borderColor: "#8B5CF6", borderWidth: 1 }]}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#2D1B4E" : "#F3E8FF" }]}>
                <MaterialIcons name="verified" size={22} color="#8B5CF6" />
              </View>
              <View style={s.actionTextWrap}>
                <Text style={s.actionTitle}>מנוי פרימיום פעיל</Text>
                <Text style={s.actionSubtitle}>
                  {profile?.subscription_status === "free_access" ? "גישה מלאה (חינם)" : "גישה לכל הפיצ׳רים ללא הגבלה"}
                </Text>
              </View>
              <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />
            </View>
          ) : (
            <TouchableOpacity
              style={s.actionCard}
              onPress={() => router.push("/paywall?placement=settings" as any)}
              activeOpacity={0.7}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#2D1B4E" : "#F3E8FF" }]}>
                <MaterialIcons name="workspace-premium" size={22} color="#8B5CF6" />
              </View>
              <View style={s.actionTextWrap}>
                <Text style={s.actionTitle}>שדרג לפרימיום</Text>
                <Text style={s.actionSubtitle}>
                  גישה לכל הפיצ׳רים ללא הגבלה
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
            </TouchableOpacity>
          )}

          {/* Restore Purchases — always visible for non-premium users */}
          {profile?.subscription_status !== "active" && profile?.subscription_status !== "free_access" && (
            <TouchableOpacity
              style={s.actionCard}
              onPress={async () => {
                try {
                  const result = await (await import("@/lib/services/adapty-service")).restorePurchases();
                  if (result) {
                    // Refresh profile to update subscription status
                    (await import("@/lib/services/adapty-service")).getSubscriptionStatus();
                  }
                } catch {}
              }}
              activeOpacity={0.7}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#1E2A3A" : "#EFF6FF" }]}>
                <MaterialIcons name="restore" size={22} color="#3B82F6" />
              </View>
              <View style={s.actionTextWrap}>
                <Text style={s.actionTitle}>שחזור רכישות</Text>
                <Text style={s.actionSubtitle}>
                  שחזר מנוי קיים ממכשיר אחר
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
            </TouchableOpacity>
          )}

          {/* Video Tutorials */}
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => router.push("/video-tutorials" as any)}
            activeOpacity={0.7}
          >
            <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#1E2A3A" : "#EFF6FF" }]}>
              <MaterialIcons name="play-circle-outline" size={22} color="#10B981" />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>הדרכות וידאו</Text>
              <Text style={s.actionSubtitle}>
                סרטוני הדרכה על השימוש באפליקציה
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
          </TouchableOpacity>

          {/* Feedback Button */}
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => router.push("/feedback" as any)}
            activeOpacity={0.7}
          >
            <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#1E2A3A" : "#EFF6FF" }]}>
              <MaterialIcons name="rate-review" size={22} color="#3B82F6" />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>שלח משוב</Text>
              <Text style={s.actionSubtitle}>
                עזור לנו לשפר את האפליקציה
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
          </TouchableOpacity>

          {/* About */}
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => router.push("/about" as any)}
            activeOpacity={0.7}
          >
            <View style={[s.actionIconWrap, { backgroundColor: isDark ? "#1E2A3A" : "#EFF6FF" }]}>
              <MaterialIcons name="info-outline" size={22} color="#6366F1" />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={s.actionTitle}>אודות</Text>
              <Text style={s.actionSubtitle}>
                מידע על האפליקציה ויצירת קשר
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => {
              Alert.alert(
                "התנתקות",
                "האם אתה בטוח שברצונך להתנתק?",
                [
                  { text: "ביטול", style: "cancel" },
                  {
                    text: "התנתק",
                    style: "destructive",
                    onPress: () => signOut(),
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <View style={[s.actionIconWrap, { backgroundColor: "#FEF2F2" }]}>
              <MaterialIcons name="logout" size={22} color="#EF4444" />
            </View>
            <View style={s.actionTextWrap}>
              <Text style={[s.actionTitle, { color: "#EF4444" }]}>התנתק</Text>
              <Text style={s.actionSubtitle}>
                {user?.email || ""}
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={DS_COLORS.border} />
          </TouchableOpacity>

          {/* Version */}
          <Text style={{ textAlign: "center", fontSize: 12, color: DS_COLORS.textSecondary, marginTop: 8 }}>
            גרסה {appVersion}
          </Text>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Interactive Crop Modal */}
      <ImageCropModal
        visible={cropModalVisible}
        imageUri={pickedImageUri}
        imageWidth={pickedImageWidth}
        imageHeight={pickedImageHeight}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
        saving={cropSaving}
      />
    </ScreenContainer>
  );
}


const LOGO_SIZE = 70;

/**
 * SyncStatusCard — Shows sync status in settings.
 * Displays: connection status, pending operations count, last sync time.
 */
function SyncStatusCard() {
  const { syncStatus, isOfflineCached } = useData();
  const { isConnected } = useNetwork();

  // Determine icon and status text
  let icon: keyof typeof MaterialIcons.glyphMap = "cloud-done";
  let statusText = "";
  let statusColor = DS_COLORS.accent;
  let bgColor = DS_COLORS.accentLight;

  if (!isConnected) {
    icon = "cloud-off";
    statusColor = "#D97706";
    bgColor = "#FEF3C7";
    if (syncStatus.pendingCount > 0) {
      statusText = `אופליין — ${syncStatus.pendingCount} שינויים ממתינים לסנכרון`;
    } else {
      statusText = "אופליין — הנתונים נשמרים במכשיר";
    }
  } else if (syncStatus.isSyncing) {
    icon = "sync";
    statusColor = "#2563EB";
    bgColor = "#EFF6FF";
    statusText = "מסנכרן שינויים...";
  } else if (syncStatus.pendingCount > 0) {
    icon = "sync-problem";
    statusColor = "#D97706";
    bgColor = "#FEF3C7";
    statusText = `${syncStatus.pendingCount} שינויים ממתינים לסנכרון`;
  } else {
    icon = "cloud-done";
    statusColor = DS_COLORS.accent;
    bgColor = DS_COLORS.accentLight;
    statusText = "כל הנתונים מסונכרנים לענן";
  }

  // Format last sync time
  let lastSyncText = "";
  if (syncStatus.lastSyncAt) {
    const d = new Date(syncStatus.lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) {
      lastSyncText = "סונכרן לאחרונה עכשיו";
    } else if (diffMin < 60) {
      lastSyncText = `סונכרן לפני ${diffMin} דקות`;
    } else {
      lastSyncText = `סונכרן ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }

  return (
    <View style={[syncCardStyles.card, { backgroundColor: bgColor }]}>
      <MaterialIcons name={icon} size={18} color={statusColor} />
      <View style={syncCardStyles.textCol}>
        <Text style={[syncCardStyles.status, { color: statusColor }]}>{statusText}</Text>
        {lastSyncText ? (
          <Text style={syncCardStyles.lastSync}>{lastSyncText}</Text>
        ) : null}
      </View>
    </View>
  );
}

const syncCardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: DS_SPACING.sm,
    borderRadius: DS_RADIUS.md,
    padding: DS_SPACING.lg,
    marginTop: DS_SPACING.md,
    direction: "rtl" as any,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  status: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 20,
  },
  lastSync: {
    fontSize: 11,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 16,
  },
});

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
    writingDirection: "rtl",
  },
  content: {
    padding: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xl + 24,
    gap: DS_SPACING.lg,
  },
  businessCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    direction: "rtl",
    ...DS_SHADOW.card,
  },
  businessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.xs,
  },
  businessTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  businessHint: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    marginBottom: DS_SPACING.md,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.lg,
  },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: "hidden",
    backgroundColor: DS_COLORS.background,
    borderWidth: 2,
    borderColor: DS_COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: LOGO_SIZE - 4,
    height: LOGO_SIZE - 4,
    borderRadius: (LOGO_SIZE - 4) / 2,
  },
  logoBtns: {
    flex: 1,
    gap: DS_SPACING.sm,
  },
  logoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2,
    justifyContent: "center",
  },
  logoBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.white,
  },
  logoRemoveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.xs,
    borderWidth: 1.5,
    borderColor: DS_COLORS.error,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm,
    justifyContent: "center",
  },
  logoRemoveBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.error,
  },
  businessInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  businessInput: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.medium,
    color: DS_COLORS.textPrimary,
  },
  businessSaveBtn: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  businessSaveBtnText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.white,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.md,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    direction: "rtl",
    ...DS_SHADOW.card,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: DS_RADIUS.md,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextWrap: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  actionTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  actionSubtitle: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.accentLight,
    borderRadius: DS_RADIUS.md,
    padding: DS_SPACING.lg,
    marginTop: DS_SPACING.md,
    direction: "rtl",
  },
  warningText: {
    flex: 1,
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 20,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: DS_SPACING.sm + 2,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: DS_COLORS.textPrimary,
    borderWidth: 3,
  },
  sectionTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
  },
  darkModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  darkModeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    flex: 1,
  },
  darkModeTextWrap: {
    gap: 2,
  },
  toggleTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: DS_COLORS.border,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleTrackActive: {
    backgroundColor: DS_COLORS.accent,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
}); }
