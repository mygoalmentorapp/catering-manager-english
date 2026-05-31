import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Image, Animated, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

/**
 * MODULE-LEVEL STATE — persists across component remounts within the same app session.
 * This prevents the "jump" that occurs when DataLoadingSplash is unmounted by AppGate
 * and remounted by AuthenticatedGate. Without this, each mount would restart the
 * phrase cycle from scratch, causing the first phrase to flash briefly before
 * the component is destroyed and recreated.
 */
let sessionPhrases: string[] | null = null; // Phrases picked for this session
let sessionPhraseIndex = 0; // Current phrase being displayed
let sessionPhrasesLoaded = false; // Whether phrases have been loaded from AsyncStorage
let sessionStartTime = 0; // When the splash first appeared this session
let cachedInsets = { top: 50, bottom: 34 }; // Default safe area insets, updated on first render

// Load phrases once per app session (not per component mount)
function loadSessionPhrases(): Promise<string[]> {
  if (sessionPhrases) return Promise.resolve(sessionPhrases);

  return (async () => {
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

    const idx1 = startIdx % ALL_PHRASES.length;
    const idx2 = (startIdx + 1) % ALL_PHRASES.length;
    sessionPhrases = [ALL_PHRASES[idx1], ALL_PHRASES[idx2]];
    sessionPhrasesLoaded = true;

    // Save next start index for next session
    const nextIdx = (startIdx + PHRASES_PER_SESSION) % ALL_PHRASES.length;
    AsyncStorage.setItem(PHRASE_INDEX_KEY, String(nextIdx)).catch(() => {});

    if (sessionStartTime === 0) {
      sessionStartTime = Date.now();
    }

    return sessionPhrases;
  })();
}

// Start loading immediately when the module is imported (before any render)
loadSessionPhrases();

interface DataLoadingSplashProps {
  /** Called when the minimum splash time has elapsed (2 phrases × 3s = 6s) */
  onMinTimeComplete: () => void;
}

/**
 * Full-screen splash shown after login while data is loading.
 * Always displays the app icon (not the user's business logo) and exactly
 * 2 rotating motivational phrases. Each phrase is shown for 3 seconds.
 * After both phrases have been displayed, onMinTimeComplete is called.
 *
 * CRITICAL: Uses module-level state to persist phrase progress across remounts.
 * The component may be unmounted/remounted multiple times during the auth flow
 * (AppGate → AuthenticatedGate transition). Without module-level persistence,
 * each mount restarts the animation, causing a visible "jump".
 */
