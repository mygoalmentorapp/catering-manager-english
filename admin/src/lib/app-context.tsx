import { createContext, useContext, useState, type ReactNode } from "react";

interface App {
  id: string;
  app_key: string;
  display_name: string;
  description: string | null;
  supported_languages: string[];
  platforms: string[];
  status: string;
  enabled_modules: string[];
  supported_events: Array<{ key: string; label: string; description: string }>;
  supported_actions: Array<{ key: string; label: string; description: string }>;
  supported_placements: Array<{ key: string; label: string; description: string }>;
  supported_entitlements: Array<{ key: string; label: string; description: string }>;
  premium_features: Array<{ key: string; label: string; description: string }>;
  condition_fields: Array<{ key: string; label: string; description: string; type: string }>;
}

interface AppContextValue {
  selectedApp: App | null;
  setSelectedApp: (app: App | null) => void;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
}

const AppContext = createContext<AppContextValue>({
  selectedApp: null,
  setSelectedApp: () => {},
  selectedLanguage: "he",
  setSelectedLanguage: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("he");

  return (
    <AppContext.Provider value={{ selectedApp, setSelectedApp, selectedLanguage, setSelectedLanguage }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

export type { App };
