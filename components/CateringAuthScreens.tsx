import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  I18nManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Catering Manager Pro - Auth / Opening Screens
 * ------------------------------------------------
 * Ready-to-integrate React Native / Expo screens:
 * - SplashScreen
 * - LoginScreen
 * - RegisterScreen
 * - EarlyAccessScreen
 *
 * Recommended packages:
 *   npx expo install expo-linear-gradient
 *
 * Optional:
 *   Use your existing Icon component instead of the simple text icons below.
 *
 * Notes for RTL:
 * - These screens are built for Hebrew / RTL.
 * - In the app entry, keep RTL enabled if the whole app is Hebrew:
 *     I18nManager.allowRTL(false);
 *     I18nManager.forceRTL(false);
 */

export const APP_BRAND = {
  appName: "Catering Manager Pro",
  colors: {
    bg: "#020708",
    bg2: "#061214",
    card: "rgba(5, 22, 24, 0.76)",
    cardStrong: "rgba(6, 29, 32, 0.9)",
    border: "rgba(101, 255, 239, 0.28)",
    borderStrong: "rgba(101, 255, 239, 0.72)",
    teal: "#35E9DD",
    tealSoft: "#79FFF4",
    gold: "#D8A24A",
    goldSoft: "#FFE2A3",
    white: "#F6F7F8",
    text: "#E7ECEF",
    muted: "#AAB6BB",
    muted2: "#77868B",
    danger: "#FF7B7B",
    disabled: "rgba(255,255,255,0.18)" },
  radius: {
    sm: 12,
    md: 18,
    lg: 26,
    xl: 34,
    pill: 999 } };

type ButtonProps = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  style?: ViewStyle;
};

type FieldProps = {
  label?: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  showSecureToggle?: boolean;
  keyboardType?: "default" | "email-address";
  error?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
};

export type SplashScreenProps = {
  loadingText?: string;
};

export type LoginScreenProps = {
  loading?: boolean;
  email?: string;
  password?: string;
  errors?: Partial<Record<"email" | "password", string>>;
  onChangeEmail?: (value: string) => void;
  onChangePassword?: (value: string) => void;
  onLogin?: () => void;
  onForgotPassword?: () => void;
  onGoToRegister?: () => void;
};

export type RegisterScreenProps = {
  loading?: boolean;
  fullName?: string;
  businessName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  errors?: Partial<Record<"fullName" | "businessName" | "email" | "password" | "confirmPassword", string>>;
  onChangeFullName?: (value: string) => void;
  onChangeBusinessName?: (value: string) => void;
  onChangeEmail?: (value: string) => void;
  onChangePassword?: (value: string) => void;
  onChangeConfirmPassword?: (value: string) => void;
  onRegister?: () => void;
  onGoToLogin?: () => void;
  onTerms?: () => void;
  onPrivacy?: () => void;
};

export type EarlyAccessScreenProps = {
  onFeedback?: () => void;
  onContinueToApp?: () => void;
};

