import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIGGER_FIRST_ORDER = "feedback_trigger_first_order";
const TRIGGER_FIRST_SHOPPING = "feedback_trigger_first_shopping";

/**
 * Hook for triggering feedback popups after meaningful actions.
 * Each trigger fires only once (tracked in AsyncStorage).
 *
 * Usage:
 * const { triggerAfterOrder, triggerAfterShoppingList } = useFeedbackTrigger();
 * // Call after creating an order:
 * triggerAfterOrder();
 */
export function useFeedbackTrigger() {
  const showFeedbackPrompt = useCallback(async (triggerKey: string, context: string) => {
    try {
      const alreadyTriggered = await AsyncStorage.getItem(triggerKey);
      if (alreadyTriggered === "true") return;

      // Mark as triggered
      await AsyncStorage.setItem(triggerKey, "true");

      // Small delay so the user sees their action complete first
      setTimeout(() => {
        if (Platform.OS === "web") {
          // On web, use a simpler approach
          const shouldFeedback = confirm("We would love to hear what you think! Want to send feedback?");
          if (shouldFeedback) {
            router.push({ pathname: "/feedback" as any, params: { context } });
          }
        } else {
          Alert.alert(
            "What do you think?",
            "We would love to hear your thoughts about the app!",
            [
              {
                text: "Later",
                style: "cancel" },
              {
                text: "Send feedback",
                onPress: () => {
                  router.push({ pathname: "/feedback" as any, params: { context } });
                } },
            ],
            { cancelable: true }
          );
        }
      }, 1500);
    } catch (err) {
      console.warn("[FeedbackTrigger] Error:", err);
    }
  }, []);

  const triggerAfterOrder = useCallback(() => {
    showFeedbackPrompt(TRIGGER_FIRST_ORDER, "after_first_order");
  }, [showFeedbackPrompt]);

  const triggerAfterShoppingList = useCallback(() => {
    showFeedbackPrompt(TRIGGER_FIRST_SHOPPING, "after_first_shopping_list");
  }, [showFeedbackPrompt]);

  return {
    triggerAfterOrder,
    triggerAfterShoppingList };
}
