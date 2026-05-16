import React, { useCallback } from "react";
import { router } from "expo-router";
import { EarlyAccessScreen } from "@/components/CateringAuthScreens";

export default function BetaIntroScreen() {
  const handleContinue = useCallback(() => {
    // Navigate to tabs — AppGate will detect the route change and mark beta as dismissed for this session
    router.replace("/(tabs)" as any);
  }, []);

  return (
    <EarlyAccessScreen
      onContinueToApp={handleContinue}
    />
  );
}
