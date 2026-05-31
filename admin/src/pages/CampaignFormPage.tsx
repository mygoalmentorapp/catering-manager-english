import { useState, useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { useNavigate, useParams } from "react-router-dom";
import { getT } from "@/lib/i18n";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3.5 flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className={`text-gray-400 text-sm transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="p-5 space-y-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  required,
  readOnly,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
          readOnly ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"
        } ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white transition-colors"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white transition-colors"
      >
        <option value="">{placeholder || "—"}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label} ({o.key})
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? "bg-primary-600" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows ?? 3}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white resize-y transition-colors"
      />
    </div>
  );
}

function JsonInput({
  label,
  value,
  onChange,
  errorLabel,
}: {
  label: string;
  value: Record<string, unknown> | null;
  onChange: (v: Record<string, unknown> | null) => void;
  errorLabel: string;
}) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "{}");
  const [error, setError] = useState("");

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setError("");
    } catch {
      setError(errorLabel);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        dir="ltr"
        className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:ring-2 focus:ring-primary-500 bg-white resize-y transition-colors ${
          error ? "border-red-300" : "border-gray-200"
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ---- Main Form Component ----

interface CampaignFormData {
  campaign_key: string;
  name: string;
  type: string;
  is_enabled: boolean;
  priority: number;
  title: string;
  subtitle: string;
  message: string;
  icon: string;
  image_url: string;
  primary_button_text: string;
  primary_button_action: string;
  primary_button_payload: Record<string, unknown> | null;
  secondary_button_text: string;
  secondary_button_action: string;
  secondary_button_payload: Record<string, unknown> | null;
  dismissible: boolean;
  trigger_event: string;
  target_audience: string;
  platform: string;
  start_at: string;
  end_at: string;
  rollout_percentage: number;
  min_app_version: string;
  max_app_version: string;
  cooldown_days_after_view: number | null;
  cooldown_days_after_dismiss: number | null;
  max_impressions_per_user: number | null;
  max_impressions_per_session: number | null;
  max_impressions_per_day: number | null;
  max_clicks_per_user: number | null;
  min_days_since_signup: number | null;
  min_days_since_first_open: number | null;
  min_sessions: number | null;
  min_products_created: number | null;
  min_orders_created: number | null;
  min_shopping_lists_created: number | null;
  min_completed_orders: number | null;
  days_since_last_active: number | null;
  show_only_if_not_premium: boolean;
  show_only_if_premium: boolean;
  show_only_if_feedback_not_submitted: boolean;
  show_only_if_onboarding_not_completed: boolean;
  requires_internet: boolean;
  do_not_show_during_critical_flow: boolean;
}

const DEFAULT_FORM: CampaignFormData = {
  campaign_key: "",
  name: "",
  type: "circle_popup",
  is_enabled: false,
  priority: 0,
  title: "",
  subtitle: "",
  message: "",
  icon: "",
  image_url: "",
  primary_button_text: "",
  primary_button_action: "",
  primary_button_payload: null,
  secondary_button_text: "",
  secondary_button_action: "",
  secondary_button_payload: null,
  dismissible: true,
  trigger_event: "",
  target_audience: "all",
  platform: "",
  start_at: "",
  end_at: "",
  rollout_percentage: 100,
  min_app_version: "",
  max_app_version: "",
  cooldown_days_after_view: null,
  cooldown_days_after_dismiss: null,
  max_impressions_per_user: null,
  max_impressions_per_session: null,
  max_impressions_per_day: null,
  max_clicks_per_user: null,
  min_days_since_signup: null,
  min_days_since_first_open: null,
  min_sessions: null,
  min_products_created: null,
  min_orders_created: null,
  min_shopping_lists_created: null,
  min_completed_orders: null,
  days_since_last_active: null,
  show_only_if_not_premium: false,
  show_only_if_premium: false,
  show_only_if_feedback_not_submitted: false,
  show_only_if_onboarding_not_completed: false,
  requires_internet: false,
  do_not_show_during_critical_flow: true,
};

function campaignToForm(c: Record<string, unknown>): CampaignFormData {
  return {
    campaign_key: (c.campaign_key as string) ?? "",
    name: (c.name as string) ?? "",
    type: (c.type as string) ?? "circle_popup",
    is_enabled: (c.is_enabled as boolean) ?? false,
    priority: (c.priority as number) ?? 0,
    title: (c.title as string) ?? "",
    subtitle: (c.subtitle as string) ?? "",
    message: (c.message as string) ?? "",
    icon: (c.icon as string) ?? "",
    image_url: (c.image_url as string) ?? "",
    primary_button_text: (c.primary_button_text as string) ?? "",
    primary_button_action: (c.primary_button_action as string) ?? "",
    primary_button_payload: (c.primary_button_payload as Record<string, unknown>) ?? null,
    secondary_button_text: (c.secondary_button_text as string) ?? "",
    secondary_button_action: (c.secondary_button_action as string) ?? "",
    secondary_button_payload: (c.secondary_button_payload as Record<string, unknown>) ?? null,
    dismissible: (c.dismissible as boolean) ?? true,
    trigger_event: (c.trigger_event as string) ?? "",
    target_audience: (c.target_audience as string) ?? "all",
    platform: (c.platform as string) ?? "",
    start_at: c.start_at ? (c.start_at as string).slice(0, 16) : "",
    end_at: c.end_at ? (c.end_at as string).slice(0, 16) : "",
    rollout_percentage: (c.rollout_percentage as number) ?? 100,
    min_app_version: (c.min_app_version as string) ?? "",
    max_app_version: (c.max_app_version as string) ?? "",
    cooldown_days_after_view: (c.cooldown_days_after_view as number) ?? null,
    cooldown_days_after_dismiss: (c.cooldown_days_after_dismiss as number) ?? null,
    max_impressions_per_user: (c.max_impressions_per_user as number) ?? null,
    max_impressions_per_session: (c.max_impressions_per_session as number) ?? null,
    max_impressions_per_day: (c.max_impressions_per_day as number) ?? null,
    max_clicks_per_user: (c.max_clicks_per_user as number) ?? null,
    min_days_since_signup: (c.min_days_since_signup as number) ?? null,
    min_days_since_first_open: (c.min_days_since_first_open as number) ?? null,
    min_sessions: (c.min_sessions as number) ?? null,
    min_products_created: (c.min_products_created as number) ?? null,
    min_orders_created: (c.min_orders_created as number) ?? null,
    min_shopping_lists_created: (c.min_shopping_lists_created as number) ?? null,
    min_completed_orders: (c.min_completed_orders as number) ?? null,
    days_since_last_active: (c.days_since_last_active as number) ?? null,
    show_only_if_not_premium: (c.show_only_if_not_premium as boolean) ?? false,
    show_only_if_premium: (c.show_only_if_premium as boolean) ?? false,
    show_only_if_feedback_not_submitted: (c.show_only_if_feedback_not_submitted as boolean) ?? false,
    show_only_if_onboarding_not_completed: (c.show_only_if_onboarding_not_completed as boolean) ?? false,
    requires_internet: (c.requires_internet as boolean) ?? false,
    do_not_show_during_critical_flow: (c.do_not_show_during_critical_flow as boolean) ?? true,
  };
}

function formToPayload(form: CampaignFormData, appKey: string, appLang: string) {
  const payload: Record<string, unknown> = {
    campaign_key: form.campaign_key,
    app_key: appKey,
    app_language: appLang,
    type: form.type,
    is_enabled: form.is_enabled,
    priority: form.priority,
    rollout_percentage: form.rollout_percentage,
    dismissible: form.dismissible,
    show_only_if_not_premium: form.show_only_if_not_premium,
    show_only_if_premium: form.show_only_if_premium,
    show_only_if_feedback_not_submitted: form.show_only_if_feedback_not_submitted,
    show_only_if_onboarding_not_completed: form.show_only_if_onboarding_not_completed,
    requires_internet: form.requires_internet,
    do_not_show_during_critical_flow: form.do_not_show_during_critical_flow,
  };

  const optStrings: (keyof CampaignFormData)[] = [
    "name", "title", "subtitle", "message", "icon", "image_url",
    "primary_button_text", "primary_button_action",
    "secondary_button_text", "secondary_button_action",
    "trigger_event", "target_audience", "platform",
    "min_app_version", "max_app_version",
  ];
  for (const key of optStrings) {
    const val = form[key] as string;
    payload[key] = val || null;
  }

  payload.start_at = form.start_at ? new Date(form.start_at).toISOString() : null;
  payload.end_at = form.end_at ? new Date(form.end_at).toISOString() : null;
  payload.primary_button_payload = form.primary_button_payload;
  payload.secondary_button_payload = form.secondary_button_payload;

  const optNums: (keyof CampaignFormData)[] = [
    "cooldown_days_after_view", "cooldown_days_after_dismiss",
    "max_impressions_per_user", "max_impressions_per_session",
    "max_impressions_per_day", "max_clicks_per_user",
    "min_days_since_signup", "min_days_since_first_open",
    "min_sessions", "min_products_created", "min_orders_created",
    "min_shopping_lists_created", "min_completed_orders",
    "days_since_last_active",
  ];
  for (const key of optNums) {
    payload[key] = form[key] ?? null;
  }

  return payload;
}

export function CampaignFormPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const t = getT(selectedLanguage);

  const [form, setForm] = useState<CampaignFormData>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const campaignQuery = trpc.admin.getCampaign.useQuery(
    { campaign_id: id ?? "" },
    { enabled: isEdit }
  );

  useEffect(() => {
    if (campaignQuery.data) {
      setForm(campaignToForm(campaignQuery.data as Record<string, unknown>));
    }
  }, [campaignQuery.data]);

  const createMutation = trpc.admin.createCampaign.useMutation();
  const updateMutation = trpc.admin.updateCampaign.useMutation();

  const update = <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!selectedApp) {
      setError(t("campaign_form.no_app" as Parameters<typeof t>[0]));
      return;
    }
    if (!form.campaign_key.trim()) {
      setError(t("campaign_form.key_required" as Parameters<typeof t>[0]));
      return;
    }

    try {
      if (isEdit) {
        const payload = formToPayload(form, selectedApp.app_key, selectedLanguage);
        delete payload.campaign_key;
        delete payload.app_key;
        delete payload.app_language;
        await updateMutation.mutateAsync({
          campaign_id: id!,
          ...payload,
        } as Parameters<typeof updateMutation.mutateAsync>[0]);
        setSuccess(t("campaign_form.updated" as Parameters<typeof t>[0]));
        setTimeout(() => navigate(`/campaigns/${id}`), 1000);
      } else {
        const payload = formToPayload(form, selectedApp.app_key, selectedLanguage);
        await createMutation.mutateAsync(payload as Parameters<typeof createMutation.mutateAsync>[0]);
        setSuccess(t("campaign_form.created" as Parameters<typeof t>[0]));
        setTimeout(() => navigate("/campaigns"), 1000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("campaign_form.failed" as Parameters<typeof t>[0]);
      setError(msg);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const events = selectedApp?.supported_events ?? [];
  const actions = selectedApp?.supported_actions ?? [];

  if (isEdit && campaignQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        {t("campaign_form.loading" as Parameters<typeof t>[0])}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? t("campaign_form.edit_title" as Parameters<typeof t>[0]) : t("campaign_form.create_title" as Parameters<typeof t>[0])}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedApp?.display_name} — {selectedLanguage}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(isEdit ? `/campaigns/${id}` : "/campaigns")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t("campaign_form.cancel" as Parameters<typeof t>[0])}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {isPending ? t("campaign_form.saving" as Parameters<typeof t>[0]) : t("campaign_form.save" as Parameters<typeof t>[0])}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="space-y-4">
        {/* Section 1: Basic Info */}
        <Section title={t("campaign_form.section_basic" as Parameters<typeof t>[0])} defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t("campaign_form.campaign_key" as Parameters<typeof t>[0])}
              value={form.campaign_key}
              onChange={(v) => update("campaign_key", v)}
              required
              readOnly={isEdit}
              placeholder={t("campaign_form.placeholder_key" as Parameters<typeof t>[0])}
              mono
            />
            <TextInput
              label={t("campaign_form.name" as Parameters<typeof t>[0])}
              value={form.name}
              onChange={(v) => update("name", v)}
              placeholder={t("campaign_form.placeholder_name" as Parameters<typeof t>[0])}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("campaign_form.type" as Parameters<typeof t>[0])}</label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
              >
                <option value="circle_popup">{t("campaign_form.type_circle_popup" as Parameters<typeof t>[0])}</option>
                <option value="banner">{t("campaign_form.type_banner" as Parameters<typeof t>[0])}</option>
                <option value="bottom_sheet">{t("campaign_form.type_bottom_sheet" as Parameters<typeof t>[0])}</option>
                <option value="full_screen">{t("campaign_form.type_full_screen" as Parameters<typeof t>[0])}</option>
                <option value="toast">{t("campaign_form.type_toast" as Parameters<typeof t>[0])}</option>
              </select>
            </div>
            <NumberInput
              label={t("campaign_form.priority" as Parameters<typeof t>[0])}
              value={form.priority}
              onChange={(v) => update("priority", v ?? 0)}
              min={0}
            />
          </div>
          <ToggleInput label={t("campaign_form.enabled" as Parameters<typeof t>[0])} value={form.is_enabled} onChange={(v) => update("is_enabled", v)} />
          <div className="grid grid-cols-2 gap-4">
            <TextInput label={t("campaign_form.app_key" as Parameters<typeof t>[0])} value={selectedApp?.app_key ?? ""} onChange={() => {}} readOnly />
            <TextInput label={t("campaign_form.language" as Parameters<typeof t>[0])} value={selectedLanguage} onChange={() => {}} readOnly />
          </div>
        </Section>

        {/* Section 2: Display / Content */}
        <Section title={t("campaign_form.section_display" as Parameters<typeof t>[0])} defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <TextInput label={t("campaign_form.title" as Parameters<typeof t>[0])} value={form.title} onChange={(v) => update("title", v)} />
            <TextInput label={t("campaign_form.subtitle" as Parameters<typeof t>[0])} value={form.subtitle} onChange={(v) => update("subtitle", v)} />
          </div>
          <TextAreaInput label={t("campaign_form.message" as Parameters<typeof t>[0])} value={form.message} onChange={(v) => update("message", v)} />
          <div className="grid grid-cols-2 gap-4">
            <TextInput label={t("campaign_form.icon" as Parameters<typeof t>[0])} value={form.icon} onChange={(v) => update("icon", v)} placeholder={t("campaign_form.placeholder_icon" as Parameters<typeof t>[0])} />
            <TextInput label={t("campaign_form.image_url" as Parameters<typeof t>[0])} value={form.image_url} onChange={(v) => update("image_url", v)} placeholder={t("campaign_form.placeholder_image" as Parameters<typeof t>[0])} />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">{t("campaign_form.primary_btn" as Parameters<typeof t>[0])}</p>
            <div className="grid grid-cols-2 gap-4">
              <TextInput label={t("campaign_form.btn_text" as Parameters<typeof t>[0])} value={form.primary_button_text} onChange={(v) => update("primary_button_text", v)} />
              <SelectInput
                label={t("campaign_form.btn_action" as Parameters<typeof t>[0])}
                value={form.primary_button_action}
                onChange={(v) => update("primary_button_action", v)}
                options={actions}
                placeholder={t("campaign_form.select_action" as Parameters<typeof t>[0])}
              />
            </div>
            <JsonInput
              label={t("campaign_form.btn_payload" as Parameters<typeof t>[0])}
              value={form.primary_button_payload}
              onChange={(v) => update("primary_button_payload", v)}
              errorLabel={t("campaign_form.invalid_json" as Parameters<typeof t>[0])}
            />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">{t("campaign_form.secondary_btn" as Parameters<typeof t>[0])}</p>
            <div className="grid grid-cols-2 gap-4">
              <TextInput label={t("campaign_form.btn_text" as Parameters<typeof t>[0])} value={form.secondary_button_text} onChange={(v) => update("secondary_button_text", v)} />
              <SelectInput
                label={t("campaign_form.btn_action" as Parameters<typeof t>[0])}
                value={form.secondary_button_action}
                onChange={(v) => update("secondary_button_action", v)}
                options={actions}
                placeholder={t("campaign_form.select_action" as Parameters<typeof t>[0])}
              />
            </div>
            <JsonInput
              label={t("campaign_form.btn_payload" as Parameters<typeof t>[0])}
              value={form.secondary_button_payload}
              onChange={(v) => update("secondary_button_payload", v)}
              errorLabel={t("campaign_form.invalid_json" as Parameters<typeof t>[0])}
            />
          </div>
          <ToggleInput label={t("campaign_form.dismissible" as Parameters<typeof t>[0])} value={form.dismissible} onChange={(v) => update("dismissible", v)} />
        </Section>

        {/* Section 3: Targeting / Trigger */}
        <Section title={t("campaign_form.section_targeting" as Parameters<typeof t>[0])}>
          <div className="grid grid-cols-2 gap-4">
            <SelectInput
              label={t("campaign_form.trigger_event" as Parameters<typeof t>[0])}
              value={form.trigger_event}
              onChange={(v) => update("trigger_event", v)}
              options={events}
              placeholder={t("campaign_form.select_event" as Parameters<typeof t>[0])}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("campaign_form.target_audience" as Parameters<typeof t>[0])}</label>
              <select
                value={form.target_audience}
                onChange={(e) => update("target_audience", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
              >
                <option value="all">{t("campaign_form.audience_all" as Parameters<typeof t>[0])}</option>
                <option value="new">{t("campaign_form.audience_new" as Parameters<typeof t>[0])}</option>
                <option value="returning">{t("campaign_form.audience_returning" as Parameters<typeof t>[0])}</option>
                <option value="premium">{t("campaign_form.audience_premium" as Parameters<typeof t>[0])}</option>
                <option value="free">{t("campaign_form.audience_free" as Parameters<typeof t>[0])}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("campaign_form.platform" as Parameters<typeof t>[0])}</label>
              <select
                value={form.platform}
                onChange={(e) => update("platform", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
              >
                <option value="">{t("campaign_form.platform_all" as Parameters<typeof t>[0])}</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
            </div>
            <NumberInput
              label={t("campaign_form.rollout" as Parameters<typeof t>[0])}
              value={form.rollout_percentage}
              onChange={(v) => update("rollout_percentage", v ?? 100)}
              min={0}
              max={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("campaign_form.start_date" as Parameters<typeof t>[0])}</label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => update("start_at", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("campaign_form.end_date" as Parameters<typeof t>[0])}</label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => update("end_at", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextInput label={t("campaign_form.min_version" as Parameters<typeof t>[0])} value={form.min_app_version} onChange={(v) => update("min_app_version", v)} placeholder={t("campaign_form.placeholder_version" as Parameters<typeof t>[0])} />
            <TextInput label={t("campaign_form.max_version" as Parameters<typeof t>[0])} value={form.max_app_version} onChange={(v) => update("max_app_version", v)} placeholder={t("campaign_form.placeholder_version" as Parameters<typeof t>[0])} />
          </div>
        </Section>

        {/* Section 4: Advanced Rules */}
        <Section title={t("campaign_form.section_advanced" as Parameters<typeof t>[0])}>
          <p className="text-xs text-gray-500 mb-3">{t("campaign_form.cooldown_subtitle" as Parameters<typeof t>[0])}</p>
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label={t("campaign_form.cooldown_view" as Parameters<typeof t>[0])} value={form.cooldown_days_after_view} onChange={(v) => update("cooldown_days_after_view", v)} min={0} />
            <NumberInput label={t("campaign_form.cooldown_dismiss" as Parameters<typeof t>[0])} value={form.cooldown_days_after_dismiss} onChange={(v) => update("cooldown_days_after_dismiss", v)} min={0} />
            <NumberInput label={t("campaign_form.max_impressions_user" as Parameters<typeof t>[0])} value={form.max_impressions_per_user} onChange={(v) => update("max_impressions_per_user", v)} min={0} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label={t("campaign_form.max_impressions_session" as Parameters<typeof t>[0])} value={form.max_impressions_per_session} onChange={(v) => update("max_impressions_per_session", v)} min={0} />
            <NumberInput label={t("campaign_form.max_impressions_day" as Parameters<typeof t>[0])} value={form.max_impressions_per_day} onChange={(v) => update("max_impressions_per_day", v)} min={0} />
            <NumberInput label={t("campaign_form.max_clicks_user" as Parameters<typeof t>[0])} value={form.max_clicks_per_user} onChange={(v) => update("max_clicks_per_user", v)} min={0} />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3">{t("campaign_form.activity_subtitle" as Parameters<typeof t>[0])}</p>
            <div className="grid grid-cols-3 gap-4">
              <NumberInput label={t("campaign_form.min_days_signup" as Parameters<typeof t>[0])} value={form.min_days_since_signup} onChange={(v) => update("min_days_since_signup", v)} min={0} />
              <NumberInput label={t("campaign_form.min_days_first_open" as Parameters<typeof t>[0])} value={form.min_days_since_first_open} onChange={(v) => update("min_days_since_first_open", v)} min={0} />
              <NumberInput label={t("campaign_form.min_sessions" as Parameters<typeof t>[0])} value={form.min_sessions} onChange={(v) => update("min_sessions", v)} min={0} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <NumberInput label={t("campaign_form.min_products" as Parameters<typeof t>[0])} value={form.min_products_created} onChange={(v) => update("min_products_created", v)} min={0} />
              <NumberInput label={t("campaign_form.min_orders" as Parameters<typeof t>[0])} value={form.min_orders_created} onChange={(v) => update("min_orders_created", v)} min={0} />
              <NumberInput label={t("campaign_form.min_shopping_lists" as Parameters<typeof t>[0])} value={form.min_shopping_lists_created} onChange={(v) => update("min_shopping_lists_created", v)} min={0} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <NumberInput label={t("campaign_form.min_completed_orders" as Parameters<typeof t>[0])} value={form.min_completed_orders} onChange={(v) => update("min_completed_orders", v)} min={0} />
              <NumberInput label={t("campaign_form.days_since_active" as Parameters<typeof t>[0])} value={form.days_since_last_active} onChange={(v) => update("days_since_last_active", v)} min={0} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3">{t("campaign_form.conditions_subtitle" as Parameters<typeof t>[0])}</p>
            <div className="space-y-3">
              <ToggleInput label={t("campaign_form.show_not_premium" as Parameters<typeof t>[0])} value={form.show_only_if_not_premium} onChange={(v) => update("show_only_if_not_premium", v)} />
              <ToggleInput label={t("campaign_form.show_premium" as Parameters<typeof t>[0])} value={form.show_only_if_premium} onChange={(v) => update("show_only_if_premium", v)} />
              <ToggleInput label={t("campaign_form.show_no_feedback" as Parameters<typeof t>[0])} value={form.show_only_if_feedback_not_submitted} onChange={(v) => update("show_only_if_feedback_not_submitted", v)} />
              <ToggleInput label={t("campaign_form.show_no_onboarding" as Parameters<typeof t>[0])} value={form.show_only_if_onboarding_not_completed} onChange={(v) => update("show_only_if_onboarding_not_completed", v)} />
              <ToggleInput label={t("campaign_form.requires_internet" as Parameters<typeof t>[0])} value={form.requires_internet} onChange={(v) => update("requires_internet", v)} />
              <ToggleInput label={t("campaign_form.no_critical_flow" as Parameters<typeof t>[0])} value={form.do_not_show_during_critical_flow} onChange={(v) => update("do_not_show_during_critical_flow", v)} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
