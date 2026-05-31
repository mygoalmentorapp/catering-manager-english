import React, { useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import {
  SplashScreen,
  LoginScreen,
  RegisterScreen,
  EarlyAccessScreen,
} from "@/components/CateringAuthScreens";

type ScreenName = "splash" | "login" | "register" | "early-access";

export default function AuthPreview() {
  const [screen, setScreen] = useState<ScreenName>("splash");

  if (screen === "splash") {
    return (
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setScreen("login")}>
        <SplashScreen loadingText="טוענים את סביבת הניהול שלך…" />
      </Pressable>
    );
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onLogin={() => setScreen("early-access")}
        onForgotPassword={() => {}}
        onGoToRegister={() => setScreen("register")}
      />
    );
  }

  if (screen === "register") {
    return (
      <RegisterScreen
        onRegister={() => setScreen("early-access")}
        onGoToLogin={() => setScreen("login")}
        onTerms={() => {}}
        onPrivacy={() => {}}
      />
    );
  }

  if (screen === "early-access") {
    return (
      <EarlyAccessScreen
        onContinueToApp={() => setScreen("splash")}
        onFeedback={() => {}}
      />
    );
  }

  return null;
}
