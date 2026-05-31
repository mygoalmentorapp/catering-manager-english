import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { useNavigate, useParams } from "react-router-dom";
import { getT } from "@/lib/i18n";

function InfoRow({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-xs font-medium text-gray-500 min-w-[140px] shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>{String(value)}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs font-medium text-gray-500 min-w-[140px] shrink-0">{label}</span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        value ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
      }`}>
        {value ? "✓" : "✗"}
      </span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-gray-50/50 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="px-5 py-3 divide-y divide-gray-50">{children}</div>
    </div>
  );
}

function ButtonSection({ label, text, action, payload }: { label: string; text?: string; action?: string; payload?: Record<string, unknown> | null }) {
  if (!text && !action) return null;
  return (
    <div className="py-2">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
        {text && <p className="text-sm text-gray-900">{text}</p>}
        {action && <p className="text-xs text-gray-500 font-mono" dir="ltr">{action}</p>}
        {payload && Object.keys(payload).length > 0 && (
          <pre className="text-xs text-gray-500 font-mono mt-1" dir="ltr">{JSON.stringify(payload, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

export function CampaignViewPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const t = getT(selectedLanguage);

  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const campaignQuery = trpc.admin.getCampaign.useQuery(
    { campaign_id: id ?? "" },
    { enabled: !!id }
  );

  const archiveMutation = trpc.admin.archiveCampaign.useMutation({
    onSuccess: () => {
      campaignQuery.refetch();
      setShowArchiveModal(false);
    },
  });

  if (campaignQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        {t("campaign_view.loading" as Parameters<typeof t>[0])}
      </div>
    );
  }

  const campaign = campaignQuery.data as Record<string, unknown> | undefined;
  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500">{t("campaign_view.not_found" as Parameters<typeof t>[0])}</p>
        <button onClick={() => navigate("/campaigns")} className="text-sm text-primary-600 hover:underline">
          {t("campaign_view.back" as Parameters<typeof t>[0])}
        </button>
      </div>
    );
  }

  const isArchived = campaign.is_archived as boolean || campaign.status === "archived";
  const isEnabled = campaign.is_enabled as boolean;
  const formatDate = (d: string | null | undefined) => {
    if (!d) return null;
    try { return new Date(d as string).toLocaleString(selectedLanguage === "he" ? "he-IL" : "en-US"); } catch { return d as string; }
  };

  const handleArchive = async () => {
    if (!selectedApp) return;
    try {
      await archiveMutation.mutateAsync({
        campaign_id: id!,
        app_key: selectedApp.app_key,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Archive failed";
      alert(msg);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate("/campaigns")} className="text-sm text-primary-600 hover:underline mb-1 inline-block">
            ← {t("campaign_view.back" as Parameters<typeof t>[0])}
          </button>
          <h2 className="text-xl font-bold text-gray-900">
            {(campaign.title as string) || (campaign.campaign_key as string)}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 font-mono" dir="ltr">
            {campaign.campaign_key as string}
          </p>
        </div>
        {!isArchived && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/campaigns/${id}/edit`)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t("campaign_view.edit" as Parameters<typeof t>[0])}
            </button>
            <button
              onClick={() => setShowArchiveModal(true)}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              {t("campaign_view.archive" as Parameters<typeof t>[0])}
            </button>
          </div>
        )}
      </div>

      {isArchived && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {t("campaign_view.archived_banner" as Parameters<typeof t>[0])}
        </div>
      )}

      {/* Status indicator */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
          isArchived ? "bg-amber-100 text-amber-700" : isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}>
          {isArchived ? (selectedLanguage === "he" ? "בארכיון" : "Archived") : isEnabled ? (selectedLanguage === "he" ? "פעיל" : "Active") : (selectedLanguage === "he" ? "מושבת" : "Disabled")}
        </span>
        <span className="text-xs text-gray-400">{campaign.type as string}</span>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <SectionCard title={t("campaign_view.section_basic" as Parameters<typeof t>[0])}>
          <InfoRow label={t("campaign_view.campaign_key" as Parameters<typeof t>[0])} value={campaign.campaign_key as string} mono />
          <InfoRow label={t("campaign_view.name" as Parameters<typeof t>[0])} value={campaign.name as string} />
          <InfoRow label={t("campaign_view.type" as Parameters<typeof t>[0])} value={campaign.type as string} />
          <InfoRow label={t("campaign_view.app_key" as Parameters<typeof t>[0])} value={campaign.app_key as string} mono />
          <InfoRow label={t("campaign_view.language" as Parameters<typeof t>[0])} value={campaign.app_language as string} />
          <InfoRow label={t("campaign_view.priority" as Parameters<typeof t>[0])} value={campaign.priority as number} />
        </SectionCard>

        {/* Display / Content */}
        <SectionCard title={t("campaign_view.section_display" as Parameters<typeof t>[0])}>
          <InfoRow label={t("campaign_view.title" as Parameters<typeof t>[0])} value={campaign.title as string} />
          <InfoRow label={t("campaign_view.subtitle" as Parameters<typeof t>[0])} value={campaign.subtitle as string} />
          <InfoRow label={t("campaign_view.message" as Parameters<typeof t>[0])} value={campaign.message as string} />
          <InfoRow label={t("campaign_view.icon" as Parameters<typeof t>[0])} value={campaign.icon as string} />
          <InfoRow label={t("campaign_view.image_url" as Parameters<typeof t>[0])} value={campaign.image_url as string} mono />
          <ButtonSection
            label={t("campaign_view.primary_btn" as Parameters<typeof t>[0])}
            text={campaign.primary_button_text as string}
            action={campaign.primary_button_action as string}
            payload={campaign.primary_button_payload as Record<string, unknown> | null}
          />
          <ButtonSection
            label={t("campaign_view.secondary_btn" as Parameters<typeof t>[0])}
            text={campaign.secondary_button_text as string}
            action={campaign.secondary_button_action as string}
            payload={campaign.secondary_button_payload as Record<string, unknown> | null}
          />
          <BoolRow label={t("campaign_view.dismissible" as Parameters<typeof t>[0])} value={campaign.dismissible as boolean} />
        </SectionCard>

        {/* Targeting / Trigger */}
        <SectionCard title={t("campaign_view.section_targeting" as Parameters<typeof t>[0])}>
          <InfoRow label={t("campaign_view.trigger_event" as Parameters<typeof t>[0])} value={campaign.trigger_event as string} mono />
          <InfoRow label={t("campaign_view.target_audience" as Parameters<typeof t>[0])} value={campaign.target_audience as string} />
          <InfoRow label={t("campaign_view.platform" as Parameters<typeof t>[0])} value={(campaign.platform as string) || t("campaign_view.platform_all" as Parameters<typeof t>[0])} />
          <InfoRow label={t("campaign_view.start_at" as Parameters<typeof t>[0])} value={formatDate(campaign.start_at as string)} />
          <InfoRow label={t("campaign_view.end_at" as Parameters<typeof t>[0])} value={formatDate(campaign.end_at as string)} />
          <InfoRow label={t("campaign_view.rollout" as Parameters<typeof t>[0])} value={`${campaign.rollout_percentage ?? 100}%`} />
          <InfoRow label={t("campaign_view.min_version" as Parameters<typeof t>[0])} value={campaign.min_app_version as string} mono />
          <InfoRow label={t("campaign_view.max_version" as Parameters<typeof t>[0])} value={campaign.max_app_version as string} mono />
        </SectionCard>

        {/* Advanced Rules */}
        <SectionCard title={t("campaign_view.section_advanced" as Parameters<typeof t>[0])}>
          <p className="text-xs text-gray-500 py-2">{t("campaign_view.cooldown_subtitle" as Parameters<typeof t>[0])}</p>
          <InfoRow label={t("campaign_view.cooldown_view" as Parameters<typeof t>[0])} value={campaign.cooldown_days_after_view as number} />
          <InfoRow label={t("campaign_view.cooldown_dismiss" as Parameters<typeof t>[0])} value={campaign.cooldown_days_after_dismiss as number} />
          <InfoRow label={t("campaign_view.max_impressions_user" as Parameters<typeof t>[0])} value={campaign.max_impressions_per_user as number} />
          <InfoRow label={t("campaign_view.max_impressions_session" as Parameters<typeof t>[0])} value={campaign.max_impressions_per_session as number} />
          <InfoRow label={t("campaign_view.max_impressions_day" as Parameters<typeof t>[0])} value={campaign.max_impressions_per_day as number} />
          <InfoRow label={t("campaign_view.max_clicks_user" as Parameters<typeof t>[0])} value={campaign.max_clicks_per_user as number} />

          <p className="text-xs text-gray-500 py-2 mt-2">{t("campaign_view.activity_subtitle" as Parameters<typeof t>[0])}</p>
          <InfoRow label={t("campaign_view.min_days_signup" as Parameters<typeof t>[0])} value={campaign.min_days_since_signup as number} />
          <InfoRow label={t("campaign_view.min_days_first_open" as Parameters<typeof t>[0])} value={campaign.min_days_since_first_open as number} />
          <InfoRow label={t("campaign_view.min_sessions" as Parameters<typeof t>[0])} value={campaign.min_sessions as number} />
          <InfoRow label={t("campaign_view.min_products" as Parameters<typeof t>[0])} value={campaign.min_products_created as number} />
          <InfoRow label={t("campaign_view.min_orders" as Parameters<typeof t>[0])} value={campaign.min_orders_created as number} />
          <InfoRow label={t("campaign_view.min_shopping_lists" as Parameters<typeof t>[0])} value={campaign.min_shopping_lists_created as number} />
          <InfoRow label={t("campaign_view.min_completed_orders" as Parameters<typeof t>[0])} value={campaign.min_completed_orders as number} />
          <InfoRow label={t("campaign_view.days_since_active" as Parameters<typeof t>[0])} value={campaign.days_since_last_active as number} />

          <p className="text-xs text-gray-500 py-2 mt-2">{t("campaign_view.conditions_subtitle" as Parameters<typeof t>[0])}</p>
          <BoolRow label={t("campaign_view.show_not_premium" as Parameters<typeof t>[0])} value={campaign.show_only_if_not_premium as boolean} />
          <BoolRow label={t("campaign_view.show_premium" as Parameters<typeof t>[0])} value={campaign.show_only_if_premium as boolean} />
          <BoolRow label={t("campaign_view.show_no_feedback" as Parameters<typeof t>[0])} value={campaign.show_only_if_feedback_not_submitted as boolean} />
          <BoolRow label={t("campaign_view.show_no_onboarding" as Parameters<typeof t>[0])} value={campaign.show_only_if_onboarding_not_completed as boolean} />
          <BoolRow label={t("campaign_view.requires_internet" as Parameters<typeof t>[0])} value={campaign.requires_internet as boolean} />
          <BoolRow label={t("campaign_view.no_critical_flow" as Parameters<typeof t>[0])} value={campaign.do_not_show_during_critical_flow as boolean} />
        </SectionCard>

        {/* Metadata */}
        <SectionCard title={t("campaign_view.section_metadata" as Parameters<typeof t>[0])}>
          <InfoRow label={t("campaign_view.id" as Parameters<typeof t>[0])} value={campaign.id as string} mono />
          <InfoRow label={t("campaign_view.created_at" as Parameters<typeof t>[0])} value={formatDate(campaign.created_at as string)} />
          <InfoRow label={t("campaign_view.updated_at" as Parameters<typeof t>[0])} value={formatDate(campaign.updated_at as string)} />
        </SectionCard>
      </div>

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t("campaign_view.archive_title" as Parameters<typeof t>[0])}
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              {t("campaign_view.archive_confirm" as Parameters<typeof t>[0])} <strong className="font-mono" dir="ltr">{campaign.campaign_key as string}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-5">
              {t("campaign_view.archive_description" as Parameters<typeof t>[0])}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t("campaign_form.cancel" as Parameters<typeof t>[0])}
              </button>
              <button
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {archiveMutation.isPending
                  ? t("campaign_view.archiving" as Parameters<typeof t>[0])
                  : t("campaign_view.archive_btn" as Parameters<typeof t>[0])}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
