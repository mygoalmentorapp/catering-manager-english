import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useNetwork } from "@/lib/network-context";
import { useThemeContext } from "@/lib/theme-provider";
import {
  DS_COLORS,
  DS_FONT,
  DS_WEIGHT,
  DS_SPACING,
  DS_RADIUS,
  DS_SHADOW } from "@/lib/design-system";
import {
  VideoTutorialsService,
  type TopicWithVideos,
  type VideoTutorial } from "@/lib/services/video-tutorials-service";

export default function VideoTutorialsScreen() {
  const router = useRouter();
  const { isOnline } = useNetwork();
  const { isDark } = useThemeContext();

  const [topics, setTopics] = useState<TopicWithVideos[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    const result = await VideoTutorialsService.getTopicsWithVideos();
    if (result === null) {
      if (!isOnline) {
        setError("Unable to load tutorial videos right now. Check your internet connection and try again.");
      } else {
        setError("Unable to load tutorial videos right now. Please try again later.");
      }
      setTopics([]);
    } else {
      setTopics(result);
    }
  }, [isOnline]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await VideoTutorialsService.clearCache();
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleVideoPress = (video: VideoTutorial) => {
    router.push({
      pathname: "/video-player",
      params: {
        title: video.title,
        description: video.description || "",
        youtubeUrl: video.youtube_url } } as any);
  };

  const renderVideoCard = (video: VideoTutorial) => (
    <View key={video.id} style={[s.videoCard, isDark && s.videoCardDark]}>
      <View style={s.videoCardContent}>
        <Text style={[s.videoTitle, isDark && s.textDark]}>{video.title}</Text>
        {video.description ? (
          <Text style={[s.videoDescription, isDark && s.textSecondaryDark]} numberOfLines={2}>
            {video.description}
          </Text>
        ) : null}
      </View>
      <View style={s.videoActions}>
        <TouchableOpacity
          style={[s.primaryButton, { backgroundColor: DS_COLORS.accent }]}
          onPress={() => handleVideoPress(video)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="play-circle-outline" size={18} color="#FFFFFF" />
          <Text style={s.primaryButtonText}>Watch video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTopic = ({ item }: { item: TopicWithVideos }) => (
    <View style={s.topicSection}>
      <View style={s.topicHeader}>
        <View style={[s.topicIconWrap, { backgroundColor: isDark ? DS_COLORS.accentMedium : DS_COLORS.accentLight }]}>
          <MaterialIcons name="folder-open" size={20} color={DS_COLORS.accent} />
        </View>
        <Text style={[s.topicTitle, isDark && s.textDark]}>{item.title}</Text>
      </View>
      {item.videos.map(renderVideoCard)}
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[s.container, isDark && s.containerDark]}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="chevron-right" size={28} color={isDark ? DS_COLORS.textPrimary : DS_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, isDark && s.textDark]}>Video tutorials</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.centerContent}>
          <ActivityIndicator size="large" color={DS_COLORS.accent} />
          <Text style={[s.loadingText, isDark && s.textSecondaryDark]}>Loading Tutorials...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={[s.container, isDark && s.containerDark]}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, isDark && s.textDark]}>Video tutorials</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.centerContent}>
          <MaterialIcons name="wifi-off" size={48} color={DS_COLORS.textSecondary} />
          <Text style={[s.errorText, isDark && s.textDark]}>{error}</Text>
          <TouchableOpacity
            style={[s.retryButton, { backgroundColor: DS_COLORS.accent }]}
            onPress={onRefresh}
            activeOpacity={0.8}
          >
            <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
            <Text style={s.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (topics.length === 0) {
    return (
      <SafeAreaView style={[s.container, isDark && s.containerDark]}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, isDark && s.textDark]}>Video tutorials</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.centerContent}>
          <MaterialIcons name="video-library" size={48} color={DS_COLORS.textSecondary} />
          <Text style={[s.emptyText, isDark && s.textSecondaryDark]}>
            No tutorial videos are available right now.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Main content
  return (
    <SafeAreaView style={[s.container, isDark && s.containerDark]}>
      <View style={s.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, isDark && s.textDark]}>Video tutorials</Text>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        renderItem={renderTopic}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={DS_COLORS.accent}
            colors={[DS_COLORS.accent]}
          />
        }
        ListHeaderComponent={
          <Text style={[s.introText, isDark && s.textSecondaryDark]}>
            Select a topic and get a short tutorial on using the app.
          </Text>
        }
      />
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
  listContent: {
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: DS_SPACING.xxxl,
  },
  introText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: DS_SPACING.xl,
    lineHeight: 24,
  },
  topicSection: {
    marginBottom: DS_SPACING.xl,
  },
  topicHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.md,
  },
  topicIconWrap: {
    width: 36,
    height: 36,
    borderRadius: DS_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  topicTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  videoCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    padding: DS_SPACING.lg,
    marginBottom: DS_SPACING.md,
    writingDirection: "rtl",
    ...DS_SHADOW.card,
  },
  videoCardDark: {
    backgroundColor: DS_COLORS.card,
  },
  videoCardContent: {
    marginBottom: DS_SPACING.md,
  },
  videoTitle: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 4,
  },
  videoDescription: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 20,
  },
  videoActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.sm,
  },
  primaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm + 2,
    borderRadius: DS_RADIUS.sm,
  },
  primaryButtonText: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: "#FFFFFF",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxxl,
    gap: DS_SPACING.lg,
  },
  loadingText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    marginTop: DS_SPACING.sm,
  },
  errorText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 24,
  },
  emptyText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.xs,
    paddingHorizontal: DS_SPACING.xl,
    paddingVertical: DS_SPACING.md,
    borderRadius: DS_RADIUS.sm,
    marginTop: DS_SPACING.md,
  },
  retryButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: "#FFFFFF",
  },
  textDark: {
    color: DS_COLORS.textPrimary,
  },
  textSecondaryDark: {
    color: DS_COLORS.textSecondary,
  },
});
