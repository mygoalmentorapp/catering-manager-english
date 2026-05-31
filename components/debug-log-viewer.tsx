import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  Share,
  Platform,
  Alert,
} from "react-native";
import { getDebugLogs, clearDebugLogs, getDebugLogsAsText } from "@/lib/_core/debug-logger";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_RADIUS, DS_SPACING } from "@/lib/design-system";
import { SafeAreaView } from "react-native-safe-area-context";

interface DebugLogViewerProps {
  visible: boolean;
  onClose: () => void;
}

export function DebugLogViewer({ visible, onClose }: DebugLogViewerProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const logs = getDebugLogs();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleClear = useCallback(() => {
    clearDebugLogs();
    setRefreshKey((k) => k + 1);
  }, []);

  const handleShare = useCallback(async () => {
    const text = getDebugLogsAsText();
    if (!text) {
      Alert.alert("אין לוגים", "אין לוגים לשיתוף");
      return;
    }

    try {
      await Share.share({ message: text, title: "Auth Debug Logs" });
    } catch {
      Alert.alert("Error", "Could not share logs");
    }
  }, []);

  const handleCopy = useCallback(async () => {
    const text = getDebugLogsAsText();
    if (!text) {
      Alert.alert("אין לוגים", "אין לוגים להעתקה");
      return;
    }
    try {
      await Share.share({ message: text, title: "Auth Debug Logs" });
    } catch {
      Alert.alert("Error", "Could not share logs");
    }
  }, []);

  const getTagColor = (tag: string): string => {
    if (tag.includes("Error") || tag.includes("error") || tag.includes("WARN")) return DS_COLORS.error;
    if (tag.includes("Auth")) return "#60A5FA"; // blue
    if (tag.includes("Bridge")) return "#C084FC"; // purple
    if (tag.includes("Flag")) return DS_COLORS.success;
    return DS_COLORS.textSecondary;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={s.container} edges={["top", "bottom", "left", "right"]}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>🔍 Auth Debug Logs</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          <Pressable onPress={handleRefresh} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.actionBtnText}>🔄 רענן</Text>
          </Pressable>
          <Pressable onPress={handleCopy} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.actionBtnText}>📋 העתק</Text>
          </Pressable>
          <Pressable onPress={handleShare} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.actionBtnText}>📤 שתף</Text>
          </Pressable>
          <Pressable onPress={handleClear} style={({ pressed }) => [s.actionBtn, s.clearBtn, pressed && { opacity: 0.6 }]}>
            <Text style={[s.actionBtnText, { color: DS_COLORS.error }]}>🗑 נקה</Text>
          </Pressable>
        </View>

        {/* Log count */}
        <Text style={s.logCount}>{logs.length} רשומות</Text>

        {/* Log entries */}
        <ScrollView style={s.logList} contentContainerStyle={s.logListContent}>
          {logs.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>אין לוגים עדיין.</Text>
              <Text style={s.emptySubtext}>הלוגים יופיעו כאן כשהאפליקציה תבצע פעולות auth.</Text>
            </View>
          ) : (
            logs.map((entry, idx) => (
              <View key={`${idx}-${refreshKey}`} style={s.logEntry}>
                <View style={s.logHeader}>
                  <Text style={s.logTimestamp}>{entry.timestamp}</Text>
                  <Text style={[s.logTag, { color: getTagColor(entry.tag) }]}>[{entry.tag}]</Text>
                </View>
                <Text style={s.logMessage} selectable>{entry.message}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D12",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A38",
  },
  title: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: "#FFFFFF",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2A2A38",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 18,
    color: "#FFFFFF",
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm,
    gap: DS_SPACING.sm,
  },
  actionBtn: {
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.xs + 2,
    backgroundColor: "#1C1C24",
    borderRadius: DS_RADIUS.sm,
    borderWidth: 1,
    borderColor: "#2A2A38",
  },
  clearBtn: {
    borderColor: DS_COLORS.error + "40",
  },
  actionBtnText: {
    fontSize: DS_FONT.caption,
    color: "#FFFFFF",
    fontWeight: DS_WEIGHT.medium,
  },
  logCount: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
    paddingHorizontal: DS_SPACING.lg,
    paddingBottom: DS_SPACING.xs,
    writingDirection: "rtl",
  },
  logList: {
    flex: 1,
  },
  logListContent: {
    paddingHorizontal: DS_SPACING.md,
    paddingBottom: 40,
  },
  logEntry: {
    paddingVertical: DS_SPACING.xs + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1C1C24",
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    marginBottom: 2,
  },
  logTimestamp: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#6B7280",
  },
  logTag: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontWeight: DS_WEIGHT.semibold,
  },
  logMessage: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#D1D5DB",
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    fontWeight: DS_WEIGHT.medium,
  },
  emptySubtext: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    marginTop: DS_SPACING.sm,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
