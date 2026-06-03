import React, { useCallback, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EarlyAccessScreen } from "@/components/CateringAuthScreens";

const BETA_INTRO_SEEN_KEY = "beta_intro_seen";

export default function BetaIntroScreen() {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleToggleDontShow = useCallback(() => {
    setDontShowAgain((prev) => !prev);
  }, []);

  const handleContinue = useCallback(async () => {
    // If user checked "אל תראה שוב", persist the flag
    if (dontShowAgain) {
      await AsyncStorage.setItem(BETA_INTRO_SEEN_KEY, "true").catch(() => {});
    }
    // Navigate to tabs — AppGate will detect the route change and mark beta as dismissed for this session
    router.replace("/(tabs)" as any);
  }, [dontShowAgain]);

  return (
    <EarlyAccessScreen
      onContinueToApp={handleContinue}
      dontShowAgain={dontShowAgain}
      onToggleDontShowAgain={handleToggleDontShow}
    />
  );
}
