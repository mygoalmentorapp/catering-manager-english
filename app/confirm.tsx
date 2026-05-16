import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  Pressable,
  ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "expo-linear-gradient";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Email Confirmation Screen — Dark Premium Design
 *
 * Matches the brand design language (dark bg, teal glow, premium feel).
 *
 * **Flow:**
 * 1. User clicks the verification link in their email
 * 2. Supabase's `/auth/v1/verify` endpoint validates the token securely
 * 3. After successful verification, Supabase redirects to this page (`/confirm`)
 * 4. This page shows a success message
 * 5. On mobile browser: "Open the app" button tries the deep link scheme
 * 6. If the app is not installed: user stays on this page with a clear message
 */

const BRAND = {
  bg: "#020708",
  bg2: "#061214",
  teal: "#35E9DD",
  tealSoft: "#79FFF4",
  gold: "#D8A24A",
  text: "#E7ECEF",
  muted: "#AAB6BB",
  muted2: "#77868B",
  danger: "#FF7B7B",
  card: "rgba(5, 22, 24, 0.76)",
  border: "rgba(101, 255, 239, 0.28)",
  borderStrong: "rgba(101, 255, 239, 0.72)" };

type ConfirmStatus = "loading" | "success" | "error" | "already_verified";

// Deep link scheme from app.config.ts
const DEEP_LINK_SCHEME = "manusen20260411205951";

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    error?: string;
    error_description?: string;
    error_code?: string;
  }>();

  const [status, setStatus] = useState<ConfirmStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [deepLinkAttempted, setDeepLinkAttempted] = useState(false);

  useEffect(() => {
    handleConfirmation();
  }, []);

  async function handleConfirmation() {
    try {
      if (params.error) {
        const desc = params.error_description || params.error || "Unknown error";
        setErrorMessage(desc);
        setStatus("error");
        return;
      }

      if (params.token_hash && params.type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: params.token_hash,
          type: params.type as EmailOtpType });

        if (error) {
          if (
            error.message?.toLowerCase().includes("expired") ||
            error.message?.toLowerCase().includes("already")
          ) {
            setStatus("already_verified");
          } else {
            setErrorMessage(error.message || "Verification error");
            setStatus("error");
          }
          return;
        }

        setStatus("success");
        return;
      }

      setStatus("success");
    } catch (err: any) {
      setErrorMessage(err?.message || "Unexpected error");
      setStatus("error");
    }
  }

  const handleOpenApp = useCallback(() => {
    setDeepLinkAttempted(true);
    const deepLink = `${DEEP_LINK_SCHEME}://`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = deepLink;
    } else {
      Linking.openURL(deepLink).catch(() => {});
    }
  }, []);

  // ============ LOADING STATE ============
  if (status === "loading") {
    return (
      <LinearGradient colors={[BRAND.bg, BRAND.bg2, BRAND.bg]} style={s.gradient}>
        <SafeAreaView style={s.container}>
          <View style={s.content}>
            <View style={s.iconCircle}>
              <ActivityIndicator size="large" color={BRAND.teal} />
            </View>
            <Text style={s.loadingText}>Verifying your email address...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============ ERROR STATE ============
  if (status === "error") {
    return (
      <LinearGradient colors={[BRAND.bg, BRAND.bg2, BRAND.bg]} style={s.gradient}>
        <SafeAreaView style={s.container}>
          <ScrollView contentContainerStyle={s.scrollContent}>
            <View style={s.content}>
              {/* Glow effects */}
              <View style={s.glowTop} />

              {/* Error Icon */}
              <View style={[s.iconCircle, { borderColor: BRAND.danger }]}>
                <Text style={s.iconEmoji}>✕</Text>
              </View>

              <Text style={s.title}>Verification error</Text>
              <Text style={s.subtitle}>{errorMessage}</Text>

              {/* Decorative Divider */}
              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerDiamond}>◇</Text>
                <View style={s.dividerLine} />
              </View>

              <Text style={s.hint}>
                The link may have expired or already been used.{"\n"}
                Try signing up again or request a new link from the app.
              </Text>

              {/* Secondary Button */}
              <Pressable
                onPress={handleOpenApp}
                style={({ pressed }) => [
                  s.secondaryButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text style={s.secondaryButtonText}>Back to app</Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={s.footer}>
            <Text style={s.footerText}>Catering Manager Pro</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============ SUCCESS / ALREADY VERIFIED STATE ============
  const isAlreadyVerified = status === "already_verified";

  return (
    <LinearGradient colors={[BRAND.bg, BRAND.bg2, BRAND.bg]} style={s.gradient}>
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.scrollContent}>
          <View style={s.content}>
            {/* Glow effects */}
            <View style={s.glowTop} />
            <View style={s.glowMiddle} />

            {/* Success Icon */}
            <View style={[s.iconCircle, { borderColor: BRAND.teal }]}>
              <Text style={[s.iconEmoji, { color: BRAND.teal }]}>✓</Text>
            </View>

            {/* Title */}
            <Text style={s.title}>
              {isAlreadyVerified ? "Email already verified!" : "Email verified successfully!"}
            </Text>

            {/* Subtitle */}
            <Text style={s.subtitle}>
              {isAlreadyVerified
                ? "Your email was already verified.\nYou can sign in the app."
                : "Your email has been verified successfully.\nYou can now sign in to the app and get started!"}
            </Text>

            {/* Decorative Divider */}
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerDiamond}>◇</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Primary Button */}
            <Pressable
              onPress={handleOpenApp}
              style={({ pressed }) => [
                s.primaryButtonWrap,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
            >
              <LinearGradient
                colors={["#0E5858", "#12A59E", "#0B4D50"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.primaryButton}
              >
                <View style={s.buttonShine} />
                <Text style={s.primaryButtonText}>Open the app</Text>
              </LinearGradient>
            </Pressable>

            {/* Fallback message — shown after deep link attempt */}
            {deepLinkAttempted && (
              <View style={s.fallbackContainer}>
                <View style={s.fallbackDivider} />
                <Text style={s.fallbackTitle}>App didn't open?</Text>
                <Text style={s.fallbackText}>
                  If the app isn't installed on your device, go back to the app manually and sign in with your email and password.
                </Text>
              </View>
            )}

            {/* Hint */}
            {!deepLinkAttempted && (
              <Text style={s.hint}>
                Tap the button to open the app and sign in.
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Catering Manager Pro</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  gradient: {
    flex: 1 },
  container: {
    flex: 1 },
  scrollContent: {
    flexGrow: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48 },
  glowTop: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(53, 233, 221, 0.06)" },
  glowMiddle: {
    position: "absolute",
    bottom: 80,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(216, 162, 74, 0.04)" },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    borderWidth: 2,
    borderColor: BRAND.teal,
    backgroundColor: "rgba(53, 233, 221, 0.08)" },
  iconEmoji: {
    fontSize: 40,
    color: BRAND.teal,
    fontWeight: "800" },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: BRAND.text,
    textAlign: "center",
    marginBottom: 12
  },
  subtitle: {
    fontSize: 16,
    color: BRAND.muted,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 20
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 24 },
  dividerLine: {
    width: 40,
    height: 1,
    backgroundColor: BRAND.border },
  dividerDiamond: {
    fontSize: 12,
    color: BRAND.tealSoft },
  primaryButtonWrap: {
    width: "100%",
    maxWidth: 280,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: BRAND.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8 },
  primaryButton: {
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" },
  buttonShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18 },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700"
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    minWidth: 200,
    backgroundColor: "rgba(5, 22, 24, 0.76)",
    borderWidth: 1.5,
    borderColor: BRAND.border },
  secondaryButtonText: {
    color: BRAND.tealSoft,
    fontSize: 16,
    fontWeight: "600"
  },
  hint: {
    fontSize: 14,
    color: BRAND.muted2,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 24
  },
  fallbackContainer: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 12 },
  fallbackDivider: {
    width: 40,
    height: 1,
    backgroundColor: BRAND.border,
    marginBottom: 16 },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: BRAND.text,
    textAlign: "center",
    marginBottom: 8
  },
  fallbackText: {
    fontSize: 14,
    color: BRAND.muted,
    textAlign: "center",
    lineHeight: 22
  },
  loadingText: {
    fontSize: 16,
    color: BRAND.muted,
    textAlign: "center",
    marginTop: 20
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center" },
  footerText: {
    fontSize: 13,
    color: BRAND.muted2
  } });
