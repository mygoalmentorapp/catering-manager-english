import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { useNavigate } from "react-router-dom";
import { getT } from "@/lib/i18n";

type StatusFilter = "all" | "active" | "archived";

function CampaignStatusBadge({ isEnabled, isArchived, lang }: { isEnabled: boolean; isArchived: boolean; lang: string }) {
  const t = getT(lang);
  if (isArchived) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        {t("status.archived")}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
    }`}>
      {isEnabled ? t("status.active") : t("status.disabled")}
    </span>
  );
}

export function CampaignsPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const navigate = useNavigate();
  const t = getT(selectedLanguage);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const campaignsQuery = trpc.admin.getCampaigns.useQuery(
    { app_key: selectedApp?.app_key ?? "", app_language: selectedLanguage, status: statusFilter },
    { enabled: !!selectedApp }
  );

  const archiveMutation = trpc.admin.archiveCampaign.useMutation({
    onSuccess: () => {
      campaignsQuery.refetch();
    },
  });

  const [archiveTarget, setArchiveTarget] = useState<{ id: string; key: string } | null>(null);

  const handleArchive = async () => {
    if (!archiveTarget || !selectedApp) return;
    try {
      await archiveMutation.mutateAsync({
        campaign_id: archiveTarget.id,
        app_key: selectedApp.app_key,
      });
      setArchiveTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Archive failed";
      alert(msg);
    }
  };

  const campaigns = (campaignsQuery.data ?? []) as Array<Record<string, unknown>>;

  const filterTabs: { label: string; value: StatusFilter }[] = [
    { label: t("campaigns.filter_active"), value: "active" },
    { label: t("campaigns.filter_all"), value: "all" },
    { label: t("campaigns.filter_archived"), value: "archived" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t("campaigns.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedApp?.display_name} ({selectedLanguage === "he" ? "עברית" : "English"})
          </p>
        </div>
        <button
          onClick={() => navigate("/campaigns/new")}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          {t("campaigns.create")}
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              statusFilter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaigns Table */}
      {campaignsQuery.isLoading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="animate-pulse text-gray-400">{t("common.loading")}</div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          {t("campaigns.no_campaigns")}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_key")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_title")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_type")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_status")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_trigger")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_priority")}</th>
                  <th className="px-4 py-3 text-start font-medium text-gray-600">{t("campaigns.col_actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((c) => (
                  <tr key={c.id as string} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-start text-gray-700 font-mono text-xs">
                      {c.campaign_key as string}
                    </td>
                    <td className="px-4 py-3 text-start text-gray-700">
                      {(c.title as string) || (c.name as string) || "-"}
                    </td>
                    <td className="px-4 py-3 text-start text-gray-500">
                      {c.type as string}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <CampaignStatusBadge
                        isEnabled={c.is_enabled as boolean}
                        isArchived={c.is_archived as boolean}
                        lang={selectedLanguage}
                      />
                    </td>
                    <td className="px-4 py-3 text-start text-gray-500 font-mono text-xs">
                      {(c.trigger_event as string) || "-"}
                    </td>
                    <td className="px-4 py-3 text-start text-gray-500">
                      {c.priority as number}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/campaigns/${c.id}`)}
                          className="px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 transition-colors"
                        >
                          {t("campaigns.view")}
                        </button>
                        {!(c.is_archived as boolean) && (
                          <>
                            <button
                              onClick={() => navigate(`/campaigns/${c.id}/edit`)}
                              className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                            >
                              {t("campaigns.edit")}
                            </button>
                            <button
                              onClick={() =>
                                setArchiveTarget({ id: c.id as string, key: c.campaign_key as string })
                              }
                              className="px-2.5 py-1 text-xs font-medium text-orange-600 bg-orange-50 rounded hover:bg-orange-100 transition-colors"
                            >
                              {t("campaigns.archive")}
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
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("campaigns.archive_title")}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t("campaigns.archive_confirm")} <strong>{archiveTarget.key}</strong>?
              {" "}{t("campaigns.archive_description")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {archiveMutation.isPending ? t("campaigns.archiving") : t("campaigns.archive_btn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
