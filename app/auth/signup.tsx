import { useState, useCallback, useRef, useEffect } from "react";
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
  Image,
  Modal } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { HAS_REGISTERED_KEY } from "@/components/app-gate";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DotsButton } from "@/components/dots-button";
import { validateEmailForRegistration, type EmailValidationResult } from "@/lib/validate-email";
import { LinearGradient } from "expo-linear-gradient";

type SignupButtonState = "idle" | "loading" | "success" | "error";

export default function SignupScreen() {
  const { signUp, signInWithGoogle, resendConfirmation } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [buttonState, setButtonState] = useState<SignupButtonState>("idle");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  // After signup attempt (any outcome), show unified confirmation screen
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Email confirmation modal state
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailValidation, setEmailValidation] = useState<EmailValidationResult | null>(null);

  const emailInputRef = useRef<TextInput>(null);

  // Cooldown timer cleanup
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // The actual signup call to Supabase (called after user confirms modal)
  const performSignup = useCallback(async () => {
    setEmailModalVisible(false);
    setLoading(true);
    setButtonState("loading");
    const { error: authError } = await signUp(email, password, fullName);
    setLoading(false);

    // Security: For ANY outcome (success, duplicate email, etc.),
    // show the same unified confirmation screen.
    // Only show error for actual technical failures (network, server error).
    if (authError) {
      const msg = authError.message?.toLowerCase() || "";
      if (
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("timeout") ||
        msg.includes("500") ||
        msg.includes("server")
      ) {
        setError("Error signing up. Check your internet connection and try again");
        setButtonState("error");
        return;
      }
    }

    // Mark that user has attempted registration (for AppGate routing)
    try {
      await AsyncStorage.setItem(HAS_REGISTERED_KEY, "true");
    } catch {}
    setButtonState("success");
    setShowConfirmation(true);
  }, [fullName, email, password, signUp]);

  const handleSignup = useCallback(async () => {
    setError("");
    setEmailWarning("");

    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter an email address");
      return;
    }

    // Use centralized email validation
    const validation = validateEmailForRegistration(email);

    // State A: Block — invalid format
    if (validation.shouldBlock) {
      setError(validation.message);
      emailInputRef.current?.focus();
      return;
    }

    // Password checks
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // State B or C: Show confirmation/warning modal
    if (validation.shouldShowConfirmModal) {
      setEmailValidation(validation);
      setEmailModalVisible(true);
      return;
    }

    // Fallback: proceed directly (shouldn't normally reach here)
    await performSignup();
  }, [fullName, email, password, confirmPassword, performSignup]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return;
    setResending(true);
    setResendSuccess(false);

    // Try auth.resend first, then fall back to signUp which reliably re-sends
    const { error: resendError } = await resendConfirmation(email);
    if (resendError) {
      // Fallback: call signUp again — Supabase re-sends confirmation for unverified users
      await signUp(email, password, fullName);
    }

    setResending(false);
    setResendSuccess(true);
    startCooldown();
    // Reset success message after 5 seconds
    setTimeout(() => setResendSuccess(false), 5000);
  }, [email, password, fullName, resendConfirmation, signUp, cooldown, startCooldown]);

  const handleGoogleSignIn = useCallback(async () => {
    setError("");
    setGoogleLoading(true);
    const { error: authError } = await signInWithGoogle();
    setGoogleLoading(false);

    if (authError) {
      setError("Error signing in with Google. Please try again");
    }
  }, [signInWithGoogle]);

  // ============ EMAIL CONFIRMATION/WARNING MODAL ============
  const renderEmailModal = () => {
    if (!emailValidation) return null;

    const isSuspicious = emailValidation.isSuspicious;
    const title = isSuspicious ? "Please check the email address" : "Email address verification";
    const confirmLabel = isSuspicious ? "The address is correct, continue" : "Confirm and continue";

    return (
      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {/* Icon */}
            <View style={[s.modalIconWrap, isSuspicious && s.modalIconWrapWarning]}>
              <MaterialIcons
                name={isSuspicious ? "warning" : "email"}
                size={36}
                color={isSuspicious ? DS_COLORS.warning : DS_COLORS.accent}
              />
            </View>

            {/* Title */}
            <Text style={s.modalTitle}>{title}</Text>

            {/* Email display */}
            <Text style={s.modalEmail}>{email.trim()}</Text>

            {/* Message body */}
            {isSuspicious ? (
              <View style={s.modalBody}>
                <Text style={s.modalText}>
                  The address looks a bit unusual.
                </Text>
                <Text style={s.modalText}>
                  There might be a small typo in the domain or email provider name.
                </Text>
                {emailValidation.suggestion ? (
                  <Text style={s.modalSuggestion}>{emailValidation.suggestion}</Text>
                ) : null}
                <Text style={s.modalText}>
                  If the address is correct — you can continue.{"\n"}
                  If there is a mistake — fix it now so the verification email reaches you.
                </Text>
              </View>
            ) : (
              <View style={s.modalBody}>
                <Text style={s.modalText}>
                  A verification email will be sent to this address.
                </Text>
                <Text style={s.modalText}>
                  Please make sure there are no typos before continuing.
                </Text>
              </View>
            )}

            {/* Buttons */}
            <TouchableOpacity
              style={[s.modalPrimaryBtn, isSuspicious && s.modalPrimaryBtnWarning]}
              onPress={performSignup}
              activeOpacity={0.8}
            >
              <Text style={s.modalPrimaryBtnText}>{confirmLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.modalSecondaryBtn}
              onPress={() => {
                setEmailModalVisible(false);
                setTimeout(() => emailInputRef.current?.focus(), 300);
              }}
              activeOpacity={0.7}
            >
              <Text style={s.modalSecondaryBtnText}>Fix the email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ============ UNIFIED CONFIRMATION SCREEN ============
  // Shown for ALL signup outcomes (new, duplicate unverified, duplicate verified)
  if (showConfirmation) {
    return (
      <LinearGradient colors={["#020708", "#061214", "#020708"]} style={{ flex: 1 }}>
        <SafeAreaView style={s.container}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} showsVerticalScrollIndicator={false}>
            <View style={s.verificationContainer}>
              {/* Glow effects */}
              <View style={s.verifyGlowTop} />
              <View style={s.verifyGlowBottom} />

              {/* Email icon */}
              <View style={s.verificationIconWrap}>
                <MaterialIcons name="mark-email-read" size={48} color="#79FFF4" />
              </View>

              <Text style={s.verificationTitle}>Almost done!</Text>
              <Text style={s.verificationDescription}>
                We sent you an email with a link to verify your address
              </Text>

              <Text style={s.verificationEmail}>{email}</Text>

              {/* Spam hint */}
              <View style={s.hintBox}>
                <MaterialIcons name="info-outline" size={18} color="#AAB6BB" />
                <Text style={s.hintText}>
                  Didn't receive it? Check your spam folder too
                </Text>
              </View>

              {/* Resend button (secondary/outline) */}
              <TouchableOpacity
                style={[s.resendButton, (resending || cooldown > 0) && s.buttonDisabled]}
                onPress={handleResend}
                disabled={resending || cooldown > 0}
                activeOpacity={0.7}
              >
                {resending ? (
                  <ActivityIndicator color="#79FFF4" size="small" />
                ) : cooldown > 0 ? (
                  <Text style={[s.resendButtonText, { color: "#77868B" }]}>
                    You can resend in {cooldown} seconds
                  </Text>
                ) : (
                  <>
                    <MaterialIcons name="refresh" size={18} color="#79FFF4" />
                    <Text style={s.resendButtonText}>Resend verification link</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Resend success feedback */}
              {resendSuccess && (
                <View style={s.resendSuccessBox}>
                  <MaterialIcons name="check-circle" size={16} color="#4ADE80" />
                  <Text style={s.resendSuccessText}>Link resent successfully</Text>
                </View>
              )}

              {/* Primary button - Go to Login */}
              <TouchableOpacity
                style={s.verifyPrimaryButton}
                onPress={() => router.replace("/auth/login")}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#0E5858", "#12A59E", "#0B4D50"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.verifyPrimaryGradient}
                >
                  <View style={s.verifyButtonShine} />
                  <Text style={s.verifyPrimaryButtonText}>Go to sign in</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Back to signup form (small link) */}
              <TouchableOpacity
                onPress={() => {
                  setShowConfirmation(false);
                  setPassword("");
                  setResendSuccess(false);
                }}
                style={s.backButton}
                activeOpacity={0.7}
              >
                <Text style={s.backButtonText}>Back to sign up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============ SIGNUP FORM ============
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
            <Text style={s.title}>Create account</Text>
            <Text style={s.subtitle}>Sign up to start managing your business</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            {/* Full Name */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Full name</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter full name"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  textAlign="left"
                  returnKeyType="next"
                />
                <MaterialIcons name="person" size={20} color={DS_COLORS.textSecondary} style={s.inputIcon} />
              </View>
            </View>

            {/* Email */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Email</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  ref={emailInputRef}
                  style={s.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setEmailWarning(""); setError(""); }}
                  onBlur={() => {
                    if (!email.trim()) return;
                    const validation = validateEmailForRegistration(email);
                    if (validation.isSuspicious && validation.suggestion) {
                      setEmailWarning(validation.suggestion);
                    }
                  }}
                  placeholder="example@email.com"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                  returnKeyType="next"
                />
                <MaterialIcons name="email" size={20} color={DS_COLORS.textSecondary} style={s.inputIcon} />
              </View>
              {emailWarning ? (
                <View style={s.emailWarningRow}>
                  <MaterialIcons name="info-outline" size={14} color={DS_COLORS.warning} />
                  <Text style={s.emailWarningText}>{emailWarning}</Text>
                </View>
              ) : null}
            </View>

            {/* Password */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrapper}>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  secureTextEntry={!showPassword}
                  textAlign="left"
                  returnKeyType="next"
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

            {/* Confirm Password */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Confirm password</Text>
              <View style={[s.inputWrapper, confirmPassword.length > 0 && password !== confirmPassword && { borderColor: DS_COLORS.error }]}>
                <TextInput
                  style={s.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Enter password again"
                  placeholderTextColor={DS_COLORS.textSecondary}
                  secureTextEntry={!showConfirmPassword}
                  textAlign="left"
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={s.inputIcon}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? "visibility" : "visibility-off"}
                    size={20}
                    color={DS_COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {confirmPassword.length > 0 && password !== confirmPassword ? (
                <Text style={s.mismatchHint}>Passwords do not match</Text>
              ) : null}
            </View>

            {/* Error — only shown for technical/network errors or validation blocks */}
            {error ? (
              <View style={s.errorBox}>
                <MaterialIcons name="error-outline" size={18} color={DS_COLORS.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Signup Button — Dots Animation */}
            <DotsButton
              state={buttonState}
              label="Sign up"
              loadingLabel="Nard"
              onPress={handleSignup}
            />

            {/* Divider + Google Sign-In — hidden for now, will be re-enabled later */}
          </View>

          {/* Login Link */}
          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.replace("/auth/login")}>
              <Text style={s.footerLink}> Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Email Confirmation/Warning Modal */}
      {renderEmailModal()}
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
    color: DS_COLORS.textSecondary,
    textAlign: "center" },
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
  emailWarningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DS_SPACING.xs,
    marginTop: DS_SPACING.xs },
  emailWarningText: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.warning,
    textAlign: "left" },
  mismatchHint: {
    fontSize: DS_FONT.caption,
    color: DS_COLORS.error,
    textAlign: "left",
    marginTop: DS_SPACING.xs },
  primaryButton: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: DS_SPACING.sm,
    ...DS_SHADOW.button },
  buttonDisabled: {
    opacity: 0.7 },
  primaryButtonText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold },
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
    fontWeight: DS_WEIGHT.bold },
  // ============ EMAIL MODAL STYLES ============
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DS_SPACING.xl },
  modalCard: {
    backgroundColor: DS_COLORS.card,
    borderRadius: DS_RADIUS.lg,
    paddingVertical: DS_SPACING.xl + 4,
    paddingHorizontal: DS_SPACING.lg,
    width: "100%",
    maxWidth: 360,
    alignItems: "center" },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${DS_COLORS.accent}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.lg },
  modalIconWrapWarning: {
    backgroundColor: `${DS_COLORS.warning}20` },
  modalTitle: {
    fontSize: DS_FONT.titleCard,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    textAlign: "center",
    marginBottom: DS_SPACING.sm },
  modalEmail: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.accent,
    textAlign: "center",
    marginBottom: DS_SPACING.md,
    writingDirection: "ltr" as any },
  modalBody: {
    gap: DS_SPACING.sm,
    marginBottom: DS_SPACING.lg },
  modalText: {
    fontSize: DS_FONT.bodySmall,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 22 },
  modalSuggestion: {
    fontSize: DS_FONT.bodySmall,
    fontWeight: DS_WEIGHT.semibold,
    color: DS_COLORS.warning,
    textAlign: "center",
    marginTop: DS_SPACING.xs },
  modalPrimaryBtn: {
    backgroundColor: DS_COLORS.accent,
    borderRadius: DS_RADIUS.md,
    paddingVertical: DS_SPACING.md + 2,
    paddingHorizontal: DS_SPACING.xl,
    width: "100%",
    alignItems: "center",
    marginBottom: DS_SPACING.sm },
  modalPrimaryBtnWarning: {
    backgroundColor: DS_COLORS.warning },
  modalPrimaryBtnText: {
    color: DS_COLORS.white,
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.bold },
  modalSecondaryBtn: {
    paddingVertical: DS_SPACING.md + 2,
    paddingHorizontal: DS_SPACING.xl,
    width: "100%",
    alignItems: "center",
    borderRadius: DS_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DS_COLORS.border,
    backgroundColor: DS_COLORS.inputBg },
  modalSecondaryBtnText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textPrimary,
    fontWeight: DS_WEIGHT.semibold },
  // ============ UNIFIED CONFIRMATION SCREEN STYLES (Dark Premium) ============
  verifyGlowTop: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(53, 233, 221, 0.06)" },
  verifyGlowBottom: {
    position: "absolute",
    bottom: 40,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(216, 162, 74, 0.04)" },
  verificationContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xl },
  verificationIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: "rgba(101, 255, 239, 0.5)",
    backgroundColor: "rgba(53, 233, 221, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28 },
  verificationTitle: {
    fontSize: 28,
    fontWeight: "800" as any,
    color: "#E7ECEF",
    marginBottom: 12,
    textAlign: "center"
  },
  verificationDescription: {
    fontSize: 16,
    color: "#AAB6BB",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 8
  },
  verificationEmail: {
    fontSize: 17,
    fontWeight: "700" as any,
    color: "#79FFF4",
    textAlign: "center",
    marginBottom: 24,
    writingDirection: "ltr" as any },
  hintBox: {
    flexDirection: "row" as any,
    alignItems: "center",
    gap: DS_SPACING.sm,
    backgroundColor: "rgba(5, 22, 24, 0.76)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(101, 255, 239, 0.15)",
    paddingHorizontal: DS_SPACING.lg,
    paddingVertical: DS_SPACING.md,
    marginBottom: 20 },
  hintText: {
    fontSize: DS_FONT.bodySmall,
    color: "#AAB6BB",
    textAlign: "left" as any
  },
  resendButton: {
    flexDirection: "row" as any,
    alignItems: "center",
    justifyContent: "center",
    gap: DS_SPACING.sm,
    paddingVertical: DS_SPACING.md,
    paddingHorizontal: DS_SPACING.lg,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(101, 255, 239, 0.4)",
    backgroundColor: "rgba(5, 22, 24, 0.5)",
    marginBottom: 12,
    minWidth: 240 },
  resendButtonText: {
    fontSize: DS_FONT.bodySmall,
    color: "#79FFF4",
    fontWeight: "600" as any
  },
  resendSuccessBox: {
    flexDirection: "row" as any,
    alignItems: "center",
    gap: DS_SPACING.xs,
    marginBottom: 16 },
  resendSuccessText: {
    fontSize: DS_FONT.bodySmall,
    color: "#4ADE80",
    fontWeight: "600" as any },
  verifyPrimaryButton: {
    width: "100%" as any,
    maxWidth: 280,
    borderRadius: 18,
    overflow: "hidden" as any,
    marginTop: DS_SPACING.sm,
    marginBottom: 8,
    shadowColor: "#35E9DD",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8 },
  verifyPrimaryGradient: {
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 18,
    alignItems: "center" as any,
    justifyContent: "center" as any,
    overflow: "hidden" as any },
  verifyButtonShine: {
    position: "absolute" as any,
    top: 0,
    left: 0,
    right: 0,
    height: "50%" as any,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18 },
  verifyPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700" as any
  },
  backButton: {
    marginTop: DS_SPACING.lg,
    paddingVertical: DS_SPACING.sm },
  backButtonText: {
    fontSize: DS_FONT.bodySmall,
    color: "#77868B",
    textAlign: "center" as any
  } });
