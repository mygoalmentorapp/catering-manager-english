import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Image } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DotsButton } from "@/components/dots-button";

type ButtonState = "idle" | "loading" | "success" | "error";

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  // Track whether signIn succeeded so we can show success animation
  const signInSucceededRef = useRef(false);

  const handleLogin = useCallback(async () => {
    setError("");

    if (!email.trim()) {
      setError("Please enter an email address");
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
      iol: "co.il", il: "co.il" };
    const domainTypos: Record<string, string> = {
      "gmial.com": "gmail.com", "gmaill.com": "gmail.com",
      "gmal.com": "gmail.com", "gmali.com": "gmail.com",
      "gamil.com": "gmail.com", "gnail.com": "gmail.com",
      "gmaul.com": "gmail.com", "gmsil.com": "gmail.com",
      "hotmal.com": "hotmail.com", "hotmial.com": "hotmail.com",
      "hotmil.com": "hotmail.com", "hotmaill.com": "hotmail.com",
      "outlok.com": "outlook.com", "outllook.com": "outlook.com",
      "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com" };
    const suggestedDomain = domainTypos[domain];
    const suggestedTld = tldTypos[tld];
    if (suggestedDomain) {
      const corrected = emailLower.split("@")[0] + "@" + suggestedDomain;
      setError(`Did you mean ${corrected}?`);
      return;
    }
    if (suggestedTld) {
      const correctedDomain = domain.replace(new RegExp(tld + "$"), suggestedTld);
      const corrected = emailLower.split("@")[0] + "@" + correctedDomain;
      setError(`Did you mean ${corrected}?`);
      return;
    }

    if (!password) {
      setError("Please enter a password");
      return;
    }

    setButtonState("loading");
    const { error: authError } = await signIn(email, password);

    if (authError) {
      const msg = authError.message || "";

      // Timeout from our safety wrapper (signInWithPassword hung)
      if (msg === "timeout") {
        setError("Login took too long. Please try again in a moment");
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
        setError("No internet connection. Check your connection and try again");
      } else if (
        msg.includes("Invalid login") ||
        msg.includes("Email not confirmed")
      ) {
        // Security: Use the same generic error for all auth failures.
        setError("Incorrect email or password");
      } else {
        setError("Error signing in. Please try again");
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
      setError("Error signing in with Google. Please try again");
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
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.subtitle}>Sign in to your account</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            {/* Email */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Email</Text>
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
                  textAlign="left"
                  returnKeyType="next"
                  editable={buttonState !== "loading" && buttonState !== "success"}
                />
                <MaterialIcons name="email" size={20} color={DS_COLORS.textSecondary} style={s.inputIcon} />
              </View>
            </View>

            {/* Password */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  secureTextEntry={!showPassword}
                  textAlign="left"
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
              <Text style={s.forgotText}>Forgot password?</Text>
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
              label="Sign in"
              loadingLabel="Connecting"
              onPress={handleLogin}
            />

            {/* Divider + Google Sign-In — hidden for now, will be re-enabled later */}
          </View>

          {/* Sign Up Link */}
          <View style={s.footer}>
            <Text style={s.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => router.replace("/auth/signup")}>
              <Text style={s.footerLink}> Sign up now</Text>
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
    backgroundColor: DS_COLORS.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: DS_SPACING.xl,
    paddingTop: 40,
    paddingBottom: 30,
    justifyContent: "center" },
  header: {
    alignItems: "center",
    marginBottom: 36 },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16 },
  title: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: 8 },
  subtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary },
  form: {
    gap: DS_SPACING.lg },
  inputGroup: {
    gap: DS_SPACING.xs + 2 },
  label: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary,
    textAlign: "left",
    alignSelf: "flex-start"
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingHorizontal: DS_SPACING.lg },
  input: {
    flex: 1,
    paddingVertical: DS_SPACING.md + 2,
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary
  },
  inputIcon: {
    marginRight: DS_SPACING.sm },
  forgotButton: {
    alignSelf: "flex-start",
    marginTop: -DS_SPACING.sm },
  forgotText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.medium },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1,
    borderColor: DS_COLORS.error,
    borderRadius: DS_RADIUS.sm,
    paddingHorizontal: DS_SPACING.md,
    paddingVertical: DS_SPACING.sm + 2 },
  errorText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.error,
    textAlign: "left",
    flex: 1 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: DS_SPACING.sm },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: DS_COLORS.border },
  dividerText: {
    marginHorizontal: DS_SPACING.md,
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    backgroundColor: DS_COLORS.card,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md + 2,
    ...DS_SHADOW.subtle },
  googleButtonText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.textPrimary },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32 },
  footerText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary },
  footerLink: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.bold } });
