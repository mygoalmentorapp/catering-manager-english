import { useApp } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { DataTable } from "@/components/ui/DataTable";
import { useState } from "react";
import { getT } from "@/lib/i18n";

export function EventsPage() {
  const { selectedApp, selectedLanguage } = useApp();
  const t = getT(selectedLanguage);
  const [offset, setOffset] = useState(0);
  const [eventFilter, setEventFilter] = useState("");
  const limit = 50;

  const eventsQuery = trpc.admin.getEvents.useQuery(
    {
      app_key: selectedApp?.app_key ?? "",
      event_name: eventFilter || undefined,
      limit,
      offset,
    },
    { enabled: !!selectedApp }
  );

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const columns = [
    {
      key: "created_at",
      header: t("events.col_time"),
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
      key: "event_name",
      header: t("events.col_event"),
      render: (row: Record<string, unknown>) => (
        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono rounded">
          {row.event_name as string}
        </span>
      ),
    },
    {
      key: "user_id",
      header: t("events.col_user"),
      render: (row: Record<string, unknown>) => (
        <span className="text-xs font-mono text-gray-500 max-w-[100px] truncate block">
          {(row.user_id as string)?.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: "platform",
      header: t("events.col_platform"),
      render: (row: Record<string, unknown>) => (
        <span className={`inline-block px-2 py-0.5 text-xs rounded ${
          row.platform === "ios" ? "bg-gray-100 text-gray-700" :
          row.platform === "android" ? "bg-green-50 text-green-700" :
          "bg-purple-50 text-purple-700"
        }`}>
          {(row.platform as string) || "-"}
        </span>
      ),
    },
    { key: "app_language", header: t("events.col_lang") },
    {
      key: "metadata",
      header: t("events.col_metadata"),
      render: (row: Record<string, unknown>) => {
        const meta = row.metadata;
        if (!meta || (typeof meta === "object" && Object.keys(meta as object).length === 0))
          return <span className="text-gray-400">-</span>;
        const rowId = (row.id as string) || (row.created_at as string);
        const isExpanded = expandedRow === rowId;
        return (
          <div>
            <button
              onClick={() => setExpandedRow(isExpanded ? null : rowId)}
              className="text-xs font-mono text-blue-600 hover:text-blue-800 max-w-[200px] truncate block text-left"
            >
              {isExpanded ? "▼ " : "▶ "}{JSON.stringify(meta).slice(0, 60)}
            </button>
            {isExpanded && (
              <pre className="mt-1 text-xs bg-gray-50 p-2 rounded border max-w-[300px] overflow-auto">
                {JSON.stringify(meta, null, 2)}
              </pre>
            )}
          </div>
        );
      },
    },
  ];

  const total = eventsQuery.data?.total ?? 0;
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;

  // Get unique event names for filter chips
  const eventNames = [...new Set((eventsQuery.data?.items ?? []).map((e: any) => e.event_name as string))].sort();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">{t("events.title")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("events.subtitle")} <strong>{selectedApp?.display_name}</strong>
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">
            {selectedLanguage === "he" ? "סנן לפי אירוע:" : "Filter by event:"}
          </label>
          <input
            type="text"
            placeholder={selectedLanguage === "he" ? "שם אירוע..." : "Event name..."}
            value={eventFilter}
            onChange={(e) => { setEventFilter(e.target.value); setOffset(0); }}
            className="border rounded px-3 py-1.5 text-sm w-48"
          />
          {eventFilter && (
            <button
              onClick={() => { setEventFilter(""); setOffset(0); }}
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

      {/* Quick event name chips */}
      {eventNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {eventNames.slice(0, 15).map((name) => (
            <button
              key={name}
              onClick={() => { setEventFilter(name); setOffset(0); }}
              className={`px-2 py-0.5 text-xs rounded border ${
                eventFilter === name
                  ? "bg-blue-100 border-blue-300 text-blue-800"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        data={(eventsQuery.data?.items ?? []) as Record<string, unknown>[]}
        isLoading={eventsQuery.isLoading}
        emptyMessage={t("events.no_events")}
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
