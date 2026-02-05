import type { Pipeline } from "../types.ts";
import "./FilterPipelinesSection.css";
import { getStatusColour } from "../constants.ts";

type Props = {
  pipelines: Pipeline[];
  formData: Record<string, string | number>;
  displayedStatus: string;
  handleParamChange: (name: string, value: unknown) => void;
  handleFilter: (status: string) => void;
};

export default function FilterPipelinesSection({
  pipelines,
  formData,
  displayedStatus,
  handleParamChange,
  handleFilter,
}: Props) {
  const allStatuses = ["RECENT", "RUNNING", "FAILED", "COMPLETED", "TOTAL"];

  return (
    <details open={false}>
      <summary>
        <h2>Filter Pipelines</h2>
      </summary>
      <section>
        <div className="pipeline-summary">
          {allStatuses.map((status) => (
            <div
              className={`pipeline-summary-card${displayedStatus === status ? " selected" : ""}`}
              key={status}
              onClick={() => handleFilter(status)}
              onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
              onMouseLeave={(e) => e.currentTarget.classList.remove("hover")}
            >
              <h3
                style={{
                  color: getStatusColour(status),
                }}
              >
                {status}
              </h3>
              {status === "RECENT" ? (
                <small>
                  {" "}
                  Pipelines started in the last 10 minutes:{" "}
                  {
                    pipelines.filter((p) => {
                      const start = p.start_time
                        ? new Date(p.start_time).getTime()
                        : 0;
                      return Date.now() - start <= 10 * 60 * 1000;
                    }).length
                  }{" "}
                </small>
              ) : (
                <small>
                  There are{" "}
                  {status === "TOTAL"
                    ? pipelines.length
                    : pipelines.filter((p) => p.status === status).length}{" "}
                  pipeline(s)
                </small>
              )}
            </div>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by name or ID"
          value={formData.search ?? ""}
          onChange={(e) => handleParamChange("search", e.target.value)}
          className="search-input"
          style={{ marginBottom: 12, width: 250 }}
        />
      </section>
    </details>
  );
}
