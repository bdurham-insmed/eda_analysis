import type { Pipeline } from "../types.ts";
import { isRecent } from "../utils/datetime.ts";
import "./FilterPipelinesSection.css";

type Props = {
  pipelines: Pipeline[];
  formData: Record<string, string | number>;
  displayedStatus: string;
  handleParamChange: (name: string, value: unknown) => void;
  handleFilter: (status: string) => void;
  initialLoad?: boolean;
};

type StatusKey = "TOTAL" | "RUNNING" | "COMPLETED" | "FAILED" | "RECENT";

const KPI_DEFS: Array<{ key: StatusKey; label: string; dotClass: string; sub: string }> = [
  { key: "TOTAL", label: "All pipelines", dotClass: "kpi-dot--total", sub: "All time" },
  { key: "RUNNING", label: "Running", dotClass: "kpi-dot--running", sub: "In progress" },
  { key: "COMPLETED", label: "Completed", dotClass: "kpi-dot--completed", sub: "Successful" },
  { key: "FAILED", label: "Failed", dotClass: "kpi-dot--failed", sub: "Errored" },
  { key: "RECENT", label: "Recent", dotClass: "kpi-dot--recent", sub: "Last 10 minutes" },
];

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export default function FilterPipelinesSection({
  pipelines,
  formData,
  displayedStatus,
  handleParamChange,
  handleFilter,
  initialLoad = false,
}: Props) {
  const counts: Record<StatusKey, number> = {
    TOTAL: pipelines.length,
    RUNNING: pipelines.filter((p) => p.status === "RUNNING").length,
    COMPLETED: pipelines.filter((p) => p.status === "COMPLETED").length,
    FAILED: pipelines.filter((p) => p.status === "FAILED").length,
    RECENT: pipelines.filter((p) => isRecent(p.start_time)).length,
  };

  return (
    <section className="page-section">
      <div className="kpi-grid">
        {KPI_DEFS.map(({ key, label, dotClass, sub }) => (
          <button
            key={key}
            type="button"
            className={`kpi ${displayedStatus === key ? "active" : ""}`}
            onClick={() => handleFilter(key)}
          >
            <span className="kpi-label">
              <span className={`kpi-dot ${dotClass}`} />
              {label}
            </span>
            {initialLoad ? (
              <div className="skeleton kpi-value--skeleton" aria-hidden="true" />
            ) : (
              <div className="kpi-value">{counts[key].toLocaleString()}</div>
            )}
            <div className="kpi-sub">{sub}</div>
          </button>
        ))}
      </div>
      <div className="search-row">
        <div className="search-input-wrap">
          <IconSearch />
          <input
            type="search"
            placeholder="Search by name or pipeline ID"
            value={formData.search ?? ""}
            onChange={(e) => handleParamChange("search", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