function BrandBackground({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const { height } = useWindowDimensions();

  const content = (
    <View style={[styles.backgroundInner, { minHeight: height }]}>
      <GlowBlob style={styles.glowTop} />
      <GlowBlob style={styles.glowMiddle} />
      <View style={styles.gridTopRight} />
      <View style={styles.gridBottomLeft} />
      <View style={styles.waveLeft} />
      <View style={styles.waveRight} />
      {children}
    </View>
  );

  return (
    <LinearGradient colors={[APP_BRAND.colors.bg, APP_BRAND.colors.bg2, APP_BRAND.colors.bg]} style={styles.background}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </LinearGradient>
  );
}

function GlowBlob({ style }: { style?: ViewStyle }) {
  return <View pointerEvents="none" style={[styles.glowBlob, style]} />;
}

function LogoMark({ size = 92 }: { size?: number }) {
  return (
    <View style={[styles.logoOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={["rgba(53,233,221,0.24)", "rgba(216,162,74,0.16)", "rgba(53,233,221,0.06)"]}
        style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
      />
      <View style={[styles.logoInner, { width: size - 10, height: size - 10, borderRadius: (size - 10) / 2 }]}>
        <Text style={[styles.logoIcon, { fontSize: size * 0.43 }]}>♨</Text>
        <Text style={[styles.logoSmallIcon, { fontSize: size * 0.27 }]}>⌒</Text>
      </View>
    </View>
  );
}

function DecorativeDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerDiamond}>◇</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function BrandTitle({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  return <Text style={[styles.title, large && styles.titleLarge]}>{children}</Text>;
}

function Highlight({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.highlight, style]}>{children}</Text>;
}

function AppButton({ title, onPress, loading, disabled, variant = "primary", style }: ButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === "secondary") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.buttonBase,
          styles.buttonSecondary,
          pressed && !isDisabled && styles.buttonPressed,
          isDisabled && styles.buttonDisabled,
          style,
        ]}
      >
        {loading ? <ActivityIndicator color={APP_BRAND.colors.goldSoft} /> : <Text style={styles.buttonSecondaryText}>{title}</Text>}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.buttonBase,
        styles.buttonPrimaryShadow,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      <LinearGradient
        colors={isDisabled ? ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.08)"] : ["#0E5858", "#12A59E", "#0B4D50"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.buttonGradient}
      >
        {loading ? <LoadingLine /> : <Text style={styles.buttonPrimaryText}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

function LoadingLine() {
  return (
    <View style={styles.loadingLineWrap}>
      <View style={styles.loadingLine} />
      <Text style={styles.loadingButtonText}>Loading…</Text>
    </View>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  onToggleSecure,
  showSecureToggle,
  keyboardType = "default",
  error,
  autoCapitalize = "none" }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <View style={[styles.inputShell, focused && styles.inputFocused, !!error && styles.inputError]}>
        {showSecureToggle && (
          <Pressable onPress={onToggleSecure} hitSlop={12} style={styles.eyeButton}>
            <Text style={styles.eyeIcon}>{secureTextEntry ? "◉" : "◎"}</Text>
          </Pressable>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={APP_BRAND.colors.muted2}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          textAlign="left"
          style={[styles.input, showSecureToggle && styles.inputWithEye]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.glassCard, style]}>{children}</View>;
}

function HeroPanel() {
  return (
    <View style={styles.heroWrap}>
      <View style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <View style={styles.chartBox}>
            <Text style={styles.heroSmallTitle}>spaces</Text>
            <Text style={styles.heroNumber}>$ 12,450</Text>
            <Text style={styles.heroCaption}>Gross profit</Text>
            <View style={styles.fakeChart}>
              {[18, 28, 24, 36, 52, 48, 70].map((h, i) => (
                <View key={i} style={[styles.fakeBar, { height: h }]} />
              ))}
            </View>
          </View>
          <View style={styles.ordersBox}>
            <Text style={styles.heroSmallTitle}>Orders</Text>
            {[0, 1, 2, 3].map((_, i) => (
              <View key={i} style={styles.orderRow}>
                <Text style={styles.checkIcon}>{i === 3 ? "◌" : "✓"}</Text>
                <View style={[styles.orderLine, { width: 92 - i * 10 }]} />
              </View>
            ))}
          </View>
        </View>
        <View style={styles.chafingDish}>
          <View style={styles.dishLid} />
          <View style={styles.dishBody} />
          <View style={styles.dishLegsRow}>
            <View style={styles.dishLeg} />
            <View style={styles.dishLeg} />
          </View>
        </View>
      </View>
      <View style={[styles.miniCard, styles.miniCardLeft]}>
        <Text style={styles.miniIcon}>🛒</Text>
        <Text style={styles.miniText}>Smart shopping</Text>
      </View>
      <View style={[styles.miniCard, styles.miniCardRight]}>
        <Text style={styles.miniIcon}>☑</Text>
        <Text style={styles.miniText}>Order tracking</Text>
      </View>
    </View>
  );
}

export function SplashScreen({ loadingText = "Loading your management environment…" }: SplashScreenProps) {
  return (
    <SafeAreaView style={styles.root}>
      <BrandBackground>
        <View style={styles.splashContent}>
          <LogoMark size={104} />
          <View style={styles.spacer24} />
          <Text style={styles.appName}>
            Catering Manager <Highlight style={styles.proHighlight}>Pro</Highlight>
          </Text>
          <DecorativeDivider />
          <Text style={styles.subtitle}>Order management, shopping, and more — all in one place</Text>
          <HeroPanel />
          <View style={styles.loadingArcWrap}>
            <View style={styles.loadingArc} />
            <View style={styles.loadingDots}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.loadingDot, i === 2 && styles.loadingDotActive]} />
              ))}
            </View>
          </View>
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      </BrandBackground>
    </SafeAreaView>
  );
}

