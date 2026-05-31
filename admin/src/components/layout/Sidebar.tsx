import { NavLink } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { getT } from "@/lib/i18n";
import { useState } from "react";

interface NavItem {
  path: string;
  labelKey: string;
  icon: string;
}

const mainNavItems: NavItem[] = [
  { path: "/", labelKey: "nav.dashboard", icon: "📊" },
  { path: "/remote-config", labelKey: "nav.remote_config", icon: "⚙️" },
  { path: "/events", labelKey: "nav.events", icon: "📈" },
  { path: "/audit-logs", labelKey: "nav.audit_logs", icon: "📋" },
];

const advancedNavItems: NavItem[] = [
  { path: "/campaigns", labelKey: "nav.campaigns", icon: "📢" },
  { path: "/onboarding", labelKey: "nav.onboarding", icon: "🎯" },
  { path: "/paywall", labelKey: "nav.paywall", icon: "💰" },
  { path: "/feature-flags", labelKey: "nav.feature_flags", icon: "🚩" },
];

export function Sidebar() {
  const { selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`
      }
    >
      <span className="text-base">{item.icon}</span>
      {t(item.labelKey as Parameters<typeof t>[0])}
    </NavLink>
  );

  return (
    <aside className="w-64 bg-white border-e border-gray-200 h-screen flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">{t("header.title")}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {selectedLanguage === "he" ? "דשבורד ניהול" : "Admin Dashboard"}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Main Navigation */}
        {mainNavItems.map(renderNavItem)}

        {/* External Links */}
        <div className="pt-4 pb-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-2">
            {selectedLanguage === "he" ? "קישורים חיצוניים" : "External"}
          </div>
          <a
            href="https://app.adapty.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">💳</span>
            Adapty
            <span className="ms-auto text-gray-400 text-xs">↗</span>
          </a>
          <a
            href="https://app.onesignal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">🔔</span>
            OneSignal
            <span className="ms-auto text-gray-400 text-xs">↗</span>
          </a>
          <a
            href="https://play.google.com/console"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">🏪</span>
            Google Play Console
            <span className="ms-auto text-gray-400 text-xs">↗</span>
          </a>
        </div>

        {/* Advanced / Legacy Section */}
        <div className="pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 px-3 py-2 w-full text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors"
          >
            <span>{showAdvanced ? "▼" : "▶"}</span>
            {selectedLanguage === "he" ? "מתקדם / Legacy" : "Advanced / Legacy"}
          </button>
          {showAdvanced && (
            <div className="space-y-1 mt-1">
              {advancedNavItems.map(renderNavItem)}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
