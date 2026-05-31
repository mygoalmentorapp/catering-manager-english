import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { getT } from "@/lib/i18n";

export function DashboardPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const isHe = selectedLanguage === "he";

  const statsQuery = trpc.admin.getDashboardStats.useQuery(
    { app_key: selectedApp?.app_key ?? "" },
    { enabled: !!selectedApp }
  );

  if (!selectedApp) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        {t("common.select_app")}
      </div>
    );
  }

  const stats = statsQuery.data;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {isHe ? "דשבורד ניהול" : "Admin Dashboard"}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{selectedApp.display_name}</p>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          {isHe ? "סטטוס מערכת" : "System Status"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            label={isHe ? "Webhook Events (7 ימים)" : "Webhook Events (7d)"}
            value={stats?.events_last_7d ?? 0}
            icon="📡"
            color="bg-blue-50 border-blue-200 text-blue-700"
            loading={statsQuery.isLoading}
          />
          <StatusCard
            label={isHe ? "Feature Flags פעילים" : "Active Feature Flags"}
            value={stats?.feature_flags ?? 0}
            icon="🚩"
            color="bg-green-50 border-green-200 text-green-700"
            loading={statsQuery.isLoading}
          />
          <StatusCard
            label={isHe ? "Audit Logs (7 ימים)" : "Audit Logs (7d)"}
            value={stats?.events_last_7d ?? 0}
            icon="📋"
            color="bg-purple-50 border-purple-200 text-purple-700"
            loading={statsQuery.isLoading}
          />
          <StatusCard
            label={isHe ? "Placements פעילים" : "Active Placements"}
            value={stats?.paywall_placements ?? 0}
            icon="💰"
            color="bg-orange-50 border-orange-200 text-orange-700"
            loading={statsQuery.isLoading}
          />
        </div>
      </div>

      {/* Quick Links - Remote Config Essentials */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          {isHe ? "שליטה קריטית (Remote Config)" : "Critical Controls (Remote Config)"}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {isHe
            ? "maintenance mode, force update, global message — נמצאים בעמוד Remote Config"
            : "maintenance mode, force update, global message — found in Remote Config page"}
        </p>
        <a
          href="/api/admin/remote-config"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
        >
          {isHe ? "פתח Remote Config →" : "Open Remote Config →"}
        </a>
      </div>

      {/* External Dashboards */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          {isHe ? "דשבורדים חיצוניים" : "External Dashboards"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ExternalLink
            href="https://app.adapty.io"
            title="Adapty"
            description={isHe ? "מנויים, Paywalls, A/B Tests" : "Subscriptions, Paywalls, A/B Tests"}
            icon="💳"
          />
          <ExternalLink
            href="https://app.onesignal.com"
            title="OneSignal"
            description={isHe ? "Push Notifications, קמפיינים" : "Push Notifications, Campaigns"}
            icon="🔔"
          />
          <ExternalLink
            href="https://play.google.com/console"
            title="Google Play Console"
            description={isHe ? "חנות, מוצרים, בדיקות" : "Store, Products, Testing"}
            icon="🏪"
          />
        </div>
      </div>

      {/* Manual Actions Checklist */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
        <h3 className="text-base font-semibold text-amber-900 mb-3">
          {isHe ? "פעולות ידניות שחסרות" : "Pending Manual Actions"}
        </h3>
        <ul className="space-y-2 text-sm text-amber-800" dir={isHe ? "rtl" : "ltr"}>
          <ChecklistItem
            done={false}
            text={isHe ? "חיבור Google Play ל-Adapty (Service Account Key)" : "Connect Google Play to Adapty (Service Account Key)"}
          />
          <ChecklistItem
            done={false}
            text={isHe ? "יצירת מוצר In-App ב-Google Play Console" : "Create In-App Product in Google Play Console"}
          />
          <ChecklistItem
            done={false}
            text={isHe ? "יצירת Product ב-Adapty מקושר ל-Google Play" : "Create Product in Adapty linked to Google Play"}
          />
          <ChecklistItem
            done={false}
            text={isHe ? "יצירת Paywall ב-Adapty עם Placement IDs: settings, main, onboarding, feature_limit" : "Create Paywall in Adapty with Placement IDs: settings, main, onboarding, feature_limit"}
          />
          <ChecklistItem
            done={false}
            text={isHe ? "הגדרת OneSignal App ID ו-REST API Key" : "Configure OneSignal App ID and REST API Key"}
          />
          <ChecklistItem
            done={true}
            text={isHe ? "הגדרת Adapty Webhook" : "Configure Adapty Webhook"}
          />
          <ChecklistItem
            done={true}
            text={isHe ? "הרצת SQL Migration (adapty_webhook_events)" : "Run SQL Migration (adapty_webhook_events)"}
          />
          <ChecklistItem
            done={true}
            text={isHe ? "הגדרת ADAPTY_WEBHOOK_SECRET" : "Configure ADAPTY_WEBHOOK_SECRET"}
          />
        </ul>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href="/api/admin/events"
          className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
        >
          <span className="text-2xl">📈</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">
              {isHe ? "אירועים" : "Events"}
            </div>
            <div className="text-xs text-gray-500">
              {isHe ? "Webhook events ואירועי משתמש" : "Webhook events & user events"}
            </div>
          </div>
        </a>
        <a
          href="/api/admin/audit-logs"
          className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
        >
          <span className="text-2xl">📋</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">
              {isHe ? "Audit Logs" : "Audit Logs"}
            </div>
            <div className="text-xs text-gray-500">
              {isHe ? "היסטוריית שינויים" : "Change history"}
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatusCard({ label, value, icon, color, loading }: {
  label: string;
  value: number;
  icon: string;
  color: string;
  loading: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold">{loading ? "..." : value}</div>
    </div>
  );
}

function ExternalLink({ href, title, description, icon }: {
  href: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{title}</div>
        <div className="text-xs text-gray-500 truncate">{description}</div>
      </div>
      <span className="text-gray-400 text-xs">↗</span>
    </a>
  );
}

function ChecklistItem({ done, text }: { done: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 ${done ? "text-green-600" : "text-amber-500"}`}>
        {done ? "✅" : "⬜"}
      </span>
      <span className={done ? "line-through text-amber-600" : ""}>{text}</span>
    </li>
  );
}
