import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
  Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { WebView } from "react-native-webview";
import { useThemeContext } from "@/lib/theme-provider";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import { extractYouTubeVideoId } from "@/lib/services/video-tutorials-service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAYER_HEIGHT = (SCREEN_WIDTH - DS_SPACING.xl * 2) * (9 / 16);

export default function VideoPlayerScreen() {
  const router = useRouter();
  const { isDark } = useThemeContext();
  const params = useLocalSearchParams<{
    title: string;
    description: string;
    youtubeUrl: string;
  }>();

  const { title, description, youtubeUrl } = params;
  const videoId = extractYouTubeVideoId(youtubeUrl || "");

  const [playerError, setPlayerError] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(true);

  const openInYouTube = useCallback(async () => {
    if (!youtubeUrl) return;
    try {
      // Try YouTube app first (Android/iOS)
      const ytAppUrl = videoId
        ? Platform.OS === "ios"
          ? `youtube://watch?v=${videoId}`
          : `vnd.youtube:${videoId}`
        : youtubeUrl;

      const canOpen = await Linking.canOpenURL(ytAppUrl);
      if (canOpen) {
        await Linking.openURL(ytAppUrl);
      } else {
        // Fallback to browser
        await Linking.openURL(youtubeUrl);
      }
    } catch {
      // Final fallback
      await Linking.openURL(youtubeUrl).catch(() => {});
    }
  }, [youtubeUrl, videoId]);

  const embedHtml = videoId
    ? `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        .container { position: relative; width: 100%; padding-top: 56.25%; }
        iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <iframe
          src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </body>
    </html>
  `
    : null;

  const renderPlayer = () => {
    if (!videoId || playerError) {
      return (
        <View style={[s.playerError, isDark && s.playerErrorDark]}>
          <MaterialIcons name="error-outline" size={40} color={DS_COLORS.textSecondary} />
          <Text style={[s.playerErrorText, isDark && s.textDark]}>
            Unable to load the video right now. You can open it on YouTube.
          </Text>
          <TouchableOpacity
            style={[s.youtubeButton, { backgroundColor: "#FF0000" }]}
            onPress={openInYouTube}
            activeOpacity={0.8}
          >
            <MaterialIcons name="play-arrow" size={20} color="#FFFFFF" />
            <Text style={s.youtubeButtonText}>Open on YouTube</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (Platform.OS === "web") {
      // On web, use an iframe directly
      return (
        <View style={s.playerContainer}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
            style={{
              width: "100%",
              height: PLAYER_HEIGHT,
              border: "none",
              borderRadius: DS_RADIUS.md } as any}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </View>
      );
    }

    return (
      <View style={s.playerContainer}>
        {playerLoading && (
          <View style={s.playerLoadingOverlay}>
            <ActivityIndicator size="large" color={DS_COLORS.accent} />
          </View>
        )}
        <WebView
          source={{ html: embedHtml! }}
          style={[s.webview, { height: PLAYER_HEIGHT }]}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          onLoadEnd={() => setPlayerLoading(false)}
          onError={() => {
            setPlayerError(true);
            setPlayerLoading(false);
          }}
          onHttpError={() => {
            setPlayerError(true);
            setPlayerLoading(false);
          }}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, isDark && s.containerDark]}>
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, isDark && s.textDark]} numberOfLines={1}>
          {title || "Watch video"}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* YouTube Player */}
        {renderPlayer()}

        {/* Video Info */}
        <View style={s.infoSection}>
          <Text style={[s.videoTitle, isDark && s.textDark]}>{title}</Text>
          {description ? (
            <Text style={[s.videoDescription, isDark && s.textSecondaryDark]}>
              {description}
            </Text>
          ) : null}
        </View>

        {/* Open in YouTube button */}
        {!playerError && videoId && (
          <TouchableOpacity
            style={[s.secondaryButton, isDark && s.secondaryButtonDark]}
            onPress={openInYouTube}
            activeOpacity={0.7}
          >
            <MaterialIcons name="open-in-new" size={18} color={DS_COLORS.accent} />
            <Text style={[s.secondaryButtonText, { color: DS_COLORS.accent }]}>
              Open on YouTube
            </Text>
          </TouchableOpacity>
        )}
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
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    flex: 1,
    marginHorizontal: DS_SPACING.sm,
  },
  scrollContent: {
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xxxl,
  },
  playerContainer: {
    borderRadius: DS_RADIUS.md,
    overflow: "hidden",
    backgroundColor: "#000000",
    marginBottom: DS_SPACING.xl,
  },
  webview: {
    width: "100%",
    backgroundColor: "#000000",
  },
  playerLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    zIndex: 10,
    height: PLAYER_HEIGHT,
  },
  playerError: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.xxxl,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.md,
    marginBottom: DS_SPACING.xl,
    minHeight: 200,
  },
  playerErrorDark: {
    backgroundColor: DS_COLORS.card,
  },
  playerErrorText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 24,
  },
  youtubeButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.sm,
    marginTop: DS_SPACING.sm,
  },
  youtubeButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: "#FFFFFF",
  },
  infoSection: {
    marginBottom: DS_SPACING.xl,
    writingDirection: "rtl",
  },
  videoTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: DS_SPACING.sm,
  },
  videoDescription: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 24,
  },
  secondaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.sm,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    backgroundColor: DS_COLORS.card,
  },
  secondaryButtonDark: {
    backgroundColor: DS_COLORS.card,
    borderColor: DS_COLORS.border,
  },
  secondaryButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
  },
  textDark: {
    color: DS_COLORS.textPrimary,
  },
  textSecondaryDark: {
    color: DS_COLORS.textSecondary,
  },
});
