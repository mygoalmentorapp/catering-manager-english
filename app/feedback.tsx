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

type FeedbackStep = "rating" | "text" | "success";

export default function FeedbackScreen() {
  const { user } = useAuth();
  const { guardMutation } = useMutationGuard();
  const params = useLocalSearchParams<{ context?: string }>();

  const [step, setStep] = useState<FeedbackStep>("rating");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Step 1: Star Rating ──
  const handleRatingSelect = useCallback((stars: number) => {
    setRating(stars);
    // Auto-advance to text step after a short delay for visual feedback
    setTimeout(() => {
      setStep("text");
    }, 300);
  }, []);

  // ── Step 2: Submit text feedback ──
  const handleSubmit = useCallback(async () => {
    setError("");

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
        rating,
        message: message.trim() || null,
        screen_context: params.context || "general",
      });

      if (insertError) {
        setError("שגיאה בשליחת המשוב. נסה שוב");
        setLoading(false);
        return;
      }

      setStep("success");

      // Session 2: Log feedback events (fire-and-forget)
      ExperienceEventService.logFeedbackSubmitted(params.context || "general").catch(() => {});
      UserExperienceStateService.onFeedbackSubmitted().catch(() => {});
    } catch {
      setError("שגיאה בשליחת המשוב. נסה שוב");
    } finally {
      setLoading(false);
    }
  }, [message, rating, user, params.context]);

  // ── Skip text and submit rating only ──
  const handleSkipText = useCallback(async () => {
    setError("");

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
        rating,
        message: null,
        screen_context: params.context || "general",
      });

      if (insertError) {
        setError("שגיאה בשליחת המשוב. נסה שוב");
        setLoading(false);
        return;
      }

      setStep("success");
      ExperienceEventService.logFeedbackSubmitted(params.context || "general").catch(() => {});
      UserExperienceStateService.onFeedbackSubmitted().catch(() => {});
    } catch {
      setError("שגיאה בשליחת המשוב. נסה שוב");
    } finally {
      setLoading(false);
    }
  }, [rating, user, params.context]);

  // ── Success Screen ──
  if (step === "success") {
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

  // ── Rating Screen (Step 1) ──
  if (step === "rating") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.ratingContainer}>
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

          {/* Rating Content */}
          <View style={s.ratingContent}>
            <View style={s.iconCircle}>
              <MaterialIcons name="star" size={36} color={DS_COLORS.accent} />
            </View>

            <Text style={s.ratingTitle}>איך הייתה החוויה שלך?</Text>
            <Text style={s.ratingSubtitle}>
              דרג את האפליקציה כדי לעזור לנו להשתפר
            </Text>

            {/* Star Rating */}
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleRatingSelect(star)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <MaterialIcons
                    name={star <= rating ? "star" : "star-border"}
                    size={48}
                    color={star <= rating ? "#FFC107" : DS_COLORS.border}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Rating labels */}
            <View style={s.ratingLabels}>
              <Text style={s.ratingLabel}>מצוין</Text>
              <Text style={s.ratingLabel}>גרוע</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Text Feedback Screen (Step 2) ──
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
              onPress={() => setStep("rating")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>ספר לנו עוד</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Content */}
          <View style={s.content}>
            {/* Show selected rating */}
            <View style={s.selectedRatingRow}>
              <Text style={s.selectedRatingLabel}>הדירוג שלך:</Text>
              <View style={s.miniStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <MaterialIcons
                    key={star}
                    name={star <= rating ? "star" : "star-border"}
                    size={20}
                    color={star <= rating ? "#FFC107" : DS_COLORS.border}
                  />
                ))}
              </View>
            </View>

            <Text style={s.description}>
              {rating <= 3
                ? "נשמח לשמוע מה אפשר לשפר. ספר לנו על בעיות או רעיונות."
                : "שמחים שנהנית! יש משהו שעוד אפשר לשפר?"}
            </Text>

            {/* Text Input */}
            <View style={s.inputGroup}>
              <TextInput
                style={s.textArea}
                value={message}
                onChangeText={setMessage}
                placeholder="כתוב כאן את המשוב שלך (אופציונלי)..."
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

            {/* Skip text button */}
            <TouchableOpacity
              style={s.skipButton}
              onPress={handleSkipText}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={s.skipButtonText}>שלח רק דירוג</Text>
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
  // ── Rating Step ──
  ratingContainer: {
    flex: 1,
  },
  ratingContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xxl,
    gap: DS_SPACING.lg,
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
  ratingTitle: {
    fontSize: 22,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
  },
  ratingSubtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.md,
    paddingVertical: DS_SPACING.xl,
  },
  ratingLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 260,
    paddingHorizontal: DS_SPACING.sm,
  },
  ratingLabel: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  // ── Text Step ──
  content: {
    flex: 1,
    alignItems: "center",
    gap: DS_SPACING.lg,
    paddingTop: DS_SPACING.lg,
  },
  selectedRatingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm + 2,
    borderRadius: DS_RADIUS.full,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
  },
  selectedRatingLabel: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  miniStarsRow: {
    flexDirection: "row",
    gap: 2,
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
  skipButton: {
    paddingVertical: DS_SPACING.md,
  },
  skipButtonText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textDecorationLine: "underline",
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
