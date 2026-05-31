import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { I18nManager, Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { DataProvider } from "@/lib/data-context";
import { AuthProvider } from "@/lib/auth-context";
import { ConfigProvider } from "@/lib/config-context";
import { NetworkProvider } from "@/lib/network-context";
import { ColorKeyNavigator } from "@/components/color-key-navigator";
import { DS_COLORS } from "@/lib/design-system";
import { AppGate } from "@/components/app-gate";
import { ExperienceBootstrap } from "@/lib/experience-bootstrap";
import { AdaptyBootstrap } from "@/lib/adapty-bootstrap";
import { OneSignalBootstrap } from "@/lib/onesignal-bootstrap";
import { CriticalFlowProvider } from "@/lib/critical-flow-context";
import { ToastProvider } from "@/lib/toast-context";

// Force RTL for Hebrew — only when not already RTL to avoid reload loops
if (Platform.OS !== "web") {
  if (!I18nManager.isRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
} else {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  // Provider chain:
  // NetworkProvider (device connectivity, no tRPC needed) →
  // AuthProvider → ConfigProvider →
  // tRPC/QueryClient → DataProvider →
  // AppGate (wraps DeviceProvider for authenticated users) →
  // ColorKeyNavigator
  //
  // DeviceProvider is inside AppGate because:
  // 1. It needs tRPC (must be inside trpc.Provider)
  // 2. It should only mount when user is authenticated
  // 3. ConnectionBanner is also inside AppGate (needs network context)
  const content = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: DS_COLORS.background }}>
      <NetworkProvider>
        <AuthProvider>
          <ConfigProvider>
            <CriticalFlowProvider>
              <trpc.Provider client={trpcClient} queryClient={queryClient}>
                <QueryClientProvider client={queryClient}>
                  <ExperienceBootstrap />
                  <AdaptyBootstrap />
                  <OneSignalBootstrap />
                  <DataProvider>
                    <ToastProvider>
                      <AppGate>
                        <ColorKeyNavigator />
                      </AppGate>
                    </ToastProvider>
                  </DataProvider>
                </QueryClientProvider>
              </trpc.Provider>
            </CriticalFlowProvider>
          </ConfigProvider>
        </AuthProvider>
      </NetworkProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
