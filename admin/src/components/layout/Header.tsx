import { useAuth } from "@/lib/auth";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { getT } from "@/lib/i18n";
import type { App } from "@/lib/app-context";

export function Header() {
  const { user, logout } = useAuth();
  const { selectedApp, setSelectedApp, selectedLanguage, setSelectedLanguage } = useApp();
  const t = getT(selectedLanguage);

  const appsQuery = trpc.admin.getApps.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const apps = (appsQuery.data ?? []) as App[];

  // Auto-select first app if none selected
  if (!selectedApp && apps.length > 0) {
    setSelectedApp(apps[0]);
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* App Selector */}
        <select
          value={selectedApp?.app_key ?? ""}
          onChange={(e) => {
            const app = apps.find((a) => a.app_key === e.target.value);
            setSelectedApp(app ?? null);
          }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {apps.map((app) => (
            <option key={app.app_key} value={app.app_key}>
              {app.display_name}
            </option>
          ))}
        </select>

        {/* Language Selector */}
        {selectedApp && (
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {selectedApp.supported_languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang === "he" ? "עברית" : lang === "en" ? "English" : lang}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{user?.email ?? user?.openId}</span>
        <button
          onClick={logout}
          className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          {t("header.logout")}
        </button>
      </div>
    </header>
  );
}
