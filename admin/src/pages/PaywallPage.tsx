import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getT } from "@/lib/i18n";

interface Placement {
  id: number;
  placement_key: string;
  display_name: string;
  description: string | null;
  is_enabled: boolean;
}

interface FeatureGate {
  id: number;
  feature_key: string;
  display_name: string;
  required_entitlement: string;
  is_enabled: boolean;
}

export function PaywallPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const appKey = selectedApp?.app_key ?? "";
  const utils = trpc.useUtils();

  // Queries
  const placementsQuery = trpc.admin.getPaywallPlacements.useQuery(
    { app_key: appKey, app_language: selectedLanguage },
    { enabled: !!selectedApp }
  );
  const gatesQuery = trpc.admin.getFeatureGates.useQuery(
    { app_key: appKey, app_language: selectedLanguage },
    { enabled: !!selectedApp }
  );

  // Mutations
  const createPlacementMutation = trpc.admin.createPaywallPlacement.useMutation({
    onSuccess: () => {
      utils.admin.getPaywallPlacements.invalidate();
      setShowAddPlacement(false);
      setNewPlacement({ placement_key: "", display_name: "", description: "" });
    },
  });
  const updatePlacementMutation = trpc.admin.updatePaywallPlacement.useMutation({
    onSuccess: () => {
      utils.admin.getPaywallPlacements.invalidate();
      setEditingPlacement(null);
    },
  });
  const createGateMutation = trpc.admin.createFeatureGate.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureGates.invalidate();
      setShowAddGate(false);
      setNewGate({ feature_key: "", display_name: "", required_entitlement: "premium" });
    },
  });
  const updateGateMutation = trpc.admin.updateFeatureGate.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureGates.invalidate();
      setEditingGate(null);
    },
  });

  // State
  const [showAddPlacement, setShowAddPlacement] = useState(false);
  const [newPlacement, setNewPlacement] = useState({ placement_key: "", display_name: "", description: "" });
  const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null);
  const [showAddGate, setShowAddGate] = useState(false);
  const [newGate, setNewGate] = useState({ feature_key: "", display_name: "", required_entitlement: "premium" });
  const [editingGate, setEditingGate] = useState<FeatureGate | null>(null);

  const placements = (placementsQuery.data ?? []) as Placement[];
  const gates = (gatesQuery.data ?? []) as FeatureGate[];

  const placementColumns = [
    { key: "placement_key", header: t("paywall.col_key") },
    { key: "display_name", header: t("paywall.col_name") },
    { key: "description", header: t("paywall.col_description") },
    {
      key: "is_enabled",
      header: t("paywall.col_status"),
      render: (row: Record<string, unknown>) => (
        <button
          onClick={() => updatePlacementMutation.mutate({
            id: row.id as number,
            app_key: appKey,
            is_enabled: !(row.is_enabled as boolean),
          })}
          className="cursor-pointer"
        >
          <StatusBadge
            status={row.is_enabled as boolean}
            trueLabel={t("status.active")}
            falseLabel={t("status.disabled")}
          />
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <button
          onClick={() => setEditingPlacement(row as unknown as Placement)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          {t("common.edit")}
        </button>
      ),
    },
  ];

  const gateColumns = [
    { key: "feature_key", header: t("paywall.col_key") },
    { key: "display_name", header: t("paywall.col_name") },
    { key: "required_entitlement", header: t("paywall.col_entitlement") },
    {
      key: "is_enabled",
      header: t("paywall.col_status"),
      render: (row: Record<string, unknown>) => (
        <button
          onClick={() => updateGateMutation.mutate({
            id: row.id as number,
            app_key: appKey,
            is_enabled: !(row.is_enabled as boolean),
          })}
          className="cursor-pointer"
        >
          <StatusBadge
            status={row.is_enabled as boolean}
            trueLabel={t("status.active")}
            falseLabel={t("status.disabled")}
          />
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <button
          onClick={() => setEditingGate(row as unknown as FeatureGate)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          {t("common.edit")}
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t("paywall.title")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("paywall.subtitle")} <strong>{selectedApp?.display_name}</strong>
        </p>
      </div>

      {/* Adapty Status Info — Main explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-600 text-lg">ℹ️</div>
          <div>
            <h4 className="font-semibold text-blue-900 text-sm">
              {selectedLanguage === "he" ? "עמוד עזר — Adapty מנהל את מסכי התשלום" : "Helper Page — Adapty Manages Paywalls"}
            </h4>
            <p className="text-blue-800 text-xs mt-1">
              {selectedLanguage === "he"
                ? "עמוד זה הוא עמוד עזר בלבד. כל ניהול מסכי התשלום, מוצרים, מחירים, A/B testing והרשאות מנוי מתבצע דרך דשבורד Adapty. כאן מוצגים רק ה-Placement IDs שהאפליקציה משתמשת בהם, ורשימת פיצ׳רים שדורשים premium."
                : "This is a helper page only. All paywall management, products, pricing, A/B testing, and entitlements are managed through the Adapty dashboard. This page only shows the Placement IDs used by the app and a list of features that require premium."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="https://app.adapty.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
              >
                {selectedLanguage === "he" ? "פתח דשבורד Adapty →" : "Open Adapty Dashboard →"}
              </a>
              <a
                href="https://app.onesignal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200 transition-colors"
              >
                {selectedLanguage === "he" ? "פתח דשבורד OneSignal →" : "Open OneSignal Dashboard →"}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* What to configure in Adapty */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-800 text-sm mb-2">
          {selectedLanguage === "he" ? "מה צריך להגדיר ב-Adapty:" : "What to configure in Adapty:"}
        </h4>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside" dir={selectedLanguage === "he" ? "rtl" : "ltr"}>
          <li>{selectedLanguage === "he" ? "ליצור Placements עם אותם IDs שמופיעים בטבלה למטה" : "Create Placements with the same IDs shown in the table below"}</li>
          <li>{selectedLanguage === "he" ? "ליצור Paywall לכל Placement (עיצוב דרך Paywall Builder)" : "Create a Paywall for each Placement (design via Paywall Builder)"}</li>
          <li>{selectedLanguage === "he" ? "להוסיף מוצרים מ-Google Play Console / App Store Connect" : "Add products from Google Play Console / App Store Connect"}</li>
          <li>{selectedLanguage === "he" ? "להגדיר Entitlements (למשל: premium)" : "Configure Entitlements (e.g., premium)"}</li>
          <li>{selectedLanguage === "he" ? "לחבר OneSignal ב-Integrations → OneSignal (REST API Key)" : "Connect OneSignal in Integrations → OneSignal (REST API Key)"}</li>
        </ul>
      </div>

      {/* Placements Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{t("paywall.placements")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedLanguage === "he"
                ? "רשימת ה-Placement IDs שהאפליקציה שולחת ל-Adapty SDK. צור placements תואמים בדשבורד Adapty."
                : "List of Placement IDs the app sends to Adapty SDK. Create matching placements in the Adapty dashboard."}
            </p>
          </div>
          <button
            onClick={() => setShowAddPlacement(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            {selectedLanguage === "he" ? "הוסף מיקום" : "Add Placement"}
          </button>
        </div>

        {/* Add Placement Form */}
        {showAddPlacement && (
          <div className="bg-gray-50 border rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="placement_key (e.g. settings)"
                value={newPlacement.placement_key}
                onChange={(e) => setNewPlacement({ ...newPlacement, placement_key: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
                dir="ltr"
              />
              <input
                type="text"
                placeholder={selectedLanguage === "he" ? "שם תצוגה" : "Display Name"}
                value={newPlacement.display_name}
                onChange={(e) => setNewPlacement({ ...newPlacement, display_name: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder={selectedLanguage === "he" ? "תיאור" : "Description"}
                value={newPlacement.description}
                onChange={(e) => setNewPlacement({ ...newPlacement, description: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createPlacementMutation.mutate({
                  app_key: appKey,
                  app_language: selectedLanguage,
                  ...newPlacement,
                })}
                disabled={!newPlacement.placement_key || !newPlacement.display_name || createPlacementMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {createPlacementMutation.isPending
                  ? (selectedLanguage === "he" ? "שומר..." : "Saving...")
                  : (selectedLanguage === "he" ? "צור מיקום" : "Create")}
              </button>
              <button
                onClick={() => setShowAddPlacement(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        <DataTable
          columns={placementColumns}
          data={placements as unknown as Record<string, unknown>[]}
          isLoading={placementsQuery.isLoading}
          emptyMessage={t("paywall.no_placements")}
        />
      </section>

      {/* Edit Placement Modal */}
      {editingPlacement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="text-lg font-bold">
              {selectedLanguage === "he" ? "עריכת מיקום" : "Edit Placement"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedLanguage === "he" ? "שם תצוגה" : "Display Name"}
                </label>
                <input
                  type="text"
                  value={editingPlacement.display_name}
                  onChange={(e) => setEditingPlacement({ ...editingPlacement, display_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedLanguage === "he" ? "תיאור" : "Description"}
                </label>
                <input
                  type="text"
                  value={editingPlacement.description ?? ""}
                  onChange={(e) => setEditingPlacement({ ...editingPlacement, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingPlacement(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => updatePlacementMutation.mutate({
                  id: editingPlacement.id,
                  app_key: appKey,
                  display_name: editingPlacement.display_name,
                  description: editingPlacement.description ?? undefined,
                })}
                disabled={updatePlacementMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {updatePlacementMutation.isPending ? (selectedLanguage === "he" ? "שומר..." : "Saving...") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature Gates Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{t("paywall.feature_gates")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedLanguage === "he"
                ? "רשימת פיצ׳רים שדורשים מנוי premium. Adapty מנהל את ההרשאה בפועל — כאן רק מוגדר אילו פיצ׳רים צריכים לבדוק entitlement."
                : "List of features requiring a premium subscription. Adapty manages the actual entitlement — this only defines which features should check for it."}
            </p>
          </div>
          <button
            onClick={() => setShowAddGate(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            {selectedLanguage === "he" ? "הוסף שער" : "Add Gate"}
          </button>
        </div>

        {/* Add Gate Form */}
        {showAddGate && (
          <div className="bg-gray-50 border rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="feature_key (e.g. unlimited_orders)"
                value={newGate.feature_key}
                onChange={(e) => setNewGate({ ...newGate, feature_key: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
                dir="ltr"
              />
              <input
                type="text"
                placeholder={selectedLanguage === "he" ? "שם תצוגה" : "Display Name"}
                value={newGate.display_name}
                onChange={(e) => setNewGate({ ...newGate, display_name: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder={selectedLanguage === "he" ? "הרשאה נדרשת (מ-Adapty)" : "Required Entitlement (from Adapty)"}
                value={newGate.required_entitlement}
                onChange={(e) => setNewGate({ ...newGate, required_entitlement: e.target.value })}
                className="border rounded px-3 py-2 text-sm"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createGateMutation.mutate({
                  app_key: appKey,
                  app_language: selectedLanguage,
                  ...newGate,
                })}
                disabled={!newGate.feature_key || !newGate.display_name || createGateMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {createGateMutation.isPending
                  ? (selectedLanguage === "he" ? "שומר..." : "Saving...")
                  : (selectedLanguage === "he" ? "צור שער" : "Create")}
              </button>
              <button
                onClick={() => setShowAddGate(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        <DataTable
          columns={gateColumns}
          data={gates as unknown as Record<string, unknown>[]}
          isLoading={gatesQuery.isLoading}
          emptyMessage={t("paywall.no_gates")}
        />
      </section>

      {/* Edit Gate Modal */}
      {editingGate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="text-lg font-bold">
              {selectedLanguage === "he" ? "עריכת שער פיצ׳ר" : "Edit Feature Gate"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedLanguage === "he" ? "שם תצוגה" : "Display Name"}
                </label>
                <input
                  type="text"
                  value={editingGate.display_name}
                  onChange={(e) => setEditingGate({ ...editingGate, display_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedLanguage === "he" ? "הרשאה נדרשת (מ-Adapty)" : "Required Entitlement (from Adapty)"}
                </label>
                <input
                  type="text"
                  value={editingGate.required_entitlement}
                  onChange={(e) => setEditingGate({ ...editingGate, required_entitlement: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingGate(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => updateGateMutation.mutate({
                  id: editingGate.id,
                  app_key: appKey,
                  display_name: editingGate.display_name,
                  required_entitlement: editingGate.required_entitlement,
                })}
                disabled={updateGateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {updateGateMutation.isPending ? (selectedLanguage === "he" ? "שומר..." : "Saving...") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
