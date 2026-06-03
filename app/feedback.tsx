import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { ExperienceEventService } from "@/lib/services/experience-event-service";
import { UserExperienceStateService } from "@/lib/services/user-experience-state-service";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import { useMutationGuard } from "@/hooks/use-mutation-guard";

export default function FeedbackScreen() {
  const { user } = useAuth();
  const { guardMutation } = useMutationGuard();
  const params = useLocalSearchParams<{ context?: string }>();

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    setError("");

    if (!message.trim()) {
      setError("נא לכתוב משוב לפני שליחה");
      return;
    }

    if (!user) {
      setError("נדרשת התחברות כדי לשלוח משוב");
      return;
    }

    const allowed = await guardMutation();
    if (!allowed) return;

    setLoading(true);

    try {
      const { error: insertError } = await supabase.from("feedback").insert({
        user_id: user.id,
        message: message.trim(),
        screen_context: params.context || "general",
      });

      if (insertError) {
        setError("שגיאה בשליחת המשוב. נסה שוב");
        setLoading(false);
        return;
      }

      setSent(true);

      // Log feedback events (fire-and-forget)
      ExperienceEventService.logFeedbackSubmitted(params.context || "general").catch(() => {});
      UserExperienceStateService.onFeedbackSubmitted().catch(() => {});
    } catch {
      setError("שגיאה בשליחת המשוב. נסה שוב");
    } finally {
      setLoading(false);
    }
  }, [message, user, params.context]);

  // ── Success Screen ──
  if (sent) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <View style={s.successIcon}>
            <MaterialIcons name="check-circle" size={56} color="#4CAF50" />
          </View>
          <Text style={s.successTitle}>תודה רבה!</Text>
          <Text style={s.successText}>
            המשוב שלך התקבל בהצלחה.{"\n"}
            הוא עוזר לנו לשפר את האפליקציה.
          </Text>
          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={s.primaryButtonText}>חזור לאפליקציה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Feedback Form ──
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header with back button */}
          <View style={s.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>שלח משוב</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Content */}
          <View style={s.content}>
            <View style={s.iconCircle}>
              <MaterialIcons name="chat-bubble-outline" size={36} color={DS_COLORS.accent} />
            </View>

            <Text style={s.title}>יש לך מה לשתף?</Text>
            <Text style={s.description}>
              נשמח לשמוע ממך — רעיונות, בעיות, או כל דבר שיעזור לנו להשתפר
            </Text>

            {/* Text Input */}
            <View style={s.inputGroup}>
              <TextInput
                style={s.textArea}
                value={message}
                onChangeText={setMessage}
                placeholder="כתוב כאן את המשוב שלך..."
                placeholderTextColor={DS_COLORS.textSecondary}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                textAlign="right"
                maxLength={1000}
                autoFocus
              />
              <Text style={s.charCount}>{message.length}/1000</Text>
            </View>

            {/* Error */}
            {error ? (
              <View style={s.errorBox}>
                <MaterialIcons name="error-outline" size={18} color={DS_COLORS.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <TouchableOpacity
              style={[s.primaryButton, loading && s.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={DS_COLORS.white} />
              ) : (
                <>
                  <MaterialIcons name="send" size={18} color={DS_COLORS.white} style={{ transform: [{ scaleX: -1 }] }} />
                  <Text style={s.primaryButtonText}>שלח משוב</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: DS_SPACING.xl,
    paddingBottom: 30,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.xl,
  },
  headerTitle: {
    fontSize: DS_FONT.titleLarge,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
  },
  content: {
    flex: 1,
    alignItems: "center",
    gap: DS_SPACING.lg,
    paddingTop: DS_SPACING.xxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
  },
  description: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  inputGroup: {
    alignSelf: "stretch",
  },
  textArea: {
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
    paddingTop: DS_SPACING.md,
    paddingBottom: DS_SPACING.md,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    minHeight: 150,
    lineHeight: 24,
  },
  charCount: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.textSecondary,
    textAlign: "left",
    marginTop: DS_SPACING.xs,
  },
  errorBox: {
    alignSelf: "stretch",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1,
    borderColor: DS_COLORS.error,
    borderRadius: DS_RADIUS.sm,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2,
  },
  errorText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.error,
    textAlign: "right",
    flex: 1,
  },
  primaryButton: {
    alignSelf: "stretch",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    ...DS_SHADOW.button,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
  },
  // ── Success ──
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl,
  },
  successIcon: {
    marginBottom: DS_SPACING.xxl,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md,
  },
  successText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxl,
  },
});
