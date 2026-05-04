import type { Pipeline } from "../types.ts";
import "./PipelineDashboard.css";

type Props = {
  pipelines: Pipeline[];
  paginatedPipelines: Pipeline[];
  currentPage: number;
  pageSize: number;
  setCurrentPage: (n: number | ((p: number) => number)) => void;
  onSelectPipeline: (id: string) => void;
};

const getElapsedTime = (pipeline: Pipeline): string => {
  if (!pipeline.start_time) return "—";
  const start = new Date(pipeline.start_time).getTime();
  const end = pipeline.end_time
    ? new Date(pipeline.end_time).getTime()
    : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const formatTime = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const statusClass = (status: string): string => {
  switch (status) {
    case "RUNNING":
      return "status status-running";
    case "COMPLETED":
      return "status status-completed";
    case "FAILED":
      return "status status-failed";
    default:
      return "status status-pending";
  }
};

const IconInbox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z" />
  </svg>
);

export default function PipelineDashboard({
  pipelines,
  paginatedPipelines,
  currentPage,
  pageSize,
  setCurrentPage,
  onSelectPipeline,
}: Props) {
  const lastPage = Math.max(1, Math.ceil(pipelines.length / pageSize));
  const rangeStart = pipelines.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, pipelines.length);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Pipeline runs</h2>
        </div>
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          {pipelines.length.toLocaleString()} total
        </span>
      </div>

      {pipelines.length === 0 ? (
        <div className="empty-state">
          <IconInbox />
          <h3>No pipelines yet</h3>
          <p>Start one from the panel above, or adjust your filters.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {paginatedPipelines.map((p) => (
                  <tr key={p.id}>
                    <td className="id-cell" title={p.id}>
                      {p.id.slice(0, 8)}
                    </td>
                    <td>
                      {p.name}
                      {p.version_number != null && (
                        <span className="muted mono" style={{ marginLeft: 8, fontSize: "0.85em" }}>
                          v{p.version_number}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={statusClass(p.status)}>{p.status}</span>
                    </td>
                    <td className="duration-cell">{getElapsedTime(p)}</td>
                    <td className="muted">{formatTime(p.start_time)}</td>
                    <td className="muted">{formatTime(p.end_time)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => onSelectPipeline(p.id)}
                        className="btn btn-ghost btn-sm"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{" "}
              {pipelines.length.toLocaleString()}
            </span>
            <div className="pagination-pages">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                className="btn btn-secondary btn-sm"
                disabled={currentPage === 1}
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary btn-sm"
              >
                Prev
              </button>
              <span style={{ alignSelf: "center", padding: "0 var(--space-3)" }}>
                Page {currentPage} of {lastPage}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
                disabled={currentPage === lastPage}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(lastPage)}
                className="btn btn-secondary btn-sm"
                disabled={currentPage === lastPage}
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
