import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Image, Animated, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DS_COLORS, DS_FONT, DS_WEIGHT } from "@/lib/design-system";
import { DebugLogViewer } from "@/components/debug-log-viewer";

/**
 * All motivational/marketing phrases.
 * Each app launch picks 2 consecutive phrases from this list,
 * cycling through them across sessions.
 */
const ALL_PHRASES = [
  "הזן את המוצרים שלך בקלות ובמהירות",
  "ראה את הרווח שלך על כל הזמנה",
  "צור הזמנה מול הלקוח בלחיצה אחת",
  "הפק רשימת קניות מדויקת — בלי לשכוח שום דבר",
  "כל העסק שלך — במקום אחד",
  "חסוך זמן, הרוויח יותר",
  "נהל את התפריט, ההזמנות והקניות בקלות",
  "הפק מסמכים מקצועיים בלחיצת כפתור",
  "תכנן את הקניות שלך בצורה חכמה",
  "שלוט בעלויות ובמחירים בקלות",
  "הכל מסודר, הכל במקום אחד",
  "בלי לשכוח כלום בלי לקנות מיותר",
];

const PHRASE_DURATION = 3000; // 3 seconds per phrase
const PHRASES_PER_SESSION = 2; // Show exactly 2 phrases per session
const PHRASE_INDEX_KEY = "splash_phrase_index";

interface DataLoadingSplashProps {
  /** Called when the minimum splash time has elapsed (2 phrases × 3s = 6s) */
  onMinTimeComplete: () => void;
}

/**
 * Full-screen splash shown after login while data is loading.
 * Always displays the app icon (not the user's business logo) and exactly
 * 2 rotating motivational phrases. Each phrase is shown for 3 seconds.
 * After both phrases have been displayed, onMinTimeComplete is called.
 * Each app launch picks the next 2 phrases in the cycle.
 */
export function DataLoadingSplash({ onMinTimeComplete }: DataLoadingSplashProps) {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const minTimeCalledRef = useRef(false);
  const mountedRef = useRef(true);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Pick phrases on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      // Pick next 2 phrases from the cycle
      let startIdx = 0;
      try {
        const stored = await AsyncStorage.getItem(PHRASE_INDEX_KEY);
        if (stored !== null) {
          startIdx = parseInt(stored, 10);
          if (isNaN(startIdx) || startIdx < 0) startIdx = 0;
        }
      } catch {
        // Ignore
      }

      // Wrap around if needed
      const idx1 = startIdx % ALL_PHRASES.length;
      const idx2 = (startIdx + 1) % ALL_PHRASES.length;
      const picked = [ALL_PHRASES[idx1], ALL_PHRASES[idx2]];

      // Save next start index for next session
      const nextIdx = (startIdx + PHRASES_PER_SESSION) % ALL_PHRASES.length;
      AsyncStorage.setItem(PHRASE_INDEX_KEY, String(nextIdx)).catch(() => {});

      if (!cancelled) {
        setPhrases(picked);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  // Animate phrases: fade in phrase 1, wait 3s, fade out, fade in phrase 2, wait 3s, call onMinTimeComplete
  useEffect(() => {
    if (phrases.length < PHRASES_PER_SESSION) return;

    // Start with phrase 0 fading in
    setCurrentPhraseIdx(0);
    fadeAnim.setValue(0);

    // Fade in first phrase
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // After 3 seconds, transition to phrase 2
    const timer1 = setTimeout(() => {
      if (!mountedRef.current) return;
      // Fade out phrase 1
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        if (!mountedRef.current) return;
        // Switch to phrase 2
        setCurrentPhraseIdx(1);
        // Fade in phrase 2
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, PHRASE_DURATION);

    // After 6 seconds total (3s phrase1 + 3s phrase2), call onMinTimeComplete
    const timer2 = setTimeout(() => {
      if (!mountedRef.current) return;
      if (!minTimeCalledRef.current) {
        minTimeCalledRef.current = true;
        onMinTimeComplete();
      }
    }, PHRASE_DURATION * PHRASES_PER_SESSION);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [phrases, fadeAnim, onMinTimeComplete]);

  // Don't render until phrases are loaded — show app icon immediately
  if (phrases.length < PHRASES_PER_SESSION) {
    return (
      <SafeAreaView style={s.container} edges={["top", "bottom", "left", "right"]}>
        <View style={s.content}>
          <Pressable onLongPress={() => setShowDebugLogs(true)} delayLongPress={3000} style={s.logoWrap}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={s.logo}
              resizeMode="contain"
            />
          </Pressable>
        </View>
        <DebugLogViewer visible={showDebugLogs} onClose={() => setShowDebugLogs(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom", "left", "right"]}>
      <View style={s.content}>
        {/* Logo — always show app icon, long-press 3s opens debug logs */}
        <Pressable onLongPress={() => setShowDebugLogs(true)} delayLongPress={3000} style={s.logoWrap}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={s.logo}
            resizeMode="contain"
          />
        </Pressable>

        {/* Rotating phrase */}
        <View style={s.bannerWrap}>
          <Animated.Text style={[s.bannerText, { opacity: fadeAnim }]}>
            {phrases[currentPhraseIdx]}
          </Animated.Text>
        </View>

        {/* Subtle loading dots */}
        <View style={s.dotsWrap}>
          <LoadingDots />
        </View>
      </View>
      <DebugLogViewer visible={showDebugLogs} onClose={() => setShowDebugLogs(false)} />
    </SafeAreaView>
  );
}

/** Simple animated loading dots */
function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    };

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={s.dots}>
      <Animated.View style={[s.dot, { opacity: dot1 }]} />
      <Animated.View style={[s.dot, { opacity: dot2 }]} />
      <Animated.View style={[s.dot, { opacity: dot3 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS_COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 48,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  logo: {
    width: 120,
    height: 120,
  },
  bannerWrap: {
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  bannerText: {
    fontSize: DS_FONT.body,
    fontWeight: DS_WEIGHT.semibold as any,
    color: DS_COLORS.textSecondary,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 26,
  },
  dotsWrap: {
    marginTop: 40,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DS_COLORS.accent,
  },
});
