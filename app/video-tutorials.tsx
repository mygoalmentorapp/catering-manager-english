import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Dimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useThemeContext } from "@/lib/theme-provider";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
} from "@/lib/design-system";

// ============================================================
// VIDEO GUIDE URL — Replace with Bunny CDN link when ready
// Example: "https://video.cateringmanager.app/guide.mp4"
// ============================================================
const VIDEO_GUIDE_URL = "";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAYER_WIDTH = SCREEN_WIDTH - DS_SPACING.xl * 2;
const PLAYER_HEIGHT = PLAYER_WIDTH * (9 / 16);

export default function VideoTutorialsScreen() {
  const router = useRouter();
  const { isDark } = useThemeContext();

  const hasVideo = VIDEO_GUIDE_URL.length > 0;

  const handleOpenInBrowser = async () => {
    if (!hasVideo) return;
    try {
      await Linking.openURL(VIDEO_GUIDE_URL);
    } catch {
      // Silent fail
    }
  };

  return (
    <SafeAreaView style={[s.container, isDark && s.containerDark]}>
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons
            name="chevron-right"
            size={28}
            color={DS_COLORS.textPrimary}
          />
        </TouchableOpacity>
        <Text style={[s.headerTitle, isDark && s.textDark]}>הדרכת וידאו</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <Text style={[s.subtitle, isDark && s.textSecondaryDark]}>
          צפה בהדרכה קצרה שמסבירה איך להשתמש באפליקציה בצורה נכונה.
        </Text>

        {/* Video Player Area */}
        <View style={[s.playerArea, isDark && s.playerAreaDark]}>
          {hasVideo ? (
            // When VIDEO_GUIDE_URL is set, show embedded video or WebView here
            <View style={s.playerPlaceholder}>
              <MaterialIcons
                name="play-circle-filled"
                size={64}
                color={DS_COLORS.accent}
              />
              <Text style={[s.placeholderText, isDark && s.textDark]}>
                טוען סרטון...
              </Text>
            </View>
          ) : (
            // Placeholder when no video URL is set
            <View style={s.playerPlaceholder}>
              <MaterialIcons
                name="videocam"
                size={56}
                color={DS_COLORS.textSecondary}
              />
              <Text style={[s.placeholderText, isDark && s.textSecondaryDark]}>
                כאן יופיע סרטון ההדרכה
              </Text>
            </View>
          )}
        </View>

        {/* Open in Browser Button */}
        <TouchableOpacity
          style={[
            s.openButton,
            !hasVideo && s.openButtonDisabled,
            isDark && s.openButtonDark,
          ]}
          onPress={handleOpenInBrowser}
          activeOpacity={hasVideo ? 0.7 : 1}
          disabled={!hasVideo}
        >
          <MaterialIcons
            name="open-in-browser"
            size={20}
            color={hasVideo ? "#FFFFFF" : DS_COLORS.textSecondary}
          />
          <Text
            style={[
              s.openButtonText,
              !hasVideo && s.openButtonTextDisabled,
            ]}
          >
            {hasVideo ? "פתח את הסרטון בדפדפן" : "הסרטון עדיין לא זמין"}
          </Text>
        </TouchableOpacity>

        {/* Internet Filtering Note */}
        <View style={[s.noteCard, isDark && s.noteCardDark]}>
          <MaterialIcons
            name="info-outline"
            size={20}
            color={DS_COLORS.textSecondary}
            style={s.noteIcon}
          />
          <Text style={[s.noteText, isDark && s.textSecondaryDark]}>
            אם הסרטון לא נפתח בגלל סינון אינטרנט, נא לבקש מחברת הסינון לפתוח
            את:{"\n"}
            <Text style={[s.noteUrl, isDark && s.textDark]}>
              video.cateringmanager.app
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  containerDark: {
    backgroundColor: DS_COLORS.background,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
  },
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xxxl * 2,
  },
  subtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxl,
  },
  playerArea: {
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    borderRadius: DS_RADIUS.lg,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    alignSelf: "center",
    overflow: "hidden",
    marginBottom: DS_SPACING.xxl,
  },
  playerAreaDark: {
    backgroundColor: DS_COLORS.card,
    borderColor: DS_COLORS.border,
  },
  playerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.md,
  },
  placeholderText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
  },
  openButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.accent,
    paddingVertical: DS_SPACING.lg,
    paddingHorizontal: DS_SPACING.xxl,
    borderRadius: DS_RADIUS.md,
    marginBottom: DS_SPACING.xxl,
  },
  openButtonDark: {
    // Same accent color in dark mode
  },
  openButtonDisabled: {
    backgroundColor: DS_COLORS.border,
  },
  openButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: "#FFFFFF",
    writingDirection: "rtl",
  },
  openButtonTextDisabled: {
    color: DS_COLORS.textSecondary,
  },
  noteCard: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.md,
    padding: DS_SPACING.lg,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  noteCardDark: {
    backgroundColor: DS_COLORS.card,
    borderColor: DS_COLORS.border,
  },
  noteIcon: {
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 22,
  },
  noteUrl: {
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
  },
  textDark: {
    color: DS_COLORS.textPrimary,
  },
  textSecondaryDark: {
    color: DS_COLORS.textSecondary,
  },
});
