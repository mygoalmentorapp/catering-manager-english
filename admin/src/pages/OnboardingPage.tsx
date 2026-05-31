import { useState, useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getT } from "@/lib/i18n";

interface OnboardingFlow {
  id: string;
  app_key: string;
  app_language: string;
  flow_key: string;
  title: string;
  is_enabled: boolean;
  created_at: string;
}

interface OnboardingScreen {
  id?: string;
  sort_order: number;
  title: string;
  body?: string;
  icon?: string;
  image_url?: string;
  background_color?: string;
  button_text?: string;
  skip_button_text?: string;
}

export function OnboardingPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const utils = trpc.useUtils();
  const appKey = selectedApp?.app_key ?? "";

  const flowsQuery = trpc.admin.getOnboardingFlows.useQuery(
    { app_key: appKey, app_language: selectedLanguage },
    { enabled: !!selectedApp }
  );

  const createFlowMutation = trpc.admin.createOnboardingFlow.useMutation({
    onSuccess: () => {
      utils.admin.getOnboardingFlows.invalidate();
      setShowCreateFlow(false);
      setNewFlowKey(""); setNewFlowTitle("");
      setSuccessMsg(t("onboarding.flow_created"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => { setErrorMsg(err.message); setTimeout(() => setErrorMsg(""), 5000); },
  });
  const updateFlowMutation = trpc.admin.updateOnboardingFlow.useMutation({
    onSuccess: () => {
      utils.admin.getOnboardingFlows.invalidate();
      setSuccessMsg(t("onboarding.flow_updated"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => { setErrorMsg(err.message); setTimeout(() => setErrorMsg(""), 5000); },
  });
  const upsertScreensMutation = trpc.admin.upsertOnboardingScreens.useMutation({
    onSuccess: () => {
      utils.admin.getOnboardingFlows.invalidate();
      setEditingFlow(null);
      setSuccessMsg(t("onboarding.screens_saved"));
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => { setErrorMsg(err.message); setTimeout(() => setErrorMsg(""), 5000); },
  });

  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [editingFlow, setEditingFlow] = useState<OnboardingFlow | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [newFlowKey, setNewFlowKey] = useState("");
  const [newFlowTitle, setNewFlowTitle] = useState("");

  const handleToggleFlow = (flow: OnboardingFlow) => {
    updateFlowMutation.mutate({ flow_id: flow.id, app_key: appKey, is_enabled: !flow.is_enabled });
  };

  const flows = (flowsQuery.data ?? []) as OnboardingFlow[];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t("onboarding.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("onboarding.subtitle")} <strong>{selectedApp?.display_name}</strong> ({selectedLanguage === "he" ? "עברית" : "English"})
          </p>
        </div>
        <button
          onClick={() => setShowCreateFlow(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          + {t("onboarding.add_flow")}
        </button>
      </div>

      {/* Temporary/Fallback Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-amber-600 text-lg">⚠️</div>
          <div>
            <h4 className="font-semibold text-amber-900 text-sm">
              {selectedLanguage === "he" ? "מערכת זמנית — Fallback" : "Temporary System — Fallback"}
            </h4>
            <p className="text-amber-800 text-xs mt-1">
              {selectedLanguage === "he"
                ? "מערכת ה-Onboarding הפנימית נשארת כרגע כ-fallback זמני. בעתיד ייתכן שנעבור ל-Adapty Onboarding Builder לאחר בדיקות RTL מלאות. לא להרחיב מערכת זו עם יכולות חדשות (A/B testing, סגמנטים, קמפיינים)."
                : "The internal Onboarding system remains as a temporary fallback. In the future, we may migrate to Adapty Onboarding Builder after full RTL testing. Do not extend this system with new capabilities (A/B testing, segments, campaigns)."}
            </p>
          </div>
        </div>
      </div>

      {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">✓ {successMsg}</div>}
      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">✗ {errorMsg}</div>}

      {/* Create Flow Form */}
      {showCreateFlow && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">{t("onboarding.new_flow")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("onboarding.flow_key")}</label>
              <input value={newFlowKey} onChange={(e) => setNewFlowKey(e.target.value)} placeholder="e.g. main_onboarding" dir="ltr" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("onboarding.flow_title")}</label>
              <input value={newFlowTitle} onChange={(e) => setNewFlowTitle(e.target.value)} placeholder={selectedLanguage === "he" ? "פתיחה ראשונית" : "Main Onboarding"} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setShowCreateFlow(false); setNewFlowKey(""); setNewFlowTitle(""); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t("common.cancel")}</button>
            <button
              onClick={() => createFlowMutation.mutate({ app_key: appKey, app_language: selectedLanguage, flow_key: newFlowKey, title: newFlowTitle, is_enabled: false })}
              disabled={!newFlowKey.trim() || !newFlowTitle.trim() || createFlowMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {createFlowMutation.isPending ? t("common.saving") : t("onboarding.create_flow")}
            </button>
          </div>
        </div>
      )}

      {/* Flows List */}
      {flowsQuery.isLoading ? (
        <div className="text-gray-400 p-8 text-center">{t("common.loading")}</div>
      ) : flows.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">{t("onboarding.no_flows")}</div>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
            <div key={flow.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleFlow(flow)} className="cursor-pointer">
                    <StatusBadge status={flow.is_enabled} trueLabel={t("status.active")} falseLabel={t("status.disabled")} />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{flow.title}</p>
                    <p className="text-xs text-gray-500 font-mono" dir="ltr">{flow.flow_key}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingFlow(flow)}
                  className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  {t("onboarding.edit_screens")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screen Editor Modal */}
      {editingFlow && (
        <ScreenEditorModal
          flow={editingFlow}
          onClose={() => setEditingFlow(null)}
          onSave={(screens) => upsertScreensMutation.mutate({ flow_id: editingFlow.id, app_key: appKey, screens })}
          isSaving={upsertScreensMutation.isPending}
          t={t}
          selectedLanguage={selectedLanguage}
        />
      )}
    </div>
  );
}

function ScreenEditorModal({ flow, onClose, onSave, isSaving, t, selectedLanguage }: {
  flow: OnboardingFlow;
  onClose: () => void;
  onSave: (screens: OnboardingScreen[]) => void;
  isSaving: boolean;
  t: (key: any) => string;
  selectedLanguage: string;
}) {
  const [screens, setScreens] = useState<OnboardingScreen[]>([]);
  const [loaded, setLoaded] = useState(false);

  const flowDetail = trpc.admin.getOnboardingFlow.useQuery(
    { flow_id: flow.id },
    { enabled: !!flow.id }
  );

  useEffect(() => {
    if (flowDetail.data && !loaded) {
      const existing = (flowDetail.data.screens ?? []) as OnboardingScreen[];
      setScreens(existing.map((s, i) => ({ ...s, sort_order: s.sort_order ?? i })));
      setLoaded(true);
    }
  }, [flowDetail.data, loaded]);

  const addScreen = () => {
    setScreens([...screens, {
      sort_order: screens.length,
      title: "",
      body: "",
      icon: "",
      button_text: selectedLanguage === "he" ? "הבא" : "Next",
      skip_button_text: selectedLanguage === "he" ? "דלג" : "Skip",
    }]);
  };

  const updateScreen = (index: number, field: string, value: string) => {
    const updated = [...screens];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setScreens(updated);
  };

  const removeScreen = (index: number) => {
    setScreens(screens.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i })));
  };

  const moveScreen = (index: number, dir: "up" | "down") => {
    if (dir === "up" && index === 0) return;
    if (dir === "down" && index === screens.length - 1) return;
    const updated = [...screens];
    const swap = dir === "up" ? index - 1 : index + 1;
    [updated[index], updated[swap]] = [updated[swap], updated[index]];
    updated.forEach((s, i) => (s.sort_order = i));
    setScreens(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t("onboarding.edit_screens")}</h3>
            <p className="text-xs text-gray-500">{flow.title} ({flow.flow_key})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {flowDetail.isLoading ? (
            <div className="text-gray-400 text-center py-8">{t("common.loading")}</div>
          ) : (
            <>
              {screens.map((screen, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">{t("onboarding.screen")} {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveScreen(index, "up")} disabled={index === 0} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30">↑</button>
                      <button onClick={() => moveScreen(index, "down")} disabled={index === screens.length - 1} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30">↓</button>
                      <button onClick={() => removeScreen(index)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">{t("common.delete")}</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t("onboarding.screen_title")}</label>
                      <input value={screen.title} onChange={(e) => updateScreen(index, "title", e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" dir={selectedLanguage === "he" ? "rtl" : "ltr"} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t("onboarding.screen_icon")}</label>
                      <input value={screen.icon ?? ""} onChange={(e) => updateScreen(index, "icon", e.target.value)} placeholder="e.g. sparkles" dir="ltr" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t("onboarding.screen_body")}</label>
                    <textarea value={screen.body ?? ""} onChange={(e) => updateScreen(index, "body", e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 resize-none" dir={selectedLanguage === "he" ? "rtl" : "ltr"} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t("onboarding.button_text")}</label>
                      <input value={screen.button_text ?? ""} onChange={(e) => updateScreen(index, "button_text", e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" dir={selectedLanguage === "he" ? "rtl" : "ltr"} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t("onboarding.skip_button")}</label>
                      <input value={screen.skip_button_text ?? ""} onChange={(e) => updateScreen(index, "skip_button_text", e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500" dir={selectedLanguage === "he" ? "rtl" : "ltr"} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addScreen} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">+ {t("onboarding.add_screen")}</button>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t("common.cancel")}</button>
          <button onClick={() => onSave(screens.map((s, i) => ({ ...s, sort_order: i })))} disabled={isSaving || screens.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {isSaving ? t("common.saving") : t("onboarding.save_screens")}
          </button>
        </div>
      </div>
    </div>
  );
}