export function LoginScreen({
  loading,
  email: emailProp,
  password: passwordProp,
  errors,
  onChangeEmail,
  onChangePassword,
  onLogin,
  onForgotPassword,
  onGoToRegister }: LoginScreenProps) {
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [secure, setSecure] = useState(true);

  const email = emailProp ?? localEmail;
  const password = passwordProp ?? localPassword;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <BrandBackground scroll>
          <View style={styles.formScreen}>
            <LogoMark size={86} />
            <View style={styles.spacer24} />
            <BrandTitle>
              Welcome back <Highlight>Back</Highlight>
            </BrandTitle>
            <DecorativeDivider />
            <Text style={styles.subtitle}>Sign in to continue managing your orders, shopping, and business</Text>

            <GlassCard style={styles.authCard}>
              <InputField
                label="Email"
                placeholder="Email"
                value={email}
                onChangeText={onChangeEmail ?? setLocalEmail}
                keyboardType="email-address"
                error={errors?.email}
              />
              <InputField
                label="Password"
                placeholder="Password"
                value={password}
                onChangeText={onChangePassword ?? setLocalPassword}
                secureTextEntry={secure}
                showSecureToggle
                onToggleSecure={() => setSecure((v) => !v)}
                error={errors?.password}
              />
              <Pressable onPress={onForgotPassword} hitSlop={10} style={styles.linkRightWrap}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            </GlassCard>

            <AppButton title="Sign in" loading={loading} disabled={loading} onPress={onLogin} style={styles.fullButton} />

            <View style={styles.inlineLinkRow}>
              <Text style={styles.inlineMuted}>Don't have an account? </Text>
              <Pressable onPress={onGoToRegister} hitSlop={10}>
                <Text style={styles.linkText}>Sign up</Text>
              </Pressable>
            </View>
          </View>
        </BrandBackground>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function RegisterScreen({
  loading,
  fullName: fullNameProp,
  businessName: businessNameProp,
  email: emailProp,
  password: passwordProp,
  confirmPassword: confirmPasswordProp,
  errors,
  onChangeFullName,
  onChangeBusinessName,
  onChangeEmail,
  onChangePassword,
  onChangeConfirmPassword,
  onRegister,
  onGoToLogin,
  onTerms,
  onPrivacy }: RegisterScreenProps) {
  const [localFullName, setLocalFullName] = useState("");
  const [localBusinessName, setLocalBusinessName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localConfirmPassword, setLocalConfirmPassword] = useState("");
  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirm, setSecureConfirm] = useState(true);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <BrandBackground scroll>
          <View style={styles.formScreen}>
            <LogoMark size={82} />
            <View style={styles.spacer18} />
            <BrandTitle>
              Create a <Highlight>new</Highlight> account
            </BrandTitle>
            <DecorativeDivider />
            <Text style={styles.subtitle}>Start managing your catering business in an organized, smart, and profitable way</Text>

            <GlassCard style={styles.registerCard}>
              <InputField
                placeholder="Full name"
                value={fullNameProp ?? localFullName}
                onChangeText={onChangeFullName ?? setLocalFullName}
                error={errors?.fullName}
              />
              <InputField
                placeholder="Business name"
                value={businessNameProp ?? localBusinessName}
                onChangeText={onChangeBusinessName ?? setLocalBusinessName}
                error={errors?.businessName}
              />
              <InputField
                placeholder="Email"
                value={emailProp ?? localEmail}
                onChangeText={onChangeEmail ?? setLocalEmail}
                keyboardType="email-address"
                error={errors?.email}
              />
              <InputField
                placeholder="Password"
                value={passwordProp ?? localPassword}
                onChangeText={onChangePassword ?? setLocalPassword}
                secureTextEntry={securePassword}
                showSecureToggle
                onToggleSecure={() => setSecurePassword((v) => !v)}
                error={errors?.password}
              />
              <InputField
                placeholder="Confirm password"
                value={confirmPasswordProp ?? localConfirmPassword}
                onChangeText={onChangeConfirmPassword ?? setLocalConfirmPassword}
                secureTextEntry={secureConfirm}
                showSecureToggle
                onToggleSecure={() => setSecureConfirm((v) => !v)}
                error={errors?.confirmPassword}
              />

              <AppButton title="Create account" loading={loading} disabled={loading} onPress={onRegister} style={styles.cardButton} />

              <View style={styles.legalRow}>
                <Text style={styles.legalText}>By signing up you agree to the </Text>
                <Pressable onPress={onTerms} hitSlop={8}>
                  <Text style={styles.legalLink}>Terms of use</Text>
                </Pressable>
                <Text style={styles.legalText}> and </Text>
                <Pressable onPress={onPrivacy} hitSlop={8}>
                  <Text style={styles.legalLink}>Privacy Policy</Text>
                </Pressable>
              </View>

              <View style={styles.inlineLinkRow}>
                <Text style={styles.inlineMuted}>Already have an account? </Text>
                <Pressable onPress={onGoToLogin} hitSlop={10}>
                  <Text style={styles.linkText}>Sign in</Text>
                </Pressable>
              </View>
            </GlassCard>
          </View>
        </BrandBackground>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function EarlyAccessScreen({ onFeedback, onContinueToApp }: EarlyAccessScreenProps) {
  const items = useMemo(
    () => [
      { icon: "▣", text: "Create products and ingredients" },
      { icon: "▦", text: "Manage orders in an organized way" },
      { icon: "🛒", text: "Generate an automatic shopping list from the order" },
      { icon: "◌", text: "Send feedback to help improve the user experience" },
    ],
    []
  );

  return (
    <SafeAreaView style={styles.root}>
      <BrandBackground scroll>
        <View style={styles.earlyScreen}>
          <LogoMark size={64} />
          <View style={styles.spacer20} />
          <BrandTitle large>
            You got <Highlight>early</Highlight> access
          </BrandTitle>
          <DecorativeDivider />

          <Text style={styles.earlyBody}>
            We are glad you chose to join the first wave of Catering Manager Pro.{"\n"}
            This is early access to a system built especially for you — to help manage orders, products, shopping, and profitability in an organized, smart, and clear way.{"\n\n"}
            In this wave, you join the first group of users who get everything first and can help refine the experience through real-world use.
          </Text>

          <GlassCard style={styles.earlyCard}>
            <Text style={styles.earlyCardTitle}>What can you do now?</Text>
            <View style={styles.earlyCardDividerWrap}>
              <DecorativeDivider />
            </View>
            {items.map((item, index) => (
              <View key={item.text} style={[styles.bulletRow, index > 0 && styles.bulletDivider]}>
                <Text style={styles.bulletCheck}>✓</Text>
                <Text style={styles.bulletText}>{item.text}</Text>
                <Text style={styles.bulletIcon}>{item.icon}</Text>
              </View>
            ))}
          </GlassCard>

          <AppButton title="Continue to app" onPress={onContinueToApp} style={styles.fullButton} />
        </View>
      </BrandBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_BRAND.colors.bg,
  },
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  backgroundInner: {
    flex: 1,
    overflow: "hidden",
    paddingHorizontal: 24,
  },
  glowBlob: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(53,233,221,0.13)",
    opacity: 0.85,
  },
  glowTop: {
    top: 70,
    alignSelf: "center",
  },
  glowMiddle: {
    top: 410,
    right: -160,
    backgroundColor: "rgba(53,233,221,0.10)",
  },
  gridTopRight: {
    position: "absolute",
    top: 36,
    right: 24,
    width: 110,
    height: 110,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(53,233,221,0.05)",
    opacity: 0.3,
  },
  gridBottomLeft: {
    position: "absolute",
    bottom: 70,
    left: 8,
    width: 120,
    height: 120,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(53,233,221,0.05)",
    opacity: 0.25,
  },
  waveLeft: {
    position: "absolute",
    left: -80,
    top: 520,
    width: 260,
    height: 1,
    backgroundColor: "rgba(53,233,221,0.25)",
    transform: [{ rotate: "-10deg" }],
  },
  waveRight: {
    position: "absolute",
    right: -80,
    top: 530,
    width: 260,
    height: 1,
    backgroundColor: "rgba(53,233,221,0.22)",
    transform: [{ rotate: "10deg" }],
  },

  splashContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 20,
    paddingBottom: 38,
  },
  formScreen: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 42,
    paddingBottom: 42,
    alignItems: "center",
  },
  earlyScreen: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: "center",
  },

  logoOuter: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(53,233,221,0.55)",
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.65,
    shadowRadius: 22,
    elevation: 8,
  },
  logoInner: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    borderColor: APP_BRAND.colors.goldSoft,
    backgroundColor: "rgba(2,7,8,0.72)",
  },
  logoIcon: {
    color: APP_BRAND.colors.goldSoft,
    lineHeight: 46,
    marginTop: 4,
  },
  logoSmallIcon: {
    color: APP_BRAND.colors.gold,
    lineHeight: 24,
    marginTop: -20,
  },

  spacer18: { height: 18 },
  spacer20: { height: 10 },
  spacer24: { height: 24 },

  appName: {
    color: APP_BRAND.colors.white,
    fontSize: 40,
    fontWeight: "800",
    textAlign: "center",
    writingDirection: "rtl",
    letterSpacing: -0.5,
  },
  proHighlight: {
    fontSize: 42,
  },
  title: {
    color: APP_BRAND.colors.white,
    fontSize: 38,
    fontWeight: "800",
    textAlign: "center",
    writingDirection: "rtl",
    letterSpacing: -0.4,
  },
  titleLarge: {
    fontSize: 30,
  },
  highlight: {
    color: APP_BRAND.colors.tealSoft,
    textShadowColor: "rgba(53,233,221,0.42)",
    textShadowRadius: 12,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 12,
    color: APP_BRAND.colors.text,
    opacity: 0.88,
    fontSize: 18,
    lineHeight: 29,
    textAlign: "center",
    writingDirection: "rtl",
    maxWidth: 360,
  },
  dividerRow: {
    marginTop: 8,
    width: 168,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  },
  dividerLine: {
    width: 58,
    height: 1,
    backgroundColor: "rgba(216,162,74,0.75)",
  },
  dividerDiamond: {
    color: APP_BRAND.colors.gold,
    fontSize: 18,
    lineHeight: 22,
  },

  heroWrap: {
    width: "100%",
    maxWidth: 380,
    height: 315,
    marginTop: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPanel: {
    width: "88%",
    height: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: APP_BRAND.colors.borderStrong,
    backgroundColor: "rgba(6, 30, 32, 0.58)",
    padding: 18,
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  heroTopRow: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  chartBox: {
    flex: 1,
    minHeight: 120,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.19)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    alignItems: "flex-end",
  },
  ordersBox: {
    flex: 0.8,
    minHeight: 120,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 12,
    alignItems: "flex-end",
  },
  heroSmallTitle: {
    color: APP_BRAND.colors.text,
    fontSize: 14,
    writingDirection: "rtl",
  },
  heroNumber: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  heroCaption: {
    color: APP_BRAND.colors.muted,
    fontSize: 12,
  },
  fakeChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    height: 74,
    marginTop: 8,
    alignSelf: "stretch",
  },
  fakeBar: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(53,233,221,0.8)",
  },
  orderRow: {
    marginTop: 10,
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
  },
  checkIcon: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 16,
    fontWeight: "800",
  },
  orderLine: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  chafingDish: {
    position: "absolute",
    bottom: -22,
    alignSelf: "center",
    width: 210,
    height: 116,
    alignItems: "center",
  },
  dishLid: {
    width: 176,
    height: 45,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    backgroundColor: "#D6D0C5",
    borderWidth: 1,
    borderColor: "rgba(255,226,163,0.82)",
  },
  dishBody: {
    width: 210,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#262D2E",
    borderWidth: 1,
    borderColor: "rgba(255,226,163,0.5)",
    marginTop: -2,
  },
  dishLegsRow: {
    width: 170,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dishLeg: {
    width: 12,
    height: 34,
    borderRadius: 6,
    backgroundColor: "#77766F",
  },
  miniCard: {
    position: "absolute",
    bottom: 8,
    width: 118,
    height: 92,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: APP_BRAND.colors.borderStrong,
    backgroundColor: "rgba(6, 30, 32, 0.84)",
    alignItems: "center",
    justifyContent: "center",
  },
  miniCardLeft: { left: 8 },
  miniCardRight: { right: 8 },
  miniIcon: {
    fontSize: 24,
    color: APP_BRAND.colors.gold,
    marginBottom: 8,
  },
  miniText: {
    color: APP_BRAND.colors.text,
    fontSize: 14,
    textAlign: "center",
    writingDirection: "rtl",
  },
  loadingArcWrap: {
    marginTop: 34,
    alignItems: "center",
  },
  loadingArc: {
    width: 180,
    height: 20,
    borderTopWidth: 2,
    borderColor: APP_BRAND.colors.gold,
    borderTopLeftRadius: 110,
    borderTopRightRadius: 110,
    opacity: 0.92,
  },
  loadingDots: {
    marginTop: 2,
    flexDirection: "row",
    gap: 12,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(53,233,221,0.32)",
  },
  loadingDotActive: {
    backgroundColor: APP_BRAND.colors.tealSoft,
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  loadingText: {
    marginTop: 18,
    color: APP_BRAND.colors.text,
    fontSize: 18,
    writingDirection: "rtl",
    textAlign: "center",
  },

  glassCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: APP_BRAND.radius.lg,
    borderWidth: 1,
    borderColor: APP_BRAND.colors.border,
    backgroundColor: APP_BRAND.colors.card,
    padding: 20,
    marginTop: 32,
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 7,
  },
  authCard: {
    paddingVertical: 24,
  },
  registerCard: {
    paddingVertical: 20,
    marginTop: 28,
  },
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: APP_BRAND.colors.text,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 8,
  },
  inputShell: {
    minHeight: 58,
    borderRadius: APP_BRAND.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.22)",
    flexDirection: "row",
    alignItems: "center",
  },
  inputFocused: {
    borderColor: APP_BRAND.colors.borderStrong,
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  inputError: {
    borderColor: APP_BRAND.colors.danger,
  },
  input: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 18,
    color: APP_BRAND.colors.white,
    fontSize: 17,
    writingDirection: "rtl",
  },
  inputWithEye: {
    paddingLeft: 56,
  },
  eyeButton: {
    position: "absolute",
    left: 18,
    zIndex: 2,
  },
  eyeIcon: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 21,
  },
  fieldError: {
    marginTop: 6,
    color: APP_BRAND.colors.danger,
    fontSize: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  linkRightWrap: {
    alignSelf: "flex-end",
    marginTop: -2,
  },
  linkText: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 17,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  fullButton: {
    width: "100%",
    maxWidth: 430,
    marginTop: 18,
  },
  fullButtonSmallMargin: {
    width: "100%",
    maxWidth: 430,
    marginTop: 14,
  },
  cardButton: {
    marginTop: 8,
  },
  buttonBase: {
    height: 54,
    borderRadius: APP_BRAND.radius.md,
    overflow: "hidden",
  },
  buttonPrimaryShadow: {
    shadowColor: APP_BRAND.colors.teal,
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 8,
  },
  buttonGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: APP_BRAND.radius.md,
    borderWidth: 1,
    borderColor: "rgba(121,255,244,0.68)",
  },
  buttonShine: {
    position: "absolute",
    top: 0,
    left: 24,
    right: 24,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  buttonPrimaryText: {
    color: APP_BRAND.colors.white,
    fontSize: 22,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  buttonSecondary: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(216,162,74,0.76)",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  buttonSecondaryText: {
    color: APP_BRAND.colors.goldSoft,
    fontSize: 21,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  loadingLineWrap: {
    alignItems: "center",
    gap: 4,
  },
  loadingLine: {
    width: 120,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  loadingButtonText: {
    color: APP_BRAND.colors.white,
    fontSize: 14,
    writingDirection: "rtl",
  },

  inlineLinkRow: {
    marginTop: 22,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  inlineMuted: {
    color: APP_BRAND.colors.text,
    fontSize: 17,
    writingDirection: "rtl",
  },
  legalRow: {
    marginTop: 18,
    flexDirection: "row-reverse",
    justifyContent: "center",
    flexWrap: "wrap",
    rowGap: 6,
  },
  legalText: {
    color: APP_BRAND.colors.muted,
    fontSize: 14,
    writingDirection: "rtl",
  },
  legalLink: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 14,
    textDecorationLine: "underline",
    writingDirection: "rtl",
  },

  earlyBody: {
    marginTop: 10,
    color: APP_BRAND.colors.text,
    opacity: 0.92,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    writingDirection: "rtl",
    maxWidth: 430,
  },
  earlyCard: {
    marginTop: 16,
    paddingVertical: 12,
  },
  earlyCardTitle: {
    color: APP_BRAND.colors.tealSoft,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    writingDirection: "rtl",
  },
  earlyCardDividerWrap: {
    alignItems: "center",
    width: "100%",
  },
  bulletRow: {
    minHeight: 42,
    flexDirection: "row",
    writingDirection: "rtl" as const,
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  bulletDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  bulletCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: APP_BRAND.colors.tealSoft,
    color: APP_BRAND.colors.tealSoft,
    textAlign: "center",
    lineHeight: 23,
    fontSize: 13,
    fontWeight: "800",
  },
  bulletText: {
    flex: 1,
    color: APP_BRAND.colors.text,
    fontSize: 15,
    textAlign: "right",
    writingDirection: "rtl",
  },
  bulletIcon: {
    color: APP_BRAND.colors.gold,
    fontSize: 18,
    width: 28,
    textAlign: "center",
  },
  bottomNote: {
    marginTop: 26,
    color: APP_BRAND.colors.text,
    fontSize: 16,
    textAlign: "center",
    writingDirection: "rtl",
  },
});

export default {
  SplashScreen,
  LoginScreen,
  RegisterScreen,
  EarlyAccessScreen };
