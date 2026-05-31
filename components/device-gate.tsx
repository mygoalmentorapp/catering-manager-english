/**
 * DeviceGate — Blocks app access when device is not active.
 *
 * Placed inside the provider tree, after AuthProvider and DeviceProvider.
 * It intercepts the device status and shows:
 * - Loading spinner while checking
 * - INLINE verification flow for requires_verification (send code → enter code → success)
 * - Offline blocked screen when no internet and no active cache
 * - Children (normal app) when device is active
 *
 * IMPORTANT: The verification flow is embedded INLINE because DeviceGate sits
 * above the navigator. When it blocks, the navigator is unmounted, so
 * router.push() would fail silently. This is the same pattern that worked
 * in the previous implementation.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDevice } from "@/lib/device-context";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { DS_COLORS, DS_FONT, DS_RADIUS } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

type VerifyStep = "prompt" | "warning" | "code_sent" | "success";

export function DeviceGate({ children }: { children: React.ReactNode }) {
  const { gateStatus, isChecking, recheckDevice, deviceUuid, onVerificationComplete } = useDevice();
  const { isAuthenticated, isLoading: authLoading, session, signOut } = useAuth();

  // Inline verification state
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("prompt");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const requestCodeMutation = trpc.device.requestVerificationCode.useMutation();
  const verifyCodeMutation = trpc.device.verifyCode.useMutation();

  // User email for display
  const userEmail = session?.user?.email ?? "";
  const maskedEmail = maskEmail(userEmail);

  // Reset verify step when gate status changes away from requires_verification
  useEffect(() => {
    if (gateStatus !== "requires_verification") {
      setVerifyStep("prompt");
      setCode("");
      setError(null);
    }
  }, [gateStatus]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // ============ SEND CODE ============
  const handleSendCode = useCallback(async () => {
    if (!deviceUuid || isSending) return;
    setIsSending(true);
    setError(null);

    try {
      const result = await requestCodeMutation.mutateAsync({
        deviceUuid,
      });

      if (result.success) {
        setVerifyStep("code_sent");
        setResendTimer(60);
        setCode("");
        setAttemptsLeft(5);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setTimeout(() => inputRef.current?.focus(), 300);
      } else {
        setError(result.message);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (err: any) {
      setError("שגיאה בשליחת הקוד. נסה שוב.");
      console.error("[DeviceGate] Send code error:", err);
    } finally {
      setIsSending(false);
    }
  }, [deviceUuid, isSending, requestCodeMutation]);

  // ============ VERIFY CODE ============
  const handleVerifyCode = useCallback(async () => {
    if (!deviceUuid || code.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError(null);

    try {
      const result = await verifyCodeMutation.mutateAsync({
        deviceUuid,
        code,
      });

      if (result.success) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setVerifyStep("success");
        setTimeout(() => {
          onVerificationComplete();
        }, 1500);
      } else {
        setError(result.message);
        setAttemptsLeft(result.attemptsLeft);
        setCode("");
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        if (result.expired || result.tooManyAttempts) {
          setTimeout(() => setVerifyStep("prompt"), 2000);
        }
      }
    } catch (err: any) {
      setError("שגיאה באימות הקוד. נסה שוב.");
      console.error("[DeviceGate] Verify code error:", err);
    } finally {
      setIsVerifying(false);
    }
  }, [deviceUuid, code, isVerifying, verifyCodeMutation, onVerificationComplete]);

  // Auto-verify when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && verifyStep === "code_sent" && !isVerifying) {
      handleVerifyCode();
    }
  }, [code, verifyStep, isVerifying, handleVerifyCode]);

  // ============ GATE LOGIC ============

  // Don't gate if not authenticated or auth is still loading
  if (authLoading || !isAuthenticated) {
    return <>{children}</>;
  }

  // Loading state — only show on cold start (first check).
  // On background resume, device check runs silently (isChecking stays false).
  if (gateStatus === "loading" && isChecking) {
    return <>{children}</>;
  }
  if (gateStatus === "loading") {
    // Cold start initial check — show nothing (splash is shown by AuthenticatedGate)
    return null;
  }

  // Active — pass through
  if (gateStatus === "active" || gateStatus === "offline_active") {
    return <>{children}</>;
  }

  // ============ REQUIRES VERIFICATION — INLINE FLOW ============
  if (gateStatus === "requires_verification") {
    // Step: prompt (initial)
    if (verifyStep === "prompt") {
      return (
        <SafeAreaView style={s.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.iconCircle}>
                <MaterialIcons name="smartphone" size={48} color={DS_COLORS.accent} />
              </View>

              <Text style={s.title}>מכשיר לא מזוהה</Text>

              <Text style={s.description}>
                החשבון שלך פעיל כרגע במכשיר אחר.
                {"\n\n"}
                אם ברצונך להפעיל את החשבון במכשיר הנוכחי, שים לב: רק נתונים שסונכרנו לענן יהיו זמינים. נתונים שנשמרו רק במכשיר הישן ולא סונכרנו — לא ניתן יהיה לשחזר.
                {"\n\n"}
                לפני שתמשיך, מומלץ לפתוח את האפליקציה במכשיר הישן ולוודא בהגדרות שכל הנתונים מסונכרנים.
              </Text>

              <View style={s.emailBox}>
                <MaterialIcons name="email" size={20} color={DS_COLORS.accent} />
                <Text style={s.emailText}>{maskedEmail}</Text>
              </View>

              {error && (
                <View style={s.errorBox}>
                  <MaterialIcons name="error-outline" size={18} color={DS_COLORS.error} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Pressable
                onPress={() => setVerifyStep("warning")}
                style={({ pressed }) => [
                  s.primaryButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <MaterialIcons name="send" size={20} color="#FFF" style={{ marginLeft: 8, transform: [{ scaleX: -1 }] }} />
                <Text style={s.primaryButtonText}>שלח קוד אימות</Text>
              </Pressable>

              <Pressable
                onPress={() => signOut()}
                style={({ pressed }) => [
                  s.linkButton,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={s.linkButtonText}>התחבר עם חשבון אחר</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    // Step: warning (data loss warning before sending code)
    if (verifyStep === "warning") {
      return (
        <SafeAreaView style={s.container}>
          <ScrollView
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[s.iconCircle, { backgroundColor: "#2D1F00" }]}>
              <MaterialIcons name="warning" size={48} color={DS_COLORS.warning} />
            </View>

            <Text style={s.title}>שים לב לפני שתמשיך</Text>

            <View style={s.warningCard}>
              <View style={s.warningRow}>
                <MaterialIcons name="cloud-off" size={22} color={DS_COLORS.warning} />
                <Text style={s.warningText}>
                  לאחר ההפעלה, המכשיר הקודם ינותק.
                </Text>
              </View>
              <View style={s.warningRow}>
                <MaterialIcons name="sync-problem" size={22} color={DS_COLORS.warning} />
                <Text style={s.warningText}>
                  נתונים שלא סונכרנו לענן מהמכשיר הקודם — לא ניתן יהיה לשחזר.
                </Text>
              </View>
              <View style={s.warningRow}>
                <MaterialIcons name="info-outline" size={22} color={DS_COLORS.accent} />
                <Text style={s.warningText}>
                  מומלץ לפתוח את האפליקציה במכשיר הישן ולוודא בהגדרות שכל הנתונים מסונכרנים.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleSendCode}
              disabled={isSending}
              style={({ pressed }) => [
                s.primaryButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                isSending && { opacity: 0.6 },
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="send" size={20} color="#FFF" style={{ marginLeft: 8, transform: [{ scaleX: -1 }] }} />
                  <Text style={s.primaryButtonText}>הבנתי, שלח קוד אימות</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => signOut()}
              style={({ pressed }) => [
                s.secondaryButton,
                { marginTop: 4 },
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
            >
              <MaterialIcons name="logout" size={20} color={DS_COLORS.error} style={{ marginLeft: 8 }} />
              <Text style={[s.secondaryButtonText, { color: DS_COLORS.error }]}>בטל העברת מכשיר</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // Step: code_sent (OTP input)
    if (verifyStep === "code_sent") {
      return (
        <SafeAreaView style={s.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.iconCircle}>
                <MaterialIcons name="mark-email-read" size={48} color={DS_COLORS.accent} />
              </View>

              <Text style={s.title}>הזן את קוד האימות</Text>

              <Text style={s.description}>
                שלחנו קוד אימות בן 6 ספרות לכתובת:
              </Text>

              <View style={s.emailBox}>
                <MaterialIcons name="email" size={20} color={DS_COLORS.accent} />
                <Text style={s.emailText}>{maskedEmail}</Text>
              </View>

              {/* OTP Input */}
              <View style={s.otpContainer}>
                <TextInput
                  ref={inputRef}
                  style={s.otpHiddenInput}
                  value={code}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, "").slice(0, 6);
                    setCode(digits);
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  returnKeyType="done"
                />
                <Pressable
                  style={s.otpBoxRow}
                  onPress={() => inputRef.current?.focus()}
                >
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <View
                      key={i}
                      style={[
                        s.otpBox,
                        code.length === i && s.otpBoxActive,
                        error ? s.otpBoxError : undefined,
                      ]}
                    >
                      <Text style={s.otpDigit}>{code[i] ?? ""}</Text>
                    </View>
                  ))}
                </Pressable>
              </View>

              {error && (
                <View style={s.errorBox}>
                  <MaterialIcons name="error-outline" size={18} color={DS_COLORS.error} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              {attemptsLeft < 5 && attemptsLeft > 0 && (
                <Text style={s.attemptsText}>
                  נותרו {attemptsLeft} ניסיונות
                </Text>
              )}

              <Pressable
                onPress={handleVerifyCode}
                disabled={code.length !== 6 || isVerifying}
                style={({ pressed }) => [
                  s.primaryButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  (code.length !== 6 || isVerifying) && { opacity: 0.5 },
                ]}
              >
                {isVerifying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="verified-user" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                    <Text style={s.primaryButtonText}>אמת קוד</Text>
                  </>
                )}
              </Pressable>

              {/* Resend */}
              <Pressable
                onPress={handleSendCode}
                disabled={resendTimer > 0 || isSending}
                style={({ pressed }) => [
                  s.linkButton,
                  pressed && { opacity: 0.6 },
                  (resendTimer > 0 || isSending) && { opacity: 0.4 },
                ]}
              >
                <Text style={s.linkButtonText}>
                  {resendTimer > 0
                    ? `שלח שוב (${resendTimer}s)`
                    : "שלח קוד חדש"}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    // Step: success
    return (
      <SafeAreaView style={s.container}>
        <View style={s.scrollContent}>
          <View style={[s.iconCircle, { backgroundColor: "#0D2818" }]}>
            <MaterialIcons name="check-circle" size={48} color={DS_COLORS.success} />
          </View>

          <Text style={s.title}>המכשיר אומת בהצלחה!</Text>

          <Text style={s.description}>
            החשבון שלך פעיל כעת במכשיר הנוכחי.
            {"\n"}
            המכשיר הקודם נותק אוטומטית.
          </Text>

          <ActivityIndicator size="small" color={DS_COLORS.accent} style={{ marginTop: 24 }} />
          <Text style={s.redirectText}>טוען את האפליקציה...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ============ OFFLINE BLOCKED ============
  if (gateStatus === "offline_blocked") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.scrollContent}>
          <View style={s.iconCircle}>
            <MaterialIcons name="wifi-off" size={48} color={DS_COLORS.textSecondary} />
          </View>
          <Text style={s.title}>נדרש חיבור לאינטרנט</Text>
          <Text style={s.description}>
            נדרש חיבור לאינטרנט כדי לאמת את המכשיר.
            {"\n"}
            אנא בדוק את החיבור ונסה שוב.
          </Text>
          <Pressable
            onPress={() => recheckDevice()}
            style={({ pressed }) => [
              s.secondaryButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
          >
            <MaterialIcons name="refresh" size={20} color={DS_COLORS.accent} style={{ marginLeft: 8 }} />
            <Text style={s.secondaryButtonText}>נסה שוב</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ============ ERROR STATE ============
  return (
    <SafeAreaView style={s.container}>
      <View style={s.scrollContent}>
        <View style={s.iconCircle}>
          <MaterialIcons name="error-outline" size={48} color={DS_COLORS.error} />
        </View>
        <Text style={s.title}>שגיאה בבדיקת מכשיר</Text>
        <Text style={s.description}>
          לא הצלחנו לבדוק את סטטוס המכשיר.
          {"\n"}
          אנא נסה שוב.
        </Text>
        <Pressable
          onPress={() => recheckDevice()}
          style={({ pressed }) => [
            s.secondaryButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <MaterialIcons name="refresh" size={20} color={DS_COLORS.accent} style={{ marginLeft: 8 }} />
          <Text style={s.secondaryButtonText}>נסה שוב</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ============ HELPERS ============

function maskEmail(email: string): string {
  if (!email) return "***@***.***";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***.***";
  const maskedLocal =
    local.length <= 2
      ? local[0] + "***"
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// ============ STYLES ============

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: DS_COLORS.textSecondary,
    fontWeight: "500",
  },
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: DS_COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
  },
  emailBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: DS_COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    marginBottom: 16,
    gap: 8,
  },
  emailText: {
    fontSize: 15,
    color: DS_COLORS.textPrimary,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  errorBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#2D1215",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
    width: "100%",
    maxWidth: 320,
  },
  errorText: {
    fontSize: 13,
    color: DS_COLORS.error,
    flex: 1,
    textAlign: "right",
  },
  primaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    maxWidth: 320,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  secondaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DS_COLORS.card,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    width: "100%",
    maxWidth: 320,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: DS_COLORS.accent,
  },
  linkButton: {
    paddingVertical: 10,
  },
  linkButtonText: {
    fontSize: 14,
    color: DS_COLORS.accent,
    fontWeight: "500",
  },
  otpContainer: {
    width: "100%",
    maxWidth: 320,
    marginBottom: 20,
    position: "relative",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    textAlign: "left" as const,
    writingDirection: "ltr" as const,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    direction: "ltr" as const,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: DS_COLORS.border,
    backgroundColor: DS_COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: DS_COLORS.accent,
  },
  otpBoxError: {
    borderColor: DS_COLORS.error,
  },
  otpDigit: {
    fontSize: 24,
    fontWeight: "700",
    color: DS_COLORS.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    writingDirection: "ltr" as const,
    textAlign: "center" as const,
  },
  attemptsText: {
    fontSize: 13,
    color: DS_COLORS.warning,
    textAlign: "center",
    marginBottom: 12,
  },
  redirectText: {
    fontSize: 14,
    color: DS_COLORS.textSecondary,
    marginTop: 8,
  },
  warningCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: DS_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DS_COLORS.border,
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  warningRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: DS_COLORS.textPrimary,
    lineHeight: 22,
    textAlign: "right",
  },
});
