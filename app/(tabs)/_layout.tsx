import { Tabs } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { DS_COLORS } from "@/lib/design-system";

export default function TabLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        sceneStyle: { backgroundColor: DS_COLORS.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ראשי",
        }}
      />
    </Tabs>
  );
}
