/**
 * ToastContext — Lightweight toast notification system.
 *
 * Shows a brief, non-blocking message at the bottom of the screen.
 * Auto-dismisses after a configurable duration.
 * Used for offline save confirmations and other brief feedback.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast("נשמר במכשיר, יסונכרן כשיהיה חיבור");
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Animated, StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { onOfflineSave } from "./offline-toast-events";

// ============ TYPES ============

interface ToastConfig {
  message: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  duration?: number; // ms, default 3000
}

interface ToastContextType {
  showToast: (messageOrConfig: string | ToastConfig) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// ============ CONSTANTS ============

const DEFAULT_DURATION = 3000;
const SLIDE_DURATION = 250;

// ============ PROVIDER ============

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ToastConfig>({ message: "" });
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((messageOrConfig: string | ToastConfig) => {
    const newConfig = typeof messageOrConfig === "string"
      ? { message: messageOrConfig }
      : messageOrConfig;

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setConfig(newConfig);
    setVisible(true);

    // Slide in
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }, newConfig.duration ?? DEFAULT_DURATION);
  }, [slideAnim]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Listen for offline save events from DataProvider
  useEffect(() => {
    const unsubscribe = onOfflineSave(() => {
      showToast({
        message: "נשמר במכשיר, יסונכרן לענן כשיהיה חיבור",
        icon: "cloud-queue",
        duration: 3000,
      });
    });
    return unsubscribe;
  }, [showToast]);

  const bottomOffset = Platform.OS === "web" ? 20 : Math.max(insets.bottom, 16) + 60; // above tab bar

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.container,
            {
              bottom: bottomOffset,
              transform: [{ translateY }],
              opacity: slideAnim,
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.toast}>
            {config.icon && (
              <MaterialIcons
                name={config.icon}
                size={18}
                color="#fff"
                style={styles.icon}
              />
            )}
            <Text style={styles.text} numberOfLines={2}>
              {config.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ============ HOOK ============

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 99999,
    elevation: 99999,
  },
  toast: {
    flexDirection: "row-reverse", // RTL
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 30, 0.92)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 380,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    marginLeft: 8,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
    writingDirection: "rtl",
    flex: 1,
    lineHeight: 20,
  },
});
