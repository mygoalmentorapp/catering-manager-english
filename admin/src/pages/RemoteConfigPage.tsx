import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { getT } from "@/lib/i18n";

// ============ Reusable Form Primitives ============

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary-600" : "bg-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
  dir,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number" | "url";
  dir?: "ltr" | "rtl";
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        dir={dir}
        className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
          disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"
        }`}
      />
    </div>
  );
}

function FormTextArea({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none ${
          disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"
        }`}
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
          disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"
        }`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============ Section Card ============

function SectionCard({
  title,
  description,
  statusBadge,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  statusBadge?: { active: boolean; label: string };
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {statusBadge && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                statusBadge.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {statusBadge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {description && <span className="text-xs text-gray-400 hidden sm:inline">{description}</span>}
          <span className={`text-gray-400 text-sm transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>
      {open && <div className="p-5 space-y-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ============ Main Page ============

export function RemoteConfigPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const utils = trpc.useUtils();

  const configQuery = trpc.admin.getRemoteConfig.useQuery(
    { app_key: selectedApp?.app_key ?? "", app_language: selectedLanguage },
    { enabled: !!selectedApp }
  );

  const upsertMutation = trpc.admin.upsertRemoteConfig.useMutation({
    onSuccess: () => {
      utils.admin.getRemoteConfig.invalidate();
      setSuccessMsg(t("remote_config.save_success"));
      setEditing(false);
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setTimeout(() => setErrorMsg(""), 5000);
    },
  });

  const [editing, setEditing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);

  // Form state — mirrors the RemoteConfig interface
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Sync form with fetched data
  useEffect(() => {
    if (configQuery.data) {
      const { id, app_key, app_language, created_at, updated_at, ...rest } = configQuery.data as Record<string, unknown>;
      setForm(rest);
    }
  }, [configQuery.data]);

  const updateField = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = () => {
    if (!selectedApp) return;
    // Client-side safety validation
    if (form.maintenance_enabled && !form.maintenance_message) {
      setErrorMsg(selectedLanguage === "he" ? "לא ניתן להפעיל מצב תחזוקה ללא הודעה" : "Cannot enable maintenance without a message");
      setTimeout(() => setErrorMsg(""), 5000);
      setConfirmSave(false);
      return;
    }
    if (form.force_update_enabled && (!form.minimum_supported_version_code || Number(form.minimum_supported_version_code) <= 0)) {
      setErrorMsg(selectedLanguage === "he" ? "לא ניתן להפעיל עדכון כפוי ללא גרסת מינימום" : "Cannot enable force update without a minimum version");
      setTimeout(() => setErrorMsg(""), 5000);
      setConfirmSave(false);
      return;
    }
    if (form.global_message_enabled && !form.global_message_text) {
      setErrorMsg(selectedLanguage === "he" ? "לא ניתן להפעיל הודעה כללית ללא טקסט" : "Cannot enable global message without text");
      setTimeout(() => setErrorMsg(""), 5000);
      setConfirmSave(false);
      return;
    }
    upsertMutation.mutate({
      app_key: selectedApp.app_key,
      app_language: selectedLanguage,
      config: form,
    });
    setConfirmSave(false);
  };

  if (!selectedApp) {
    return <div className="text-gray-500 p-4">{t("common.select_app")}</div>;
  }

  const isLoading = configQuery.isLoading;
  const config = configQuery.data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t("remote_config.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("remote_config.subtitle")} <strong>{selectedApp.display_name}</strong> ({selectedLanguage === "he" ? "עברית" : "English"})
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              disabled={isLoading || !config}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t("remote_config.edit")}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  if (configQuery.data) {
                    const { id, app_key, app_language, created_at, updated_at, ...rest } = configQuery.data as Record<string, unknown>;
                    setForm(rest);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("remote_config.cancel")}
              </button>
              <button
                onClick={() => setConfirmSave(true)}
                disabled={upsertMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {upsertMutation.isPending ? t("common.saving") : t("remote_config.save")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ✗ {errorMsg}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 p-8 text-center">{t("common.loading")}</div>
      ) : !config ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          {t("remote_config.no_config")}
          <div className="mt-4">
            <button
              onClick={() => {
                if (!selectedApp) return;
                upsertMutation.mutate({
                  app_key: selectedApp.app_key,
                  app_language: selectedLanguage,
                  config: {
                    schema_version: 1,
                    paywall_enabled: false,
                    revenuecat_enabled: false,
                    remote_campaigns_enabled: false,
                    feedback_popup_enabled: false,
                    global_message_enabled: false,
                    external_urls_enabled: false,
                    cache_ttl_minutes: 30,
                    force_update_enabled: false,
                    minimum_supported_version_code: 0,
                    latest_version_code: 0,
                    force_update_title: "",
                    force_update_message: "",
                    force_update_button_text: "",
                    google_play_url: "",
                    maintenance_enabled: false,
                    maintenance_title: "",
                    maintenance_message: "",
                    maintenance_action_text: "",
                    global_message_title: "",
                    global_message_text: "",
                    global_message_type: "info",
                    global_message_action: "",
                    global_message_action_text: "",
                    global_message_dismissible: true,
                    session_timeout_minutes: 30,
                    dynamic_onboarding_enabled: false,
                    default_entitlement_id: "premium_access",
                    default_offering_id: "",
                    paywall_provider: "adapty",
                  },
                });
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t("remote_config.create_default")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ===== Maintenance Mode ===== */}
          <SectionCard
            title={t("remote_config.maintenance_title")}
            statusBadge={{
              active: !!form.maintenance_enabled,
              label: form.maintenance_enabled ? t("common.active") : t("common.disabled"),
            }}
            defaultOpen={!!form.maintenance_enabled}
          >
            <ToggleSwitch
              label={t("remote_config.maintenance_enabled")}
              description={t("remote_config.maintenance_enabled_desc")}
              checked={!!form.maintenance_enabled}
              onChange={(v) => updateField("maintenance_enabled", v)}
              disabled={!editing}
            />
            <FormInput
              label={t("remote_config.maintenance_title_field")}
              value={(form.maintenance_title as string) ?? ""}
              onChange={(v) => updateField("maintenance_title", v)}
              disabled={!editing}
              placeholder="האפליקציה בתחזוקה"
            />
            <FormTextArea
              label={t("remote_config.maintenance_message_field")}
              value={(form.maintenance_message as string) ?? ""}
              onChange={(v) => updateField("maintenance_message", v)}
              disabled={!editing}
              placeholder="אנחנו עובדים על שיפורים. נחזור בקרוב!"
            />
            <FormInput
              label={t("remote_config.maintenance_action_text_field")}
              value={(form.maintenance_action_text as string) ?? ""}
              onChange={(v) => updateField("maintenance_action_text", v)}
              disabled={!editing}
              placeholder="הבנתי"
            />
          </SectionCard>

          {/* ===== Force Update ===== */}
          <SectionCard
            title={t("remote_config.force_update_title")}
            statusBadge={{
              active: !!form.force_update_enabled,
              label: form.force_update_enabled ? t("common.active") : t("common.disabled"),
            }}
            defaultOpen={!!form.force_update_enabled}
          >
            <ToggleSwitch
              label={t("remote_config.force_update_enabled")}
              description={t("remote_config.force_update_enabled_desc")}
              checked={!!form.force_update_enabled}
              onChange={(v) => updateField("force_update_enabled", v)}
              disabled={!editing}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label={t("remote_config.minimum_version")}
                value={String(form.minimum_supported_version_code ?? 0)}
                onChange={(v) => updateField("minimum_supported_version_code", Number(v) || 0)}
                disabled={!editing}
                type="number"
                dir="ltr"
              />
              <FormInput
                label={t("remote_config.latest_version")}
                value={String(form.latest_version_code ?? 0)}
                onChange={(v) => updateField("latest_version_code", Number(v) || 0)}
                disabled={!editing}
                type="number"
                dir="ltr"
              />
            </div>
            <FormInput
              label={t("remote_config.force_update_title_field")}
              value={(form.force_update_title as string) ?? ""}
              onChange={(v) => updateField("force_update_title", v)}
              disabled={!editing}
              placeholder="עדכון חובה"
            />
            <FormTextArea
              label={t("remote_config.force_update_message_field")}
              value={(form.force_update_message as string) ?? ""}
              onChange={(v) => updateField("force_update_message", v)}
              disabled={!editing}
              placeholder="גרסה חדשה זמינה. יש לעדכן כדי להמשיך להשתמש באפליקציה."
            />
            <FormInput
              label={t("remote_config.force_update_button_text_field")}
              value={(form.force_update_button_text as string) ?? ""}
              onChange={(v) => updateField("force_update_button_text", v)}
              disabled={!editing}
              placeholder="עדכן עכשיו"
            />
            <FormInput
              label={t("remote_config.google_play_url_field")}
              value={(form.google_play_url as string) ?? ""}
              onChange={(v) => updateField("google_play_url", v)}
              disabled={!editing}
              type="url"
              dir="ltr"
              placeholder="https://play.google.com/store/apps/details?id=..."
            />
          </SectionCard>

          {/* ===== Global Message ===== */}
          <SectionCard
            title={t("remote_config.global_message_title")}
            statusBadge={{
              active: !!form.global_message_enabled,
              label: form.global_message_enabled ? t("common.active") : t("common.disabled"),
            }}
            defaultOpen={!!form.global_message_enabled}
          >
            <ToggleSwitch
              label={t("remote_config.global_message_enabled")}
              description={t("remote_config.global_message_enabled_desc")}
              checked={!!form.global_message_enabled}
              onChange={(v) => updateField("global_message_enabled", v)}
              disabled={!editing}
            />
            <FormInput
              label={t("remote_config.global_message_title_field")}
              value={(form.global_message_title as string) ?? ""}
              onChange={(v) => updateField("global_message_title", v)}
              disabled={!editing}
              placeholder="הודעה חשובה"
            />
            <FormTextArea
              label={t("remote_config.global_message_text_field")}
              value={(form.global_message_text as string) ?? ""}
              onChange={(v) => updateField("global_message_text", v)}
              disabled={!editing}
              placeholder="תוכן ההודעה..."
            />
            <div className="grid grid-cols-2 gap-4">
              <FormSelect
                label={t("remote_config.global_message_type_field")}
                value={(form.global_message_type as string) ?? "info"}
                onChange={(v) => updateField("global_message_type", v)}
                disabled={!editing}
                options={[
                  { value: "info", label: "Info" },
                  { value: "warning", label: "Warning" },
                  { value: "error", label: "Error" },
                  { value: "success", label: "Success" },
                ]}
              />
              <ToggleSwitch
                label={t("remote_config.global_message_dismissible")}
                checked={form.global_message_dismissible !== false}
                onChange={(v) => updateField("global_message_dismissible", v)}
                disabled={!editing}
              />
            </div>
            <FormInput
              label={t("remote_config.global_message_action_field")}
              value={(form.global_message_action as string) ?? ""}
              onChange={(v) => updateField("global_message_action", v)}
              disabled={!editing}
              placeholder="open_url / navigate / dismiss"
              dir="ltr"
            />
            <FormInput
              label={t("remote_config.global_message_action_text_field")}
              value={(form.global_message_action_text as string) ?? ""}
              onChange={(v) => updateField("global_message_action_text", v)}
              disabled={!editing}
              placeholder="לחץ כאן"
            />
          </SectionCard>

          {/* ===== Feature Toggles ===== */}
          <SectionCard title={t("remote_config.feature_toggles_title")} defaultOpen={true}>
            <ToggleSwitch
              label={t("remote_config.paywall_enabled")}
              description={t("remote_config.paywall_enabled_desc")}
              checked={!!form.paywall_enabled}
              onChange={(v) => updateField("paywall_enabled", v)}
              disabled={!editing}
            />
            {/* Deprecated toggles — will be removed after OneSignal migration */}
            <div className="border-t border-amber-200 pt-3 mt-3">
              <p className="text-xs text-amber-600 mb-2 font-medium">
                {selectedLanguage === "he" ? "⚠️ מיועדים להסרה לאחר מעבר ל-OneSignal" : "⚠️ Scheduled for removal after OneSignal migration"}
              </p>
              <ToggleSwitch
                label={t("remote_config.remote_campaigns_enabled")}
                description={t("remote_config.remote_campaigns_enabled_desc")}
                checked={!!form.remote_campaigns_enabled}
                onChange={(v) => updateField("remote_campaigns_enabled", v)}
                disabled={!editing}
              />
              <ToggleSwitch
                label={t("remote_config.feedback_popup_enabled")}
                description={t("remote_config.feedback_popup_enabled_desc")}
                checked={!!form.feedback_popup_enabled}
                onChange={(v) => updateField("feedback_popup_enabled", v)}
                disabled={!editing}
              />
            </div>
            <ToggleSwitch
              label={t("remote_config.external_urls_enabled")}
              description={t("remote_config.external_urls_enabled_desc")}
              checked={!!form.external_urls_enabled}
              onChange={(v) => updateField("external_urls_enabled", v)}
              disabled={!editing}
            />
            <ToggleSwitch
              label={t("remote_config.dynamic_onboarding_enabled")}
              description={t("remote_config.dynamic_onboarding_enabled_desc")}
              checked={!!form.dynamic_onboarding_enabled}
              onChange={(v) => updateField("dynamic_onboarding_enabled", v)}
              disabled={!editing}
            />
          </SectionCard>

          {/* ===== Advanced Settings ===== */}
          <SectionCard title={t("remote_config.advanced_title")}>
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label={t("remote_config.cache_ttl")}
                value={String(form.cache_ttl_minutes ?? 30)}
                onChange={(v) => updateField("cache_ttl_minutes", Number(v) || 30)}
                disabled={!editing}
                type="number"
                dir="ltr"
              />
              <FormInput
                label={t("remote_config.session_timeout")}
                value={String(form.session_timeout_minutes ?? 30)}
                onChange={(v) => updateField("session_timeout_minutes", Number(v) || 30)}
                disabled={!editing}
                type="number"
                dir="ltr"
              />
            </div>
            <FormInput
              label={t("remote_config.default_entitlement_id")}
              value={(form.default_entitlement_id as string) ?? ""}
              onChange={(v) => updateField("default_entitlement_id", v)}
              disabled={!editing}
              dir="ltr"
              placeholder="premium_access"
            />
            <FormInput
              label={t("remote_config.default_offering_id")}
              value={(form.default_offering_id as string) ?? ""}
              onChange={(v) => updateField("default_offering_id", v)}
              disabled={!editing}
              dir="ltr"
            />
            <FormSelect
              label={t("remote_config.paywall_provider")}
              value={(form.paywall_provider as string) ?? "adapty"}
              onChange={(v) => updateField("paywall_provider", v)}
              disabled={!editing}
              options={[
                { value: "adapty", label: "Adapty" },
                { value: "revenuecat", label: "RevenueCat (Legacy)" },
                { value: "none", label: "None" },
              ]}
            />
          </SectionCard>
        </div>
      )}

      {/* ===== Confirmation Modal ===== */}
      {confirmSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("remote_config.confirm_save_title")}</h3>
            <p className="text-sm text-gray-600 mb-6">{t("remote_config.confirm_save_message")}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSave(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("remote_config.cancel")}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                {t("remote_config.confirm_save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