export function DataLoadingSplash({ onMinTimeComplete }: DataLoadingSplashProps) {
  const insets = useSafeAreaInsets();
  // Cache insets on first render so remounts don't cause layout recalculation
  if (insets.top > 0) {
    cachedInsets = { top: insets.top, bottom: insets.bottom };
  }

  const [phrases, setPhrases] = useState<string[]>(sessionPhrases ?? []);
  const [currentPhraseIdx, setCurrentPhraseIdx] = useState(sessionPhraseIndex);
  const fadeAnim = useRef(new Animated.Value(sessionPhrasesLoaded ? 1 : 0)).current;
  const contentFadeAnim = useRef(new Animated.Value(sessionPhrasesLoaded ? 1 : 0)).current;
  const minTimeCalledRef = useRef(false);
  const mountedRef = useRef(true);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Load phrases (will resolve immediately if already loaded)
  useEffect(() => {
    mountedRef.current = true;

    if (sessionPhrases) {
      // Already loaded — just sync state
      setPhrases(sessionPhrases);
      setCurrentPhraseIdx(sessionPhraseIndex);
    } else {
      loadSessionPhrases().then((loaded) => {
        if (mountedRef.current) {
          setPhrases(loaded);
        }
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fade in content (no delay on remount, short delay on first mount)
  useEffect(() => {
    if (sessionPhrasesLoaded) {
      // Already loaded (remount) — show immediately, no animation
      contentFadeAnim.setValue(1);
    } else {
      // First time — fade in after 500ms
      const timer = setTimeout(() => {
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [contentFadeAnim]);

  // Animate phrases with module-level tracking
  useEffect(() => {
    if (phrases.length < PHRASES_PER_SESSION) return;

    // Calculate where we should be based on elapsed time since session start
    const elapsed = Date.now() - sessionStartTime;
    const shouldBeOnPhrase = Math.min(
      Math.floor(elapsed / PHRASE_DURATION),
      PHRASES_PER_SESSION - 1
    );

    // If we're already past where we should be, just show the correct phrase
    if (shouldBeOnPhrase > sessionPhraseIndex) {
      sessionPhraseIndex = shouldBeOnPhrase;
      setCurrentPhraseIdx(shouldBeOnPhrase);
      fadeAnim.setValue(1);
    } else {
      // Show current phrase
      setCurrentPhraseIdx(sessionPhraseIndex);
      fadeAnim.setValue(1);
    }

    // Calculate remaining time for current phrase
    const timeInCurrentPhrase = elapsed % PHRASE_DURATION;
    const remainingTime = PHRASE_DURATION - timeInCurrentPhrase;

    // Schedule transition to next phrase (if not on last)
    let timer1: ReturnType<typeof setTimeout> | undefined;
    if (sessionPhraseIndex < PHRASES_PER_SESSION - 1) {
      timer1 = setTimeout(() => {
        if (!mountedRef.current) return;
        // Fade out current phrase
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          if (!mountedRef.current) return;
          // Switch to next phrase
          sessionPhraseIndex = 1;
          setCurrentPhraseIdx(1);
          // Fade in next phrase
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        });
      }, remainingTime);
    }

    // Schedule onMinTimeComplete based on total elapsed time
    const totalSplashTime = PHRASE_DURATION * PHRASES_PER_SESSION;
    const remainingTotal = Math.max(0, totalSplashTime - elapsed);

    const timer2 = setTimeout(() => {
      if (!mountedRef.current) return;
      if (!minTimeCalledRef.current) {
        minTimeCalledRef.current = true;
        onMinTimeComplete();
      }
    }, remainingTotal);

    return () => {
      if (timer1) clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [phrases, fadeAnim, onMinTimeComplete]);

  return (
    <View style={[s.container, { paddingTop: cachedInsets.top, paddingBottom: cachedInsets.bottom }]}>
      <View style={s.content}>
        {/* Logo — always show app icon at same size */}
        <Pressable onLongPress={() => setShowDebugLogs(true)} delayLongPress={3000} style={s.logoWrap}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={s.logo}
            resizeMode="contain"
          />
        </Pressable>

        {/* Rotating phrase + dots — fade in after brief delay */}
        <Animated.View style={{ opacity: contentFadeAnim, alignItems: "center" }}>
          <View style={s.bannerWrap}>
            {phrases.length >= PHRASES_PER_SESSION && (
              <Animated.Text style={[s.bannerText, { opacity: fadeAnim }]}>
                {phrases[currentPhraseIdx]}
              </Animated.Text>
            )}
          </View>

          {/* Subtle loading dots */}
          <View style={s.dotsWrap}>
            <LoadingDots />
          </View>
        </Animated.View>
      </View>

      {/* Small debug button in bottom-right corner */}
      <Pressable
        onPress={() => setShowDebugLogs(true)}
        style={s.debugBtn}
      >
        <Text style={s.debugBtnText}>LOG</Text>
      </Pressable>

      <DebugLogViewer visible={showDebugLogs} onClose={() => setShowDebugLogs(false)} />
    </View>
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
    height: 60,
    width: "100%",
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
  debugBtn: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  debugBtnText: {
    fontSize: 10,
    color: DS_COLORS.textSecondary,
    fontWeight: "500" as any,
  },
});
