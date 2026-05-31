import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { DataTable } from "@/components/ui/DataTable";
import { useState } from "react";
import { getT } from "@/lib/i18n";

const MODULE_OPTIONS = [
  "remote_config",
  "feature_flags",
  "campaigns",
  "onboarding",
  "paywall",
  "users",
  "apps",
];

export function AuditLogsPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const [offset, setOffset] = useState(0);
  const [moduleFilter, setModuleFilter] = useState("");
  const limit = 50;

  const logsQuery = trpc.admin.getAuditLogs.useQuery(
    {
      app_key: selectedApp?.app_key ?? "",
      module: moduleFilter || undefined,
      limit,
      offset,
    },
    { enabled: !!selectedApp }
  );

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const columns = [
    {
      key: "created_at",
      header: t("audit_logs.col_time"),
      render: (row: Record<string, unknown>) => {
        const d = new Date(row.created_at as string);
        return (
          <span className="text-xs whitespace-nowrap">
            {d.toLocaleDateString()} {d.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      key: "admin_email",
      header: t("audit_logs.col_admin"),
      render: (row: Record<string, unknown>) => (
        <span className="text-sm font-medium text-gray-700">
          {row.admin_email as string}
        </span>
      ),
    },
    {
      key: "module",
      header: t("audit_logs.col_module"),
      render: (row: Record<string, unknown>) => (
        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-mono rounded">
          {row.module as string}
        </span>
      ),
    },
    {
      key: "action",
      header: t("audit_logs.col_action"),
      render: (row: Record<string, unknown>) => {
        const action = row.action as string;
        const color = action === "create" ? "bg-green-50 text-green-700" :
                      action === "update" ? "bg-yellow-50 text-yellow-700" :
                      action === "delete" ? "bg-red-50 text-red-700" :
                      "bg-gray-50 text-gray-700";
        return (
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${color}`}>
            {action}
          </span>
        );
      },
    },
    { key: "entity_type", header: t("audit_logs.col_entity") },
    {
      key: "entity_id",
      header: t("audit_logs.col_entity_id"),
      render: (row: Record<string, unknown>) => (
        <span className="text-xs font-mono text-gray-500">
          {(row.entity_id as string)?.slice(0, 12)}
        </span>
      ),
    },
    {
      key: "details",
      header: selectedLanguage === "he" ? "פרטים" : "Details",
      render: (row: Record<string, unknown>) => {
        const changes = row.changes || row.metadata;
        if (!changes) return <span className="text-gray-400">-</span>;
        const rowId = (row.id as string) || (row.created_at as string);
        const isExpanded = expandedRow === rowId;
        return (
          <div>
            <button
              onClick={() => setExpandedRow(isExpanded ? null : rowId)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {isExpanded ? "▼" : "▶"} {selectedLanguage === "he" ? "צפה" : "View"}
            </button>
            {isExpanded && (
              <pre className="mt-1 text-xs bg-gray-50 p-2 rounded border max-w-[250px] overflow-auto">
                {JSON.stringify(changes, null, 2)}
              </pre>
            )}
          </div>
        );
      },
    },
  ];

  const total = logsQuery.data?.total ?? 0;
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">{t("audit_logs.title")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("audit_logs.subtitle")} <strong>{selectedApp?.display_name}</strong>
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">
            {selectedLanguage === "he" ? "סנן לפי מודול:" : "Filter by module:"}
          </label>
          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); setOffset(0); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">{selectedLanguage === "he" ? "הכל" : "All"}</option>
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {moduleFilter && (
            <button
              onClick={() => { setModuleFilter(""); setOffset(0); }}
              className="text-xs text-red-600 hover:text-red-800"
            >
              {selectedLanguage === "he" ? "נקה" : "Clear"}
            </button>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {selectedLanguage === "he" ? `סה"כ: ${total}` : `Total: ${total}`}
        </div>
      </div>

      {/* Module chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {MODULE_OPTIONS.map((m) => (
          <button
            key={m}
            onClick={() => { setModuleFilter(m); setOffset(0); }}
            className={`px-2 py-0.5 text-xs rounded border ${
              moduleFilter === m
                ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={(logsQuery.data?.items ?? []) as Record<string, unknown>[]}
        isLoading={logsQuery.isLoading}
        emptyMessage={t("audit_logs.no_logs")}
      />

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={!hasPrev}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            {t("audit_logs.previous")}
          </button>
          <span className="text-sm text-gray-500">
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasNext}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            {t("audit_logs.next")}
          </button>
        </div>
      )}
    </div>
  );
}
