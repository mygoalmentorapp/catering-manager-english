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
  StyleSheet } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { DS_COLORS, DS_FONT, DS_WEIGHT, DS_SPACING, DS_RADIUS, DS_SHADOW } from "@/lib/design-system";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = useCallback(async () => {
    setError("");

    if (!email.trim()) {
      setError("Please enter an email address");
      return;
    }

    setLoading(true);
    const { error: authError } = await resetPassword(email);
    setLoading(false);

    if (authError) {
      setError("Error sending the link. Please try again");
      return;
    }

    setSent(true);
  }, [email, resetPassword]);

  if (sent) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <View style={s.successIcon}>
            <MaterialIcons name="mark-email-read" size={48} color={DS_COLORS.accent} />
          </View>
          <Text style={s.successTitle}>Link sent!</Text>
          <Text style={s.successText}>
            We sent a password reset link to {email}. Check your inbox (including spam).
          </Text>
          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => router.replace("/auth/login")}
            activeOpacity={0.8}
          >
            <Text style={s.primaryButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* Back Button */}
          <TouchableOpacity
            style={s.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="chevron-right" size={28} color={DS_COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={s.header}>
            <View style={s.iconCircle}>
              <MaterialIcons name="lock-reset" size={36} color={DS_COLORS.accent} />
            </View>
            <Text style={s.title}>Forgot password?</Text>
            <Text style={s.subtitle}>
              Enter your email address and we will send you a password reset link
            </Text>
          </View>

          {/* Form */}
          <View style={s.form}>
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
                  returnKeyType="done"
                  onSubmitEditing={handleReset}
                />
                <MaterialIcons name="email" size={20} color={DS_COLORS.textSecondary} style={s.inputIcon} />
              </View>
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
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={DS_COLORS.white} />
              ) : (
                <Text style={s.primaryButtonText}>Send reset link</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Back to Login */}
          <View style={s.footer}>
            <Text style={s.footerText}>Remember your password?</Text>
            <TouchableOpacity onPress={() => router.replace("/auth/login")}>
              <Text style={s.footerLink}> Sign in</Text>
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
    paddingTop: 20,
    paddingBottom: 30,
    justifyContent: "center" },
  backButton: {
    alignSelf: "flex-end",
    marginBottom: DS_SPACING.lg },
  header: {
    alignItems: "center",
    marginBottom: 36 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.lg },
  title: {
    fontSize: 28,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: 8 },
  subtitle: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24 },
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
  // Success state
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DS_SPACING.xl },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DS_COLORS.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DS_SPACING.xxl },
  successTitle: {
    fontSize: 24,
    fontWeight: DS_WEIGHT.bold,
    color: DS_COLORS.textPrimary,
    marginBottom: DS_SPACING.md },
  successText: {
    fontSize: DS_FONT.body,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: DS_SPACING.xxl } });
