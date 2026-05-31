import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Image,
  Pressable,
  Alert,
  Share,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DotsButton } from "@/components/dots-button";
import { DebugLogViewer } from "@/components/debug-log-viewer";
import { getAuthFlag } from "@/lib/_core/auth-flag";
import { getDebugLogsAsText } from "@/lib/_core/debug-logger";

type ButtonState = "idle" | "loading" | "success" | "error";

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  // Track whether signIn succeeded so we can show success animation
  const signInSucceededRef = useRef(false);

  // AUTO-ALERT: If user lands on login but auth flag says they were logged in,
  // this is the bug scenario. Automatically show debug logs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wasLoggedIn = await getAuthFlag();
      if (wasLoggedIn && !cancelled) {
        // Wait a moment for logs to be loaded from AsyncStorage
        setTimeout(() => {
          if (cancelled) return;
          const logsText = getDebugLogsAsText();
          const preview = logsText.length > 800 ? logsText.slice(-800) : logsText;
          Alert.alert(
            "🔍 Debug: הגעת ל-login בצורה לא צפויה",
            `הלוגים האחרונים:\n\n${preview}`,
            [
              {
                text: "העתק הכל",
                onPress: () => {
                  Share.share({ message: logsText, title: "Debug Logs" }).catch(() => {});
                  Alert.alert("הועתק!", "הלוגים הועתקו. שלח אותם למפתח.");
                },
              },
              {
                text: "הצג מלא",
                onPress: () => setShowDebugLogs(true),
              },
              { text: "סגור", style: "cancel" },
            ]
          );
        }, 1500);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback(async () => {
    setError("");

    if (!email.trim()) {
      setError("נא להזין כתובת אימייל");
      return;
    }

    // Detect common email domain typos before sending to server
    const emailLower = email.trim().toLowerCase();
    const domain = emailLower.split("@")[1] || "";
    const tld = domain.split(".").pop() || "";
    const tldTypos: Record<string, string> = {
      comm: "com", con: "com", cmo: "com", vom: "com", xom: "com",
      coom: "com", cm: "com", om: "com", comn: "com", coml: "com",
      nte: "net", nett: "net", ent: "net",
      ogr: "org", orgg: "org",
      iol: "co.il", il: "co.il",
    };
    const domainTypos: Record<string, string> = {
      "gmial.com": "gmail.com", "gmaill.com": "gmail.com",
      "gmal.com": "gmail.com", "gmali.com": "gmail.com",
      "gamil.com": "gmail.com", "gnail.com": "gmail.com",
      "gmaul.com": "gmail.com", "gmsil.com": "gmail.com",
      "hotmal.com": "hotmail.com", "hotmial.com": "hotmail.com",
      "hotmil.com": "hotmail.com", "hotmaill.com": "hotmail.com",
      "outlok.com": "outlook.com", "outllook.com": "outlook.com",
      "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com",
    };
    const suggestedDomain = domainTypos[domain];
    const suggestedTld = tldTypos[tld];
    if (suggestedDomain) {
      const corrected = emailLower.split("@")[0] + "@" + suggestedDomain;
      setError(`האם התכוונת ל-${corrected}?`);
      return;
    }
    if (suggestedTld) {
      const correctedDomain = domain.replace(new RegExp(tld + "$"), suggestedTld);
      const corrected = emailLower.split("@")[0] + "@" + correctedDomain;
      setError(`האם התכוונת ל-${corrected}?`);
      return;
    }

    if (!password) {
      setError("נא להזין סיסמה");
      return;
    }

    setButtonState("loading");
    const { error: authError } = await signIn(email, password);

    if (authError) {
      const msg = authError.message || "";

      // Timeout from our safety wrapper (signInWithPassword hung)
      if (msg === "timeout") {
        setError("ההתחברות נמשכה יותר מדי. נסה שוב בעוד רגע");
        setButtonState("error");
        return;
      }

      // Detect network errors — show clear connectivity message
      const isNetworkError =
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("Network") ||
        msg.includes("Failed to fetch") ||
        msg.includes("Unable to connect") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ERR_NETWORK") ||
        msg.includes("aborted");

      if (isNetworkError) {
        setError("אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב");
      } else if (
        msg.includes("Invalid login") ||
        msg.includes("Email not confirmed")
      ) {
        // Security: Use the same generic error for all auth failures.
        setError("אימייל או סיסמה שגויים");
      } else {
        setError("שגיאה בהתחברות. נסה שוב");
      }
      setButtonState("error");
      return;
    }

    // Auth succeeded — navigation will be handled by auth state change listener
    signInSucceededRef.current = true;
    setButtonState("success");
  }, [email, password, signIn]);

  const handleGoogleSignIn = useCallback(async () => {
    setError("");
    setGoogleLoading(true);
    const { error: authError } = await signInWithGoogle();
    setGoogleLoading(false);

    if (authError) {
      setError("שגיאה בהתחברות עם Google. נסה שוב");
    }
  }, [signInWithGoogle]);

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
          {/* Header with Logo */}
          <View style={s.header}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={s.logo}
              resizeMode="contain"
            />
            <Text style={s.title}>ברוך הבא</Text>
            <Text style={s.subtitle}>התחבר לחשבון שלך</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            {/* Email */}
            <View style={s.inputGroup}>
              <Text style={s.label}>אימייל</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@email.com"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="right"
                  returnKeyType="next"
                  editable={buttonState !== "loading" && buttonState !== "success"}
                />
                <MaterialIcons name="email" size={20} color={DS_COLORS.textSecondary} style={s.inputIcon} />
              </View>
            </View>

            {/* Password */}
            <View style={s.inputGroup}>
              <Text style={s.label}>סיסמה</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="הזן סיסמה"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={buttonState !== "loading" && buttonState !== "success"}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={s.inputIcon}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons
                    name={showPassword ? "visibility" : "visibility-off"}
                    size={20}
                    color={DS_COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity
              onPress={() => router.push("/auth/forgot-password")}
              style={s.forgotButton}
            >
              <Text style={s.forgotText}>שכחת סיסמה?</Text>
            </TouchableOpacity>

            {/* Error */}
            {error ? (
              <View style={s.errorBox}>
                <MaterialIcons name="error-outline" size={18} color={DS_COLORS.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Login Button — Dots Animation */}
            <DotsButton
              state={buttonState}
              label="התחבר"
              loadingLabel="מתחבר"
              onPress={handleLogin}
            />

            {/* Divider + Google Sign-In — hidden for now, will be re-enabled later */}
          </View>

          {/* Sign Up Link */}
          <View style={s.footer}>
            <Text style={s.footerText}>אין לך חשבון?</Text>
            <TouchableOpacity onPress={() => router.replace("/auth/signup")}>
              <Text style={s.footerLink}> הרשם עכשיו</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Debug LOG button — small, bottom-left corner */}
      <Pressable
        onPress={() => setShowDebugLogs(true)}
        style={s.debugBtn}
      >
        <Text style={s.debugBtnText}>LOG</Text>
      </Pressable>

      <DebugLogViewer visible={showDebugLogs} onClose={() => setShowDebugLogs(false)} />
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
    paddingTop: 40,
    paddingBottom: 30,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 36,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
  },
  form: {
    gap: DS_SPACING.lg,
  },
  inputGroup: {
    gap: DS_SPACING.xs + 2,
  },
  label: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "right",
    alignSelf: "flex-start",
    writingDirection: "rtl",
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg,
  },
  input: {
    flex: 1,
    paddingVertical: DS_SPACING.md + 2,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    writingDirection: "rtl",
  },
  inputIcon: {
    marginRight: DS_SPACING.sm,
  },
  forgotButton: {
    alignSelf: "flex-start",
    marginTop: -DS_SPACING.sm,
  },
  forgotText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.medium,
  },
  errorBox: {
    flexDirection: "row",
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
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: DS_SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: DS_COLORS.border,
  },
  dividerText: {
    marginHorizontal: DS_SPACING.md,
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  googleButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md + 2,
    ...DS_SHADOW.subtle,
  },
  googleButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
  },
  footerText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
  },
  footerLink: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.bold,
  },
  debugBtn: {
    position: "absolute",
    bottom: 20,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  debugBtnText: {
    fontSize: 11,
    color: DS_COLORS.textSecondary,
    fontWeight: "600" as any,
  },
});
