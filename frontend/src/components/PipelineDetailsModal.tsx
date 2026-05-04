import type { Pipeline, Step } from "../types.ts";
import "./PipelineDetailsModal.css";

type Props = {
  pipeline: Pipeline;
  onClose: () => void;
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
  return new Date(iso).toLocaleString();
};

const renderParameterValue = (value: unknown) => {
  if (value === null || value === undefined) return <em className="muted">—</em>;
  if (typeof value === "string") {
    if (value.startsWith("gs://")) return <code>{value}</code>;
    return value;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  return <code>{JSON.stringify(value)}</code>;
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

const stepMarkerClass = (status: string): string => {
  if (status === "RUNNING") return "step-marker step-marker--running";
  if (status === "COMPLETED") return "step-marker step-marker--completed";
  if (status === "FAILED") return "step-marker step-marker--failed";
  return "step-marker";
};

const StepIcon = ({ status }: { status: string }) => {
  if (status === "COMPLETED") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="var(--success-700)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 8.5 6.5 12 13 5" />
      </svg>
    );
  }
  if (status === "FAILED") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="var(--danger-700)" strokeWidth="2.5"
        strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </svg>
    );
  }
  if (status === "RUNNING") {
    return (
      <svg viewBox="0 0 16 16" fill="var(--accent-600)" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
      </svg>
    );
  }
  return null;
};

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PipelineDetailsModal({ pipeline, onClose }: Props) {
  const sortedSteps: Step[] = [...(pipeline.steps ?? [])].sort((a, b) => {
    const aOrder = a.step_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.step_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const getTime = (date: string | null) =>
      date ? new Date(date).getTime() : 0;
    const aStart = getTime(a.start_time);
    const bStart = getTime(b.start_time);
    if (aStart !== bStart) return aStart - bStart;
    return getTime(a.end_time) - getTime(b.end_time);
  });

  const parameterEntries = pipeline.parameter_values
    ? Object.entries(pipeline.parameter_values)
    : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <aside className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{pipeline.name}</h2>
            <div className="id">{pipeline.id}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close panel"
          >
            <IconClose />
          </button>
        </header>

        <div className="modal-body">
          <section className="detail-section">
            <h3>Run details</h3>
            <dl className="detail-grid">
              <dt>Status</dt>
              <dd>
                <span className={statusClass(pipeline.status)}>{pipeline.status}</span>
              </dd>
              <dt>Workflow</dt>
              <dd>
                {pipeline.name}
                {pipeline.version_number != null && (
                  <span className="mono" style={{ marginLeft: 6 }}>
                    v{pipeline.version_number}
                  </span>
                )}
                {pipeline.workflow_id != null && (
                  <span className="muted"> · #{pipeline.workflow_id}</span>
                )}
              </dd>
              <dt>Duration</dt>
              <dd className="mono">{getElapsedTime(pipeline)}</dd>
              <dt>Started</dt>
              <dd>{formatTime(pipeline.start_time)}</dd>
              <dt>Finished</dt>
              <dd>{formatTime(pipeline.end_time)}</dd>
            </dl>
          </section>

          {parameterEntries.length > 0 && (
            <section className="detail-section">
              <h3>Parameters</h3>
              <dl className="parameter-list">
                {parameterEntries.map(([k, v]) => (
                  <div className="parameter-row" key={k}>
                    <dt>{k}</dt>
                    <dd>{renderParameterValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="detail-section">
            <h3>Steps</h3>
            {sortedSteps.length > 0 ? (
              <div className="step-timeline">
                {sortedSteps.map((step, i) => (
                  <div className="step-timeline-item" key={i}>
                    <div className={stepMarkerClass(step.status)}>
                      <StepIcon status={step.status} />
                    </div>
                    <div className="step-body">
                      <div className="step-name">{step.name}</div>
                      <div className="step-meta">
                        {step.status}
                        {step.start_time && (
                          <>
                            {" · started "}
                            {new Date(step.start_time).toLocaleTimeString()}
                          </>
                        )}
                        {step.end_time && (
                          <>
                            {" · finished "}
                            {new Date(step.end_time).toLocaleTimeString()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                No step details available.
              </p>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </footer>
      </aside>
    </div>
  );
}
