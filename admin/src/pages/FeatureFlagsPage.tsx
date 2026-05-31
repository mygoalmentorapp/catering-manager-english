import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getT } from "@/lib/i18n";

interface FeatureFlag {
  id: string;
  flag_name: string;
  is_enabled: boolean;
  description: string | null;
  rollout_percentage: number;
  created_at: string;
  updated_at: string | null;
}

// Flags marked for future cleanup — do NOT delete yet, just label them
const DEPRECATED_FLAGS: Record<string, string> = {
  revenuecat: "מיועד להסרה לאחר מעבר מלא ל-Adapty",
  remote_campaigns: "מיועד להסרה לאחר מעבר מלא ל-OneSignal",
  feedback_popup: "מיועד להסרה לאחר מעבר ל-OneSignal In-App Messages",
  dynamic_onboarding: "זמני — עד החלטה סופית לגבי Adapty Onboarding",
};

export function FeatureFlagsPage() {
  const { selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const utils = trpc.useUtils();

  const flagsQuery = trpc.admin.getFeatureFlags.useQuery();
  const createMutation = trpc.admin.createFeatureFlag.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureFlags.invalidate();
      setShowCreate(false);
      resetForm();
      setSuccessMsg(t("feature_flags.created_success"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(""), 5000);
    },
  });
  const updateMutation = trpc.admin.updateFeatureFlag.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureFlags.invalidate();
      setEditingId(null);
      setSuccessMsg(t("feature_flags.updated_success"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(""), 5000);
    },
  });
  const deleteMutation = trpc.admin.deleteFeatureFlag.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureFlags.invalidate();
      setConfirmDelete(null);
      setSuccessMsg(t("feature_flags.deleted_success"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(""), 5000);
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FeatureFlag | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEnabled, setNewEnabled] = useState(false);
  const [newRollout, setNewRollout] = useState(100);

  const [editDesc, setEditDesc] = useState("");
  const [editRollout, setEditRollout] = useState(100);

  const resetForm = () => {
    setNewName("");
    setNewDesc("");
    setNewEnabled(false);
    setNewRollout(100);
  };

  const startEdit = (flag: FeatureFlag) => {
    setEditingId(flag.id);
    setEditDesc(flag.description ?? "");
    setEditRollout(flag.rollout_percentage ?? 100);
  };

  const handleToggle = (flag: FeatureFlag) => {
    updateMutation.mutate({ id: flag.id, is_enabled: !flag.is_enabled });
  };

  const handleSaveEdit = (flag: FeatureFlag) => {
    updateMutation.mutate({
      id: flag.id,
      description: editDesc,
      rollout_percentage: editRollout,
    });
  };

  const flags = (flagsQuery.data ?? []) as FeatureFlag[];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t("feature_flags.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("feature_flags.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          + {t("feature_flags.add_flag")}
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">✓ {successMsg}</div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">✗ {errorMsg}</div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">{t("feature_flags.new_flag")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("feature_flags.col_key")}</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. show_premium_badge"
                dir="ltr"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("feature_flags.col_rollout")}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={newRollout}
                onChange={(e) => setNewRollout(Number(e.target.value))}
                dir="ltr"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("feature_flags.col_description")}</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder={t("feature_flags.desc_placeholder")}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newEnabled}
                onChange={(e) => setNewEnabled(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              {t("feature_flags.enable_immediately")}
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setShowCreate(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => createMutation.mutate({ flag_name: newName, is_enabled: newEnabled, description: newDesc, rollout_percentage: newRollout })}
              disabled={!newName.trim() || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? t("common.saving") : t("feature_flags.create")}
            </button>
          </div>
        </div>
      )}

      {/* Flags Table */}
      {flagsQuery.isLoading ? (
        <div className="text-gray-400 p-8 text-center">{t("common.loading")}</div>
      ) : flags.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          {t("feature_flags.no_flags")}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("feature_flags.col_key")}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("feature_flags.col_status")}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("feature_flags.col_rollout")}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("feature_flags.col_description")}</th>
                <th className="px-4 py-3 text-end text-xs font-medium text-gray-500 uppercase">{t("feature_flags.col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flags.map((flag) => (
                <tr key={flag.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3" dir="ltr">
                    <span className="font-mono text-xs text-gray-800">{flag.flag_name}</span>
                    {DEPRECATED_FLAGS[flag.flag_name] && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 border border-amber-200" title={DEPRECATED_FLAGS[flag.flag_name]}>
                        {selectedLanguage === "he" ? "מיועד לניקוי" : "pending cleanup"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(flag)}
                      disabled={updateMutation.isPending}
                      className="cursor-pointer"
                      title={t("feature_flags.toggle_tooltip")}
                    >
                      <StatusBadge
                        status={flag.is_enabled}
                        trueLabel={t("status.enabled")}
                        falseLabel={t("status.disabled")}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === flag.id ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editRollout}
                        onChange={(e) => setEditRollout(Number(e.target.value))}
                        dir="ltr"
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-primary-500"
                      />
                    ) : (
                      <span className="text-xs text-gray-600" dir="ltr">{flag.rollout_percentage ?? 100}%</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === flag.id ? (
                      <input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-primary-500"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">{flag.description || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === flag.id ? (
                        <>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            onClick={() => handleSaveEdit(flag)}
                            disabled={updateMutation.isPending}
                            className="px-2 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50"
                          >
                            {t("common.save")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(flag)}
                            className="px-2 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(flag)}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            {t("common.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("feature_flags.confirm_delete_title")}</h3>
            <p className="text-sm text-gray-600 mb-1">{t("feature_flags.confirm_delete_message")}</p>
            <p className="text-sm font-mono text-red-600 mb-6" dir="ltr">{confirmDelete.flag_name}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: confirmDelete.id })}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
