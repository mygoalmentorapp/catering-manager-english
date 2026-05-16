import { useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import type { Order, SavedShoppingList } from "@/lib/types";
import { useMutationGuard } from "@/hooks/use-mutation-guard";

/**
 * Returns orders that are:
 * - Not archived
 * - Event date is more than 1 day ago (yesterday or earlier)
 */
function getPastDueOrders(orders: Order[]): Order[] {
  const now = new Date();
  // Start of today (midnight)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // More than 1 day ago means eventDate < start of yesterday
  const cutoff = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  return orders
    .filter((o) => {
      if (o.status === "archived") return false;
      const eventDate = new Date(o.eventDate);
      // eventDate is before the cutoff (i.e., yesterday or earlier)
      return eventDate < cutoff;
    })
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
}

interface UsePastDueCheckParams {
  orders: Order[];
  savedShoppingLists: SavedShoppingList[];
  loading: boolean;
  archiveOrder: (id: string) => Promise<void>;
  deleteSavedShoppingList: (id: string) => Promise<void>;
}

/**
 * Hook that runs once on mount (after data loads) and sequentially asks
 * the user about each past-due order.
 */
export function usePastDueCheck({
  orders,
  savedShoppingLists,
  loading,
  archiveOrder,
  deleteSavedShoppingList }: UsePastDueCheckParams) {
  const hasChecked = useRef(false);
  const { guardMutation } = useMutationGuard();

  const formatDate = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "numeric",
        year: "numeric" });
    } catch {
      return dateStr;
    }
  }, []);

  const archiveWithShoppingListCheck = useCallback(
    async (order: Order): Promise<boolean> => {
      const linkedLists = savedShoppingLists.filter(
        (sl) => sl.orderIds.includes(order.id) && sl.status !== "needs_refresh_locked"
      );

      if (linkedLists.length > 0) {
        // Has linked shopping lists — ask for confirmation
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            "Move to archive",
            "This order has a linked shopping list.\nArchiving will also delete the related shopping lists.",
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false) },
              {
                text: "Move to archive",
                style: "destructive",
                onPress: async () => {
                  const allowed = await guardMutation();
                  if (!allowed) { resolve(false); return; }
                  try {
                    for (const sl of linkedLists) {
                      await deleteSavedShoppingList(sl.id);
                    }
                    await archiveOrder(order.id);
                    resolve(true);
                  } catch {
                    Alert.alert("Error", "Archiving failed.");
                    resolve(false);
                  }
                } },
            ]
          );
        });
      } else {
        // No linked shopping lists — archive directly
        const allowed = await guardMutation();
        if (!allowed) return false;
        try {
          await archiveOrder(order.id);
          return true;
        } catch {
          Alert.alert("Error", "Archiving failed.");
          return false;
        }
      }
    },
    [savedShoppingLists, archiveOrder, deleteSavedShoppingList, guardMutation]
  );

  const askAboutOrder = useCallback(
    (order: Order): Promise<"yes" | "no" | "cancel"> => {
      return new Promise((resolve) => {
        Alert.alert(
          "Was the order completed?",
          `The event date for this order has passed.\nWas the order completed?\n\nCustomer: ${order.customerName}\nEvent date: ${formatDate(order.eventDate)}`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => resolve("cancel") },
            {
              text: "No, not completed yet",
              onPress: () => resolve("no") },
            {
              text: "Yes, completed",
              style: "destructive",
              onPress: () => resolve("yes") },
          ]
        );
      });
    },
    [formatDate]
  );

  const runCheck = useCallback(async () => {
    const pastDue = getPastDueOrders(orders);
    if (pastDue.length === 0) return;

    for (const order of pastDue) {
      const answer = await askAboutOrder(order);

      if (answer === "cancel") {
        // Stop the sequence
        break;
      }

      if (answer === "yes") {
        await archiveWithShoppingListCheck(order);
      }
      // "no" → do nothing, continue to next order
    }
  }, [orders, askAboutOrder, archiveWithShoppingListCheck]);

  useEffect(() => {
    if (loading || hasChecked.current) return;
    hasChecked.current = true;

    // Small delay to let the home screen render first
    const timer = setTimeout(() => {
      runCheck();
    }, 800);

    return () => clearTimeout(timer);
  }, [loading, runCheck]);
}
